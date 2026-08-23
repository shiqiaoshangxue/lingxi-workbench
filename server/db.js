/* ============================================================
   灵犀工作台 · 服务端存储层
   JSON 文件数据库：原子写入（临时文件 + rename）+ 串行写队列
   零外部依赖，数据文件位于 data/db.json
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

/* ---------- 初始化 ---------- */
function defaultData() {
  const t = Date.now();
  return {
    users: [],
    projects: [],
    projectMembers: [],
    columns: [
      { id: "col_todo", name: "待办", color: "#9aa0b0", order: 0 },
      { id: "col_doing", name: "进行中", color: "#4f6bff", order: 1 },
      { id: "col_done", name: "已完成", color: "#16a34a", order: 2 },
    ],
    tasks: [],
    timeLogs: [],
    goals: [],
    notes: [],
    clients: [],
    ideas: [],
    canvas: [],
    milestones: [],
    events: [],
    comments: [],
    files: [],
    retros: [],
    notifications: [],
    agentRules: [],
    agentLogs: [],
    agentConfig: null,
    mailConfig: null,
    meta: { createdAt: t },
  };
}

let db = null;
let writeChain = Promise.resolve();

function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    // 结构校验，缺的集合补上（向前兼容）
    const def = defaultData();
    for (const k of Object.keys(def)) if (!(k in db)) db[k] = def[k];
  } catch (e) {
    db = defaultData();
    persist();
  }
  return db;
}

/* 原子写入：先写临时文件再 rename，避免写一半损坏；rename 失败自动重试 */
function persist() {
  writeChain = writeChain.then(() => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
    for (let i = 0; i < 5; i++) {
      try { fs.renameSync(tmp, DB_FILE); return; }
      catch (e) {
        if (i === 4) throw e;
        const t0 = Date.now();
        while (Date.now() - t0 < 60 * (i + 1)) { /* 短等待后重试 */ }
      }
    }
  }).catch((err) => {
    console.error("[db] 写入失败:", err.message);
  });
  return writeChain;
}

/* ---------- 工具 ---------- */
const uid = (p = "") => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => Date.now();
const dayStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* ---------- 密码 & 令牌 ---------- */
function hashPassword(pw, salt) {
  return crypto.createHash("sha256").update(salt + pw).digest("hex");
}
function makeSalt() { return crypto.randomBytes(16).toString("hex"); }

function getSecret() {
  const keyFile = path.join(DATA_DIR, "secret.key");
  try { return fs.readFileSync(keyFile, "utf8").trim(); }
  catch (e) {
    const s = crypto.randomBytes(32).toString("hex");
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(keyFile, s, "utf8");
    return s;
  }
}
const SECRET = getSecret();

const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function signToken(payload, ttlMs = 1000 * 60 * 60 * 24 * 30) {
  const p = Object.assign({ iat: now(), exp: now() + ttlMs }, payload);
  const h = enc({ alg: "HS256", typ: "JWT" });
  const body = enc(p);
  const sig = crypto.createHmac("sha256", SECRET).update(h + "." + body).digest("base64url");
  return `${h}.${body}.${sig}`;
}
function verifyToken(token) {
  try {
    const [h, body, sig] = String(token).split(".");
    const expect = crypto.createHmac("sha256", SECRET).update(h + "." + body).digest("base64url");
    if (sig !== expect) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp < now()) return null;
    return payload;
  } catch (e) { return null; }
}

/* ---------- 权限辅助 ---------- */
function findUser(id) { return db.users.find((u) => u.id === id); }
function findUserByName(name) { return db.users.find((u) => u.username === String(name).toLowerCase()); }

function projectMemberRole(userId, projectId) {
  const m = db.projectMembers.find((x) => x.projectId === projectId && x.userId === userId);
  return m ? m.role : null;
}
function canReadProject(user, projectId) {
  if (!projectId) return true; // 个人数据
  if (user.role === "owner") return true; // 系统管理员
  return projectMemberRole(user.id, projectId) !== null;
}
function canWriteProject(user, projectId) {
  if (!projectId) return true;
  if (user.role === "owner") return true;
  const r = projectMemberRole(user.id, projectId);
  return r === "owner" || r === "editor";
}
function isProjectAdmin(user, projectId) {
  if (user.role === "owner") return true;
  return projectMemberRole(user.id, projectId) === "owner";
}

/* ---------- 可见数据过滤 ---------- */
function visibleProjectIds(user) {
  if (user.role === "owner") return db.projects.map((p) => p.id);
  return db.projectMembers.filter((m) => m.userId === user.id).map((m) => m.projectId);
}
function visibleTasks(user) {
  const pids = new Set(visibleProjectIds(user));
  return db.tasks.filter((t) => !t.projectId || pids.has(t.projectId));
}
function visibleItems(user, collection) {
  const pids = new Set(visibleProjectIds(user));
  return db[collection].filter((it) => {
    if (it.userId && it.userId === user.id) return true;      // 个人私有
    if (it.projectId && pids.has(it.projectId)) return true;  // 项目共享
    return false;
  });
}

module.exports = { load, persist, db, uid, now, dayStr, hashPassword, makeSalt, signToken, verifyToken,
  findUser, findUserByName, projectMemberRole, canReadProject, canWriteProject, isProjectAdmin,
  visibleProjectIds, visibleTasks, visibleItems };
