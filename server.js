require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize Gemini API
// Note: It expects GEMINI_API_KEY to be set in .env
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

app.listen(port, () => {
  console.log(`AI Study Team Backend running at http://localhost:${port}`);
  console.log('อย่าลืมตั้งค่า GEMINI_API_KEY ในไฟล์ .env ด้วยนะครับ!');
});
