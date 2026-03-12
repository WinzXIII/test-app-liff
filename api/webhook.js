const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const events = req.body.events;
    
    // ถ้าไม่มี events (เผื่อกรณีระบบส่งเช็คสถานะเฉยๆ)
    if (!events || events.length === 0) {
      return res.status(200).send('OK');
    }
    
    const results = await Promise.all(events.map(async (event) => {
      // 🌟 [สำคัญ] ดักจับการกดปุ่ม Verify จาก LINE Developers
      // ถ้าเป็น token จำลอง ให้ข้ามการทำงานไปเลย ไม่ต้องตอบกลับ
      if (event.replyToken === '00000000000000000000000000000000' || event.replyToken === 'ffffffffffffffffffffffffffffffff') {
        return null;
      }

      if (event.type !== 'message' || event.message.type !== 'text') {
        return null;
      }

      // ตอบกลับข้อความ
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'คุณพิมพ์ว่า: ' + event.message.text
      });
    }));

    return res.status(200).json(results);
    
  } catch (error) {
    console.error("Error from webhook:", error.message || error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}