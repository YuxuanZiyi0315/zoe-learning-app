#!/usr/bin/env node

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = parseInt(process.env.PORT || "18890", 10);
const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, 'frontend');
const MIMO_API_KEY = process.env.MIMO_API_KEY || 'sk-cjnwxwbzk29ssnr1wlsiuy0v1ipn4bbabexrct1kwl8m054g';
const MIMO_API_URL = process.env.MIMO_API_URL || 'https://api.xiaomimimo.com/v1/chat/completions';

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: "10mb" }));
app.use(express.static(FRONTEND_DIR));

const DATABASE_URL = process.env.DATABASE_URL;
const EXTERNAL_DB_URL = 'postgresql://english_learning_app_user:0kl539TpVfzG2tGpZnQ097xCzgYAFdlN@dpg-d8l6icbeo5us73b588pg-a.singapore-postgres.render.com/english_learning_app?sslmode=require';
const finalDBUrl = DATABASE_URL || EXTERNAL_DB_URL;
const pool = new Pool({ connectionString: finalDBUrl, ssl: { rejectUnauthorized: false } });

async function q(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function initDb() {
  try {
    await q("CREATE TABLE IF NOT EXISTS teachers (id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    await q("CREATE TABLE IF NOT EXISTS classes (id SERIAL PRIMARY KEY, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL, teacher_id INTEGER NOT NULL REFERENCES teachers(id), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    await q("CREATE TABLE IF NOT EXISTS students (id SERIAL PRIMARY KEY, name TEXT NOT NULL, class_id INTEGER NOT NULL REFERENCES classes(id), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    await q("CREATE TABLE IF NOT EXISTS assignments (id SERIAL PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id), title TEXT NOT NULL, questions TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    await q("CREATE TABLE IF NOT EXISTS submissions (id SERIAL PRIMARY KEY, assignment_id INTEGER NOT NULL REFERENCES assignments(id), student_id INTEGER NOT NULL REFERENCES students(id), answers TEXT, score INTEGER DEFAULT 0, feedback TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    const existing = await q("SELECT COUNT(*)::int as cnt FROM teachers");
    if (existing.rows[0].cnt === 0) {
      await q("INSERT INTO teachers (code, name) VALUES ('T001', '寮犺€佸笀')");
      await q("INSERT INTO teachers (code, name) VALUES ('T002', '鏉庤€佸笀')");
      console.log("Default teachers seeded");
    }
    console.log("PostgreSQL database initialized");
  } catch (e) {
    console.error("Database init error:", e.message);
    throw e;
  }
}

async function callMimoApi(systemPrompt, userContent, timeoutMs) {
  timeoutMs = timeoutMs || 60000;
  if (!MIMO_API_KEY) return { error: 'Error: MIMO_API_KEY not set' };
  try {
    const mod = await import('node-fetch');
    const fetch = mod.default;
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
      console.log('MiMo API Success');
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

function parseJSON(str) { try { return JSON.parse(str || "{}"); } catch(e) { return {}; } }


// === API Routes ===

app.post("/api/teacher/login", async (req, res) => {
  try {
    const code = req.body.code;
    if (!code) return res.status(400).json({ code: 1001, message: "璇疯緭鍏ユ暀甯堢紪鍙? });
    const r = await q("SELECT * FROM teachers WHERE code = $1", [code]);
    if (r.rows.length === 0) return res.json({ code: 1002, message: "鏁欏笀缂栧彿閿欒" });
    res.json({ code: 0, data: r.rows[0] });
  } catch (e) { res.status(500).json({ code: 9999, message: e.message }); }
});

app.post("/api/student/login", async (req, res) => {
  try {
    const { class_code, name } = req.body;
    if (!class_code || !name) return res.status(400).json({ code: 1001, message: "缂哄皯鍙傛暟" });
    const cls = await q("SELECT * FROM classes WHERE code = $1", [class_code]);
    if (cls.rows.length === 0) return res.json({ code: 1002, message: "鐝骇缂栧彿涓嶅瓨鍦? });
    const cl = cls.rows[0];
    let student = await q("SELECT * FROM students WHERE name = $1 AND class_id = $2", [name, cl.id]);
    if (student.rows.length === 0) {
      const r = await q("INSERT INTO students (name, class_id) VALUES ($1, $2) RETURNING *", [name, cl.id]);
      student = r;
    }
    res.json({ code: 0, data: { student: student.rows[0], class: cl } });
  } catch (e) { res.status(500).json({ code: 9999, message: e.message }); }
});

app.get("/api/classes", async (req, res) => {
  try {
    const tid = parseInt(req.query.teacher_id);
    if (!tid) return res.status(400).json({ code: 1001, message: "缂哄皯 teacher_id 鍙傛暟" });
    const r = await q("SELECT * FROM classes WHERE teacher_id = $1 ORDER BY created_at DESC", [tid]);
    res.json({ code: 0, data: r.rows });
  } catch (e) { res.status(500).json({ code: 9999, message: e.message }); }
});

app.post("/api/classes", async (req, res) => {
  try {
    const { teacher_id, name } = req.body;
    if (!teacher_id || !name) return res.status(400).json({ code: 1001, message: "缂哄皯蹇呰鍙傛暟" });
    const code = generateCode();
    const r = await q("INSERT INTO classes (name, code, teacher_id) VALUES ($1, $2, $3) RETURNING *", [name, code, teacher_id]);
    res.json({ code: 0, data: r.rows[0] });
  } catch (e) { res.status(500).json({ code: 9999, message: e.message }); }
});

app.delete("/api/classes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const cls = await q("SELECT * FROM classes WHERE id = $1", [id]);
    if (cls.rows.length === 0) return res.status(404).json({ code: 1003, message: "鐝骇涓嶅瓨鍦? });
    await q("DELETE FROM submissions WHERE assignment_id IN (SELECT id FROM assignments WHERE class_id = $1)", [id]);
    await q("DELETE FROM assignments WHERE class_id = $1", [id]);
    await q("DELETE FROM students WHERE class_id = $1", [id]);
    await q("DELETE FROM classes WHERE id = $1", [id]);
    res.json({ code: 0, message: "鍒犻櫎鎴愬姛" });
  } catch (e) { res.status(500).json({ code: 9999, message: e.message }); }
});

app.post("/api/assignments", async (req, res) => {
  try {
    const { class_id, title, questions } = req.body;
    if (!class_id || !title || !questions) return res.status(400).json({ code: 1001, message: "缂哄皯蹇呰鍙傛暟" });
    const r = await q("INSERT INTO assignments (class_id, title, questions) VALUES ($1, $2, $3) RETURNING *", [class_id, title, JSON.stringify(questions)]);
    res.json({ code: 0, data: r.rows[0] });
  } catch (e) { res.status(500).json({ code: 9999, message: e.message }); }
});

app.get("/api/assignments", async (req, res) => {
  try {
    const class_id = req.query.class_id ? parseInt(req.query.class_id) : null;
    if (class_id) {
      const r = await q("SELECT * FROM assignments WHERE class_id = $1 ORDER BY created_at DESC", [class_id]);
      return res.json({ code: 0, data: r.rows });
    }
    res.status(400).json({ code: 1001, message: "缂哄皯 class_id" });
  } catch (e) { res.status(500).json({ code: 9999, message: e.message }); }
});

app.get("/api/assignments/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const r = await q("SELECT * FROM assignments WHERE id = $1", [id]);
    if (r.rows.length === 0) return res.status(404).json({ code: 1003, message: "浣滀笟涓嶅瓨鍦? });
    const a = r.rows[0];
    a.questions = parseJSON(a.questions);
    res.json({ code: 0, data: a });
  } catch (e) { res.status(500).json({ code: 9999, message: e.message }); }
});

app.delete("/api/assignments/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const a = await q("SELECT * FROM assignments WHERE id = $1", [id]);
    if (a.rows.length === 0) return res.status(404).json({ code: 1003, message: "assignment not found" });
    await q("DELETE FROM submissions WHERE assignment_id = $1", [id]);
    await q("DELETE FROM assignments WHERE id = $1", [id]);
    res.json({ code: 0, message: "ok" });
  } catch (e) { res.status(500).json({ code: 9999, message: e.message }); }
});

app.post("/api/assignments/generate", async (req, res) => {
  try {
    const { prompt, num_questions, content } = req.body;
    const count = Math.min(Math.max(parseInt(num_questions) || 5, 1), 20);
    const courseContent = content || "";
    const sysP = "浣犳槸涓€浣嶈嫳璇暀甯堬紝璇锋牴鎹互涓嬭姹傜敓鎴愯嫳璇粌涔犻銆傞鐩繀椤讳互涓嬫牸寮忕殑JSON鏁扮粍杈撳嚭锛屼笉瑕佸寘鍚叾浠栧唴瀹癸細[{\"question\": \"...\", \"type\": \"choice|fill|translation\", \"options\": [\"A. ...\", \"B. ...\", \"C. ...\", \"D. ...\"], \"answer\": \"...\"}] 濡傛灉鏄痜ill绫诲瀷锛屼笉闇€瑕乷ptions瀛楁銆傚鏋滄槸translation锛屼篃涓嶉渶瑕乷ptions銆傛瘡閬撻鐩殑answer瀛楁蹇呴』鍖呭惈姝ｇ‘绛旀銆傝纭繚杈撳嚭涓烘湁鏁堢殑JSON鏁扮粍銆?;
    let userC = "璇风敓鎴? + count + "閬撹嫳璇粌涔犻锛屽寘鎷€夋嫨棰樸€佸～绌洪鍜岀炕璇戦銆?;
    if (courseContent) userC += "璇剧▼鍐呭锛? + courseContent;
    if (prompt) userC += "鐗瑰埆瑕佹眰锛? + prompt;
    const result = await callMimoApi(sysP, userC);
    if (result.error) return res.json({ code: 0, data: { questions: [], rawContent: result.error, count: 0 } });
    let questions = [];
    let raw = result.content;
    try {
      const jsonMatch = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) raw = jsonMatch[0];
      questions = JSON.parse(raw);
      if (!Array.isArray(questions)) throw new Error("not an array");
    } catch (e) {
      return res.json({ code: 0, data: { questions: [], rawContent: raw, count: 0 } });
    }
    res.json({ code: 0, data: { questions: questions, count: questions.length } });
  } catch (e) {
    res.status(500).json({ code: 9999, message: e.message });
  }
});

app.post("/api/assignments/:id/submit", async (req, res) => {
  try {
    const aid = parseInt(req.params.id);
    const { student_id, answers } = req.body;
    if (!student_id || !answers) return res.status(400).json({ code: 1001, message: "缂哄皯鍙傛暟" });
    const ex = await q("SELECT id FROM submissions WHERE assignment_id = $1 AND student_id = $2", [aid, student_id]);
    if (ex.rows.length > 0) {
      await q("UPDATE submissions SET answers = $1, status = 'submitted', score = 0, feedback = NULL WHERE assignment_id = $2 AND student_id = $3", [JSON.stringify(answers), aid, student_id]);
    } else {
      await q("INSERT INTO submissions (assignment_id, student_id, answers, status) VALUES ($1, $2, $3, 'submitted')", [aid, student_id, JSON.stringify(answers)]);
    }
    res.json({ code: 0, message: "鎻愪氦鎴愬姛" });
  } catch (e) { res.status(500).json({ code: 9999, message: e.message }); }
});

app.post("/api/assignments/:id/grade-auto", async (req, res) => {
  try {
    const aid = parseInt(req.params.id);
    const { student_id, answers } = req.body;
    if (!student_id || !answers) return res.status(400).json({ code: 1001, message: "缂哄皯鍙傛暟" });
    const asgnR = await q("SELECT * FROM assignments WHERE id = $1", [aid]);
    if (asgnR.rows.length === 0) return res.status(404).json({ code: 1003, message: "浣滀笟涓嶅瓨鍦? });
    const asgn = asgnR.rows[0];
    const questions = parseJSON(asgn.questions);
    const sp = "浣犳槸涓€浣嶈嫳璇暀甯堬紝璇峰瀛︾敓鐨勭瓟妗堣繘琛屾壒鏀广€備互涓嬫牸寮忚繑鍥濲SON锛屼笉瑕佸寘鍚叾浠栧唴瀹癸細{\"score\": 85, \"questions\": [{\"idx\": 0, \"correct\": true, \"feedback\": \"...\", \"correctAnswer\": \"...\"}], \"comment\": \"鎬讳綋璇勪环\"}";
    const uc = "鍘熼锛? + JSON.stringify(questions) + "\n瀛︾敓绛旀锛? + JSON.stringify(answers);
    const result = await callMimoApi(sp, uc);
    if (result.error) return res.json({ code: 0, data: { score: 0, questions: [], comment: "鎵规敼澶辫触锛? + result.error } });
    let fb = { score: 0, questions: [], comment: "" };
    try {
      let raw = result.content;
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) raw = jsonMatch[0];
      fb = JSON.parse(raw);
    } catch (e) {
      fb = { score: 0, questions: [], comment: "瑙ｆ瀽澶辫触锛? + result.content };
    }
    const ex = await q("SELECT id FROM submissions WHERE assignment_id = $1 AND student_id = $2", [aid, student_id]);
    if (ex.rows.length > 0) {
      await q("UPDATE submissions SET score = $1, feedback = $2, status = 'graded' WHERE assignment_id = $3 AND student_id = $4", [fb.score, JSON.stringify(fb), aid, student_id]);
    } else {
      await q("INSERT INTO submissions (assignment_id, student_id, answers, score, feedback, status) VALUES ($1, $2, $3, $4, $5, 'graded')", [aid, student_id, JSON.stringify(answers), fb.score, JSON.stringify(fb)]);
    }
    res.json({ code: 0, data: fb });
  } catch (e) { res.status(500).json({ code: 9999, message: e.message }); }
});

app.get("/api/submissions", async (req, res) => {
  try {
    const aid = req.query.assignment_id ? parseInt(req.query.assignment_id) : null;
    const sid = req.query.student_id ? parseInt(req.query.student_id) : null;
    if (aid && sid) {
      const r = await q("SELECT s.*, st.name as student_name FROM submissions s JOIN students st ON st.id = s.student_id WHERE s.assignment_id = $1 AND s.student_id = $2", [aid, sid]);
      if (r.rows.length === 0) return res.json({ code: 0, data: null });
      const s = r.rows[0];
      return res.json({ code: 0, data: { id: s.id, student_name: s.student_name, score: s.score, answers: parseJSON(s.answers), feedback: parseJSON(s.feedback), status: s.status, created_at: s.created_at } });
    }
    if (aid) {
      const r = await q("SELECT s.*, st.name as student_name FROM submissions s JOIN students st ON st.id = s.student_id WHERE s.assignment_id = $1 ORDER BY s.created_at DESC", [aid]);
      return res.json({ code: 0, data: r.rows.map(function(s) { return { id: s.id, student_id: s.student_id, student_name: s.student_name, score: s.score, status: s.status, created_at: s.created_at }; }) });
    }
    if (sid) {
      const r = await q("SELECT s.*, a.title as assignment_title FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.student_id = $1 ORDER BY s.created_at DESC", [sid]);
      return res.json({ code: 0, data: r.rows.map(function(s) { return { id: s.id, assignment_title: s.assignment_title, assignment_id: s.assignment_id, score: s.score, status: s.status, created_at: s.created_at }; }) });
    }
    res.status(400).json({ code: 1001, message: "鍙傛暟涓嶈冻" });
  } catch (e) { res.status(500).json({ code: 9999, message: e.message }); }
});

app.post("/api/assignments/:id/grade", async (req, res) => {
  try {
    const aid = parseInt(req.params.id);
    const { student_id, score, feedback, comment } = req.body;
    if (!student_id || score === undefined) return res.status(400).json({ code: 1001, message: "缂哄皯鍙傛暟" });
    const fb = { score: score, questions: feedback || [], comment: comment || "" };
    const ex = await q("SELECT id FROM submissions WHERE assignment_id = $1 AND student_id = $2", [aid, student_id]);
    if (ex.rows.length > 0) {
      await q("UPDATE submissions SET score = $1, feedback = $2, status = 'graded' WHERE id = $3", [score, JSON.stringify(fb), ex.rows[0].id]);
    } else {
      return res.status(404).json({ code: 1003, message: "鎻愪氦璁板綍涓嶅瓨鍦? });
    }
    res.json({ code: 0, data: fb });
  } catch (e) { res.status(500).json({ code: 9999, message: e.message }); }
});

app.get("/api/student/assignments", async (req, res) => {
  try {
    const student_id = parseInt(req.query.student_id);
    const class_id = parseInt(req.query.class_id);
    if (!student_id || !class_id) return res.status(400).json({ code: 1001, message: "缺少参数" });
    const assignments = await q("SELECT * FROM assignments WHERE class_id = $1 ORDER BY created_at DESC", [class_id]);
    const subs = await q("SELECT assignment_id, status, score FROM submissions WHERE student_id = $1", [student_id]);
    const subMap = {};
    subs.rows.forEach(function(s) { subMap[s.assignment_id] = s; });
    const data = assignments.rows.map(function(a) {
      const sub = subMap[a.id] || {};
      return {
        id: a.id,
        title: a.title,
        created_at: a.created_at,
        submit_status: sub.status || "pending",
        score: sub.score || null
      };
    });
    res.json({ code: 0, data: data });
  } catch (e) { res.status(500).json({ code: 9999, message: e.message }); }
});
app.get("/api/students", async (req, res) => {
  try {
    const class_id = req.query.class_id ? parseInt(req.query.class_id) : null;
    if (!class_id) return res.status(400).json({ code: 1001, message: "缂哄皯 class_id" });
    const r = await q("SELECT * FROM students WHERE class_id = $1 ORDER BY created_at ASC", [class_id]);
    res.json({ code: 0, data: r.rows });
  } catch (e) { res.status(500).json({ code: 9999, message: e.message }); }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "鏈嶅姟杩愯姝ｅ父" });
});

app.use((req, res) => {
  if (req.method === "GET" && !req.path.startsWith("/api/")) {
    res.sendFile(path.join(FRONTEND_DIR, "index.html"));
  } else {
    res.status(404).json({ code: 1004, message: "Not found" });
  }
});

initDb().then(() => {
  console.log("=".repeat(50));
  console.log("ZOE瀛︿範鏅鸿兘浣?- 鏈嶅姟鍚姩");
  console.log("=".repeat(50));
  console.log("PostgreSQL: OK");
  console.log("API Key: OK");
  console.log("璁块棶鍦板潃: http://0.0.0.0:" + PORT);
  console.log("=".repeat(50));
  app.listen(PORT, "0.0.0.0", function () {
    console.log("Server running on http://0.0.0.0:" + PORT);
  });
}).catch((e) => {
  console.error("Failed to start:", e.message);
  process.exit(1);
});

module.exports = app;