require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const AdmZip = require('adm-zip');
const { parseOffice } = require('officeparser');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const port = process.env.PORT || 3001;

// Set up multer for file upload in memory
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// Initialize Gemini API
const ai = new GoogleGenAI({});

// Helper to retry Gemini API calls
async function generateContentWithRetry(model, prompt, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await ai.models.generateContent({ model, contents: prompt });
    } catch (err) {
      console.warn(`Gemini API attempt ${i + 1} failed: ${err.message}`);
      if (i === maxRetries - 1) throw err;
      // Wait for 2 seconds before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

app.post('/api/tutor', async (req, res) => {
  try {
    const { subject, message, history } = req.body;
    
    const prompt = `You are an AI Tutor for the university subject: "${subject}". 
    Your goal is to explain concepts clearly, use simple analogies, and be encouraging. 
    User's message: ${message}`;

    const response = await generateContentWithRetry('gemini-3.6-flash', prompt);
    
    res.json({ reply: response.text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI' });
  }
});

// Helper to extract text from a buffer based on extension
async function extractText(buffer, filename) {
  let ext = filename.toLowerCase().split('.').pop();
  if (ext === 'jpeg' || ext === 'jpg' || ext === 'png') return '';
  
  try {
    if (ext === 'pdf') {
      const data = await pdfParse(buffer);
      return data.text;
    } else if (['docx', 'pptx', 'xlsx', 'doc', 'ppt', 'xls', 'odt', 'odp', 'ods'].includes(ext)) {
      // officeparser parses these formats
      const data = await parseOffice(buffer, { fileType: ext });
      const txt = await data.to('txt');
      return txt.value;
    } else if (['txt', 'md', 'csv'].includes(ext)) {
      return buffer.toString('utf-8');
    }
  } catch (err) {
    console.error(`Failed to parse ${filename}:`, err);
  }
  return '';
}

app.post('/api/parse-knowledge', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let textContent = '';
    const isZip = req.file.mimetype === 'application/zip' || req.file.mimetype === 'application/x-zip-compressed' || req.file.originalname.endsWith('.zip');

    if (isZip) {
      // Handle ZIP file
      const zip = new AdmZip(req.file.buffer);
      const zipEntries = zip.getEntries();
      
      for (const zipEntry of zipEntries) {
        if (!zipEntry.isDirectory) {
           const parsedText = await extractText(zipEntry.getData(), zipEntry.entryName);
           if (parsedText && String(parsedText).trim().length > 0) {
             textContent += `\n\n--- Document: ${zipEntry.entryName} ---\n\n` + parsedText;
           }
        }
      }
      
      if (!textContent) {
        return res.status(400).json({ error: 'ไม่พบไฟล์ที่รองรับการอ่านข้อความใน ZIP นี้' });
      }
    } else {
      // Handle single file
      textContent = await extractText(req.file.buffer, req.file.originalname);
      if (!textContent || String(textContent).trim().length === 0) {
        // Fallback
        textContent = req.file.buffer.toString('utf-8'); 
      }
    }

    // Limit text length to prevent exceeding token limits
    if (textContent.length > 25000) {
      textContent = textContent.substring(0, 25000); 
    }

    const prompt = `
      คุณคือ AI ผู้ช่วยนักศึกษา โปรดอ่านเนื้อหาจากสไลด์/เอกสารการเรียนต่อไปนี้ แล้วสกัดข้อมูลออกมาเป็น JSON เท่านั้น
      ห้ามตอบอย่างอื่นนอกจาก JSON 
      
      รูปแบบที่ต้องการ:
      {
        "topics": "หัวข้อหลักที่เรียนในเอกสารนี้ (เขียนสรุปเป็น Bullet points)",
        "emphasis": "จุดที่อาจารย์เน้นย้ำ หรือสิ่งสำคัญที่น่าจะออกสอบ (ถ้าไม่มีให้ว่างไว้)",
        "assignments": "งานหรือแบบฝึกหัดที่สั่งในเอกสาร (ถ้าไม่มีให้ว่างไว้)"
      }

      เนื้อหาเอกสาร:
      ${textContent}
    `;

    const response = await generateContentWithRetry('gemini-3.6-flash', prompt);

    let rawText = response.text.trim();
    // Clean up potential markdown formatting around JSON
    if (rawText.startsWith('\`\`\`json')) {
      rawText = rawText.replace(/\`\`\`json/, '').replace(/\`\`\`/, '');
    }

    const parsedData = JSON.parse(rawText);
    res.json(parsedData);

  } catch (error) {
    console.error("Parse Error:", error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการประมวลผลไฟล์' });
  }
});

// Phase 9.2: Automated MS Teams Notification (Actual Webhook)
app.post('/api/notify/teams', async (req, res) => {
  try {
    const { tasks } = req.body;
    
    if (!tasks || tasks.length === 0) {
      return res.status(200).json({ message: 'No urgent tasks to notify.' });
    }

    const webhookUrl = process.env.TEAMS_WEBHOOK_URL;

    // Log to console first
    console.log(`\n🔔 [MS Teams Notification Initiated]`);
    console.log(`Sending alert for ${tasks.length} urgent task(s)...`);
    
    // Construct the payload for MS Teams (MessageCard format)
    const facts = tasks.map(t => ({
      name: `📌 [${t.subject || 'Unknown'}] ${t.name}`,
      value: `กำหนดส่ง: **${t.deadline}**`
    }));

    const payload = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      "themeColor": "D97706",
      "summary": "AI Study Team - แจ้งเตือนงานด่วน",
      "sections": [{
        "activityTitle": "🚨 มีงานด่วนใกล้ถึงกำหนดส่ง!",
        "activitySubtitle": "แจ้งเตือนอัตโนมัติจาก AI Study Team",
        "activityImage": "https://cdn-icons-png.flaticon.com/512/3233/3233483.png",
        "facts": facts,
        "markdown": true
      }]
    };

    if (!webhookUrl || webhookUrl.trim() === '' || webhookUrl === 'your_teams_webhook_url_here') {
      console.log(`⚠️ TEAMS_WEBHOOK_URL is not set in .env! Simulating output instead.`);
      tasks.forEach(t => console.log(` - [${t.subject}] ${t.name} (Due: ${t.deadline})`));
      console.log(`========================================\n`);
      return res.json({ success: true, message: 'บันทึกแจ้งเตือนลง Console สำเร็จ (กรุณาตั้งค่า TEAMS_WEBHOOK_URL เพื่อส่งเข้า MS Teams จริง)' });
    }

    // Send to MS Teams Webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Teams API Error: ${response.status} - ${errText}`);
      throw new Error(`Failed to send to MS Teams: ${response.statusText}`);
    }

    console.log(`✅ Successfully sent to MS Teams!`);
    console.log(`========================================\n`);

    res.json({ success: true, message: 'แจ้งเตือนไปยัง MS Teams สำเร็จแล้ว!' });
  } catch (error) {
    console.error("Teams Notify Error:", error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการส่งแจ้งเตือน: ' + error.message });
  }
});

app.listen(port, () => {
  console.log(`AI Study Team Backend running at http://localhost:${port}`);
  console.log('อย่าลืมตั้งค่า GEMINI_API_KEY ในไฟล์ .env ด้วยนะครับ!');
});
