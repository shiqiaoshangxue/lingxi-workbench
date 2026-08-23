/* ============================================================
   灵犀工作台 · 服务端入口（零依赖 node:http）
   提供：REST API（多用户 + 权限）+ 静态文件托管 + 文件上传下载
   启动：node server.js  →  http://localhost:3000
   ============================================================ */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const DB = require("./db");
const Agent = require("./agent");
const Mail = require("./mail");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "..");
const FILE_DIR = path.join(__dirname, "data", "files");

const db = DB.load();

/* ================= 基础工具 ================= */
function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
function ok(res, data) { json(res, 200, data); }
function fail(res, code, msg) { json(res, code, { error: msg }); }

function readBody(req, limit = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("body 过大")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function publicUser(u) {
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role, email: u.email || "", createdAt: u.createdAt };
}

/* 认证中间件 */
function auth(req, res) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  const payload = token ? DB.verifyToken(token) : null;
  if (!payload || !payload.uid) { fail(res, 401, "未登录或登录已过期"); return null; }
  const user = DB.findUser(payload.uid);
  if (!user) { fail(res, 401, "用户不存在"); return null; }
  return user;
}

function notify(userId, title, desc, link) {
  db.notifications.push({ id: DB.uid("n_"), userId, title, desc, link: link || "", read: false, createdAt: DB.now() });
  // 若配置了 SMTP 且用户有邮箱，异步发送邮件（失败静默）
  const cfg = db.mailConfig;
  const u = DB.findUser(userId);
  if (cfg && cfg.enabled && u && u.email) {
    Mail.sendMail(cfg, u.email, "【灵犀工作台】" + title, desc + (link ? "\n\n打开链接查看：" + link : "")).catch((e) => console.error("[mail]", e.message));
  }
}

function delCascade(projectId) {
  ["tasks", "timeLogs", "comments", "files", "ideas", "milestones", "events", "canvas", "retros"].forEach((c) => {
    db[c] = db[c].filter((x) => x.projectId !== projectId);
  });
  db.projectMembers = db.projectMembers.filter((m) => m.projectId !== projectId);
}

/* ================= 路由表 ================= */
const routes = [];

function on(method, pattern, handler) {
  const keys = [];
  const rx = new RegExp("^" + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return "([^/]+)"; }) + "$");
  routes.push({ method, rx, keys, handler });
}

/* ---------- 认证 ---------- */
on("POST", "/api/auth/register", async (req, res, body) => {
  const { username, password, displayName } = body || {};
  const un = String(username || "").trim().toLowerCase();
  if (!un || !password) return fail(res, 400, "用户名和密码必填");
  if (un.length < 2 || password.length < 4) return fail(res, 400, "用户名至少 2 位，密码至少 4 位");
  if (DB.findUserByName(un)) return fail(res, 409, "用户名已存在");
  const salt = DB.makeSalt();
  const user = {
    id: DB.uid("u_"), username: un,
    passwordHash: DB.hashPassword(password, salt), salt,
    displayName: (displayName || un).trim().slice(0, 24),
    role: db.users.length === 0 ? "owner" : "member", // 首个注册者成为管理员
    createdAt: DB.now(),
  };
  db.users.push(user);
  DB.persist();
  ok(res, { token: DB.signToken({ uid: user.id }), user: publicUser(user) });
});

on("POST", "/api/auth/login", async (req, res, body) => {
  const { username, password } = body || {};
  const user = DB.findUserByName(String(username || ""));
  if (!user || user.passwordHash !== DB.hashPassword(String(password || ""), user.salt))
    return fail(res, 401, "用户名或密码错误");
  ok(res, { token: DB.signToken({ uid: user.id }), user: publicUser(user) });
});

on("GET", "/api/me", (req, res, _b, user) => ok(res, publicUser(user)));

/* 更新个人资料 */
on("POST", "/api/profile", async (req, res, body, user) => {
  if (body.displayName !== undefined) user.displayName = String(body.displayName).trim().slice(0, 24) || user.displayName;
  if (body.email !== undefined) user.email = String(body.email).trim().slice(0, 120);
  DB.persist();
  ok(res, publicUser(user));
});

/* 导入个人数据（合并：目标/笔记/客户/个人任务/个人时间日志/个人事件） */
on("POST", "/api/import", async (req, res, body, user) => {
  const d = body && body.data ? body.data : {};
  let count = 0;
  const pick = (arr) => Array.isArray(arr) ? arr : [];
  pick(d.goals).forEach((g) => { if (g && g.title) { db.goals.push({ id: DB.uid("g_"), title: String(g.title).slice(0, 120), desc: String(g.desc || ""), color: g.color || "#4f6bff", dueDate: g.dueDate || "", krs: g.krs || [], userId: user.id, createdAt: DB.now(), updatedAt: DB.now() }); count++; } });
  pick(d.notes).forEach((n) => { if (n && n.title) { db.notes.push({ id: DB.uid("n_"), title: String(n.title).slice(0, 120), category: n.category || "随笔", content: String(n.content || ""), pinned: !!n.pinned, userId: user.id, createdAt: DB.now(), updatedAt: DB.now() }); count++; } });
  pick(d.clients).forEach((c) => { if (c && c.title) { db.clients.push({ id: DB.uid("c_"), title: String(c.title).slice(0, 120), org: String(c.org || ""), projectId: null, email: String(c.email || ""), phone: String(c.phone || ""), desc: String(c.desc || ""), userId: user.id, createdAt: DB.now() }); count++; } });
  pick(d.tasks).forEach((t) => { if (t && t.title && !t.projectId) { db.tasks.push({ id: DB.uid("t_"), title: String(t.title).slice(0, 200), desc: String(t.desc || ""), projectId: null, colId: (t.colId && db.columns.find((x) => x.id === t.colId)) ? t.colId : db.columns[0].id, priority: t.priority || "mid", dueDate: t.dueDate || "", startDate: t.startDate || "", tags: t.tags || [], subtasks: t.subtasks || [], assigneeId: null, createdAt: DB.now(), completedAt: t.completedAt || null, order: db.tasks.length }); count++; } });
  pick(d.timeLogs).forEach((l) => { if (l && l.minutes) { db.timeLogs.push({ id: DB.uid("l_"), taskId: null, minutes: Math.round(l.minutes), date: l.date || DB.dayStr(), note: String(l.note || "").slice(0, 200), userId: user.id, createdAt: DB.now() }); count++; } });
  pick(d.events).forEach((e) => { if (e && e.title && e.date) { db.events.push({ id: DB.uid("e_"), projectId: null, title: String(e.title).slice(0, 120), date: e.date, desc: String(e.desc || ""), userId: user.id, createdAt: DB.now() }); count++; } });
  DB.persist();
  ok(res, { ok: true, count });
});

