const { Redis } = require("@upstash/redis");

function getEnv(name) {
  const v = process.env[name];
  return v && String(v).trim() ? v : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  try {
    const url = getEnv("UPSTASH_REDIS_REST_URL");
    const token = getEnv("UPSTASH_REDIS_REST_TOKEN");
    if (!url || !token) return res.status(500).json({ message: "Missing Upstash env" });

    const redis = new Redis({ url, token });

    const { userId, customerId, memberId } = req.body || {};
    if (!userId || !customerId || !memberId) {
      return res.status(400).json({ message: "Missing userId/customerId/memberId" });
    }

    await redis.set(`memberlink:${userId}`, { customerId, memberId });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("link-member error:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};