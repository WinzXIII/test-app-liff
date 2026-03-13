const line = require("@line/bot-sdk");
const { Redis } = require("@upstash/redis");

// 1. ตั้งค่า LINE SDK
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);

// 2. ตั้งค่า Redis (ดึงค่าจาก ENV ที่ Vercel สร้างให้)
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// ฟังก์ชันหลักที่ Vercel เรียกใช้งาน
module.exports = async function handler(req, res) {
  // รองรับการเช็คสถานะจาก Browser
  if (req.method === "GET") return res.status(200).send("Webhook is running...");
  
  // รับเฉพาะ HTTP POST จาก LINE
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  try {
    const events = req.body && Array.isArray(req.body.events) ? req.body.events : [];
    
    // วนลูปจัดการอีเวนต์ที่ LINE ส่งมา
    const results = await Promise.all(events.map(async (event) => {
      
      // 🛡️ 1. ดักการกดปุ่ม "Verify" ใน LINE Developers (ข้ามไปเลย ไม่ต้องตอบกลับ)
      if (event.replyToken === "00000000000000000000000000000000" || event.replyToken === "ffffffffffffffffffffffffffffffff") {
        return null;
      }

      // 🛡️ 2. รับเฉพาะข้อความตัวอักษร
      if (event.type !== 'message' || event.message.type !== 'number' && event.message.type !== 'text') {
        return null;
      }

      const userMessage = event.message.text.trim().toUpperCase();
      const userId = event.source.userId;

      // 🎯 3. ถ้าพิมพ์ "A" (จาก Rich Menu หรือพิมพ์เอง)
      if (userMessage === "A") {
        const redis = new Redis({ url: redisUrl, token: redisToken });
        const key = `memberlink:${userId}`;

        alert("Debug: Checking Redis for key " + key); // เพิ่ม Alert เพื่อ Debug
        
        // ดึงข้อมูลการผูกบัญชีจาก Redis
        let linkData = await redis.get(key);
        
        // ถ้าเป็น String ให้แปลงเป็น JSON
        if (typeof linkData === 'string') {
          try { linkData = JSON.parse(linkData); } catch(e) { console.error("JSON Parse Error", e); }
        }

        // ❌ กรณีผู้ใช้ยังไม่ได้เปิด LIFF เพื่อผูกข้อมูล
        if (!linkData || !linkData.customerId || !linkData.memberId) {
          return client.replyMessage(event.replyToken, {
            type: "text",
            text: "⚠️ คุณยังไม่ได้ผูกข้อมูลสมาชิกครับ\n\nกรุณากดเมนูเพื่อกรอก CustomerID และ MemberID ในหน้าเว็บก่อนครับ"
          });
        }

        // ✅ กรณีมีข้อมูลแล้ว -> ยิง API ไปหา UAT
        try {
          const apiUrl = `https://uat-chapanakij.thaijobjob.com/api/uat/chatme/member/${encodeURIComponent(linkData.customerId)}/${encodeURIComponent(linkData.memberId)}`;
          const apiResp = await fetch(apiUrl, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' } 
          });
          const result = await apiResp.json();

          if (result.respCode === "200" && result.data) {
            const d = result.data;
            const p = d.PaymentInfo || {};
            
            // จัดรูปแบบข้อความตอบกลับ
            const replyMsg = 
`[ข้อมูลสมาชิกของคุณ]
👤 ชื่อ: ${d.Name}
📌 สถานะ: ${d.Status}
📝 ประเภท: ${d.RegisType}
💳 การชำระเงิน: ${p.PayForm || 'หักเงินจากธนาคาร'}
🔗 รายละเอียด: ${d.InfoURL || '-'}`;

            return client.replyMessage(event.replyToken, { type: "text", text: replyMsg });
          } else {
            return client.replyMessage(event.replyToken, { 
              type: "text", 
              text: `❌ ไม่พบข้อมูลในระบบหลัก: ${result.respMsg || 'กรุณาลองใหม่'}` 
            });
          }
        } catch (apiErr) {
          console.error("API UAT Error", apiErr);
          return client.replyMessage(event.replyToken, { type: "text", text: "❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์หลัก" });
        }
      }

      // 🎯 4. กรณีพิมพ์คำสั่งอื่น (B, C, D...) หรือพิมพ์ทั่วไป
      // (คุณสามารถเพิ่มเงื่อนไข else if (userMessage === "B") ได้ที่นี่)
      // return client.replyMessage(event.replyToken, {
      //   type: "text",
      //   text: `คุณพิมพ์ว่า: ${event.message.text}\n\n(พิมพ์ A เพื่อตรวจสอบข้อมูลสมาชิก)`
      // });

    }));

    return res.status(200).json(results);
    
  } catch (error) {
    console.error("Webhook Error:", error);
    // ตอบ 200 ไว้เพื่อให้ LINE ไม่ฟ้อง Error (แต่เอาไปดู Error ใน Vercel Logs แทน)
    return res.status(200).json({ status: "error", message: error.message });
  }
};