/* ---------- 引导数据（一次拉取可见数据） ---------- */
on("GET", "/api/bootstrap", (req, res, _b, user) => {
  const pids = new Set(DB.visibleProjectIds(user));
  const projects = db.projects.filter((p) => pids.has(p.id)).map((p) => {
    const m = db.projectMembers.find((x) => x.projectId === p.id && x.userId === user.id);
    return Object.assign({}, p, { myRole: m ? m.role : "owner" });
  });
  const members = db.projectMembers.filter((m) => pids.has(m.projectId)).map((m) =>
    Object.assign({}, m, { user: (() => { const u = DB.findUser(m.userId); return u ? publicUser(u) : null; })() }));
  ok(res, {
    user: publicUser(user),
    columns: db.columns,
    projects,
    tasks: DB.visibleTasks(user),
    timeLogs: DB.visibleItems(user, "timeLogs"),
    goals: DB.visibleItems(user, "goals"),
    notes: DB.visibleItems(user, "notes"),
    clients: DB.visibleItems(user, "clients"),
    ideas: DB.visibleItems(user, "ideas"),
    canvas: DB.visibleItems(user, "canvas"),
    milestones: DB.visibleItems(user, "milestones"),
    events: DB.visibleItems(user, "events"),
    comments: DB.visibleItems(user, "comments"),
    files: DB.visibleItems(user, "files").map((f) => ({ id: f.id, projectId: f.projectId, name: f.name, size: f.size, mime: f.mime, uploadedBy: f.uploadedBy, createdAt: f.createdAt })),
    retros: DB.visibleItems(user, "retros"),
    mailEnabled: !!(db.mailConfig && db.mailConfig.enabled),
    notifications: db.notifications.filter((n) => n.userId === user.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50),
    members,
    isAdmin: user.role === "owner",
  });
});

/* ---------- 项目 ---------- */
on("GET", "/api/projects", (req, res, _b, user) => {
  const pids = new Set(DB.visibleProjectIds(user));
  const list = db.projects.filter((p) => pids.has(p.id)).map((p) => {
    const m = db.projectMembers.find((x) => x.projectId === p.id && x.userId === user.id);
    return Object.assign({}, p, { myRole: m ? m.role : "owner" });
  });
  ok(res, list);
});

on("POST", "/api/projects", async (req, res, body, user) => {
  const { name, desc, color } = body || {};
  if (!name || !String(name).trim()) return fail(res, 400, "项目名称必填");
  const p = { id: DB.uid("p_"), name: String(name).trim().slice(0, 60), desc: String(desc || ""), color: color || "#4f6bff", status: "active", ownerId: user.id, createdAt: DB.now() };
  db.projects.push(p);
  db.projectMembers.push({ projectId: p.id, userId: user.id, role: "owner" });
  DB.persist();
  ok(res, Object.assign({}, p, { myRole: "owner" }));
});

on("PUT", "/api/projects/:id", async (req, res, body, user, m) => {
  const p = db.projects.find((x) => x.id === m[0]);
  if (!p) return fail(res, 404, "项目不存在");
  if (!DB.canWriteProject(user, p.id)) return fail(res, 403, "没有权限");
  if (body.name !== undefined) p.name = String(body.name).trim().slice(0, 60) || p.name;
  if (body.desc !== undefined) p.desc = String(body.desc);
  if (body.color !== undefined) p.color = body.color;
  if (body.status !== undefined) p.status = body.status;
  DB.persist();
  ok(res, p);
});

on("DELETE", "/api/projects/:id", async (req, res, _b, user, m) => {
  const p = db.projects.find((x) => x.id === m[0]);
  if (!p) return fail(res, 404, "项目不存在");
  if (!DB.isProjectAdmin(user, p.id)) return fail(res, 403, "仅项目负责人可删除");
  db.projects = db.projects.filter((x) => x.id !== p.id);
  delCascade(p.id);
  DB.persist();
  ok(res, { ok: true });
});

/* ---------- 项目成员 ---------- */
on("GET", "/api/projects/:id/members", (req, res, _b, user, m) => {
  const p = db.projects.find((x) => x.id === m[0]);
  if (!p) return fail(res, 404, "项目不存在");
  if (!DB.canReadProject(user, p.id)) return fail(res, 403, "无权访问");
  const list = db.projectMembers.filter((x) => x.projectId === p.id).map((x) => {
    const u = DB.findUser(x.userId);
    return { projectId: x.projectId, userId: x.userId, role: x.role, user: u ? publicUser(u) : null };
  });
  ok(res, list);
});

on("POST", "/api/projects/:id/members", async (req, res, body, user, m) => {
  const p = db.projects.find((x) => x.id === m[0]);
  if (!p) return fail(res, 404, "项目不存在");
  if (!DB.isProjectAdmin(user, p.id)) return fail(res, 403, "仅项目负责人可管理成员");
  const { userId, role } = body || {};
  const target = DB.findUser(userId);
  if (!target) return fail(res, 404, "用户不存在");
  const r = ["owner", "editor", "viewer"].includes(role) ? role : "editor";
  const exist = db.projectMembers.find((x) => x.projectId === p.id && x.userId === userId);
  if (exist) exist.role = r;
  else db.projectMembers.push({ projectId: p.id, userId, role: r });
  notify(userId, "新项目邀请", `${publicUser(user).displayName} 邀请你加入项目「${p.name}」（${r === "viewer" ? "只读" : r === "editor" ? "可编辑" : "负责人"}）`, `#/projects`);
  DB.persist();
  ok(res, { ok: true });
});

on("DELETE", "/api/projects/:id/members/:userId", async (req, res, _b, user, m) => {
  const p = db.projects.find((x) => x.id === m[0]);
  if (!p) return fail(res, 404, "项目不存在");
  if (!DB.isProjectAdmin(user, p.id)) return fail(res, 403, "仅项目负责人可管理成员");
  if (m[1] === user.id) return fail(res, 400, "不能移除自己");
  db.projectMembers = db.projectMembers.filter((x) => !(x.projectId === p.id && x.userId === m[1]));
  DB.persist();
  ok(res, { ok: true });
});

