const line = require("@line/bot-sdk");
const { Redis } = require("@upstash/redis");

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

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
        
        // จัดการข้อมูลจาก Redis (เผื่อเป็น String หรือ Object)
        if (typeof linkData === 'string') {
          try { linkData = JSON.parse(linkData); } catch(e) {}
        }

        if (!linkData || !linkData.customerId) {
          return client.replyMessage(event.replyToken, {
            type: "text",
            text: "⚠️ ยังไม่ได้ผูกข้อมูลสมาชิกครับ\nกรุณาลงทะเบียนผ่านหน้าเว็บ LIFF ก่อนครับ"
          });
        }

        const apiUrl = `https://uat-chapanakij.thaijobjob.com/api/uat/chatme/member/${encodeURIComponent(linkData.customerId)}/${encodeURIComponent(linkData.memberId)}`;
        const apiResp = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const result = await apiResp.json();

        if (result.respCode === "200" && result.data) {
          const d = result.data;
          const p = d.PaymentInfo || {};
          const replyMsg = `[ข้อมูลสมาชิก]\n👤 ชื่อ: ${d.Name}\n📌 สถานะ: ${d.Status}\n📝 ประเภท: ${d.RegisType}\n💳 การชำระเงิน: ${p.PayForm || 'หักเงินจากธนาคาร'}`;
          return client.replyMessage(event.replyToken, { type: "text", text: replyMsg });
        } else {
          return client.replyMessage(event.replyToken, { type: "text", text: "❌ ไม่พบข้อมูลในระบบหลัก" });
        }
      }
    }));

    return res.status(200).json(results);
  } catch (error) {
    console.error("Webhook Error:", error);
    return res.status(200).json({ status: "error" });
  }
};