import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  try {
    const { userId, customerId, memberId } = req.body || {};
    if (!userId || !customerId || !memberId) {
      return res.status(400).json({ message: "Missing userId/customerId/memberId" });
    }

    const key = `memberlink:${userId}`;
    await redis.set(key, { customerId, memberId });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}