/* ---------- 看板列（全局；管理员可改） ---------- */
on("GET", "/api/columns", (req, res) => ok(res, db.columns));
on("POST", "/api/columns", async (req, res, body, user) => {
  if (user.role !== "owner") return fail(res, 403, "仅管理员可改列");
  if (!body.name) return fail(res, 400, "列名称必填");
  db.columns.push({ id: DB.uid("col_"), name: String(body.name).trim().slice(0, 12), color: body.color || "#4f6bff", order: db.columns.length });
  DB.persist(); ok(res, db.columns);
});
on("PUT", "/api/columns/:id", async (req, res, body, user, m) => {
  if (user.role !== "owner") return fail(res, 403, "仅管理员可改列");
  const c = db.columns.find((x) => x.id === m[0]);
  if (!c) return fail(res, 404, "列不存在");
  if (body.name) c.name = String(body.name).trim().slice(0, 12);
  if (body.color) c.color = body.color;
  if (body.order !== undefined) c.order = +body.order;
  DB.persist(); ok(res, db.columns);
});
on("DELETE", "/api/columns/:id", async (req, res, _b, user, m) => {
  if (user.role !== "owner") return fail(res, 403, "仅管理员可改列");
  if (db.columns.length <= 1) return fail(res, 400, "至少保留一列");
  const target = db.columns[0].id;
  db.tasks.forEach((t) => { if (t.colId === m[0]) t.colId = target; });
  db.columns = db.columns.filter((x) => x.id !== m[0]).map((x, i) => Object.assign({}, x, { order: i }));
  DB.persist(); ok(res, db.columns);
});

/* ---------- 任务 ---------- */
on("GET", "/api/tasks", (req, res, _b, user) => {
  let tasks = DB.visibleTasks(user);
  const url = new URL(req.url, "http://x");
  const pid = url.searchParams.get("projectId");
  if (pid) tasks = tasks.filter((t) => t.projectId === pid);
  ok(res, tasks);
});

on("POST", "/api/tasks", async (req, res, body, user) => {
  const { title, projectId } = body || {};
  if (!title || !String(title).trim()) return fail(res, 400, "任务标题必填");
  if (projectId && !DB.canWriteProject(user, projectId)) return fail(res, 403, "没有权限");
  const t = Object.assign({
    id: DB.uid("t_"), title: String(title).trim().slice(0, 200), desc: String(body.desc || ""),
    projectId: projectId || null, colId: body.colId || db.columns[0].id,
    priority: body.priority || "mid", dueDate: body.dueDate || "", startDate: body.startDate || "",
    tags: body.tags || [], subtasks: body.subtasks || [], assigneeId: body.assigneeId || null,
    dependencies: Array.isArray(body.dependencies) ? body.dependencies : [],
    milestoneId: body.milestoneId || null,
    createdAt: DB.now(), completedAt: null, order: db.tasks.length,
  }, {});
  db.tasks.push(t);
  if (t.assigneeId && t.assigneeId !== user.id) {
    const p = db.projects.find((x) => x.id === t.projectId);
    notify(t.assigneeId, "新任务分配", `${publicUser(user).displayName} 给你分配了任务「${t.title}」${p ? `（${p.name}）` : ""}`, `#/tasks`);
  }
  DB.persist();
  ok(res, t);
});

on("PUT", "/api/tasks/:id", async (req, res, body, user, m) => {
  const t = db.tasks.find((x) => x.id === m[0]);
  if (!t) return fail(res, 404, "任务不存在");
  if (t.projectId && !DB.canWriteProject(user, t.projectId)) return fail(res, 403, "没有权限");
  if (body.projectId && body.projectId !== t.projectId && !DB.canWriteProject(user, body.projectId)) return fail(res, 403, "没有权限");
  ["title", "desc", "priority", "dueDate", "startDate", "tags", "subtasks", "assigneeId", "milestoneId"].forEach((k) => {
    if (body[k] !== undefined) t[k] = body[k];
  });
  if (body.dependencies !== undefined) t.dependencies = Array.isArray(body.dependencies) ? body.dependencies : [];
  if (body.colId !== undefined) t.colId = body.colId;
  if (body.projectId !== undefined) t.projectId = body.projectId || null;
  if (t.colId === "col_done") t.completedAt = t.completedAt || DB.now();
  else t.completedAt = null;
  if (body.assigneeId && body.assigneeId !== t.assigneeId && body.assigneeId !== user.id) {
    const p = db.projects.find((x) => x.id === t.projectId);
    notify(body.assigneeId, "任务分配变更", `「${t.title}」现在由你负责${p ? `（${p.name}）` : ""}`, `#/tasks`);
    t.assigneeId = body.assigneeId;
  }
  DB.persist();
  ok(res, t);
});

on("DELETE", "/api/tasks/:id", async (req, res, _b, user, m) => {
  const t = db.tasks.find((x) => x.id === m[0]);
  if (!t) return fail(res, 404, "任务不存在");
  if (t.projectId && !DB.canWriteProject(user, t.projectId)) return fail(res, 403, "没有权限");
  db.tasks = db.tasks.filter((x) => x.id !== t.id);
  db.tasks.forEach((x) => { if (x.dependencies && x.dependencies.includes(t.id)) x.dependencies = x.dependencies.filter((d) => d !== t.id); });
  db.timeLogs = db.timeLogs.filter((l) => l.taskId !== t.id);
  db.comments = db.comments.filter((c) => c.taskId !== t.id);
  DB.persist();
  ok(res, { ok: true });
});

/* ---------- 时间日志 ---------- */
on("GET", "/api/timeLogs", (req, res, _b, user) => ok(res, DB.visibleItems(user, "timeLogs")));
on("POST", "/api/timeLogs", async (req, res, body, user) => {
  const minutes = Math.round(+(body.minutes || 0));
  if (!minutes || minutes < 1) return fail(res, 400, "时长无效");
  const taskId = body.taskId || null;
  const t = taskId ? db.tasks.find((x) => x.id === taskId) : null;
  if (taskId && !t) return fail(res, 404, "任务不存在");
  if (t && t.projectId && !DB.canWriteProject(user, t.projectId)) return fail(res, 403, "没有权限");
  const log = { id: DB.uid("l_"), taskId, minutes, date: body.date || DB.dayStr(), note: String(body.note || "").slice(0, 200), userId: user.id, createdAt: DB.now() };
  db.timeLogs.push(log);
  DB.persist();
  ok(res, log);
});
on("DELETE", "/api/timeLogs/:id", async (req, res, _b, user, m) => {
  const l = db.timeLogs.find((x) => x.id === m[0]);
  if (!l) return fail(res, 404, "记录不存在");
  if (l.userId !== user.id) {
    const t = l.taskId ? db.tasks.find((x) => x.id === l.taskId) : null;
    if (!t || !DB.canWriteProject(user, t.projectId)) return fail(res, 403, "没有权限");
  }
  db.timeLogs = db.timeLogs.filter((x) => x.id !== l.id);
  DB.persist();
  ok(res, { ok: true });
});

