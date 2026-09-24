const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const SUBJECTS_DIR = path.join(DATA_DIR, 'subjects');

/**
 * DBManager handles reading and writing isolated JSON files
 */
class DBManager {
  
  async ensureDirs() {
    await fs.mkdir(SUBJECTS_DIR, { recursive: true });
  }

  // --- SEMESTER ---
  async getSemester() {
    try {
      const data = await fs.readFile(path.join(DATA_DIR, 'semester.json'), 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }

  async getFullSemesterData() {
    let semester = await this.getSemester();
    if (!semester) {
      semester = { id: 'default', name: 'Semester', subjects: [] };
    }
    
    // Instead of using legacy subjects, we build it from the isolated folders
    const subjectIds = await this.getSubjectIds();
    const subjects = [];
    for (const sid of subjectIds) {
      const meta = await this.getSubjectData(sid, 'metadata.json');
      if (meta) subjects.push(meta);
    }
    
    semester.subjects = subjects;
    return semester;
  }

  // --- SUBJECTS ISOLATION ---
  async getSubjectIds() {
    await this.ensureDirs();
    const entries = await fs.readdir(SUBJECTS_DIR, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  }

  async getAllTasks() {
    const subjectIds = await this.getSubjectIds();
    let allTasks = [];
    for (const sid of subjectIds) {
      const data = await this.getSubjectData(sid, 'tasks.json');
      if (data && data.tasks) allTasks.push(...data.tasks);
    }
    return allTasks;
  }

  async getAllKnowledge() {
    const subjectIds = await this.getSubjectIds();
    let allKnowledge = [];
    for (const sid of subjectIds) {
      const kb = await this.getSubjectData(sid, 'knowledge.json');
      // format knowledge to fit frontend expectations (flattened summary)
      if (kb && kb.weeks) {
        kb.weeks.forEach(w => {
          w.documents.forEach(doc => {
            if (doc.summary) {
              allKnowledge.push({
                subjectId: sid,
                week: w.week,
                docId: doc.id,
                topics: doc.summary.topics || '',
                emphasis: doc.summary.emphasis || '',
                assignments: doc.summary.assignments || ''
              });
            }
          });
        });
      }
    }
    return allKnowledge;
  }

  async getSubjectData(subjectId, filename) {
    try {
      const filePath = path.join(SUBJECTS_DIR, subjectId, filename);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      if (filename === 'knowledge.json') return { weeks: [] };
      if (filename === 'tasks.json') return { tasks: [] };
      return null;
    }
  }

  async saveSubjectData(subjectId, filename, data) {
    const dir = path.join(SUBJECTS_DIR, subjectId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), JSON.stringify(data, null, 2), 'utf8');
  }

  // --- MIGRATION SCRIPT ---
  async migrateFromLegacy() {
    console.log('[DBManager] Starting migration to Subject-Isolated structure...');
    await this.ensureDirs();
    
    // 1. Read legacy semester
    const semester = await this.getSemester();
    if (!semester || !semester.subjects) {
      console.log('[DBManager] No legacy semester.json found or already migrated.');
      return;
    }

    // 2. Read legacy tasks
    let legacyTasks = [];
    try {
      const tasksData = await fs.readFile(path.join(DATA_DIR, 'tasks.json'), 'utf8');
      legacyTasks = JSON.parse(tasksData).tasks || [];
    } catch (e) {
      // ignore
    }

    // 3. Isolate each subject
    for (const sub of semester.subjects) {
      // Save metadata
      await this.saveSubjectData(sub.id, 'metadata.json', sub);
      
      // Save tasks for this subject
      const subTasks = legacyTasks.filter(t => t.subjectId === sub.id);
      await this.saveSubjectData(sub.id, 'tasks.json', { tasks: subTasks });
      
      // Initialize knowledge base
      const existingKB = await this.getSubjectData(sub.id, 'knowledge.json');
      if (!existingKB || existingKB.weeks.length === 0) {
        await this.saveSubjectData(sub.id, 'knowledge.json', {
          subjectId: sub.id,
          weeks: []
        });
      }
    }

    console.log('[DBManager] Migration completed successfully.');
  }
}

module.exports = new DBManager();
