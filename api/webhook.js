const line = require("@line/bot-sdk");

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);

module.exports = async function handler(req, res) {
  if (req.method === "GET") return res.status(200).send("OK");
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  try {
    const events = req.body && Array.isArray(req.body.events) ? req.body.events : [];
    
    const results = await Promise.all(events.map(async (event) => {
      if (event.replyToken === "00000000000000000000000000000000") return null;
      if (event.type !== 'message' || event.message.type !== 'text') return null;

      // ลบช่องว่างหน้า-หลังออก
      const userMessage = event.message.text.trim();
      const userId = event.source.userId;

      // --- เมนูพื้นฐาน ---
      if (userMessage.toUpperCase() === "PING") {
        return client.replyMessage(event.replyToken, { type: "text", text: "PONG!"});
      }
      if (userMessage.toUpperCase() === "LOGIN") {
        const liffUrl = process.env.LINE_LIFF_URL;
        return client.replyMessage(event.replyToken, { type: "text", text: `กรุณาลงทะเบียนผูกบัญชีผ่านหน้าเว็บ LIFF ก่อนนะครับ\n👉 ${liffUrl}` });
      }
      if (userMessage === "เว็บไซต์ของฌาปนกิจ") {
        return client.replyMessage(event.replyToken, { 
            type: "text", 
            text: `https://chapanakij.or.th/` 
        });
      }
      if (userMessage.toUpperCase() === "HELP") {
        const helpText = "เมนูคำสั่งที่รองรับ:\n1. ข้อมูลของฉัน\n2. ต้องการชำระเงิน\n3. ยอดค้างชำระทั้งหมด\n4. ข้อมูลใบเสร็จรับเงิน\n5. สอบถามข้อมูลทายาท\n6. เว็บไซต์ของฌาปนกิจ";
        return client.replyMessage(event.replyToken, { type: "text", text: helpText });
      }

      // --- เมนูหลัก (A / B / C / D / E) ---
      // รองรับคำว่า "สอบภาม..." ตามที่คุณพิมพ์มา และ "สอบถาม..." ที่ถูกต้อง
      const validCommands = [
        "ข้อมูลของฉัน", 
        "ต้องการชำระเงิน", 
        "ยอดค้างชำระทั้งหมด", 
        "ข้อมูลใบเสร็จรับเงิน", 
        "สอบถามข้อมูลทายาท",
        "สอบภามข้อมูลทายาท" 
      ];

      if (validCommands.includes(userMessage)) {
        try {
          // STEP 1: ค้นหาข้อมูลการผูกบัญชีจาก Database หลัก
          const getMemberUrl = `${process.env.DOMAIN_URL}/chatme/getMember/${encodeURIComponent(userId)}`;
          
          const memberResp = await fetch(getMemberUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'x-api-key': process.env.API_KEY || '' }
          });

          const memberResult = await memberResp.json();

          if (memberResult.respCode !== "200" || !memberResult.data) {
            const liffUrl = process.env.LINE_LIFF_URL;
            return client.replyMessage(event.replyToken, {
              type: "text",
              text: `⚠️ ยังไม่ได้ผูกข้อมูลสมาชิก หรือไม่พบข้อมูลในระบบครับ\nกรุณาลงทะเบียนผ่านหน้าเว็บ LIFF ก่อนนะครับ\n👉 ${liffUrl}`
            });
          }

          const { customerId, memberId } = memberResult.data;

          // STEP 2: เลือก Endpoint ตามคำสั่ง
          let endpoint = "";
          if (userMessage === "ข้อมูลของฉัน") endpoint = "member";
          else if (userMessage === "ต้องการชำระเงิน") endpoint = "payment";
          else if (userMessage === "ยอดค้างชำระทั้งหมด") endpoint = "overdue";
          else if (userMessage === "ข้อมูลใบเสร็จรับเงิน") endpoint = "receipt";
          else if (userMessage === "สอบถามข้อมูลทายาท" || userMessage === "สอบภามข้อมูลทายาท") endpoint = "heir";

          const apiUrl = `${process.env.DOMAIN_URL}/chatme/${endpoint}/${encodeURIComponent(customerId)}/${encodeURIComponent(memberId)}`;
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);

          const apiResp = await fetch(apiUrl, { 
            method: 'POST', 
            headers: { 
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              'Accept': 'application/json',
              'x-api-key': process.env.API_KEY || ''
            },
            body: JSON.stringify({}),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          const rawText = await apiResp.text();

          let result;
          try {
            result = JSON.parse(rawText);
          } catch (e) {
            return client.replyMessage(event.replyToken, { type: "text", text: `พบปัญหาการอ่านข้อมูลจากระบบหลัก` });
          }

          // จัดการ 404 Not Found
          if (result.respCode === "404") {
             if (userMessage === "ยอดค้างชำระทั้งหมด") return client.replyMessage(event.replyToken, { type: "text", text: `✅ ตรวจสอบแล้ว ไม่มียอดค้างชำระครับ` });
             if (userMessage === "ข้อมูลใบเสร็จรับเงิน") return client.replyMessage(event.replyToken, { type: "text", text: `❌ ไม่พบประวัติใบเสร็จรับเงินครับ` });
             if (endpoint === "heir") return client.replyMessage(event.replyToken, { type: "text", text: `❌ ไม่พบข้อมูลทายาทในระบบครับ` });
             
             return client.replyMessage(event.replyToken, { type: "text", text: `❌ ไม่พบข้อมูลในระบบครับ` });
          }

          // STEP 3: จัดรูปแบบข้อความตอบกลับตามคำสั่ง
          if (result.respCode === "200" && result.data) {
            const d = result.data;
            
            // ------------------------------------
            // A. ข้อมูลของฉัน
            // ------------------------------------
            if (userMessage === "ข้อมูลของฉัน") {
              // แยกชื่อและนามสกุลจาก d.Name (ถ้ามี)
              const nameParts = (d.Name || "").split(" ");
              const firstName = nameParts[0] || "-";
              const lastName = nameParts.slice(1).join(" ") || "-";
              const age = d.Age || "-"; // ตรวจสอบว่า API มีส่ง Age มาหรือไม่
              
              const replyMsg = `ชื่อ ${firstName} นามสกุล ${lastName}\nอายุ ${age} เลขสมาชิก ${memberId}\n\nท่านสามารถดูข้อมูลของท่านเพิ่มเติมได้ที่ Link : ${d.InfoURL || '-'}`;
              return client.replyMessage(event.replyToken, { type: "text", text: replyMsg });
            } 
            
            // ------------------------------------
            // B. ต้องการชำระเงิน
            // ------------------------------------
            else if (userMessage === "ต้องการชำระเงิน") {
              const p = d.PaymentInfo || {};
              const replyMsg = `ยอดชำระเงินปัจจุบัน : ${d.Price || '-'}\nท่านสามารถชำระเงินได้ที่\nLink : ${d.InfoURL || '-'}`;
              return client.replyMessage(event.replyToken, { type: "text", text: replyMsg });
            } 
            
            // ------------------------------------
            // C. ยอดค้างชำระทั้งหมด (Flex Message)
            // ------------------------------------
            else if (userMessage === "ยอดค้างชำระทั้งหมด") {
              const currentDate = new Date().toLocaleDateString('th-TH');
              const flexCard = {
                type: "flex",
                altText: "แจ้งเตือนยอดค้างชำระ",
                contents: {
                  type: "bubble",
                  header: {
                    type: "box", layout: "vertical", contents: [
                      { type: "text", text: "ยอดค้างชำระ", weight: "bold", size: "xl", color: "#ff4d4f" }
                    ]
                  },
                  body: {
                    type: "box", layout: "vertical", spacing: "sm", contents: [
                      { type: "box", layout: "horizontal", contents: [ { type: "text", text: "รายการ", color: "#888888", size: "sm" }, { type: "text", text: "เงินสงเคราะห์", align: "end", size: "sm" } ] },
                      { type: "box", layout: "horizontal", contents: [ { type: "text", text: "วันที่", color: "#888888", size: "sm" }, { type: "text", text: currentDate, align: "end", size: "sm" } ] },
                      { type: "box", layout: "horizontal", contents: [ { type: "text", text: "จำนวนเงิน", color: "#888888", size: "sm" }, { type: "text", text: `${d.OverduePrice} บาท`, align: "end", size: "sm", weight: "bold" } ] }
                    ]
                  },
                  footer: {
                    type: "box", layout: "vertical", contents: [
                      { type: "button", style: "link", height: "sm", action: { type: "uri", label: "ดูรายละเอียดเพิ่มเติม", uri: d.Bill || "https://chapanakij.or.th/" } }
                    ]
                  }
                }
              };
              return client.replyMessage(event.replyToken, flexCard);
            }
            
            // ------------------------------------
            // D. ข้อมูลใบเสร็จรับเงิน (Text + Flex Message)
            // ------------------------------------
            else if (userMessage === "ข้อมูลใบเสร็จรับเงิน") {
              const textMsg = { type: "text", text: `ท่านได้ชำระเงินจำนวน ${d.ReceiptAmount} บาท` };
              const flexCard = {
                type: "flex",
                altText: "แจ้งเตือนชำระเงินสำเร็จ",
                contents: {
                  type: "bubble",
                  header: {
                    type: "box", layout: "vertical", contents: [
                      { type: "text", text: "แจ้งเตือนชำระเงินสำเร็จ", weight: "bold", size: "lg", color: "#52c41a" }
                    ]
                  },
                  body: {
                    type: "box", layout: "vertical", spacing: "sm", contents: [
                      { type: "box", layout: "horizontal", contents: [ { type: "text", text: "รายการ", color: "#888888", size: "sm" }, { type: "text", text: "ชำระเงินสงเคราะห์", align: "end", size: "sm" } ] },
                      { type: "box", layout: "horizontal", contents: [ { type: "text", text: "เลขที่", color: "#888888", size: "sm" }, { type: "text", text: d.ReceiptNo || "-", align: "end", size: "sm" } ] },
                      { type: "box", layout: "horizontal", contents: [ { type: "text", text: "วันที่", color: "#888888", size: "sm" }, { type: "text", text: d.ReceiptPayDate || "-", align: "end", size: "sm" } ] },
                      { type: "box", layout: "horizontal", contents: [ { type: "text", text: "จำนวน", color: "#888888", size: "sm" }, { type: "text", text: `${d.ReceiptAmount} บาท`, align: "end", size: "sm", weight: "bold" } ] }
                    ]
                  },
                  footer: {
                    type: "box", layout: "vertical", contents: [
                      { type: "button", style: "primary", color: "#1890ff", action: { type: "uri", label: "ดาวน์โหลดเอกสาร", uri: d.ReceipURL || "https://chapanakij.or.th/" } }
                    ]
                  }
                }
              };
              // ส่งทั้งข้อความ Text และ Card ใบเสร็จไปพร้อมกัน
              return client.replyMessage(event.replyToken, [textMsg, flexCard]);
            }
            
            // ------------------------------------
            // E. สอบถามข้อมูลทายาท
            // ------------------------------------
            else if (endpoint === "heir") {
              const heirs = Array.isArray(d) ? d : [];
              let heirText = "ท่านมีข้อมูลทายาท ดังนี้\n";
              
              heirs.forEach((h) => {
                  const nParts = (h.FullName || "").split(" ");
                  const fName = nParts[0] || "-";
                  const lName = nParts.slice(1).join(" ") || "-";
                  heirText += `ชื่อ ${fName} นามสกุล ${lName}\n`;
              });
              
              heirText += `\nดูข้อมูลทายาทเพิ่มเติมได้ที่ Link : ${result.InfoURL || '-'}`;
              return client.replyMessage(event.replyToken, { type: "text", text: heirText.trim() });
            }

          } else {
            return client.replyMessage(event.replyToken, { type: "text", text: `❌ เกิดข้อผิดพลาดจากระบบ: ${result.respMsg || ''}` });
          }

        } catch (error) {
          console.error("❌ [DEBUG] API Error:", error.message);
          if (error.name === 'AbortError' || error.code === 'UND_ERR_CONNECT_TIMEOUT') {
            return client.replyMessage(event.replyToken, { type: "text", text: `⚠️ การเชื่อมต่อกับฐานข้อมูลใช้เวลานานเกินไป (Timeout)` });
          }
          return client.replyMessage(event.replyToken, { type: "text", text: `❌ เกิดข้อผิดพลาดในการเชื่อมต่อระบบ:\n${error.message}` });
        }
      } 
    }));

    return res.status(200).json(results);
  } catch (error) {
    console.error("Webhook Global Error:", error);
    return res.status(500).json({ status: "error" });
  }
};