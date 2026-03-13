const line = require("@line/bot-sdk");
const { Redis } = require("@upstash/redis");

function getEnv(name) {
  const v = process.env[name];
  return v && String(v).trim() ? v : null;
}

const isDummyToken = (t) =>
  t === "00000000000000000000000000000000" || t === "ffffffffffffffffffffffffffffffff";

async function callMemberApi(customerId, memberId) {
  const apiUrl = `https://uat-chapanakij.thaijobjob.com/api/uat/chatme/member/${encodeURIComponent(
    customerId
  )}/${encodeURIComponent(memberId)}`;

  const resp = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "application/json" } });
  const result = await resp.json().catch(() => null);
  return { resp, result };
}

function formatMember(d) {
  const p = d.PaymentInfo || {};
  return (
    `[ข้อมูลสมาชิก]\n` +
    `CustomerID: ${d.CustomerID || "-"}\n` +
    `MemberID: ${d.MemberID || "-"}\n` +
    `ชื่อ: ${d.Name || "-"}\n` +
    `��ถานะ: ${d.Status || "-"}\n` +
    `RegisType: ${d.RegisType || "-"}\n` +
    `MemberType: ${d.MemberType || "-"}\n\n` +
    `[การชำระเงิน]\n` +
    `PayType: ${p.PayType || "-"}\n` +
    `PayForm: ${p.PayForm || "-"}\n` +
    `PayAccountName: ${p.PayAccountName || "-"}\n` +
    `PayAccountNumber: ${p.PayAccountNumber || "-"}\n` +
    (d.InfoURL ? `\nดูรายละเอียด: ${d.InfoURL}` : "")
  );
}

module.exports = async function handler(req, res) {
  // health check
  if (req.method === "GET") return res.status(200).send("OK");
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  try {
    const CHANNEL_ACCESS_TOKEN = getEnv("CHANNEL_ACCESS_TOKEN");
    const CHANNEL_SECRET = getEnv("CHANNEL_SECRET");
    const UPSTASH_REDIS_REST_URL = getEnv("UPSTASH_REDIS_REST_URL");
    const UPSTASH_REDIS_REST_TOKEN = getEnv("UPSTASH_REDIS_REST_TOKEN");

    if (!CHANNEL_ACCESS_TOKEN || !CHANNEL_SECRET) {
      console.error("Missing LINE env");
      return res.status(200).json({ ok: false, error: "Missing LINE env" });
    }
    if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
      console.error("Missing Upstash env");
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

    const events = req.body && Array.isArray(req.body.events) ? req.body.events : [];
    if (!events.length) return res.status(200).json({ ok: true, note: "no events" });

    await Promise.all(
      events.map(async (event) => {
        if (!event?.replyToken || isDummyToken(event.replyToken)) return;
        if (event.type !== "message" || event.message?.type !== "text") return;

        const text = String(event.message.text || "").trim().toUpperCase();

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

        const { resp, result } = await callMemberApi(link.customerId, link.memberId);

        if (result?.respCode === "200" && result?.data) {
          return client.replyMessage(event.replyToken, { type: "text", text: formatMember(result.data) });
        }

        return client.replyMessage(event.replyToken, {
          type: "text",
          text: `ไม่สำเร็จ: ${result?.respMsg || `HTTP ${resp.status}`}`,
        });
      })
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("webhook runtime error:", err);
    // ตอบ 200 ไว้เพื่อให้ Verify ผ่าน แล้วค่อยดู log ต่อ
    return res.status(200).json({ ok: false, error: String(err?.message || err) });
  }
};