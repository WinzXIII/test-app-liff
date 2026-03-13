const { Redis } = require("@upstash/redis");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  try {
    // ดึงค่าจาก ENV (รองรับทั้งชื่อ UPSTASH และ KV)
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
      return res.status(500).json({ ok: false, message: "Missing Redis Config" });
    }

    const redis = new Redis({ url, token });
    const { userId, customerId, memberId } = req.body || {};

    if (!userId || !customerId || !memberId) {
      return res.status(400).json({ ok: false, message: "Missing required fields" });
    }

    const key = `memberlink:${userId}`;
    // บันทึกข้อมูลแบบ Object
    await redis.set(key, JSON.stringify({ customerId, memberId }));

    console.log(`Success: Linked ${userId} to ${customerId}`);
    return res.status(200).json({ ok: true, message: "Linked successfully" });
  } catch (err) {
    console.error("Link-member Error:", err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};