/* ---------- 个人资源（目标/笔记） ---------- */
["goals", "notes"].forEach((col) => {
  on("GET", "/api/" + col, (req, res, _b, user) => ok(res, DB.visibleItems(user, col)));
  on("POST", "/api/" + col, async (req, res, body, user) => {
    if (!body.title) return fail(res, 400, "标题必填");
    const item = Object.assign({
      id: DB.uid(col === "goals" ? "g_" : "n_"), title: String(body.title).trim().slice(0, 120),
      desc: String(body.desc || ""), color: body.color || "#4f6bff", dueDate: body.dueDate || "",
      krs: body.krs || [], userId: user.id, createdAt: DB.now(), updatedAt: DB.now(),
    }, col === "notes" ? { category: body.category || "随笔", content: String(body.content || ""), pinned: !!body.pinned } : {});
    db[col].push(item);
    DB.persist();
    ok(res, item);
  });
  on("PUT", "/api/" + col + "/:id", async (req, res, body, user, m) => {
    const it = db[col].find((x) => x.id === m[0]);
    if (!it) return fail(res, 404, "不存在");
    if (it.userId !== user.id) return fail(res, 403, "没有权限");
    Object.keys(body).forEach((k) => { if (k !== "id" && k !== "userId" && k !== "createdAt") it[k] = body[k]; });
    it.updatedAt = DB.now();
    DB.persist();
    ok(res, it);
  });
  on("DELETE", "/api/" + col + "/:id", async (req, res, _b, user, m) => {
    const it = db[col].find((x) => x.id === m[0]);
    if (!it) return fail(res, 404, "不存在");
    if (it.userId !== user.id) return fail(res, 403, "没有权限");
    db[col] = db[col].filter((x) => x.id !== it.id);
    DB.persist();
    ok(res, { ok: true });
  });
});

/* ---------- 项目内资源（客户/想法/画布/里程碑/日历事件） ---------- */
function projectResource(col, uidPrefix, checkWrite) {
  on("GET", "/api/" + col, (req, res, _b, user) => ok(res, DB.visibleItems(user, col)));
  on("POST", "/api/" + col, async (req, res, body, user) => {
    if (body.projectId && !DB.canWriteProject(user, body.projectId)) return fail(res, 403, "没有权限");
    if (!body.title && col !== "canvas") return fail(res, 400, "标题必填");
    const item = Object.assign({
      id: DB.uid(uidPrefix), projectId: body.projectId || null, userId: user.id, createdAt: DB.now(),
    }, body || {});
    delete item.userId;
    db[col].push(item);
    DB.persist();
    ok(res, item);
  });
  on("PUT", "/api/" + col + "/:id", async (req, res, body, user, m) => {
    const it = db[col].find((x) => x.id === m[0]);
    if (!it) return fail(res, 404, "不存在");
    if (!DB.canWriteProject(user, it.projectId)) return fail(res, 403, "没有权限");
    Object.keys(body).forEach((k) => { if (k !== "id" && k !== "createdAt") it[k] = body[k]; });
    DB.persist();
    ok(res, it);
  });
  on("DELETE", "/api/" + col + "/:id", async (req, res, _b, user, m) => {
    const it = db[col].find((x) => x.id === m[0]);
    if (!it) return fail(res, 404, "不存在");
    if (!DB.canWriteProject(user, it.projectId)) return fail(res, 403, "没有权限");
    db[col] = db[col].filter((x) => x.id !== it.id);
    if (col === "milestones") {
      db.tasks.forEach((t) => { if (t.milestoneId === it.id) t.milestoneId = null; });
    }
    DB.persist();
    ok(res, { ok: true });
  });
}
projectResource("clients", "c_");
projectResource("ideas", "i_");
projectResource("milestones", "ms_");
projectResource("events", "e_");
projectResource("retros", "rt_");

/* 画布特殊处理：type 校验 */
on("POST", "/api/canvas", async (req, res, body, user) => {
  if (body.projectId && !DB.canWriteProject(user, body.projectId)) return fail(res, 403, "没有权限");
  const type = ["swot", "lean", "bmc", "value_prop", "customer_journey", "empathy", "lean_startup"].includes(body.type) ? body.type : "swot";
  const item = { id: DB.uid("cv_"), projectId: body.projectId || null, type, cells: body.cells || {}, userId: user.id, createdAt: DB.now() };
  delete item.userId;
  db.canvas.push(item);
  DB.persist();
  ok(res, item);
});

/* 画布更新 / 删除（前端 makeProjectResource 生成 PUT/DELETE 调用，需补齐） */
on("PUT", "/api/canvas/:id", async (req, res, body, user, m) => {
  const it = db.canvas.find((x) => x.id === m[0]);
  if (!it) return fail(res, 404, "不存在");
  if (!DB.canWriteProject(user, it.projectId)) return fail(res, 403, "没有权限");
  Object.keys(body).forEach((k) => { if (k !== "id" && k !== "createdAt") it[k] = body[k]; });
  DB.persist();
  ok(res, it);
});
on("DELETE", "/api/canvas/:id", async (req, res, _b, user, m) => {
  const it = db.canvas.find((x) => x.id === m[0]);
  if (!it) return fail(res, 404, "不存在");
  if (!DB.canWriteProject(user, it.projectId)) return fail(res, 403, "没有权限");
  db.canvas = db.canvas.filter((x) => x.id !== it.id);
  DB.persist();
  ok(res, { ok: true });
});

/* 想法投票 */
on("POST", "/api/ideas/:id/vote", async (req, res, _b, user, m) => {
  const it = db.ideas.find((x) => x.id === m[0]);
  if (!it) return fail(res, 404, "想法不存在");
  if (!DB.canReadProject(user, it.projectId)) return fail(res, 403, "没有权限");
  it.votes = it.votes || [];
  const i = it.votes.indexOf(user.id);
  if (i >= 0) it.votes.splice(i, 1);
  else it.votes.push(user.id);
  DB.persist();
  ok(res, { votes: it.votes });
});

