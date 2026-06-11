#!/usr/bin/env node

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = parseInt(process.env.PORT || '18890', 10);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, 'frontend');
const MIMO_API_KEY = 'sk-cjnwxwbzk29ssnr1wlsiuy0v1ipn4bbabexrct1kwl8m054g';
const MIMO_API_URL = process.env.MIMO_API_URL || 'https://api.xiaomimimo.com/v1/chat/completions';

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(FRONTEND_DIR));

let db;
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const d = getDb();
  d.exec([
    "CREATE TABLE IF NOT EXISTS teachers (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);",
    "CREATE TABLE IF NOT EXISTS classes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL, teacher_id INTEGER NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (teacher_id) REFERENCES teachers(id));",
    "CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, class_id INTEGER NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (class_id) REFERENCES classes(id));",
    "CREATE TABLE IF NOT EXISTS assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER NOT NULL, title TEXT NOT NULL, questions TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (class_id) REFERENCES classes(id));",
    "CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER NOT NULL, student_id INTEGER NOT NULL, answers TEXT, score INTEGER DEFAULT 0, feedback TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (assignment_id) REFERENCES assignments(id), FOREIGN KEY (student_id) REFERENCES students(id));",
    "INSERT OR IGNORE INTO teachers (code, name) VALUES ('T001', '张老师');",
    "INSERT OR IGNORE INTO teachers (code, name) VALUES ('T002', '李老师');"
  ].join('\n'));
  console.log('Database initialized at:', DB_PATH);
}

async function callMimoApi(systemPrompt, userContent, timeoutMs) {
  timeoutMs = timeoutMs || 60000;
  if (!MIMO_API_KEY) return { error: 'Error: MIMO_API_KEY not set' };
  try {
    const fetch = require('node-fetch');
    const resp = await fetch(MIMO_API_URL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + MIMO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mimo-v2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        stream: false,
        max_tokens: 4096
      }),
      timeout: timeoutMs
    });
    if (resp.ok) {
      const data = await resp.json();
      const content = data.choices[0].message.content;
      console.log('MiMo API Success, model=' + (data.model || 'unknown'));
      return { content: content };
    } else {
      const text = await resp.text();
      return { error: 'MiMo API Error: status=' + resp.status + ', body=' + text.slice(0, 200) };
    }
  } catch (e) {
    return { error: 'API call exception: ' + e.message };
  }
}

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function parseJSON(str) {
  try { return JSON.parse(str || '{}'); } catch(e) { return {}; }
}

app.post('/api/teacher/login', (req, res) => {
  const code = req.body.code;
  if (!code) return res.status(400).json({ code: 1001, message: '请输入教师编号' });
  const teacher = getDb().prepare('SELECT * FROM teachers WHERE code = ?').get(code);
  if (!teacher) return res.json({ code: 1002, message: '教师编号错误' });
  res.json({ code: 0, data: teacher });
});

app.get('/api/classes', (req, res) => {
  const tid = parseInt(req.query.teacher_id);
  if (!tid) return res.status(400).json({ code: 1001, message: '缺少 teacher_id 参数' });
  res.json({ code: 0, data: getDb().prepare('SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at DESC').all(tid) });
});

app.post('/api/classes', (req, res) => {
  const { teacher_id, name } = req.body;
  if (!teacher_id || !name) return res.status(400).json({ code: 1001, message: '缺少必要参数' });
  const d = getDb();
  let code = generateCode();
  while (d.prepare('SELECT id FROM classes WHERE code = ?').get(code)) code = generateCode();
  const result = d.prepare('INSERT INTO classes (name, code, teacher_id) VALUES (?, ?, ?)').run(name, code, teacher_id);
  res.json({ code: 0, data: { id: result.lastInsertRowid, name, code, teacher_id } });
});

