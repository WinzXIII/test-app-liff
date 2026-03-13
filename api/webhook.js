const line = require("@line/bot-sdk");
const { Redis } = require("@upstash/redis");

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);

const redisUrl = process.env.KV_REST_API_URL;
const redisToken = process.env.KV_REST_API_TOKEN;

module.exports = async function handler(req, res) {
  if (req.method === "GET") return res.status(200).send("OK");
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  try {
    const events = req.body && Array.isArray(req.body.events) ? req.body.events : [];
    
    const results = await Promise.all(events.map(async (event) => {
      if (event.replyToken === "00000000000000000000000000000000") return null;
      if (event.type !== 'message' || event.message.type !== 'text') return null;

      const userMessage = event.message.text.trim().toUpperCase();
      const userId = event.source.userId;

      if (userMessage === "A") {
        const redis = new Redis({ url: redisUrl, token: redisToken });
        const key = `memberlink:${userId}`;
        
        let linkData = await redis.get(key);
        
        if (typeof linkData === 'string') {
          try { linkData = JSON.parse(linkData); } catch(e) {}
        }

        if (!linkData || !linkData.customerId) {
          return client.replyMessage(event.replyToken, {
            type: "text",
            text: "⚠️ ยังไม่ได้ผูกข้อมูลสมาชิกครับ\nกรุณาลงทะเบียนผ่านหน้าเว็บ LIFF ก่อนครับ"
          });
        }

        // --- ส่วน Debug: ยิง API ---
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); // รอสูงสุด 8 วิ

          const apiUrl = `https://uat-chapanakij.thaijobjob.com/api/uat/chatme/member/${encodeURIComponent(linkData.customerId)}/${encodeURIComponent(linkData.memberId)}`;
          console.log("➡️ [DEBUG] กำลังยิงไปที่:", apiUrl);

          const apiResp = await fetch(apiUrl, { 
            method: 'POST', 
            headers: { 
              'Content-Type': 'application/json',
              // ปลอมตัวเป็น Browser ทั่วไป เผื่อเซิร์ฟเวอร์บล็อก Vercel Agent
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json'
            },
            // ✅ เพิ่ม body ว่างๆ เข้าไป ป้องกัน Web Server ปลายทางค้างรอรับ Data
            body: JSON.stringify({}),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          // ✅ อ่านค่าเป็น Text แค่ครั้งเดียว เพื่อนำไป Log และ Parse
          const rawText = await apiResp.text();
          console.log(`⬅️ [DEBUG] Status: ${apiResp.status} | Body: ${rawText.substring(0, 100)}...`);

          let result;
          try {
            result = JSON.parse(rawText);
          } catch (parseErr) {
            console.error("❌ [DEBUG] เซิร์ฟเวอร์ไม่ได้ตอบกลับมาเป็น JSON:", rawText);
            return client.replyMessage(event.replyToken, { type: "text", text: `พบปัญหาการอ่านข้อมูล (ไม่เป็น JSON)\nStatus: ${apiResp.status}` });
          }

          if (result.respCode === "200" && result.data) {
            const d = result.data;
            const p = d.PaymentInfo || {};
            const replyMsg = `[ข้อมูลสมาชิก]\n👤 ชื่อ: ${d.Name}\n📌 สถานะ: ${d.Status}\n📝 ประเภท: ${d.RegisType}\n💳 การชำระเงิน: ${p.PayForm || '-'}`;
            return client.replyMessage(event.replyToken, { type: "text", text: replyMsg });
          } else {
            return client.replyMessage(event.replyToken, { type: "text", text: `❌ ไม่พบข้อมูลในระบบหลัก: ${result.respMsg || ''}` });
          }
        } catch (apiError) {
          console.error("❌ [DEBUG] API Error Triggered:", apiError.message);
          
          if (apiError.name === 'AbortError' || apiError.code === 'UND_ERR_CONNECT_TIMEOUT') {
            return client.replyMessage(event.replyToken, { type: "text", text: `⚠️ การเชื่อมต่อกับฐานข้อมูลใช้เวลานานเกินไป (Timeout)\n[สาเหตุที่เป็นไปได้: Vercel ถูกบล็อก IP จากฝั่งเซิร์ฟเวอร์หลัก]` });
          }
          return client.replyMessage(event.replyToken, { type: "text", text: `❌ เกิดข้อผิดพลาด:\n${apiError.message}` });
        }
      }
    }));

    return res.status(200).json(results);
  } catch (error) {
    console.error("Webhook Global Error:", error);
    return res.status(200).json({ status: "error" });
  }
};