/* ---------- 评论 ---------- */
on("GET", "/api/tasks/:id/comments", (req, res, _b, user, m) => {
  const t = db.tasks.find((x) => x.id === m[0]);
  if (!t) return fail(res, 404, "任务不存在");
  if (!DB.canReadProject(user, t.projectId)) return fail(res, 403, "没有权限");
  const list = db.comments.filter((c) => c.taskId === t.id).sort((a, b) => a.createdAt - b.createdAt).map((c) => {
    const u = DB.findUser(c.userId);
    return Object.assign({}, c, { user: u ? publicUser(u) : null });
  });
  ok(res, list);
});
on("POST", "/api/tasks/:id/comments", async (req, res, body, user, m) => {
  const t = db.tasks.find((x) => x.id === m[0]);
  if (!t) return fail(res, 404, "任务不存在");
  if (!DB.canWriteProject(user, t.projectId)) return fail(res, 403, "没有权限");
  const content = String(body.content || "").trim();
  if (!content) return fail(res, 400, "评论内容不能为空");
  const c = { id: DB.uid("cm_"), taskId: t.id, projectId: t.projectId, userId: user.id, content: content.slice(0, 2000), createdAt: DB.now() };
  db.comments.push(c);
  // 通知：项目其他成员
  const me = publicUser(user);
  db.projectMembers.forEach((mm) => {
    if (mm.projectId === t.projectId && mm.userId !== user.id) {
      notify(mm.userId, "新评论", `${me.displayName} 评论了任务「${t.title}」`, `#/tasks`);
    }
  });
  const u = DB.findUser(c.userId);
  DB.persist();
  ok(res, Object.assign({}, c, { user: u ? publicUser(u) : null }));
});
on("DELETE", "/api/comments/:id", async (req, res, _b, user, m) => {
  const c = db.comments.find((x) => x.id === m[0]);
  if (!c) return fail(res, 404, "评论不存在");
  if (c.userId !== user.id && !DB.isProjectAdmin(user, c.projectId)) return fail(res, 403, "没有权限");
  db.comments = db.comments.filter((x) => x.id !== c.id);
  DB.persist();
  ok(res, { ok: true });
});

/* ---------- 文件 ---------- */
on("GET", "/api/files", (req, res, _b, user) => {
  ok(res, DB.visibleItems(user, "files").map((f) => ({ id: f.id, projectId: f.projectId, name: f.name, size: f.size, mime: f.mime, uploadedBy: f.uploadedBy, createdAt: f.createdAt })));
});
on("POST", "/api/files", async (req, res, body, user) => {
  const { name, mime, data, projectId } = body || {};
  if (!name || !data) return fail(res, 400, "缺少文件名或内容");
  if (projectId && !DB.canWriteProject(user, projectId)) return fail(res, 403, "没有权限");
  const buf = Buffer.from(String(data), "base64");
  if (buf.length > 50 * 1024 * 1024) return fail(res, 400, "文件超过 50MB 上限");
  if (!fs.existsSync(FILE_DIR)) fs.mkdirSync(FILE_DIR, { recursive: true });
  const id = DB.uid("f_");
  fs.writeFileSync(path.join(FILE_DIR, id + ".bin"), buf);
  const f = { id, projectId: projectId || null, name: String(name).slice(0, 160), size: buf.length, mime: mime || "application/octet-stream", uploadedBy: user.id, createdAt: DB.now() };
  db.files.push(f);
  DB.persist();
  ok(res, { id: f.id, projectId: f.projectId, name: f.name, size: f.size, mime: f.mime, uploadedBy: f.uploadedBy, createdAt: f.createdAt });
});
on("DELETE", "/api/files/:id", async (req, res, _b, user, m) => {
  const f = db.files.find((x) => x.id === m[0]);
  if (!f) return fail(res, 404, "文件不存在");
  if (!DB.canWriteProject(user, f.projectId)) return fail(res, 403, "没有权限");
  db.files = db.files.filter((x) => x.id !== f.id);
  try { fs.unlinkSync(path.join(FILE_DIR, f.id + ".bin")); } catch (e) {}
  DB.persist();
  ok(res, { ok: true });
});
on("GET", "/api/files/:id/download", (req, res, _b, user, m) => {
  const f = db.files.find((x) => x.id === m[0]);
  if (!f) return fail(res, 404, "文件不存在");
  if (!DB.canReadProject(user, f.projectId)) return fail(res, 403, "没有权限");
  const fp = path.join(FILE_DIR, f.id + ".bin");
  if (!fs.existsSync(fp)) return fail(res, 404, "文件已丢失");
  res.writeHead(200, {
    "Content-Type": f.mime || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(f.name)}"`,
  });
  fs.createReadStream(fp).pipe(res);
});

/* ---------- 通知 ---------- */
on("GET", "/api/notifications", (req, res, _b, user) =>
  ok(res, db.notifications.filter((n) => n.userId === user.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100)));
on("POST", "/api/notifications/:id/read", async (req, res, _b, user, m) => {
  const n = db.notifications.find((x) => x.id === m[0] && x.userId === user.id);
  if (n) n.read = true;
  DB.persist();
  ok(res, { ok: true });
});
on("POST", "/api/notifications/read-all", async (req, res, _b, user) => {
  db.notifications.forEach((n) => { if (n.userId === user.id) n.read = true; });
  DB.persist();
  ok(res, { ok: true });
});

/* ---------- Agent（技能 / 规则 / 对话） ---------- */
const agentCfg = () => db.agentConfig || (db.agentConfig = { llm: null });

on("GET", "/api/agent/bootstrap", (req, res, _b, user) => {
  const cfg = agentCfg();
  ok(res, {
    skills: Object.keys(Agent.SKILLS).map((k) => ({ name: k, label: Agent.SKILLS[k].label, icon: Agent.SKILLS[k].icon, desc: Agent.SKILLS[k].desc, params: Agent.SKILLS[k].params })),
    rules: (db.agentRules || []).map((r) => Object.assign({}, r)),
    logs: (db.agentLogs || []).slice().reverse().slice(0, 50),
    projects: db.projects.filter((p) => DB.canReadProject(user, p.id)).map((p) => ({ id: p.id, name: p.name })),
    llm: cfg.llm ? { provider: cfg.llm.provider, baseUrl: cfg.llm.baseUrl, model: cfg.llm.model, enabled: !!cfg.llm.enabled, hasKey: !!(cfg.llm.apiKey) } : { enabled: false, hasKey: false },
    isOwner: user.role === "owner",
  });
});

