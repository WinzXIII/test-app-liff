require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path'); // เพิ่ม module สำหรับจัดการ path ของไฟล์

const app = express();

app.use(cors());
app.use(express.json());

// Import ไฟล์ฟังก์ชัน
const webhookHandler = require('./api/webhook.js');
const linkMemberHandler = require('./api/link-member.js');
// const pingHandler = require('./api/ping.js'); // คอมเมนต์ไว้ถ้าไม่ได้แก้เป็น CommonJS

// Route สำหรับ API
app.all('/api/webhook', (req, res) => webhookHandler(req, res));
app.all('/api/link-member', (req, res) => linkMemberHandler(req, res));

// 🌐 Route สำหรับแสดงหน้าเว็บ LIFF (index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index3.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Local Server is running on http://localhost:${PORT}`);
  console.log(`🌐 Webpage URL: http://localhost:${PORT}/`);
  console.log(`👉 Webhook URL: http://localhost:${PORT}/api/webhook`);
});