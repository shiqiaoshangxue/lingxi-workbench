/* ============================================================
   灵犀工作台 · 核心层：工具函数 / API 客户端 / 数据模型 / 路由 / 统计
   架构：前后端一体（服务端为真源，内存 state 为渲染源，localStorage 仅存令牌）
   ============================================================ */
"use strict";

/* ---------- 通用工具 ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const escapeHtml = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const pad2 = (n) => String(n).padStart(2, "0");

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const dateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const parseDate = (s) => (s ? new Date(s + "T00:00:00") : null);

/* 友好日期：今天 / 明天 / 昨天 / 8月21日 周五 */
const fmtDate = (s) => {
  if (!s) return "";
  const d = parseDate(s);
  if (!d || isNaN(d)) return s;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const diff = Math.round((d - now) / 86400000);
  const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === -1) return "昨天";
  const mm = d.getMonth() + 1;
  if (d.getFullYear() === now.getFullYear()) return `${mm}月${d.getDate()}日 周${week}`;
  return `${d.getFullYear()}年${mm}月${d.getDate()}日`;
};

const daysUntil = (s) => {
  if (!s) return null;
  const d = parseDate(s);
  if (!d || isNaN(d)) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
};

/* 分钟 -> 中文时长 */
const fmtDur = (min) => {
  min = Math.max(0, Math.round(min));
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
};

const fmtDurShort = (min) => {
  min = Math.max(0, Math.round(min));
  if (min < 60) return `${min}分`;
  return `${Math.floor(min / 60)}h${min % 60 ? " " + (min % 60) + "m" : ""}`;
};

const fmtSize = (bytes) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
};

const debounce = (fn, ms = 200) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- 常量 ---------- */
const PRIORITY = {
  high: { label: "高", cls: "pri-high", icon: "flag" },
  mid: { label: "中", cls: "pri-mid", icon: "flag" },
  low: { label: "低", cls: "pri-low", icon: "flag" },
};

