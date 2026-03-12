const line = require('@line/bot-sdk');

// ดึงค่า Token และ Secret จาก Environment Variables ของ Vercel
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);

// ฟังก์ชันหลักที่ Vercel จะเรียกใช้งาน
export default async function handler(req, res) {
  // รับเฉพาะ HTTP POST เท่านั้น
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const events = req.body.events;
    
    // วนลูปจัดการทุกอีเวนต์ที่ LINE ส่งมา
    const results = await Promise.all(events.map(async (event) => {
      // ตรวจสอบว่าเป็นข้อความประเภท Text หรือไม่
      if (event.type !== 'message' || event.message.type !== 'text') {
        return null;
      }

      // บอทตอบกลับตามที่พิมพ์มา
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'คุณพิมพ์ว่า: ' + event.message.text
      });
    }));

    // ตอบกลับ LINE ว่ารับข้อมูลสำเร็จ (HTTP 200)
    return res.status(200).json(results);
    
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}