on("POST", "/api/agent/run", async (req, res, body, user) => {
  const { skill, params } = body || {};
  if (!Agent.findSkill(skill)) return fail(res, 404, "技能不存在");
  try {
    const result = Agent.runSkill(user, skill, params || {});
    ok(res, Object.assign({ ok: true }, result));
  } catch (e) { fail(res, 400, e.message); }
});

/* 执行技能给出的建议动作（复用工具注册表，权限内建校验） */
on("POST", "/api/agent/action", async (req, res, body, user) => {
  const { tool, args } = body || {};
  const t = Agent.findTool(tool);
  if (!t) return fail(res, 404, "工具不存在");
  try {
    const result = t.run({ user, notify }, args || {});
    if (result && result.ok === false) return fail(res, 403, result.error || "执行失败");
    ok(res, Object.assign({ ok: true }, result));
  } catch (e) { fail(res, 400, e.message); }
});

on("POST", "/api/agent/chat", async (req, res, body, user) => {
  const text = String((body || {}).text || "").trim();
  if (!text) return fail(res, 400, "请输入内容");
  const sessionId = String((body || {}).sessionId || "").slice(0, 64);
  const requestId = String((body || {}).requestId || "").slice(0, 64);
  const cfg = (db.agentConfig && db.agentConfig.llm) || {};
  if (cfg.enabled && cfg.apiKey) {
    try {
      const llmRes = await Agent.llmChat(user, sessionId, text, requestId, notify);
      if (llmRes) return ok(res, llmRes);
    } catch (e) { /* 降级到确定性引擎 */ }
  }
  ok(res, Agent.intentChat(user, sessionId, text, requestId));
});

on("GET", "/api/agent/rules", (req, res, _b, user) => ok(res, db.agentRules || []));
on("POST", "/api/agent/rules", async (req, res, body, user) => {
  if (user.role !== "owner") return fail(res, 403, "仅管理员可配置自动化");
  const { name, cron, skill, params, enabled } = body || {};
  if (!name || !String(name).trim()) return fail(res, 400, "规则名称必填");
  if (!skill || !Agent.findSkill(skill)) return fail(res, 400, "技能无效");
  const rule = { id: DB.uid("r_"), name: String(name).trim().slice(0, 40), triggerType: "cron", cron: cron || "0 9 * * *", skill, params: params || {}, enabled: enabled !== false, lastRun: 0, lastStatus: "", lastMessage: "", createdAt: DB.now() };
  db.agentRules = db.agentRules || [];
  db.agentRules.push(rule);
  DB.persist();
  ok(res, rule);
});
on("PUT", "/api/agent/rules/:id", async (req, res, body, user, m) => {
  if (user.role !== "owner") return fail(res, 403, "仅管理员可配置自动化");
  const r = (db.agentRules || []).find((x) => x.id === m[0]);
  if (!r) return fail(res, 404, "规则不存在");
  ["name", "cron", "skill", "params"].forEach((k) => { if (body[k] !== undefined) r[k] = body[k]; });
  if (body.enabled !== undefined) r.enabled = !!body.enabled;
  DB.persist();
  ok(res, r);
});
on("DELETE", "/api/agent/rules/:id", async (req, res, _b, user, m) => {
  if (user.role !== "owner") return fail(res, 403, "仅管理员可配置自动化");
  db.agentRules = (db.agentRules || []).filter((x) => x.id !== m[0]);
  DB.persist();
  ok(res, { ok: true });
});

on("GET", "/api/agent/logs", (req, res, _b, user) => ok(res, (db.agentLogs || []).slice().reverse().slice(0, 100)));
/* 清空执行日志（仅管理员；执行统计随日志归零） */
on("DELETE", "/api/agent/logs", async (req, res, _b, user) => {
  if (user.role !== "owner") return fail(res, 403, "仅管理员可清空日志");
  ok(res, Agent.clearLogs());
});
/* 重置当前用户会话（清空对话时调用，避免残留多轮追问状态） */
on("POST", "/api/agent/session/clear", async (req, res, body, user) => {
  ok(res, Agent.clearSession(user.id, (body || {}).sessionId));
});
on("GET", "/api/agent/stats", (req, res, _b, user) => ok(res, Agent.stats()));
on("GET", "/api/agent/audit", (req, res, _b, user) => ok(res, Agent.auditReport()));
on("POST", "/api/agent/controls", async (req, res, body, user) => {
  if (user.role !== "owner") return fail(res, 403, "仅管理员可配置");
  ok(res, Agent.setControls(body || {}));
});
on("POST", "/api/agent/config", async (req, res, body, user) => {
  if (user.role !== "owner") return fail(res, 403, "仅管理员可配置");
  const cfg = agentCfg();
  const llm = body && body.llm;
  if (llm) {
    cfg.llm = {
      provider: llm.provider || cfg.llm?.provider || "deepseek",
      baseUrl: llm.baseUrl || cfg.llm?.baseUrl || "",
      model: llm.model || cfg.llm?.model || "",
      apiKey: llm.apiKey !== undefined ? llm.apiKey : (cfg.llm?.apiKey || ""),
      enabled: !!llm.enabled,
    };
  }
  DB.persist();
  ok(res, { enabled: !!(cfg.llm && cfg.llm.enabled), hasKey: !!(cfg.llm && cfg.llm.apiKey) });
});

