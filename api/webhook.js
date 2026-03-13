import line from "@line/bot-sdk";
import { Redis } from "@upstash/redis";

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function callMemberApi(customerId, memberId) {
  const apiUrl = `https://uat-chapanakij.thaijobjob.com/api/uat/chatme/member/${encodeURIComponent(customerId)}/${encodeURIComponent(memberId)}`;

  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const json = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(`Member API HTTP ${resp.status}: ${JSON.stringify(json)}`);
  return json;
}

function formatMember(data) {
  const p = data.PaymentInfo || {};
  const lines = [
    "[ข้อมูลสมาชิก]",
    `CustomerID: ${data.CustomerID || "-"}`,
    `MemberID: ${data.MemberID || "-"}`,
    `ชื่อ: ${data.Name || "-"}`,
    `สถานะ: ${data.Status || "-"}`,
    `RegisType: ${data.RegisType || "-"}`,
    `MemberType: ${data.MemberType || "-"}`,
    "",
    "[การชำระเงิน]",
    `PayType: ${p.PayType || "-"}`,
    `PayForm: ${p.PayForm || "-"}`,
    `PayAccountName: ${p.PayAccountName || "-"}`,
    `PayAccountNumber: ${p.PayAccountNumber || "-"}`,
  ];
  if (data.InfoURL) lines.push("", `ดูรายละเอียด: ${data.InfoURL}`);
  return lines.join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method Not Allowed" });

  try {
    const events = req.body?.events || [];
    if (!events.length) return res.status(200).send("OK");

    await Promise.all(
      events.map(async (event) => {
        // ดัก verify token ของ LINE
        if (
          event.replyToken === "00000000000000000000000000000000" ||
          event.replyToken === "ffffffffffffffffffffffffffffffff"
        ) return;

        if (event.type !== "message" || event.message.type !== "text") return;

        const text = (event.message.text || "").trim().toUpperCase();

        if (text === "A") {
          const userId = event.source?.userId;
          if (!userId) {
            return client.replyMessage(event.replyToken, { type: "text", text: "ไม่พบ LINE userId" });
          }

          const key = `memberlink:${userId}`;
          const link = await redis.get(key);

          if (!link?.customerId || !link?.memberId) {
            return client.replyMessage(event.replyToken, {
              type: "text",
              text: "ยังไม่ได้ผูก CustomerID/MemberID ครับ กรุณาเปิด LIFF เพื่อกรอกข้อมูลก่อน",
            });
          }

          const apiResult = await callMemberApi(link.customerId, link.memberId);

          if (apiResult?.respCode === "200" && apiResult?.data) {
            return client.replyMessage(event.replyToken, {
              type: "text",
              text: formatMember(apiResult.data),
            });
          }

          return client.replyMessage(event.replyToken, {
            type: "text",
            text: `ไม่สำเร็จ: ${apiResult?.respMsg || "Unknown error"}`,
          });
        }

        // เมนูอื่นๆ
        return client.replyMessage(event.replyToken, {
          type: "text",
          text: "เมนู: A, B, C, D, E, F (พิมพ์ A เพื่อดึงข้อมูลสมาชิก)",
        });
      })
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}