const PROJ_COLORS = ["#4f6bff", "#8b5cf6", "#0ea5a4", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#6366f1", "#14b8a6", "#f97316"];
const NOTE_COLORS = ["#4f6bff", "#8b5cf6", "#0ea5a4", "#f59e0b", "#10b981", "#ec4899"];
const CANVAS_TYPES = {
  swot: { label: "SWOT 分析", cells: { s: "优势", w: "劣势", o: "机会", t: "威胁" } },
  lean: { label: "精益画布", cells: { p1: "问题", p2: "客户群体", p3: "独特卖点", p4: "解决方案", p5: "渠道", p6: "收入来源", p7: "成本结构", p8: "关键指标", p9: "门槛优势" } },
  bmc: { label: "商业模式画布", cells: { p1: "关键伙伴", p2: "关键活动", p3: "关键资源", p4: "价值主张", p5: "客户关系", p6: "渠道", p7: "客户细分", p8: "成本结构", p9: "收入来源" } },
  value_prop: { label: "价值主张画布", cells: { p1: "客户任务", p2: "客户痛点", p3: "客户收益", p4: "产品与服务", p5: "止痛剂", p6: "收益创造者" } },
  customer_journey: { label: "客户旅程地图", cells: { p1: "阶段", p2: "触点", p3: "用户目标", p4: "情绪", p5: "痛点", p6: "机会点" } },
  empathy: { label: "移情图", cells: { p1: "所见", p2: "所听", p3: "所想", p4: "所感", p5: "所说所做", p6: "痛点", p7: "收益" } },
  lean_startup: { label: "精益创业画布", cells: { p1: "问题", p2: "解决方案", p3: "关键指标", p4: "独特价值主张", p5: "不公平优势", p6: "渠道", p7: "客户群体", p8: "成本结构", p9: "收入来源" } },
};

/* ---------- API 客户端 ---------- */
const API = (() => {
  const TOKEN_KEY = "lingxi-token";
  let token = localStorage.getItem(TOKEN_KEY) || null;

  async function request(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error) || `请求失败(${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }
  const get = (p) => request("GET", p);
  const post = (p, b) => request("POST", p, b || {});
  const put = (p, b) => request("PUT", p, b || {});
  const del = (p) => request("DELETE", p);

  return {
    get token() { return token; },
    setToken(t) { token = t; if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); },
    clearToken() { token = null; localStorage.removeItem(TOKEN_KEY); },
    request, get, post, put, del,
  };
})();

/* ---------- 数据模型（内存真源 + 服务端同步） ---------- */
const emptyState = () => ({
  user: null, isAdmin: false,
  columns: [{ id: "col_todo", name: "待办", color: "#9aa0b0", order: 0 }],
  projects: [], tasks: [], timeLogs: [], goals: [], notes: [],
  clients: [], ideas: [], canvas: [], milestones: [], events: [],
  comments: [], files: [], retros: [], notifications: [], members: [], allUsers: [],
});

const DB = (() => {
  const state = emptyState();

  async function bootstrap() {
    const data = await API.get("/api/bootstrap");
    Object.assign(state, emptyState());
    Object.keys(data).forEach((k) => { if (k in state) state[k] = data[k]; });
    return state;
  }

  /* ---- 实体同步助手：更新内存 ---- */
  const upsert = (col, item) => {
    const arr = state[col];
    const i = arr.findIndex((x) => x.id === item.id);
    if (i >= 0) arr[i] = item; else arr.push(item);
  };
  const remove = (col, id) => { state[col] = state[col].filter((x) => x.id !== id); };

  /* ---- 项目 ---- */
  const createProject = async (body) => { const d = await API.post("/api/projects", body); state.projects.push(d); return d; };
  const updateProject = async (id, body) => { const d = await API.put(`/api/projects/${id}`, body); upsert("projects", d); return d; };
  const deleteProject = async (id) => {
    await API.del(`/api/projects/${id}`);
    state.projects = state.projects.filter((x) => x.id !== id);
    ["tasks", "timeLogs", "comments", "files", "ideas", "milestones", "events", "canvas"].forEach((c) => {
      state[c] = state[c].filter((x) => x.projectId !== id);
    });
    state.members = state.members.filter((m) => m.projectId !== id);
  };
  const addMember = async (projectId, userId, role) => { await API.post(`/api/projects/${projectId}/members`, { userId, role }); };
  const removeMember = async (projectId, userId) => { await API.del(`/api/projects/${projectId}/members/${userId}`); };

  /* ---- 看板列 ---- */
  const createColumn = async (body) => { const d = await API.post("/api/columns", body); state.columns = d; return d; };
  const updateColumn = async (id, body) => { const d = await API.put(`/api/columns/${id}`, body); state.columns = d; return d; };
  const deleteColumn = async (id) => { const d = await API.del(`/api/columns/${id}`); state.columns = d; return d; };

  /* ---- 任务 ---- */
  const createTask = async (body) => { const d = await API.post("/api/tasks", body); state.tasks.push(d); return d; };
  const updateTask = async (id, body) => { const d = await API.put(`/api/tasks/${id}`, body); upsert("tasks", d); return d; };
  const deleteTask = async (id) => {
    await API.del(`/api/tasks/${id}`);
    remove("tasks", id);
    state.timeLogs = state.timeLogs.filter((l) => l.taskId !== id);
    state.comments = state.comments.filter((c) => c.taskId !== id);
  };

  /* ---- 时间日志 ---- */
  const createTimeLog = async (body) => { const d = await API.post("/api/timeLogs", body); state.timeLogs.push(d); return d; };
  const deleteTimeLog = async (id) => { await API.del(`/api/timeLogs/${id}`); remove("timeLogs", id); };

  /* ---- 目标 / 笔记 ---- */
  const createGoal = async (b) => { const d = await API.post("/api/goals", b); state.goals.push(d); return d; };
  const updateGoal = async (id, b) => { const d = await API.put(`/api/goals/${id}`, b); upsert("goals", d); return d; };
  const deleteGoal = async (id) => { await API.del(`/api/goals/${id}`); remove("goals", id); };
  const createNote = async (b) => { const d = await API.post("/api/notes", b); state.notes.push(d); return d; };
  const updateNote = async (id, b) => { const d = await API.put(`/api/notes/${id}`, b); upsert("notes", d); return d; };
  const deleteNote = async (id) => { await API.del(`/api/notes/${id}`); remove("notes", id); };

  /* ---- 项目资源（客户/想法/画布/里程碑/事件/回顾） ---- */
  const makeProjectResource = (col, createPath) => ({
    create: async (b) => { const d = await API.post(createPath || "/api/" + col, b); state[col].push(d); return d; },
    update: async (id, b) => { const d = await API.put(`/api/${col}/${id}`, b); upsert(col, d); return d; },
    remove: async (id) => {
      await API.del(`/api/${col}/${id}`);
      remove(col, id);
      if (col === "milestones") state.tasks.forEach((t) => { if (t.milestoneId === id) t.milestoneId = null; });
    },
  });
  const clients = makeProjectResource("clients");
  const ideas = makeProjectResource("ideas");
  const canvas = makeProjectResource("canvas");
  const milestones = makeProjectResource("milestones");
  const events = makeProjectResource("events");
  const voteIdea = async (id) => {
    const d = await API.post(`/api/ideas/${id}/vote`);
    const it = state.ideas.find((x) => x.id === id);
    if (it) it.votes = d.votes;
    return d;
  };

  /* ---- 评论 ---- */
  const createComment = async (taskId, content) => {
    const d = await API.post(`/api/tasks/${taskId}/comments`, { content });
    state.comments.push(d);
    return d;
  };
  const deleteComment = async (id) => { await API.del(`/api/comments/${id}`); remove("comments", id); };

  /* ---- 文件 ---- */
  const uploadFile = async (b) => { const d = await API.post("/api/files", b); state.files.push(d); return d; };
  const deleteFile = async (id) => { await API.del(`/api/files/${id}`); remove("files", id); };

  /* ---- 通知 ---- */
  const readNotifications = async () => { await API.post("/api/notifications/read-all"); state.notifications.forEach((n) => (n.read = true)); };
  const markRead = async (id) => { await API.post(`/api/notifications/${id}/read`); const n = state.notifications.find((x) => x.id === id); if (n) n.read = true; };

  /* ---- 回顾（项目内资源） ---- */
  const retros = makeProjectResource("retros");

  /* ---- CSV / 报告 / 邮件 ---- */
  const importCsv = async (csv, projectId) => API.post("/api/import-csv", { csv, projectId });
  const exportCsv = async () => {
    const res = await API.get("/api/tasks/export.csv");
    // API.get 会尝试 JSON.parse；这里返回原始 blob
    const r = await fetch("/api/tasks/export.csv", { headers: { Authorization: "Bearer " + API.token } });
    return await r.text();
  };
  const reports = () => API.get("/api/reports");
  const getMailConfig = () => API.get("/api/mail/config");
  const saveMailConfig = (cfg) => API.post("/api/mail/config", { llm: undefined, ...cfg });
  const testMail = () => API.post("/api/mail/test");

  return {
    state,
    bootstrap,
    createProject, updateProject, deleteProject, addMember, removeMember,
    createColumn, updateColumn, deleteColumn,
    createTask, updateTask, deleteTask,
    createTimeLog, deleteTimeLog,
    createGoal, updateGoal, deleteGoal,
    createNote, updateNote, deleteNote,
    clients, ideas, canvas, milestones, events, retros, voteIdea,
    createComment, deleteComment,
    uploadFile, deleteFile,
    readNotifications, markRead,
    importCsv, exportCsv, reports, getMailConfig, saveMailConfig, testMail,
  };
})();

/* ---------- 统计辅助 ---------- */
const Stats = {
  taskTime(task) {
    return DB.state.timeLogs.filter((l) => l.taskId === task.id).reduce((s, l) => s + (l.minutes || 0), 0);
  },
  doneTasks() { return DB.state.tasks.filter((t) => t.colId === "col_done"); },
  todayTasks() {
    const t = todayStr();
    return DB.state.tasks.filter((x) => x.dueDate === t && x.colId !== "col_done");
  },
  overdueTasks() {
    const t = todayStr();
    return DB.state.tasks.filter((x) => x.dueDate && x.dueDate < t && x.colId !== "col_done");
  },
  projectProgress(pid) {
    const tasks = DB.state.tasks.filter((t) => t.projectId === pid);
    if (!tasks.length) return 0;
    return Math.round((tasks.filter((t) => t.colId === "col_done").length / tasks.length) * 100);
  },
  goalProgress(goal) {
    if (!goal.krs || !goal.krs.length) return 0;
    return Math.round(goal.krs.reduce((s, k) => s + (k.value || 0), 0) / goal.krs.length);
  },
  timeOn(date) {
    return DB.state.timeLogs.filter((l) => l.date === date).reduce((s, l) => s + (l.minutes || 0), 0);
  },
  weekTime(offset = 0) {
    const arr = [];
    const base = new Date();
    base.setDate(base.getDate() + offset);
    for (let i = 6; i >= 0; i--) {
      const t = new Date(base); t.setDate(t.getDate() - i);
      const ds = dateStr(t);
      arr.push({ date: ds, label: `${t.getMonth() + 1}/${t.getDate()}`, minutes: this.timeOn(ds) });
    }
    return arr;
  },
  totalTime() {
    return DB.state.timeLogs.reduce((s, l) => s + (l.minutes || 0), 0);
  },
};

/* ---------- 简易 Markdown 渲染 ---------- */
const mdRender = (src) => {
  if (!src) return "";
  let s = String(src);
  s = escapeHtml(s);
  s = s.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre><code>${code.trim()}</code></pre>`);
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/^###### (.*)$/gm, "<h6>$1</h6>")
       .replace(/^##### (.*)$/gm, "<h5>$1</h5>")
       .replace(/^#### (.*)$/gm, "<h4>$1</h4>")
       .replace(/^### (.*)$/gm, "<h3>$1</h3>")
       .replace(/^## (.*)$/gm, "<h2>$1</h2>")
       .replace(/^# (.*)$/gm, "<h1>$1</h1>");
  s = s.replace(/^&gt; (.*)$/gm, "<blockquote>$1</blockquote>");
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/^[-*] (.*)$/gm, "<li>$1</li>");
  s = s.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>");
  s = s.replace(/^\d+\. (.*)$/gm, "<li>$1</li>");
  s = s.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>");
  s = s.replace(/^---$/gm, "<hr>");
  s = s.split("\n").map((line) => {
    if (/^\s*<(h[1-6]|ul|ol|pre|blockquote|hr)/.test(line)) return line;
    if (line.trim() === "") return "";
    return `<p>${line}</p>`;
  }).join("\n");
  return s;
};

const mdPreview = (src, len = 90) => {
  if (!src) return "";
  let s = String(src)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`\-\[\]()!]/g, "")
    .replace(/\s+/g, " ");
  return s.length > len ? s.slice(0, len) + "…" : s;
};

/* ---------- 路由 ---------- */
const Router = {
  parse() {
    const h = location.hash.replace(/^#\/?/, "");
    const [path, param] = h.split("/");
    return { view: path || "dashboard", param: param ? decodeURIComponent(param) : null };
  },
  go(view, param) {
    location.hash = param ? `#/${view}/${encodeURIComponent(param)}` : `#/${view}`;
  },
  current: null,
};

window.App = { DB, Stats, Router, API, mdRender, mdPreview, fmtDate, fmtDur, fmtDurShort, fmtSize,
  todayStr, daysUntil, uid, escapeHtml, dateStr, PROJ_COLORS, NOTE_COLORS, CANVAS_TYPES, PRIORITY, ICONS, debounce, clamp };