/* ---------- CSV 导入 / 导出 ---------- */
function parseCSV(text) {
  const rows = [];
  let cur = "", row = [], inQ = false;
  const t = String(text || "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => String(x).trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => String(x).trim() !== "")) rows.push(row);
  return rows;
}
const csvEsc = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

on("POST", "/api/import-csv", async (req, res, body, user) => {
  const { csv, projectId } = body || {};
  if (!csv) return fail(res, 400, "缺少 CSV 内容");
  if (projectId && !DB.canWriteProject(user, projectId)) return fail(res, 403, "没有权限");
  const rows = parseCSV(csv);
  if (!rows.length) return fail(res, 400, "CSV 为空");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const colMap = {}; db.columns.forEach((c) => { colMap[c.name] = c.id; colMap[c.id] = c.id; });
  const priMap = { 高: "high", high: "high", 中: "mid", mid: "mid", 低: "low", low: "low" };
  const created = [], errors = [];
  rows.slice(1).forEach((r, ri) => {
    try {
      const get = (name) => { const i = idx(name); return i >= 0 ? (r[i] || "").trim() : ""; };
      const title = get("标题") || get("title");
      if (!title) { errors.push(`第 ${ri + 2} 行：缺少标题`); return; }
      const t = {
        title: title.slice(0, 200), desc: get("描述") || get("desc"),
        projectId: projectId || null,
        colId: colMap[get("状态") || get("col")] || db.columns[0].id,
        priority: priMap[get("优先级") || get("priority")] || "mid",
        dueDate: get("截止日期") || get("dueDate") || "", startDate: get("开始日期") || get("startDate") || "",
        tags: (get("标签") || get("tags") || "").split(/[;；|]/).map((x) => x.trim()).filter(Boolean),
        subtasks: [], assigneeId: null, dependencies: [], milestoneId: null,
        createdAt: DB.now(), completedAt: null, order: db.tasks.length,
      };
      const assignee = get("负责人") || get("assignee");
      if (assignee) {
        const u = DB.findUserByName(assignee) || db.users.find((x) => x.displayName === assignee);
        if (u) t.assigneeId = u.id;
      }
      const msName = get("里程碑") || get("milestone");
      if (msName && projectId) {
        const ms = db.milestones.find((x) => x.projectId === projectId && x.title === msName);
        if (ms) t.milestoneId = ms.id;
      }
      t.id = DB.uid("t_");
      db.tasks.push(t);
      created.push(t.title);
    } catch (e) { errors.push(`第 ${ri + 2} 行：${e.message}`); }
  });
  DB.persist();
  ok(res, { created: created.length, errors });
});

on("GET", "/api/tasks/export.csv", (req, res, _b, user) => {
  const tasks = DB.visibleTasks(user);
  const lines = ["标题,描述,优先级,截止日期,开始日期,状态,负责人,标签,里程碑"];
  const colName = (id) => { const c = db.columns.find((x) => x.id === id); return c ? c.name : id; };
  const priName = { high: "高", mid: "中", low: "低" };
  tasks.forEach((t) => {
    const assignee = t.assigneeId ? (DB.findUser(t.assigneeId) || {}).displayName || "" : "";
    const ms = t.milestoneId ? (db.milestones.find((x) => x.id === t.milestoneId) || {}).title || "" : "";
    lines.push([t.title, t.desc, priName[t.priority] || t.priority, t.dueDate, t.startDate, colName(t.colId), assignee, (t.tags || []).join(";"), ms].map(csvEsc).join(","));
  });
  res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="tasks.csv"' });
  res.end("\uFEFF" + lines.join("\r\n")); // BOM 便于 Excel 识别中文
});

/* ---------- 报告中心 ---------- */
on("GET", "/api/reports", (req, res, _b, user) => {
  const pids = new Set(DB.visibleProjectIds(user));
  const tasks = DB.visibleTasks(user);
  const logs = db.timeLogs.filter((l) => l.userId === user.id || (l.taskId && tasks.some((t) => t.id === l.taskId)));
  const projects = db.projects.filter((p) => pids.has(p.id));
  const doneCol = "col_done";
  const today = DB.dayStr();

  // 最近 30 天工时
  const timeByDay = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const p = (n) => String(n).padStart(2, "0");
    const ds = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    timeByDay.push({ date: ds, minutes: logs.filter((l) => l.date === ds).reduce((s, x) => s + (x.minutes || 0), 0) });
  }
  const minutesOf = (list) => list.reduce((s, x) => s + (x.minutes || 0), 0);

  ok(res, {
    timeByDay,
    timeByProject: projects.map((p) => ({ id: p.id, name: p.name, minutes: minutesOf(db.timeLogs.filter((l) => { const t = l.taskId ? db.tasks.find((x) => x.id === l.taskId) : null; return t && t.projectId === p.id; })) })),
    timeByUser: db.users.map((u) => ({ id: u.id, name: u.displayName, minutes: minutesOf(db.timeLogs.filter((l) => l.userId === u.id)) })),
    projects: projects.map((p) => {
      const ts = db.tasks.filter((t) => t.projectId === p.id);
      return { id: p.id, name: p.name, color: p.color, tasks: ts.length,
        done: ts.filter((t) => t.colId === doneCol).length,
        overdue: ts.filter((t) => t.dueDate && t.dueDate < today && t.colId !== doneCol).length,
        progress: ts.length ? Math.round(ts.filter((t) => t.colId === doneCol).length / ts.length * 100) : 0,
        minutes: minutesOf(db.timeLogs.filter((l) => { const t = l.taskId ? db.tasks.find((x) => x.id === l.taskId) : null; return t && t.projectId === p.id; })) };
    }),
    clients: db.clients.filter((c) => DB.canReadProject(user, c.projectId)).map((c) => {
      const ts = db.tasks.filter((t) => t.projectId === c.projectId);
      return { id: c.id, title: c.title, projectName: c.projectId ? (db.projects.find((p) => p.id === c.projectId) || {}).name : "个人",
        tasks: ts.length, minutes: minutesOf(db.timeLogs.filter((l) => { const t = l.taskId ? db.tasks.find((x) => x.id === l.taskId) : null; return t && t.projectId === c.projectId; })) };
    }),
    totals: { tasks: tasks.length, done: tasks.filter((t) => t.colId === doneCol).length, overdue: tasks.filter((t) => t.dueDate && t.dueDate < today && t.colId !== doneCol).length, minutes: minutesOf(logs) },
  });
});

/* ---------- 邮件通知配置 ---------- */
on("GET", "/api/mail/config", (req, res, _b, user) => {
  const c = db.mailConfig;
  ok(res, c ? { enabled: !!c.enabled, host: c.host, port: c.port, user: c.user, from: c.from, ssl: !!c.ssl, hasPass: !!(c.pass) } : { enabled: false });
});
on("POST", "/api/mail/config", async (req, res, body, user) => {
  if (user.role !== "owner") return fail(res, 403, "仅管理员可配置");
  const cur = db.mailConfig || {};
  db.mailConfig = {
    enabled: !!body.enabled,
    host: String(body.host || cur.host || "").trim(),
    port: parseInt(body.port || cur.port || (body.ssl ? 465 : 25), 10),
    user: String(body.user !== undefined ? body.user : (cur.user || "")).trim(),
    pass: body.pass ? String(body.pass) : (cur.pass || ""),
    from: String(body.from || cur.from || "no-reply@localhost").trim(),
    ssl: !!body.ssl,
  };
  DB.persist();
  ok(res, { ok: true });
});
on("POST", "/api/mail/test", async (req, res, _b, user) => {
  const cfg = db.mailConfig;
  if (!cfg || !cfg.enabled || !cfg.host) return fail(res, 400, "请先配置 SMTP");
  if (!user.email) return fail(res, 400, "请先在设置中填写你的邮箱");
  try {
    await Mail.sendMail(cfg, user.email, "【灵犀工作台】测试邮件", "这是一封测试邮件，SMTP 配置可用。");
    ok(res, { ok: true });
  } catch (e) { fail(res, 400, "发送失败：" + e.message); }
});

