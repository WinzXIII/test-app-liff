import line from "@line/bot-sdk";
import { Redis } from "@upstash/redis";

function getEnv(name) {
  const v = process.env[name];
  return v && String(v).trim() ? v : null;
}

export default async function handler(req, res) {
  // ✅ ใช้เช็คว่า route ทำงาน
  if (req.method === "GET") return res.status(200).send("OK");

  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  try {
    // ✅ ตรวจ env ก่อนสร้าง client/redis เพื่อกัน crash
    const CHANNEL_ACCESS_TOKEN = getEnv("CHANNEL_ACCESS_TOKEN");
    const CHANNEL_SECRET = getEnv("CHANNEL_SECRET");
    const UPSTASH_REDIS_REST_URL = getEnv("UPSTASH_REDIS_REST_URL");
    const UPSTASH_REDIS_REST_TOKEN = getEnv("UPSTASH_REDIS_REST_TOKEN");

    if (!CHANNEL_ACCESS_TOKEN || !CHANNEL_SECRET) {
      console.error("Missing LINE env:", { CHANNEL_ACCESS_TOKEN: !!CHANNEL_ACCESS_TOKEN, CHANNEL_SECRET: !!CHANNEL_SECRET });
      return res.status(200).json({ ok: false, error: "Missing LINE env" });
    }

    if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
      console.error("Missing Upstash env:", { UPSTASH_REDIS_REST_URL: !!UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN: !!UPSTASH_REDIS_REST_TOKEN });
      return res.status(200).json({ ok: false, error: "Missing Upstash env" });
    }

    const client = new line.Client({
      channelAccessToken: CHANNEL_ACCESS_TOKEN,
      channelSecret: CHANNEL_SECRET,
    });

    const redis = new Redis({
      url: UPSTASH_REDIS_REST_URL,
      token: UPSTASH_REDIS_REST_TOKEN,
    });

    const events = req.body?.events;
    if (!Array.isArray(events) || events.length === 0) {
      // LINE Verify บางทีส่ง payload แปลก ๆ — ตอบ 200 ไว้ก่อน
      return res.status(200).json({ ok: true, note: "no events" });
    }

    const isDummyToken = (t) =>
      t === "00000000000000000000000000000000" || t === "ffffffffffffffffffffffffffffffff";

    await Promise.all(
      events.map(async (event) => {
        if (!event?.replyToken || isDummyToken(event.replyToken)) return;
        if (event.type !== "message" || event.message?.type !== "text") return;

        const text = (event.message.text || "").trim().toUpperCase();

        if (text !== "A") {
          return client.replyMessage(event.replyToken, { type: "text", text: "พิมพ์ A เพื่อดึงข้อมูลสมาชิก" });
        }

        const userId = event.source?.userId;
        if (!userId) {
          return client.replyMessage(event.replyToken, { type: "text", text: "ไม่พบ LINE userId" });
        }

        const link = await redis.get(`memberlink:${userId}`);
        if (!link?.customerId || !link?.memberId) {
          return client.replyMessage(event.replyToken, {
            type: "text",
            text: "ยังไม่ได้ผูก CustomerID/MemberID ครับ กรุณาเปิด LIFF เพื่อกรอกข้อมูลก่อน",
          });
        }

        const apiUrl = `https://uat-chapanakij.thaijobjob.com/api/uat/chatme/member/${encodeURIComponent(
          link.customerId
        )}/${encodeURIComponent(link.memberId)}`;

        const resp = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "application/json" } });
        const result = await resp.json().catch(() => null);

        if (result?.respCode === "200" && result?.data) {
          const d = result.data;
          const p = d.PaymentInfo || {};
          const msg =
            `[ข้อมูลสมาชิก]\n` +
            `CustomerID: ${d.CustomerID || "-"}\n` +
            `MemberID: ${d.MemberID || "-"}\n` +
            `ชื่อ: ${d.Name || "-"}\n` +
            `สถานะ: ${d.Status || "-"}\n` +
            `RegisType: ${d.RegisType || "-"}\n` +
            `MemberType: ${d.MemberType || "-"}\n\n` +
            `[การชำระเงิน]\n` +
            `PayType: ${p.PayType || "-"}\n` +
            `PayForm: ${p.PayForm || "-"}\n` +
            `PayAccountName: ${p.PayAccountName || "-"}\n` +
            `PayAccountNumber: ${p.PayAccountNumber || "-"}\n` +
            (d.InfoURL ? `\nดูรายละเอียด: ${d.InfoURL}` : "");

          return client.replyMessage(event.replyToken, { type: "text", text: msg });
        }

        return client.replyMessage(event.replyToken, {
          type: "text",
          text: `ไม่สำเร็จ: ${result?.respMsg || `HTTP ${resp.status}`}`,
        });
      })
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("webhook crashed:", err);
    // ✅ ตอบ 200 เพื่อให้ Verify ไม่ล้ม (แล้วดู log เอา)
    return res.status(200).json({ ok: false, error: String(err?.message || err) });
  }
}