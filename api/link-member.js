const { Redis } = require("@upstash/redis");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  try {
    // บังคับให้ใช้ KV_REST_API_URL และ KV_REST_API_TOKEN เท่านั้น
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
      console.error("Missing Redis Config in link-member.js");
      return res.status(500).json({ ok: false, message: "Missing Redis Config" });
    }

    const redis = new Redis({ url, token });
    const { userId, customerId, memberId } = req.body || {};

    if (!userId || !customerId || !memberId) {
      return res.status(400).json({ ok: false, message: "Missing required fields" });
    }

    const key = `memberlink:${userId}`;
    await redis.set(key, JSON.stringify({ customerId, memberId }));

    return res.status(200).json({ ok: true, message: "Linked successfully" });
  } catch (err) {
    console.error("Link-member Error:", err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};