/* ---------- 用户管理（管理员） ---------- */
on("GET", "/api/users", (req, res, _b, user) => {
  if (user.role !== "owner") return fail(res, 403, "仅管理员可见");
  ok(res, db.users.map(publicUser));
});
on("POST", "/api/users", async (req, res, body, user) => {
  if (user.role !== "owner") return fail(res, 403, "仅管理员可创建账号");
  const { username, password, displayName, role } = body || {};
  const un = String(username || "").trim().toLowerCase();
  if (!un || !password) return fail(res, 400, "用户名和密码必填");
  if (DB.findUserByName(un)) return fail(res, 409, "用户名已存在");
  const salt = DB.makeSalt();
  const u = { id: DB.uid("u_"), username: un, passwordHash: DB.hashPassword(password, salt), salt,
    displayName: (displayName || un).trim().slice(0, 24), role: role === "owner" ? "member" : (role || "member"), createdAt: DB.now() };
  db.users.push(u);
  DB.persist();
  ok(res, publicUser(u));
});

/* ---------- 示例数据（管理员一键填充） ---------- */
on("POST", "/api/seed", async (req, res, _b, user) => {
  if (user.role !== "owner") return fail(res, 403, "仅管理员可填充示例数据");
  if (db.projects.length || db.tasks.length) return fail(res, 400, "已有数据，请先在设置中清空");
  const p = { id: DB.uid("p_"), name: "灵思Agent 平台", desc: "本地化 AI 研究助手平台，打磨核心体验与 UI 细节。", color: "#4f6bff", status: "active", ownerId: user.id, createdAt: DB.now() };
  db.projects.push(p);
  db.projectMembers.push({ projectId: p.id, userId: user.id, role: "owner" });
  const mk = (title, desc, colId, priority, dueDate, startDate, tags, assigneeId) => ({
    id: DB.uid("t_"), title, desc, projectId: p.id, colId, priority, dueDate, startDate,
    tags, subtasks: [], assigneeId: assigneeId || null, createdAt: DB.now(), completedAt: null, order: db.tasks.length,
  });
  db.tasks.push(
    mk("优化看板拖拽体验", "为看板卡片增加平滑的拖拽过渡动画。", "col_doing", "high", DB.dayStr(), DB.dayStr(), ["前端", "UI"]),
    mk("完成产品周报", "汇总本周进展与下周计划。", "col_todo", "mid", DB.dayStr(), "", ["汇报"]),
    mk("评审新版 UI 方案", "对齐字节跳动风格的视觉与动效细节。", "col_todo", "high", DB.dayStr(), "", ["UI", "评审"]),
    mk("整理知识库文档目录", "为笔记建立清晰的分类体系。", "col_done", "mid", DB.dayStr(), "", ["知识库"]),
  );
  db.goals.push({ id: DB.uid("g_"), title: "打造体验一流的协作工作台", desc: "让每个功能都有清晰的入口与流畅的交互。", color: "#4f6bff", dueDate: "", krs: [
    { id: DB.uid("k_"), title: "完成核心模块开发", value: 70 }, { id: DB.uid("k_"), title: "多轮 UI 打磨", value: 40 },
  ], userId: user.id, createdAt: DB.now(), updatedAt: DB.now() });
  db.notes.push({ id: DB.uid("n_"), title: "设计原则", content: "## 设计原则\n\n- **克制的动效**：所有动画不超过 0.3s\n- **信息密度适中**：一屏之内呈现最重要的信息\n- **随时可继续**：关闭页面后重新打开，一切都在原地\n\n> 好的工具让人忘记工具本身。", category: "产品", pinned: true, userId: user.id, createdAt: DB.now(), updatedAt: DB.now() });
  db.milestones.push({ id: DB.uid("ms_"), projectId: p.id, title: "v1.0 里程碑", desc: "核心功能稳定可用", startDate: DB.dayStr(), endDate: "", color: "#8b5cf6", createdAt: DB.now() });
  DB.persist();
  ok(res, { ok: true });
});

/* ================= 请求分发 ================= */
function handleApi(req, res, user) {
  const url = new URL(req.url, "http://x");
  const pathname = url.pathname;
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.rx);
    if (!m) continue;
    const params = m.slice(1);
    // 仅登录/注册接口免预认证，其余全部需要 token
    const needAuth = !pathname.startsWith("/api/auth/login") && !pathname.startsWith("/api/auth/register");
    const u = needAuth ? auth(req, res) : user;
    if (needAuth && !u) return;
    if (req.method === "GET" || req.method === "DELETE") {
      return r.handler(req, res, null, u, params);
    }
    return readBody(req).then((buf) => {
      let body = {};
      try { body = buf.length ? JSON.parse(buf.toString("utf8")) : {}; } catch (e) { return fail(res, 400, "JSON 解析失败"); }
      return r.handler(req, res, body, u, params);
    }).catch((e) => fail(res, 400, e.message));
  }
  fail(res, 404, "接口不存在: " + req.method + " " + pathname);
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://x");
  let p = url.pathname;
  if (p === "/") p = "/index.html";
  const fp = path.normalize(path.join(ROOT, p));
  if (!fp.startsWith(ROOT)) return fail(res, 403, "禁止访问");
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("404 Not Found"); return; }
  const ext = path.extname(fp).toLowerCase();
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(fp).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    const u = null;
    // 登录/注册接口不需要预认证；其余在 handleApi 内认证
    return handleApi(req, res, u);
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  Agent.startScheduler();
  console.log("==============================================");
  console.log("  灵犀工作台 · 服务已启动");
  console.log(`  本机访问  →  http://localhost:${PORT}`);
  console.log(`  局域网访问 →  http://<本机IP>:${PORT}`);
  console.log("  首次使用：注册第一个账号将自动成为管理员");
  console.log("  Agent 调度器：已启动");
  console.log("==============================================");
});
