const { Redis } = require("@upstash/redis");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;

    // รองรับทั้ง payload ที่ส่งมาเป็น userId หรือ lineUserId
    const { userId, lineUserId, customerId, memberId } = req.body || {};
    const targetLineId = lineUserId || userId;

    if (!targetLineId || !customerId || !memberId) {
      return res.status(400).json({ respCode: "400", respMsg: "Missing required fields" });
    }

    // ---------------------------------------------------------
    // STEP 1: ยิงไปผูกบัญชีกับ API หลังบ้านหลัก (MySQL)
    // ---------------------------------------------------------
    // const backendApiUrl = "https://uat-chapanakij.thaijobjob.com/api/uat/chatme/linkAccount";
    const backendApiUrl = process.env.API_URL;
    
    const backendResponse = await fetch(backendApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.API_KEY || '' // 🔴 อย่าลืมตั้งค่า API_KEY ใน Environment ของ Vercel
      },
      body: JSON.stringify({
        lineUserId: targetLineId,
        customerId: customerId,
        memberId: memberId
      })
    });

    const backendResult = await backendResponse.json();

    // ---------------------------------------------------------
    // STEP 2: ถ้าผูกสำเร็จ (200) หรือ ผูกไว้แล้ว (409) ให้จำลง Redis
    // เพื่อให้ webhook.js ดึงข้อมูลได้ไวที่สุดเวลาลูกค้าพิมพ์ A หรือ B
    // ---------------------------------------------------------
    if (backendResult.respCode === "200" || backendResult.respCode === "409") {
      if (url && token) {
        const redis = new Redis({ url, token });
        const key = `memberlink:${targetLineId}`;
        await redis.set(key, JSON.stringify({ customerId, memberId }));
      }
    }

    // ส่งผลลัพธ์กลับไปให้หน้า LIFF เพื่อแสดง Alert ให้ผู้ใช้เห็น
    return res.status(200).json(backendResult);

  } catch (err) {
    console.error("Link-member Error:", err.message);
    return res.status(500).json({ respCode: "500", respMsg: err.message });
  }
};