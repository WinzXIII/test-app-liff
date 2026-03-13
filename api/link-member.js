const { Redis } = require("@upstash/redis");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      return res.status(500).json({ ok: false, message: "Missing Upstash Environment Variables" });
    }

    const redis = new Redis({ url, token });

    const { userId, customerId, memberId } = req.body || {};
    if (!userId || !customerId || !memberId) {
      return res.status(400).json({ ok: false, message: "Missing data" });
    }

    // บันทึกข้อมูล
    const key = `memberlink:${userId}`;
    await redis.set(key, { customerId, memberId });

    return res.status(200).json({ ok: true, message: "Saved successfully" });
  } catch (err) {
    console.error("link-member error:", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};