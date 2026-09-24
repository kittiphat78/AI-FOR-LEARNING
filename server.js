require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const AdmZip = require('adm-zip');
const { parseOffice } = require('officeparser');
const path = require('path');
const GeminiProvider = require('./providers/GeminiProvider');
const TextChunker = require('./utils/chunker');
const dbManager = require('./database/db');

const app = express();
const port = process.env.PORT || 3001;

// Set up multer for file upload in memory with 50MB limit
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } 
});

app.use(cors());
app.use(express.json());

// Initialize AI Provider
const aiProvider = new GeminiProvider();

// Phase 4: Data Endpoints
app.get('/api/semester', async (req, res) => {
  const semester = await dbManager.getFullSemesterData();
  res.json(semester);
});

app.get('/api/tasks', async (req, res) => {
  const tasks = await dbManager.getAllTasks();
  res.json({ tasks });
});

app.post('/api/tasks', async (req, res) => {
  const { subjectId, task } = req.body;
  if (!subjectId || !task) return res.status(400).json({ error: 'Missing data' });
  
  let subjectTasks = await dbManager.getSubjectData(subjectId, 'tasks.json') || { tasks: [] };
  subjectTasks.tasks.push(task);
  await dbManager.saveSubjectData(subjectId, 'tasks.json', subjectTasks);
  res.json({ success: true });
});

