/**
 * AI Study Team - Main Application Logic
 */

// ==========================================
// 1. Application State
// ==========================================
const AppState = {
  semester: null,
  tasks: [],
  subjectsMap: new Map(), // id -> subject object
  currentView: 'dashboard',
  currentSubjectId: null,
  theme: localStorage.getItem('ai_study_theme') || 'dark',
  db: {
    getTasks: () => JSON.parse(localStorage.getItem('ai_study_tasks') || '[]'),
    saveTasks: (tasks) => localStorage.setItem('ai_study_tasks', JSON.stringify(tasks)),
    getWeeklyKnowledge: () => JSON.parse(localStorage.getItem('ai_study_knowledge') || '[]'),
    saveWeeklyKnowledge: (k) => localStorage.setItem('ai_study_knowledge', JSON.stringify(k)),
  }
};

// ==========================================
// 2. Initialization & Data Loading
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadData();
    initUI();
    bindEvents();
    renderApp();
  } catch (error) {
    console.error('Error initializing app:', error);
    showToast('ไม่สามารถโหลดข้อมูลเริ่มต้นได้', 'error');
  }
});

async function loadData() {
  // Load Semester Data
  try {
    const res = await fetch('data/semester.json');
    if (!res.ok) throw new Error('Failed to load semester.json');
    AppState.semester = await res.json();
    
    // Map subjects for quick access
    AppState.semester.subjects.forEach(sub => {
      AppState.subjectsMap.set(sub.id, sub);
    });
  } catch (e) {
    console.error(e);
    showToast('กรุณารันผ่าน Live Server (http://localhost...)', 'error');
    return;
  }

  // Apply initial theme
  applyTheme(AppState.theme);

  // Load Tasks (merge from JSON and LocalStorage)
  let localTasks = AppState.db.getTasks();
  if (localTasks.length === 0) {
    try {
      const res = await fetch('data/tasks.json');
      if (res.ok) {
        const data = await res.json();
        localTasks = data.tasks || [];
        AppState.db.saveTasks(localTasks);
      }
    } catch (e) {
      console.warn('Could not load initial tasks.json', e);
    }
  }
  AppState.tasks = localTasks;
}

// ==========================================
// 3. UI Rendering
// ==========================================
function initUI() {
  // Populate subject selects
  const subjectSelects = [document.getElementById('weekly-subject'), document.getElementById('task-subject')];
  
  if (AppState.semester) {
    const optionsHTML = AppState.semester.subjects.map(s => 
      `<option value="${s.id}">${s.icon} ${s.shortName} - ${s.name}</option>`
    ).join('');
    
    subjectSelects.forEach(select => {
      if(select) select.innerHTML = optionsHTML;
    });

    // Populate Sidebar Subjects
    const sidebarSubjects = document.getElementById('sidebar-subjects');
    if (sidebarSubjects) {
      sidebarSubjects.innerHTML = AppState.semester.subjects.map(s => `
        <li class="sidebar-subject-item" data-subject-id="${s.id}">
          <div class="sidebar-subject-dot" style="background-color: ${s.color}; box-shadow: 0 0 8px ${s.color}80;"></div>
          <span class="sidebar-subject-name" title="${s.nameTH}">${s.shortName}</span>
        </li>
      `).join('');
    }
  }
}

function renderApp() {
  updateTaskBadge();
  if (AppState.currentView === 'dashboard') {
    renderDashboard();
  } else if (AppState.currentView === 'subject' && AppState.currentSubjectId) {
    renderSubjectView(AppState.currentSubjectId);
  } else if (AppState.currentView === 'tasks') {
    renderTasksView();
  }
}

