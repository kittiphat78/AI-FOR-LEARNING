require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const port = process.env.PORT || 3001;

// Set up multer for file upload in memory
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// Initialize Gemini API
const ai = new GoogleGenAI({});

app.post('/api/tutor', async (req, res) => {
  try {
    const { subject, message, history } = req.body;
    
    const prompt = `You are an AI Tutor for the university subject: "${subject}". 
    Your goal is to explain concepts clearly, use simple analogies, and be encouraging. 
    User's message: ${message}`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
    res.json({ reply: response.text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI' });
  }
});

app.post('/api/parse-knowledge', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let textContent = '';

    // Handle PDF
    if (req.file.mimetype === 'application/pdf') {
      const data = await pdfParse(req.file.buffer);
      textContent = data.text;
    } else {
      // For now, if not PDF, we just pretend we read it or handle text
      textContent = req.file.buffer.toString('utf-8'); 
    }

    // Limit text length to prevent exceeding token limits
    if (textContent.length > 50000) {
      textContent = textContent.substring(0, 50000); 
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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

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

app.listen(port, () => {
  console.log(`AI Study Team Backend running at http://localhost:${port}`);
  console.log('อย่าลืมตั้งค่า GEMINI_API_KEY ในไฟล์ .env ด้วยนะครับ!');
});