app.get('/api/students', (req, res) => {
  const cid = parseInt(req.query.class_id);
  if (!cid) return res.status(400).json({ code: 1001, message: '缺少 class_id 参数' });
  res.json({ code: 0, data: getDb().prepare('SELECT id, name, class_id, created_at FROM students WHERE class_id = ? ORDER BY created_at DESC').all(cid) });
});

app.post('/api/student/login', (req, res) => {
  const { name, class_code } = req.body;
  if (!name || !class_code) return res.status(400).json({ code: 1001, message: '请输入姓名和班级编号' });
  const d = getDb();
  const cls = d.prepare('SELECT * FROM classes WHERE code = ?').get(class_code);
  if (!cls) return res.json({ code: 1002, message: '班级编号错误' });
  let student = d.prepare('SELECT * FROM students WHERE name = ? AND class_id = ?').get(name, cls.id);
  if (!student) {
    const result = d.prepare('INSERT INTO students (name, class_id) VALUES (?, ?)').run(name, cls.id);
    student = { id: result.lastInsertRowid, name, class_id: cls.id };
  }
  res.json({ code: 0, data: Object.assign({}, student, { class_name: cls.name }) });
});

app.get('/api/assignments', (req, res) => {
  const cid = parseInt(req.query.class_id);
  if (!cid) return res.status(400).json({ code: 1001, message: '缺少 class_id 参数' });
  res.json({ code: 0, data: getDb().prepare('SELECT * FROM assignments WHERE class_id = ? ORDER BY created_at DESC').all(cid) });
});

app.get('/api/assignments/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const a = getDb().prepare('SELECT * FROM assignments WHERE id = ?').get(id);
  if (!a) return res.status(404).json({ code: 1003, message: '作业不存在' });
  try { a.questions = JSON.parse(a.questions); } catch (e) { a.questions = []; }
  res.json({ code: 0, data: a });
});

app.post('/api/assignments/generate', async (req, res) => {
  const { prompt, content, num_questions, question_type, count, grade, teacher_prompt } = req.body;
  const actualContent = content || prompt || '';
  const actualCount = count || num_questions || 5;
  if (!actualContent && !teacher_prompt) return res.status(400).json({ code: 1001, message: '请输入课堂内容或教师提示词' });
  const tn = { choice: "选择题", fill: "填空题", translation: "翻译题", mixed: "混合题型" };
  const sp = "你是名小学英语出题专家，请根据要求生成英语题目。请仅返回JSON数组，不要添加任何其他内容。每道题包含：id(序号), type(choice/fill/translation), question(题目内容), options(选择题的选项，可选), answer(正确答案), explanation(解释说明)";
  const uc = "请生成" + actualCount + "道英语题目，题型为\"" + (tn[question_type] || question_type) + "\"，适合小学" + (grade || "3-4") + "年级学生。课程内容：" + actualContent + (teacher_prompt ? "\n\n教师特别要求：" + teacher_prompt : "");
  const result = await callMimoApi(sp, uc);
  if (result.error) return res.status(500).json({ code: 2001, message: '生成失败：' + result.error });
  try {
    const m = result.content.match(/\[.*\]/s);
    const questions = m ? JSON.parse(m[0]) : [];
    res.json({ code: 0, data: { questions, count: questions.length } });
  } catch (e) {
    res.json({ code: 0, data: { questions: [], rawContent: result.content, count: 0 } });
  }
});

app.post('/api/assignments', (req, res) => {
  const { class_id, title, questions } = req.body;
  if (!class_id || !title || !questions) return res.status(400).json({ code: 1001, message: '缺少必要参数' });
  const r = getDb().prepare('INSERT INTO assignments (class_id, title, questions) VALUES (?, ?, ?)').run(class_id, title, JSON.stringify(questions));
  res.json({ code: 0, data: { id: r.lastInsertRowid, class_id, title } });
});

app.get('/api/student/assignments', (req, res) => {
  const sid = parseInt(req.query.student_id);
  const cid = parseInt(req.query.class_id);
  if (!sid || !cid) return res.status(400).json({ code: 1001, message: '缺少参数' });
  const d = getDb();
  const as = d.prepare('SELECT a.*, s.status as submit_status, s.score, s.id as submission_id FROM assignments a LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ? WHERE a.class_id = ? ORDER BY a.created_at DESC').all(sid, cid);
  res.json({ code: 0, data: as });
});