function renderDashboard() {
  const dashCourseCount = document.getElementById('dash-course-count');
  if (dashCourseCount) {
    dashCourseCount.innerText = `${AppState.semester.subjects.length} Active Modules`;
  }

  // 1. My Courses Grid
  const subjectGridEl = document.getElementById('dash-subject-grid');
  if (subjectGridEl) {
    subjectGridEl.innerHTML = AppState.semester.subjects.map(s => {
      const subTasks = AppState.tasks.filter(t => t.subjectId === s.id && t.status !== 'DONE');
      const knowledge = AppState.db.getWeeklyKnowledge().filter(k => k.subjectId === s.id);
      
      let syncText = "Live Sync";
      let syncColor = "#10b981";
      if (knowledge.length === 0) {
        syncText = "Not synced";
        syncColor = "#94a3b8";
      }

      return `
        <div class="dash-subject-card" onclick="navigateToSubject('${s.id}')">
          <div class="dash-subject-header" style="background: linear-gradient(135deg, ${s.color}dd, ${s.color}88);">
            ${s.icon}
          </div>
          <div class="dash-subject-body">
            <div class="dash-subject-title">${s.name}</div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <span style="font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 12px; background: ${syncColor}22; color: ${syncColor}; border: 1px solid ${syncColor}44;">
                <span style="display:inline-block; width:4px; height:4px; border-radius:50%; background:${syncColor}; margin-right:4px; margin-bottom:1px;"></span>${syncText}
              </span>
              ${subTasks.length > 0 ? `<span style="font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 12px; background: rgba(245, 158, 11, 0.15); color: #d97706;">${subTasks.length} tasks</span>` : ''}
            </div>
          </div>
          <div class="dash-subject-footer">
            <span>📄 ${knowledge.length} sources</span>
            <span>${subTasks.length === 0 ? 'Up to date' : 'Action needed'}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // 2. Upcoming Milestones
  const activeTasks = AppState.tasks.filter(t => t.status !== 'DONE').sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const urgentCountEl = document.getElementById('dash-urgent-count');
  if (urgentCountEl) {
    urgentCountEl.innerText = `${activeTasks.length} tasks`;
  }

  const urgentTasksEl = document.getElementById('dash-urgent-tasks');
  if (urgentTasksEl) {
    const upcoming = activeTasks.slice(0, 5);
    
    if (upcoming.length === 0) {
      urgentTasksEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎉</div>
          <h3>You're all caught up!</h3>
          <p>No upcoming milestones at the moment.</p>
        </div>
      `;
    } else {
      urgentTasksEl.innerHTML = upcoming.map(t => {
        const sub = AppState.subjectsMap.get(t.subjectId);
        
        let datePillHTML = '';
        if (t.deadline) {
          const dateObj = new Date(t.deadline);
          const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const { priorityClass } = getDeadlineInfo(t.deadline);
          let pillBg = 'rgba(236, 72, 153, 0.1)';
          let pillColor = '#ec4899';
          if (priorityClass === 'urgent') { pillBg = 'rgba(239, 68, 68, 0.1)'; pillColor = '#ef4444'; }
          else if (priorityClass === 'medium') { pillBg = 'rgba(245, 158, 11, 0.1)'; pillColor = '#d97706'; }
          else if (priorityClass === 'low') { pillBg = 'rgba(16, 185, 129, 0.1)'; pillColor = '#10b981'; }

          datePillHTML = `<div class="milestone-date-pill" style="background: ${pillBg}; color: ${pillColor};">${dateStr}</div>`;
        } else {
          datePillHTML = `<div class="milestone-date-pill" style="background: var(--bg-hover); color: var(--text-secondary);">No deadline</div>`;
        }

        return `
          <div class="milestone-card" onclick="openTaskDetail('${t.id}')">
            <div>
              <div class="milestone-title">${t.name}</div>
              <div class="milestone-meta">Course: ${sub.shortName}</div>
            </div>
            ${datePillHTML}
          </div>
        `;
      }).join('');
    }
  }
}

function renderSubjectView(subjectId) {
  const sub = AppState.subjectsMap.get(subjectId);
  if (!sub) return;

  // Update Hero
  const heroEl = document.getElementById('subject-hero');
  if (heroEl) {
    heroEl.innerHTML = `
      <div class="subject-hero-top">
        <div class="subject-hero-info">
          <h2>${sub.icon} ${sub.name}</h2>
          <div class="subject-th">${sub.nameTH}</div>
          <div class="subject-hero-meta">
            <span class="subject-meta-tag">เครดิต: ${sub.credits}</span>
            ${sub.schedule.map(sch => `<span class="subject-meta-tag">📍 ${sch.day} (${sch.room})</span>`).join('')}
            <span class="subject-meta-tag" style="background:${sub.color}20; border-color:${sub.color}50; color:${sub.color};">
              Type: ${sub.type.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    `;
    heroEl.style.borderColor = `${sub.color}50`;
    heroEl.style.boxShadow = `inset 0 0 40px ${sub.color}10`;
  }

  // Render Knowledge Timeline
  const timelineEl = document.getElementById('knowledge-timeline');
  const knowledge = AppState.db.getWeeklyKnowledge().filter(k => k.subjectId === subjectId).sort((a,b) => b.week - a.week);
  
  if (timelineEl) {
    if (knowledge.length === 0) {
      timelineEl.innerHTML = `<div class="empty-state"><h3>ยังไม่มีบันทึกความรู้</h3><p>คลิก "เพิ่มข้อมูล" ด้านบนเพื่อบันทึกเนื้อหารายสัปดาห์</p></div>`;
    } else {
      timelineEl.innerHTML = knowledge.map(k => `
        <div class="knowledge-week">
          <div class="knowledge-week-dot" style="border-color: ${sub.color};"></div>
          <div class="knowledge-week-header">
            <span class="knowledge-week-label">Week ${k.week}</span>
            <span class="knowledge-week-date">${k.date || ''}</span>
          </div>
          <div class="knowledge-week-content">
            <ul class="knowledge-week-topics">
              ${k.topics.split('\n').filter(t => t.trim()).map(t => `<li class="knowledge-topic-tag">${t.trim()}</li>`).join('')}
            </ul>
            ${k.emphasis ? `
              <div class="knowledge-week-emphasis">
                ${k.emphasis.split('\n').filter(t => t.trim()).map(t => `<div class="knowledge-emphasis-item">⚠️ ${t.trim()}</div>`).join('')}
              </div>
            ` : ''}
            ${k.notes ? `
              <div style="margin-top: 12px; font-size: 12px; color: var(--text-secondary); border-top: 1px dashed var(--border-subtle); padding-top: 8px;">
                <strong>📝 Notes:</strong><br>${k.notes.replace(/\n/g, '<br>')}
              </div>
            `: ''}
          </div>
        </div>
      `).join('');
    }
  }

  // Render Tasks
  const tasksEl = document.getElementById('subject-tasks');
  const subTasks = AppState.tasks.filter(t => t.subjectId === subjectId);
  
  if (tasksEl) {
    tasksEl.innerHTML = generateTaskListHTML(subTasks);
  }
}

function renderTasksView(filter = 'all') {
  const tasksEl = document.getElementById('all-tasks');
  let filtered = AppState.tasks;
  if (filter !== 'all') {
    filtered = AppState.tasks.filter(t => t.status === filter);
  }

  if (tasksEl) {
    tasksEl.innerHTML = generateTaskListHTML(filtered);
  }
}

function generateTaskListHTML(tasks) {
  if (tasks.length === 0) {
    return `<div class="empty-state"><p>ไม่มีงานในหมวดหมู่นี้</p></div>`;
  }
  
  // Sort: Not done first, then by deadline
  const sorted = [...tasks].sort((a, b) => {
    if (a.status === 'DONE' && b.status !== 'DONE') return 1;
    if (a.status !== 'DONE' && b.status === 'DONE') return -1;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  return sorted.map(t => {
    const sub = AppState.subjectsMap.get(t.subjectId);
    const isDone = t.status === 'DONE';
    const statusClass = `status-${t.status.toLowerCase().replace('_', '-')}`;
    
    let deadlineStr = '';
    if (t.deadline) {
      const { daysText, priorityClass } = getDeadlineInfo(t.deadline);
      const color = isDone ? 'inherit' : (priorityClass === 'urgent' ? 'var(--danger)' : (priorityClass === 'medium' ? 'var(--warning)' : 'var(--text-tertiary)'));
      deadlineStr = `<span style="color: ${color}">📅 ${t.deadline} (${daysText})</span>`;
    }

    return `
      <div class="task-item ${isDone ? 'done' : ''}" onclick="openTaskDetail('${t.id}')">
        <div class="task-checkbox ${isDone ? 'checked' : ''}" onclick="toggleTaskStatus(event, '${t.id}')">
          ${isDone ? '✓' : ''}
        </div>
        <div class="task-content">
          <div class="task-title">${t.name}</div>
          <div class="task-meta">
            <span>${sub.icon} ${sub.shortName}</span>
            ${deadlineStr ? `<span>•</span>${deadlineStr}` : ''}
            <span>•</span>
            <span class="task-status-badge ${statusClass}">${t.status}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}


// ==========================================
// 4. Events & Interactions
// ==========================================
function bindEvents() {
  // Navigation Sidebar
  document.querySelectorAll('.sidebar-nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      document.querySelectorAll('.sidebar-nav-item, .sidebar-subject-item').forEach(i => i.classList.remove('active'));
      el.classList.add('active');
      const view = el.getAttribute('data-view');
      switchView(view);
    });
  });

  // Navigation Subjects
  document.getElementById('sidebar-subjects')?.addEventListener('click', (e) => {
    const li = e.target.closest('.sidebar-subject-item');
    if (li) {
      document.querySelectorAll('.sidebar-nav-item, .sidebar-subject-item').forEach(i => i.classList.remove('active'));
      li.classList.add('active');
      const sid = li.getAttribute('data-subject-id');
      navigateToSubject(sid);
    }
  });

  // Modals
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.getAttribute('data-close')).classList.remove('active');
    });
  });

  document.getElementById('btn-add-weekly')?.addEventListener('click', () => {
    document.getElementById('modal-weekly').classList.add('active');
  });

  document.getElementById('btn-generate-review')?.addEventListener('click', generateWeeklyReview);
  document.getElementById('btn-start-review')?.addEventListener('click', generateWeeklyReview);

  // File Upload Logic
  const dropZone = document.getElementById('file-drop-zone');
  const fileInput = document.getElementById('weekly-file-input');
  
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        handleFilesSelected(e.dataTransfer.files);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        handleFilesSelected(e.target.files);
      }
    });
  }

  document.getElementById('btn-add-task')?.addEventListener('click', () => {
    document.getElementById('modal-task').classList.add('active');
  });
  
  document.getElementById('btn-add-task-page')?.addEventListener('click', () => {
    document.getElementById('modal-task').classList.add('active');
  });

  document.getElementById('btn-generate-planner')?.addEventListener('click', generateStudyPlanner);
  document.getElementById('btn-tutor-send')?.addEventListener('click', handleTutorChat);
  document.getElementById('tutor-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleTutorChat();
  });

  // Theme Toggle
  document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
    AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('ai_study_theme', AppState.theme);
    applyTheme(AppState.theme);
  });

  // Save Forms
  document.getElementById('btn-save-weekly')?.addEventListener('click', saveWeeklyKnowledge);
  document.getElementById('btn-save-task')?.addEventListener('click', saveTask);

  // Subject Tabs
  document.getElementById('subject-tabs')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('subject-tab')) {
      document.querySelectorAll('.subject-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.subject-tab-content').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      const tabId = e.target.getAttribute('data-tab');
      document.getElementById(`tab-${tabId}`).classList.add('active');
    }
  });

  // Task Filters
  document.getElementById('task-filters')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('task-filter-btn')) {
      document.querySelectorAll('.task-filter-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      renderTasksView(e.target.getAttribute('data-filter'));
    }
  });
}

function switchView(viewId) {
  AppState.currentView = viewId;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${viewId}`).classList.add('active');
  
  const titles = {
    'dashboard': '📊 Dashboard',
    'tasks': '✅ จัดการงาน',
    'weekly': '📋 Weekly Review',
    'exam': '📝 เตรียมสอบ',
    'planner': '⏰ วางแผนเวลา'
  };
  
  if (titles[viewId]) {
    document.getElementById('page-title').innerText = titles[viewId];
  }
  
  if (viewId === 'exam') {
    generateExamPrep();
  } else if (viewId === 'weekly' && AppState.db.getWeeklyKnowledge().length > 0) {
    // auto generate if there's data and they haven't clicked yet
    if (document.getElementById('weekly-review-content').innerHTML.includes('empty-state')) {
      generateWeeklyReview();
    }
  }
  
  renderApp();
}

function navigateToSubject(subjectId) {
  AppState.currentSubjectId = subjectId;
  switchView('subject');
  const sub = AppState.subjectsMap.get(subjectId);
  document.getElementById('page-title').innerText = `${sub.icon} ${sub.shortName}`;
}

function handleFilesSelected(files) {
  const fileListEl = document.getElementById('weekly-file-list');
  const fileNames = Array.from(files).map(f => f.name).join(', ');
  
  fileListEl.innerHTML = Array.from(files).map(f => `
    <div class="file-item">
      <div class="file-item-info"><span>📄</span> ${f.name}</div>
      <div class="file-remove" onclick="this.parentElement.remove()">✕</div>
    </div>
  `).join('');

  // Call Backend API to Process PDF/File
  const aiProcessing = document.getElementById('ai-processing');
  aiProcessing.classList.add('active');
  
  const formData = new FormData();
  formData.append('file', files[0]); // Send first file for now

  fetch('http://localhost:3001/api/parse-knowledge', {
    method: 'POST',
    body: formData
  })
  .then(res => {
    if(!res.ok) throw new Error('Network response was not ok');
    return res.json();
  })
  .then(data => {
    aiProcessing.classList.remove('active');
    
    // Auto-fill form fields with AI extracted data
    if (data.topics) document.getElementById('weekly-topics').value = data.topics;
    if (data.emphasis) document.getElementById('weekly-emphasis').value = data.emphasis;
    if (data.assignments) document.getElementById('weekly-assignments').value = data.assignments;
    
    showToast('AI อ่านเอกสารและสรุปข้อมูลให้แล้ว! ✨', 'success');
  })
  .catch(err => {
    console.error(err);
    aiProcessing.classList.remove('active');
    
    // Fallback if backend is not running
    document.getElementById('weekly-topics').value = "หัวข้อที่ 1: " + fileNames + "\n(เกิดข้อผิดพลาดในการดึงข้อมูลจาก AI หรือไม่ได้เปิด Backend)";
    showToast('มีปัญหาในการเชื่อมต่อ AI ⚠️', 'warning');
  });
}

// ==========================================
// 5. Data Actions
// ==========================================

function generateWeeklyReview() {
  const contentEl = document.getElementById('weekly-review-content');
  if (!contentEl) return;
  
  const allKnowledge = AppState.db.getWeeklyKnowledge();
  const allTasks = AppState.tasks;
  
  if (allKnowledge.length === 0 && allTasks.length === 0) {
    showToast('ไม่มีข้อมูลเพียงพอสำหรับสร้าง Review', 'warning');
    return;
  }
  
  // Aggregate data
  const doneTasks = allTasks.filter(t => t.status === 'DONE');
  const pendingTasks = allTasks.filter(t => t.status !== 'DONE');
  
  let knowledgeHTML = '';
  if (allKnowledge.length > 0) {
    knowledgeHTML = allKnowledge.map(k => {
      const sub = AppState.subjectsMap.get(k.subjectId);
      return `<li><strong>${sub?.shortName}:</strong> ${k.topics.split('\n')[0].replace('หัวข้อที่ 1: ', '')}</li>`;
    }).join('');
  } else {
    knowledgeHTML = '<li>- ยังไม่มีบันทึกเนื้อหา -</li>';
  }
  
  let doneTasksHTML = '';
  if (doneTasks.length > 0) {
    doneTasksHTML = doneTasks.map(t => {
      const sub = AppState.subjectsMap.get(t.subjectId);
      return `<li>✅ [${sub?.shortName}] ${t.name}</li>`;
    }).join('');
  } else {
    doneTasksHTML = '<li>- ไม่มีงานที่ทำเสร็จในสัปดาห์นี้ -</li>';
  }

  let pendingTasksHTML = '';
  if (pendingTasks.length > 0) {
    pendingTasksHTML = pendingTasks.map(t => {
      const sub = AppState.subjectsMap.get(t.subjectId);
      const dl = t.deadline ? `(ถึงกำหนด: ${t.deadline})` : '';
      return `<li>⏳ [${sub?.shortName}] ${t.name} ${dl}</li>`;
    }).join('');
  } else {
    pendingTasksHTML = '<li>🎉 ไม่มีงานค้าง!</li>';
  }

  contentEl.innerHTML = `
    <div class="review-card">
      <h4>📖 สิ่งที่เรียนในสัปดาห์นี้</h4>
      <ul class="review-list">
        ${knowledgeHTML}
      </ul>
    </div>
    
    <div class="review-card">
      <h4 style="color: var(--success);">✅ งานที่ทำเสร็จแล้ว</h4>
      <ul class="review-list">
        ${doneTasksHTML}
      </ul>
    </div>
    
    <div class="review-card">
      <h4 style="color: var(--warning);">⏳ งานที่ยังค้างอยู่</h4>
      <ul class="review-list">
        ${pendingTasksHTML}
      </ul>
    </div>
    
    <div class="review-card">
      <h4 style="color: var(--accent-light);">🎯 สิ่งที่ควรทำในสัปดาห์หน้า</h4>
      <ul class="review-list">
        ${pendingTasks.slice(0, 3).map(t => `<li>ต้องจัดการ: ${t.name}</li>`).join('')}
        ${pendingTasks.length === 0 ? '<li>เตรียมตัวอ่านทบทวนล่วงหน้า</li>' : ''}
      </ul>
    </div>
  `;
  
  showToast('สร้าง Weekly Review สำเร็จ!', 'success');
}

function generateExamPrep() {
  const contentEl = document.getElementById('exam-content');
  if (!contentEl) return;
  
  const allKnowledge = AppState.db.getWeeklyKnowledge();
  if (allKnowledge.length === 0) {
    showToast('ไม่มีข้อมูลเพียงพอสำหรับสร้าง Exam Prep', 'warning');
    return;
  }
  
  let subjectsHTML = AppState.semester.subjects.map(sub => {
    const subKnowledge = allKnowledge.filter(k => k.subjectId === sub.id);
    if(subKnowledge.length === 0) return '';
    
    const emphasisHTML = subKnowledge
      .filter(k => k.emphasis && k.emphasis.trim())
      .map(k => `<li>⚠️ Week ${k.week}: ${k.emphasis.split('\n')[0]}</li>`)
      .join('');
      
    const topicsHTML = subKnowledge
      .map(k => `<span class="knowledge-topic-tag">W${k.week}: ${k.topics.split('\n')[0].replace('หัวข้อที่ 1: ', '')}</span>`)
      .join(' ');
      
    return `
      <div class="review-card" style="border-left: 4px solid ${sub.color}">
        <h4>${sub.icon} ${sub.shortName} - Exam Knowledge Map</h4>
        <div class="mb-4">
          <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">หัวข้อที่ต้องทบทวน:</div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">${topicsHTML}</div>
        </div>
        ${emphasisHTML ? `
          <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); padding: 12px; border-radius: 8px;">
            <div style="font-size: 12px; font-weight: 600; color: var(--warning); margin-bottom: 4px;">จุดที่อาจารย์เน้น (เก็งข้อสอบ)</div>
            <ul style="font-size: 12px; color: var(--text-primary); padding-left: 20px;">
              ${emphasisHTML}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
  }).filter(h => h).join('');
  
  contentEl.innerHTML = subjectsHTML || '<div class="empty-state">ยังไม่มีข้อมูลวิชาใดๆ</div>';
  showToast('สร้าง Exam Knowledge Map แล้ว', 'success');
}

function generateStudyPlanner() {
  const contentEl = document.getElementById('planner-content');
  if (!contentEl) return;

  const pendingTasks = AppState.tasks.filter(t => t.status !== 'DONE').sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  
  if (pendingTasks.length === 0) {
    contentEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎉</div>
        <h3>ไม่มีงานค้าง</h3>
        <p>คุณสามารถพักผ่อน หรือเริ่มทบทวนบทเรียนล่วงหน้าได้เลย!</p>
      </div>
    `;
    return;
  }

  // Create a mock 3-day schedule
  const today = new Date();
  const scheduleHTML = [0, 1, 2].map(dayOffset => {
    const d = new Date(today);
    d.setDate(d.getDate() + dayOffset);
    const dayName = d.toLocaleDateString('th-TH', { weekday: 'long' });
    const dateStr = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    
    // Assign 1-2 tasks per day
    const dayTasks = pendingTasks.slice(dayOffset * 2, (dayOffset * 2) + 2);
    
    if (dayTasks.length === 0) return '';
    
    let timeSlot = 19; // Start at 19:00
    
    const slotsHTML = dayTasks.map(t => {
      const sub = AppState.subjectsMap.get(t.subjectId);
      const html = `
        <div class="planner-slot">
          <div class="planner-time">${timeSlot}:00 - ${timeSlot + 1}:30</div>
          <div class="planner-task">
            <div class="planner-task-title">${t.name}</div>
            <div class="planner-task-meta">
              <span style="color: ${sub.color}">${sub.icon} ${sub.shortName}</span>
              ${t.deadline ? `• Deadline: ${t.deadline}` : ''}
            </div>
          </div>
        </div>
      `;
      timeSlot += 2;
      return html;
    }).join('');

    return `
      <div class="planner-day">
        <div class="planner-day-header">
          <span>📅 วัน${dayName}</span>
          <span>${dateStr}</span>
        </div>
        ${slotsHTML}
      </div>
    `;
  }).join('');

  contentEl.innerHTML = `
    <div style="margin-bottom: var(--sp-6);">
      <p style="color: var(--text-secondary); font-size: 14px;">จัดสรรเวลาให้คุณแล้ว! ระบบแนะนำให้ใช้เทคนิค Pomodoro (ทำ 25 นาที พัก 5 นาที) เพื่อประสิทธิภาพสูงสุด</p>
    </div>
    ${scheduleHTML}
  `;
  showToast('จัดตารางเวลาอัตโนมัติสำเร็จ!', 'success');
}

function handleTutorChat() {
  const inputEl = document.getElementById('tutor-input');
  const msgContainer = document.getElementById('tutor-chat-messages');
  if (!inputEl || !msgContainer) return;

  const text = inputEl.value.trim();
  if (!text) return;

  // Add user message
  msgContainer.innerHTML += `
    <div class="tutor-message user">
      <div class="tutor-message-avatar">👤</div>
      <div class="tutor-message-bubble">${text}</div>
    </div>
  `;
  inputEl.value = '';
  msgContainer.scrollTop = msgContainer.scrollHeight;

  // Simulate AI Thinking
  const thinkingId = `think-${Date.now()}`;
  msgContainer.innerHTML += `
    <div class="tutor-message bot" id="${thinkingId}">
      <div class="tutor-message-avatar">🎓</div>
      <div class="tutor-message-bubble">
        <span class="pulse">กำลังคิด...</span>
      </div>
    </div>
  `;
  msgContainer.scrollTop = msgContainer.scrollHeight;

  // Call Backend API
  fetch('http://localhost:3001/api/tutor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject: AppState.subjectsMap.get(AppState.currentSubjectId)?.name || 'Unknown',
      message: text
    })
  })
  .then(res => res.json())
  .then(data => {
    const thinkEl = document.getElementById(thinkingId);
    if (thinkEl) thinkEl.remove();

    // Format markdown to basic HTML for chat
    let replyText = data.reply || "เกิดข้อผิดพลาดในการรับข้อมูล";
    replyText = replyText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    replyText = replyText.replace(/\*(.*?)\*/g, '<em>$1</em>');
    replyText = replyText.replace(/\n/g, '<br>');

    msgContainer.innerHTML += `
      <div class="tutor-message bot">
        <div class="tutor-message-avatar">🎓</div>
        <div class="tutor-message-bubble" style="line-height: 1.6;">${replyText}</div>
      </div>
    `;
    msgContainer.scrollTop = msgContainer.scrollHeight;
  })
  .catch(err => {
    console.error(err);
    const thinkEl = document.getElementById(thinkingId);
    if (thinkEl) thinkEl.remove();

    msgContainer.innerHTML += `
      <div class="tutor-message bot">
        <div class="tutor-message-avatar">⚠️</div>
        <div class="tutor-message-bubble" style="color: var(--danger);">
          ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ AI ได้ โปรดตรวจสอบว่ารัน backend (node server.js) และใส่ GEMINI_API_KEY แล้ว
        </div>
      </div>
    `;
    msgContainer.scrollTop = msgContainer.scrollHeight;
  });
}

function saveWeeklyKnowledge() {
  const subjectId = document.getElementById('weekly-subject').value;
  const week = document.getElementById('weekly-week').value;
  const date = document.getElementById('weekly-date').value;
  const topics = document.getElementById('weekly-topics').value;
  const emphasis = document.getElementById('weekly-emphasis').value;
  const assignments = document.getElementById('weekly-assignments').value;
  const notes = document.getElementById('weekly-notes').value;

  if (!subjectId || !week || !topics) {
    showToast('กรุณากรอกข้อมูลที่จำเป็น (วิชา, สัปดาห์, เนื้อหา)', 'warning');
    return;
  }

  const k = {
    id: `wk-${Date.now()}`,
    subjectId, week: parseInt(week), date, topics, emphasis, assignments, notes,
    timestamp: new Date().toISOString()
  };

  const allK = AppState.db.getWeeklyKnowledge();
  allK.push(k);
  AppState.db.saveWeeklyKnowledge(allK);

  // If there's an assignment, prompt or auto-create a task (Simplified: just show toast)
  if (assignments.trim()) {
    showToast('บันทึกความรู้แล้ว (อย่าลืมเพิ่มงานใน Task Manager)', 'success');
  } else {
    showToast('บันทึกความรู้เรียบร้อย', 'success');
  }

  document.getElementById('modal-weekly').classList.remove('active');
  
  // clear form
  document.getElementById('weekly-topics').value = '';
  document.getElementById('weekly-emphasis').value = '';
  document.getElementById('weekly-assignments').value = '';
  document.getElementById('weekly-notes').value = '';

  if (AppState.currentView === 'subject' && AppState.currentSubjectId === subjectId) {
    renderSubjectView(subjectId);
  }
}

function saveTask() {
  const subjectId = document.getElementById('task-subject').value;
  const name = document.getElementById('task-name').value;
  const description = document.getElementById('task-description').value;
  const receivedDate = document.getElementById('task-received').value;
  const deadline = document.getElementById('task-deadline').value;
  const status = document.getElementById('task-status').value;
  const deliverables = document.getElementById('task-deliverables').value;

  if (!subjectId || !name) {
    showToast('กรุณากรอกข้อมูลที่จำเป็น (วิชา, ชื่องาน)', 'warning');
    return;
  }

  const task = {
    id: `task-${Date.now()}`,
    subjectId, name, description, receivedDate, deadline, status, deliverables
  };

  AppState.tasks.push(task);
  AppState.db.saveTasks(AppState.tasks);
  
  showToast('เพิ่มงานใหม่เรียบร้อย', 'success');
  document.getElementById('modal-task').classList.remove('active');
  
  // clear form
  document.getElementById('task-name').value = '';
  document.getElementById('task-description').value = '';
  
  renderApp();
}

function toggleTaskStatus(e, taskId) {
  e.stopPropagation(); // Prevent opening detail modal
  const task = AppState.tasks.find(t => t.id === taskId);
  if (task) {
    task.status = task.status === 'DONE' ? 'TODO' : 'DONE';
    AppState.db.saveTasks(AppState.tasks);
    renderApp();
    
    if(task.status === 'DONE') {
      showToast('ทำภารกิจสำเร็จ! 🎉', 'success');
    }
  }
}

function openTaskDetail(taskId) {
  const task = AppState.tasks.find(t => t.id === taskId);
  if (!task) return;
  const sub = AppState.subjectsMap.get(task.subjectId);

  document.getElementById('task-detail-title').innerHTML = `${sub.icon} ${task.name}`;
  
  const body = document.getElementById('task-detail-body');
  body.innerHTML = `
    <div class="mb-4">
      <div class="form-label">วิชา</div>
      <div class="text-primary">${sub.name} (${sub.nameTH})</div>
    </div>
    <div class="mb-4">
      <div class="form-label">รายละเอียด</div>
      <div style="white-space: pre-wrap; font-size: 13px;">${task.description || '-'}</div>
    </div>
    <div class="form-row mb-4">
      <div>
        <div class="form-label">กำหนดส่ง (Deadline)</div>
        <div class="text-primary">${task.deadline || 'ไม่ระบุ'}</div>
      </div>
      <div>
        <div class="form-label">สถานะปัจจุบัน</div>
        <select class="form-select" id="detail-task-status" data-task-id="${task.id}">
          <option value="TODO" ${task.status === 'TODO' ? 'selected' : ''}>TODO</option>
          <option value="IN_PROGRESS" ${task.status === 'IN_PROGRESS' ? 'selected' : ''}>IN PROGRESS</option>
          <option value="WAITING" ${task.status === 'WAITING' ? 'selected' : ''}>WAITING</option>
          <option value="REVIEW" ${task.status === 'REVIEW' ? 'selected' : ''}>REVIEW</option>
          <option value="DONE" ${task.status === 'DONE' ? 'selected' : ''}>DONE</option>
        </select>
      </div>
    </div>
    <div class="mb-4">
      <div class="form-label">สิ่งที่ต้องส่ง</div>
      <div style="white-space: pre-wrap; font-size: 13px; background: var(--bg-secondary); padding: var(--sp-3); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">${task.deliverables || '-'}</div>
    </div>
  `;

  // Attach event to update button
  const updateBtn = document.getElementById('btn-update-task-status');
  updateBtn.onclick = () => {
    const newStatus = document.getElementById('detail-task-status').value;
    task.status = newStatus;
    AppState.db.saveTasks(AppState.tasks);
    showToast('อัพเดทสถานะแล้ว', 'success');
    document.getElementById('modal-task-detail').classList.remove('active');
    renderApp();
  };

  document.getElementById('modal-task-detail').classList.add('active');
}

// ==========================================
// 6. Helpers
// ==========================================
function getUrgentTasks() {
  const now = new Date();
  const threeDays = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));
  
  return AppState.tasks.filter(t => {
    if (t.status === 'DONE' || !t.deadline) return false;
    const deadline = new Date(t.deadline);
    return deadline <= threeDays;
  });
}

function getDeadlineInfo(deadlineStr) {
  if (!deadlineStr) return { daysText: '-', priorityClass: 'low' };
  
  const today = new Date();
  today.setHours(0,0,0,0);
  const deadline = new Date(deadlineStr);
  deadline.setHours(0,0,0,0);
  
  const diffTime = deadline - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return { daysText: 'เลยกำหนด', priorityClass: 'urgent' };
  if (diffDays === 0) return { daysText: 'วันนี้', priorityClass: 'urgent' };
  if (diffDays === 1) return { daysText: 'พรุ่งนี้', priorityClass: 'urgent' };
  if (diffDays <= 3) return { daysText: `อีก ${diffDays} วัน`, priorityClass: 'urgent' };
  if (diffDays <= 7) return { daysText: `อีก ${diffDays} วัน`, priorityClass: 'medium' };
  return { daysText: `อีก ${diffDays} วัน`, priorityClass: 'low' };
}

function updateTaskBadge() {
  const badge = document.getElementById('task-badge');
  if (!badge) return;
  const pendingCount = AppState.tasks.filter(t => t.status !== 'DONE').length;
  if (pendingCount > 0) {
    badge.innerText = pendingCount;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

function applyTheme(theme) {
  const btn = document.getElementById('btn-theme-toggle');
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    if(btn) btn.innerText = '🌙';
  } else {
    document.documentElement.removeAttribute('data-theme');
    if(btn) btn.innerText = '☀️';
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type]}</div>
    <div class="toast-message">${message}</div>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// MS Teams Integration (Phase 9.2)
function syncToMSTeams() {
  const activeTasks = AppState.tasks.filter(t => t.status !== 'DONE' && t.deadline);
  const urgentTasks = activeTasks.filter(t => {
    const diffDays = Math.ceil((new Date(t.deadline) - new Date()) / (1000 * 60 * 60 * 24));
    return diffDays <= 3;
  });

  if (urgentTasks.length === 0) {
    showToast('????????????????????????????', 'success');
    return;
  }

  showToast('??????????????????? MS Teams...', 'warning');

  fetch('http://localhost:3001/api/notify/teams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks: urgentTasks })
  })
  .then(res => res.json())
  .then(data => {
    if(data.success) {
      showToast(data.message || '??????????????????!', 'success');
    } else {
      showToast('????????????????????????????', 'danger');
    }
  })
  .catch(err => {
    console.error(err);
    showToast('????????????????????? Backend ???', 'danger');
  });
}