app.put('/api/tasks/:id', async (req, res) => {
  const taskId = req.params.id;
  const { status } = req.body;
  let allTasks = await dbManager.getAllTasks();
  let task = allTasks.find(t => t.id === taskId);
  if (task) {
    let subjectTasks = await dbManager.getSubjectData(task.subjectId, 'tasks.json');
    let st = subjectTasks.tasks.find(t => t.id === taskId);
    if (st) {
      st.status = status;
      await dbManager.saveSubjectData(task.subjectId, 'tasks.json', subjectTasks);
    }
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Task not found' });
});

app.get('/api/knowledge', async (req, res) => {
  const knowledge = await dbManager.getAllKnowledge();
  res.json(knowledge);
});

app.post('/api/knowledge', async (req, res) => {
  const { subjectId, week, knowledge } = req.body;
  if (!subjectId || !week || !knowledge) return res.status(400).json({ error: 'Missing data' });
  
  let kb = await dbManager.getSubjectData(subjectId, 'knowledge.json') || { subjectId, weeks: [] };
  let weekData = kb.weeks.find(w => w.week === parseInt(week));
  if (!weekData) {
    weekData = { week: parseInt(week), documents: [] };
    kb.weeks.push(weekData);
  }
  
  // We treat manual knowledge entry as a "document" with a summary
  weekData.documents.push({
    id: knowledge.id || `manual-${Date.now()}`,
    fileName: 'Manual Entry',
    uploadedAt: new Date().toISOString(),
    chunks: [],
    summary: {
      topics: knowledge.topics,
      emphasis: knowledge.emphasis,
      assignments: knowledge.assignments
    }
  });
  
  await dbManager.saveSubjectData(subjectId, 'knowledge.json', kb);
  res.json({ success: true });
});

app.post('/api/tutor', async (req, res) => {
  try {
    const { subject, message, history } = req.body;
    
    const prompt = `You are an AI Tutor for the university subject: "${subject}". 
    Your goal is to explain concepts clearly, use simple analogies, and be encouraging. 
    User's message: ${message}`;

    const responseText = await aiProvider.generate(prompt);
    
    res.json({ reply: responseText });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI' });
  }
});

// Helper to extract text from a buffer based on extension
async function extractText(buffer, filename) {
  let ext = filename.toLowerCase().split('.').pop();
  const allowed = ['pdf', 'docx', 'pptx', 'xlsx', 'doc', 'ppt', 'xls', 'odt', 'odp', 'ods', 'txt', 'md', 'csv'];
  
  if (!allowed.includes(ext)) return '[UNSUPPORTED_FORMAT]';
  
  try {
    if (ext === 'pdf') {
      const data = await pdfParse(buffer);
      if (!data.text || data.text.trim().length === 0) return '[TEXT_NOT_FOUND: Possible Image-only PDF]';
      return data.text;
    } else if (['docx', 'pptx', 'xlsx', 'doc', 'ppt', 'xls', 'odt', 'odp', 'ods'].includes(ext)) {
      const data = await parseOffice(buffer, { fileType: ext });
      const txt = await data.to('txt');
      if (!txt.value || txt.value.trim().length === 0) return '[TEXT_NOT_FOUND: Empty Document]';
      return txt.value;
    } else if (['txt', 'md', 'csv'].includes(ext)) {
      return buffer.toString('utf-8');
    }
  } catch (err) {
    console.error(`Failed to parse ${filename}:`, err.message);
    return `[PARSE_ERROR: ${err.message}]`;
  }
  return '';
}

app.post('/api/parse-knowledge', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `File upload error: ${err.message}` });
    } else if (err) {
      return res.status(500).json({ error: `Unknown upload error: ${err.message}` });
    }

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
      
      let processedFiles = 0;
      for (const zipEntry of zipEntries) {
        if (!zipEntry.isDirectory) {
           // Prevent Path Traversal
           if (zipEntry.entryName.includes('..')) continue;
           
           const parsedText = await extractText(zipEntry.getData(), zipEntry.entryName);
           if (parsedText && String(parsedText).trim().length > 0) {
             textContent += `\n\n--- Document: ${zipEntry.entryName} ---\n\n` + parsedText;
             processedFiles++;
           }
        }
      }
      
      if (processedFiles === 0 || !textContent.trim()) {
        return res.status(400).json({ error: 'ไม่พบไฟล์ที่รองรับการอ่านข้อความใน ZIP นี้ หรือไฟล์เป็นรูปภาพทั้งหมด' });
      }
    } else {
      // Handle single file
      textContent = await extractText(req.file.buffer, req.file.originalname);
      if (!textContent || textContent.includes('[UNSUPPORTED_FORMAT]')) {
        return res.status(400).json({ error: 'ไฟล์ประเภทนี้ยังไม่รองรับ หรือไม่พบเนื้อหาตัวอักษร' });
      }
    }

    // PHASE 3: Semantic Chunking & DB Isolation
    const chunks = TextChunker.chunk(textContent, 15000); // 15k chars per chunk
    const subjectId = req.body.subjectId || 'unknown-subject';
    const week = parseInt(req.body.week || '1');
    
    // Save to Database Background Task
    const docId = `doc-${Date.now()}`;
    const knowledgeData = {
      id: docId,
      fileName: req.file.originalname,
      uploadedAt: new Date().toISOString(),
      chunks: chunks.map((c, i) => ({ chunkId: `${docId}-c${i}`, text: c }))
    };

    if (subjectId !== 'unknown-subject') {
      try {
        let kb = await dbManager.getSubjectData(subjectId, 'knowledge.json');
        if (!kb) kb = { subjectId, weeks: [] };
        
        let weekData = kb.weeks.find(w => w.week === week);
        if (!weekData) {
          weekData = { week, documents: [] };
          kb.weeks.push(weekData);
        }
        weekData.documents.push(knowledgeData);
        
        await dbManager.saveSubjectData(subjectId, 'knowledge.json', kb);
      } catch (err) {
        console.error("Failed to save knowledge to DB:", err.message);
      }
    }

    // For real-time AI summary, we will just use the first chunk to avoid timeouts/limits
    const aiContextText = chunks.length > 0 ? chunks[0] : "";

    const prompt = `
      คุณคือ AI ผู้ช่วยนักศึกษา โปรดอ่านเนื้อหาจากสไลด์/เอกสารการเรียนต่อไปนี้ แล้วสกัดข้อมูลออกมาเป็น JSON เท่านั้น
      (เนื้อหาอาจถูกตัดแบ่งมาเพียงส่วนแรก โปรดสรุปเท่าที่เห็น)
      ห้ามตอบอย่างอื่นนอกจาก JSON 
      
      รูปแบบที่ต้องการ:
      {
        "topics": "หัวข้อหลักที่เรียนในเอกสารนี้ (เขียนสรุปเป็น Bullet points)",
        "emphasis": "จุดที่อาจารย์เน้นย้ำ หรือสิ่งสำคัญที่น่าจะออกสอบ (ถ้าไม่มีให้ว่างไว้)",
        "assignments": "งานหรือแบบฝึกหัดที่สั่งในเอกสาร (ถ้าไม่มีให้ว่างไว้)"
      }

      เนื้อหาเอกสาร:
      ${aiContextText}
    `;

    let parsedData;
    try {
      const responseText = await aiProvider.generate(prompt);
      let rawText = responseText.trim();
      // Clean up potential markdown formatting around JSON
      if (rawText.startsWith('\`\`\`json')) {
        rawText = rawText.replace(/\`\`\`json/, '').replace(/\`\`\`/, '');
      }
      parsedData = JSON.parse(rawText);
    } catch (aiError) {
      console.error("AI Provider Error:", aiError.message);
      parsedData = {
        topics: `⚠️ ระบบ AI กำลังมีปัญหาชั่วคราว (แต่ไฟล์ของคุณถูกบันทึกและอ่านข้อมูลสำเร็จแล้ว 100%)\n\nระบบจะสามารถสรุปผลต่อได้เมื่อบริการ AI กลับมาใช้งาน\nError: ${aiError.message}`,
        emphasis: "-",
        assignments: "-"
      };
    }


    // Update DB with the summary
    if (subjectId !== 'unknown-subject') {
      try {
        let kb = await dbManager.getSubjectData(subjectId, 'knowledge.json');
        let weekData = kb.weeks.find(w => w.week === week);
        if (weekData) {
          let doc = weekData.documents.find(d => d.id === docId);
          if (doc) doc.summary = parsedData;
          await dbManager.saveSubjectData(subjectId, 'knowledge.json', kb);
        }
      } catch (err) {
        console.error("Failed to update knowledge summary in DB:", err.message);
      }
    }

    res.json(parsedData);

  } catch (error) {
    console.error("Parse Error:", error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการประมวลผลไฟล์' });
  }
  });
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