app.post('/api/assignments/:id/submit', async (req, res) => {
  const aid = parseInt(req.params.id);
  const { student_id, answers } = req.body;
  if (!student_id || !answers) return res.status(400).json({ code: 1001, message: '缺少参数' });
  const d = getDb();
  const a = d.prepare('SELECT * FROM assignments WHERE id = ?').get(aid);
  if (!a) return res.status(404).json({ code: 1003, message: '作业不存在' });
  let questions;
  try { questions = JSON.parse(a.questions); } catch(e) { questions = []; }
  let qa = '';
  for (const q of questions) {
    qa += "题目：" + q.question + "\n正确答案：" + q.answer + "\n学生答案：" + (answers[q.id] || "(未作答)") + "\n\n";
  }
  const sp = "你是名温暖的英语老师，批改作业时永远保持鼓励的态度。即使学生答错也要肯定他们的努力，用温和的方式引导他们找到正确答案。请直接返回JSON对象，不要添加任何其他内容。";
  const uc = "请批改以下作业，保持鼓励的语气。\n\n题目和正确答案：\n" + qa + "\n请批改每道题，并给出：\n1. 每道题的对错\n2. 对答对的题给予肯定\n3. 对答错的题温和指出正确答案\n4. 总体评论要积极正面\n\n返回JSON格式：{\"score\": 分数, \"questions\": [{\"id\": 0, \"correct\": true/false, \"feedback\": \"评语\"}], \"comment\": \"总体评论\"}";
  const result = await callMimoApi(sp, uc);
  if (result.error) {
    // Save draft even if AI grading fails
    const ex = d.prepare('SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ?').get(aid, student_id);
    if (ex) {
      d.prepare("UPDATE submissions SET answers = ?, status = 'pending' WHERE id = ?").run(JSON.stringify(answers), ex.id);
    } else {
      d.prepare("INSERT INTO submissions (assignment_id, student_id, answers, status) VALUES (?, ?, ?, 'pending')").run(aid, student_id, JSON.stringify(answers));
    }
    return res.status(500).json({ code: 2001, message: '批改失败：' + result.error, data: { saved: true } });
  }
  let fb;
  try {
    const m = result.content.match(/\{.*\}/s);
    fb = m ? JSON.parse(m[0]) : {};
    if (!fb.score) fb.score = 0;
    if (!fb.questions) fb.questions = [];
    if (!fb.comment) fb.comment = '批改解析失败';
  } catch (e) {
    fb = { score: 0, questions: [], comment: '批改解析失败' };
  }
  const ex = d.prepare('SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ?').get(aid, student_id);
  if (ex) {
    d.prepare("UPDATE submissions SET answers = ?, score = ?, feedback = ?, status = 'graded' WHERE id = ?").run(JSON.stringify(answers), fb.score, JSON.stringify(fb), ex.id);
  } else {
    d.prepare("INSERT INTO submissions (assignment_id, student_id, answers, score, feedback, status) VALUES (?, ?, ?, ?, ?, 'graded')").run(aid, student_id, JSON.stringify(answers), fb.score, JSON.stringify(fb));
  }
  res.json({ code: 0, data: fb });
});

app.get('/api/submissions', (req, res) => {
  const aid = req.query.assignment_id ? parseInt(req.query.assignment_id) : null;
  const sid = req.query.student_id ? parseInt(req.query.student_id) : null;
  const d = getDb();
  if (aid && sid) {
    const s = d.prepare('SELECT s.*, st.name as student_name FROM submissions s JOIN students st ON st.id = s.student_id WHERE s.assignment_id = ? AND s.student_id = ?').get(aid, sid);
    if (!s) return res.json({ code: 0, data: null });
    return res.json({ code: 0, data: { id: s.id, student_name: s.student_name, score: s.score, answers: parseJSON(s.answers), feedback: parseJSON(s.feedback), status: s.status, created_at: s.created_at } });
  }
  if (aid) {
    return res.json({ code: 0, data: d.prepare('SELECT s.*, st.name as student_name FROM submissions s JOIN students st ON st.id = s.student_id WHERE s.assignment_id = ? ORDER BY s.created_at DESC').all(aid).map(function(s) { return { id: s.id, student_id: s.student_id, student_name: s.student_name, score: s.score, status: s.status, created_at: s.created_at }; }) });
  }
  if (sid) {
    return res.json({ code: 0, data: d.prepare('SELECT s.*, a.title as assignment_title FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.student_id = ? ORDER BY s.created_at DESC').all(sid).map(function(s) { return { id: s.id, assignment_title: s.assignment_title, assignment_id: s.assignment_id, score: s.score, status: s.status, created_at: s.created_at }; }) });
  }
  res.status(400).json({ code: 1001, message: '参数不足' });
});



// Teacher manual grade
app.post('/api/assignments/:id/grade', (req, res) => {
  const aid = parseInt(req.params.id);
  const { student_id, score, feedback, comment } = req.body;
  if (!student_id || score === undefined) return res.status(400).json({ code: 1001, message: '缺少参数' });
  const d = getDb();
  const fb = { score: score, questions: feedback || [], comment: comment || '' };
  const ex = d.prepare('SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ?').get(aid, student_id);
  if (ex) {
    d.prepare("UPDATE submissions SET score = ?, feedback = ?, status = 'graded' WHERE id = ?").run(score, JSON.stringify(fb), ex.id);
  } else {
    return res.status(404).json({ code: 1003, message: '提交记录不存在' });
  }
  res.json({ code: 0, data: fb });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '服务运行正常' });
});


// DELETE /api/classes/:id - 删除班级（级联删除学生、作业、提交）
app.delete('/api/classes/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const d = getDb();
  const cls = d.prepare('SELECT * FROM classes WHERE id = ?').get(id);
  if (!cls) return res.status(404).json({ code: 1003, message: '班级不存在' });
  d.prepare('DELETE FROM students WHERE class_id = ?').run(id);
  const asgns = d.prepare('SELECT id FROM assignments WHERE class_id = ?').all(id);
  for (const a of asgns) { d.prepare('DELETE FROM submissions WHERE assignment_id = ?').run(a.id); }
  d.prepare('DELETE FROM assignments WHERE class_id = ?').run(id);
  d.prepare('DELETE FROM classes WHERE id = ?').run(id);
  res.json({ code: 0, message: '删除成功' });
});



// DELETE /api/assignments/:id
app.delete('/api/assignments/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const d = getDb();
  const a = d.prepare('SELECT * FROM assignments WHERE id = ?').get(id);
  if (!a) return res.status(404).json({ code: 1003, message: 'assignment not found' });
  d.prepare('DELETE FROM submissions WHERE assignment_id = ?').run(id);
  d.prepare('DELETE FROM assignments WHERE id = ?').run(id);
  res.json({ code: 0, message: 'ok' });
});

app.use((req, res) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  } else {
    res.status(404).json({ code: 1004, message: 'Not found' });
  }
});

initDb();
console.log('='.repeat(50));
console.log('ZOE的学习智能体 - 服务启动');
console.log('='.repeat(50));
console.log("数据库路径: " + DB_PATH);
console.log("API Key: " + (MIMO_API_KEY ? "已配置" : "未配置（请设置MIMO_API_KEY 环境变量）"));
console.log('访问地址: http://0.0.0.0:' + PORT);
console.log('='.repeat(50));

app.listen(PORT, '0.0.0.0', function() {
  console.log('Server running on http://0.0.0.0:' + PORT);
});

module.exports = app;

app.listen(PORT, '0.0.0.0', function() {
  console.log('Server running on http://0.0.0.0:' + PORT);
});
