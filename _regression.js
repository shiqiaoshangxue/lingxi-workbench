/* ============================================================
   灵犀工作台 · 端到端回归测试（前后端一体）
   启动真实服务器 → 注册/登录/seed → 前端 vm 环境 → 全视图渲染 + API 链路
   运行：node _regression.js
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawn } = require("child_process");

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const dir = __dirname;
const node = process.execPath;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL: " + name); }
}

const srv = spawn(node, ["server.js"], { cwd: path.join(dir, "server"), env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "inherit"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const api = async (method, p, body, token) => {
  const res = await fetch(BASE + p, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  return { status: res.status, data };
};

/* ---------- vm 前端环境 ---------- */
function makeFrontCtx(token) {
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, Math, Date, JSON, prompt: () => null,
    location: { hash: "", search: "" }, URLSearchParams, FileReader: class { },
    localStorage: (() => { const d = {}; return { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: (k) => { delete d[k]; } }; })(),
    fetch: (url, opts) => {
      const p = String(url).startsWith("http") ? new URL(url).pathname + new URL(url).search : String(url);
      return fetch(BASE + p, opts);
    },
    URL: globalThis.URL, Blob: globalThis.Blob,
  };
  ctx.window = ctx;
  ctx.window.addEventListener = () => {};
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  if (token) ctx.localStorage.setItem("lingxi-token", token);
  ["js/icons.js", "js/core.js", "js/ui.js", "js/views-modal.js", "js/views.js", "js/views-extra.js", "js/agent-chat.js", "js/views-agent.js", "js/app.js"].forEach((f) =>
    vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f }));

  // DOM stub（足够支撑 render/bind 不抛错）
  const dummyEl = () => ({
    _html: "", dataset: {}, style: {}, scrollTop: 0, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    querySelector: () => dummyEl(), querySelectorAll: () => [], addEventListener: () => {}, removeEventListener: () => {},
    appendChild: () => {}, remove: () => {}, focus: () => {}, blur: () => {}, closest: () => null, click: () => {},
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    set textContent(v) { this._txt = v; }, get textContent() { return this._txt; },
  });
  ctx.document = {
    documentElement: { dataset: {} },
    getElementById: () => dummyEl(), querySelector: () => dummyEl(), querySelectorAll: () => [],
    createElement: () => dummyEl(), body: dummyEl(), addEventListener: () => {},
  };
  return { ctx, dummyEl };
}

(async () => {
  // 等待服务器就绪
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(BASE + "/"); if (r.status === 200) break; } catch (e) {}
    await wait(300);
  }

  console.log("== 认证与数据准备 ==");
  const reg = await api("POST", "/api/auth/register", { username: "tester", password: "pass1234", displayName: "测试员" });
  ok(reg.status === 200 && reg.data.user.role === "owner", "注册成功且为首位管理员");
  const token = reg.data.token;
  const seed = await api("POST", "/api/seed", null, token);
  ok(seed.status === 200, "填充示例数据成功");

  console.log("== 前端 API 层链路 ==");
  const f1 = makeFrontCtx(token);
  const App = f1.ctx.App;
  await App.DB.bootstrap();
  ok(App.DB.state.projects.length >= 1 && App.DB.state.tasks.length >= 4, "bootstrap 拉取数据完整");
  ok(App.DB.state.user.role === "owner", "当前用户信息正确");

  // 创建任务（前端 API → 后端 → 内存）
  const t = await App.DB.createTask({ title: "端到端测试任务", projectId: App.DB.state.projects[0].id, priority: "high" });
  ok(App.DB.state.tasks.some((x) => x.id === t.id), "createTask 同步到内存");
  const t2 = await App.DB.updateTask(t.id, { colId: "col_done" });
  ok(t2.completedAt, "updateTask 完成状态由服务端写入");
  const cm = await App.DB.createComment(t.id, "这是端到端评论");
  ok(App.DB.state.comments.some((c) => c.id === cm.id), "createComment 成功");

  // 多用户视角：第二用户能看到项目任务（协同数据可见）
  const reg2 = await api("POST", "/api/auth/register", { username: "buddy", password: "pass1234", displayName: "伙伴" });
  await api("POST", `/api/projects/${App.DB.state.projects[0].id}/members`, { userId: reg2.data.user.id, role: "editor" }, token);
  const f2 = makeFrontCtx(reg2.data.token);
  await f2.ctx.App.DB.bootstrap();
  ok(f2.ctx.App.DB.state.tasks.some((x) => x.id === t.id), "协作者能看到项目任务（多用户可见）");
  ok(f2.ctx.App.DB.state.notifications.some((n) => n.title === "新项目邀请"), "协作者收到邀请通知");

  console.log("== 全视图渲染 ==");
  const viewNames = ["dashboard", "projects", "tasks", "kanban", "timetrack", "goals", "notes", "settings",
    "gantt", "calendar", "clients", "ideas", "canvas", "milestones", "files", "notifications"];
  const Views = vm.runInContext("Views", f1.ctx);
  viewNames.forEach((name) => {
    try {
      const html = Views[name].view.render(null);
      ok(html && html.length > 100, `${name} 视图渲染成功 (${html.length} 字符)`);
      Views[name].view.bind(f1.dummyEl(html), null);
    } catch (e) { ok(false, `${name} 视图渲染失败: ${e.message}`); }
  });

  console.log("== 新功能 API 链路 ==");
  const idea = await App.DB.ideas.create({ title: "加个番茄钟", projectId: App.DB.state.projects[0].id });
  await App.DB.voteIdea(idea.id);
  ok((App.DB.state.ideas.find((x) => x.id === idea.id).votes || []).length === 1, "想法投票生效");
  const cv = await App.DB.canvas.create({ projectId: App.DB.state.projects[0].id, type: "swot", cells: { s: "优势", w: "劣势" } });
  ok(App.DB.state.canvas.some((x) => x.id === cv.id), "画布创建成功");
  const cv2 = await App.DB.canvas.create({ projectId: App.DB.state.projects[0].id, type: "bmc", cells: { p1: "关键伙伴" } });
  ok(App.DB.state.canvas.some((x) => x.id === cv2.id && x.type === "bmc"), "7 种画布类型（bmc）创建成功且类型保留");
  const cv3 = await App.DB.canvas.create({ projectId: App.DB.state.projects[0].id, type: "empathy", cells: {} });
  ok(App.DB.state.canvas.some((x) => x.id === cv3.id && x.type === "empathy"), "7 种画布类型（empathy）创建成功且类型保留");
  const cvUp = await App.DB.canvas.update(cv.id, { cells: { s: "优势v2", w: "劣势", o: "机会" } });
  ok(cvUp.cells && cvUp.cells.s === "优势v2", "画布更新（PUT /api/canvas/:id）成功");
  await App.DB.canvas.remove(cv2.id);
  ok(!App.DB.state.canvas.some((x) => x.id === cv2.id), "画布删除（DELETE /api/canvas/:id）成功");
  const ms = await App.DB.milestones.create({ title: "v2.0", projectId: App.DB.state.projects[0].id, startDate: "2026-08-01", endDate: "2026-09-01" });
  ok(App.DB.state.milestones.some((x) => x.id === ms.id), "里程碑创建成功");
  const ev = await App.DB.events.create({ title: "评审会", date: "2026-08-28", projectId: App.DB.state.projects[0].id });
  ok(App.DB.state.events.some((x) => x.id === ev.id), "日历事件创建成功");
  const cl = await App.DB.clients.create({ title: "示例客户", projectId: App.DB.state.projects[0].id });
  ok(App.DB.state.clients.some((x) => x.id === cl.id), "客户创建成功");
  const up = await App.DB.uploadFile({ name: "doc.txt", mime: "text/plain", data: Buffer.from("hello").toString("base64"), projectId: App.DB.state.projects[0].id });
  ok(App.DB.state.files.some((x) => x.id === up.id), "文件上传成功");

  console.log("== 权限隔离 ==");
  const f3 = makeFrontCtx(reg2.data.token);
  const App3 = f3.ctx.App;
  await App3.DB.bootstrap();
  const privBefore = App3.DB.state.goals.length;
  await App3.DB.createGoal({ title: "伙伴的个人目标" });
  await App.DB.bootstrap(); // 刷新测试员视角
  ok(!App.DB.state.goals.some((g) => g.title === "伙伴的个人目标"), "个人目标数据隔离（A 看不到 B 的）");

  console.log("== Agent 引擎 ==");
  const ag = await api("GET", "/api/agent/bootstrap", null, token);
  ok(ag.status === 200 && ag.data.skills.length >= 5, "Agent 技能库加载（5+ 技能）");
  ok(ag.data.isOwner === true, "管理员可配置 Agent");

  const wr = await api("POST", "/api/agent/run", { skill: "weekly_report", params: {} }, token);
  ok(wr.status === 200 && wr.data.text.includes("本周周报"), "周报生成技能执行成功");
  const od = await api("POST", "/api/agent/run", { skill: "scan_overdue", params: { notify: true } }, token);
  ok(od.status === 200 && od.data.text.includes("逾期"), "逾期扫描技能执行成功");
  const ts = await api("POST", "/api/agent/run", { skill: "todo_summary", params: {} }, token);
  ok(ts.status === 200 && ts.data.text.includes("今日摘要"), "今日摘要技能执行成功");
  const gs = await api("POST", "/api/agent/run", { skill: "goal_alerts", params: {} }, token);
  ok(gs.status === 200, "目标预警技能执行成功");
  const ps = await api("POST", "/api/agent/run", { skill: "project_snapshot", params: {} }, token);
  ok(ps.status === 200 && ps.data.text.includes("项目状态快照"), "项目快照技能执行成功");
  const badSkill = await api("POST", "/api/agent/run", { skill: "not_exist", params: {} }, token);
  ok(badSkill.status === 404, "不存在的技能被拒绝");

  // cron 匹配单元测试
  const Agent = require("./server/agent");
  const tNow = new Date(2026, 7, 21, 9, 0, 0); // 2026-08-21 09:00 周五
  ok(Agent.cronMatch("0 9 * * *", tNow), "cron 每天 9:00 匹配");
  ok(Agent.cronMatch("0 9 * * 5", tNow), "cron 周五匹配");
  ok(!Agent.cronMatch("30 9 * * *", tNow), "cron 9:30 不匹配 9:00");
  ok(!Agent.cronMatch("0 9 * * 1", tNow), "cron 周一不匹配周五");

  // 规则 CRUD
  const r1 = await api("POST", "/api/agent/rules", { name: "每日摘要", cron: "0 9 * * *", skill: "todo_summary", params: {} }, token);
  ok(r1.status === 200 && r1.data.id, "创建自动化规则成功");
  const r2 = await api("PUT", `/api/agent/rules/${r1.data.id}`, { enabled: false }, token);
  ok(r2.status === 200 && r2.data.enabled === false, "规则停用成功");
  const r3 = await api("DELETE", `/api/agent/rules/${r1.data.id}`, null, token);
  ok(r3.status === 200, "规则删除成功");

  // 非管理员不能建规则
  const regNoOwner = await api("POST", "/api/auth/register", { username: "viewer2", password: "pass1234" });
  const denyRule = await api("POST", "/api/agent/rules", { name: "x", cron: "* * * * *", skill: "todo_summary" }, regNoOwner.data.token);
  ok(denyRule.status === 403, "非管理员不能创建规则(403)");

  // 聊天 FAQ
  const chat = await api("POST", "/api/agent/chat", { text: "怎么邀请朋友？" }, token);
  ok(chat.status === 200 && chat.data.reply.includes("协作"), "FAQ 问答命中协作话题");

  // Agent 视图渲染
  await f1.ctx.App.DB.bootstrap();
  {
    const ctxA = f1.ctx;
    const loaded = await vm.runInContext("window.agentView", ctxA).load();
    ok(loaded === true, "Agent 视图数据加载成功");
    const html = vm.runInContext("window.agentView.render()", ctxA);
    ok(html.includes("技能库") && html.includes("自动化规则") && html.includes("LLM 配置"), "Agent 视图渲染成功");
    ctxA.__stub = f1.dummyEl(html);
    vm.runInContext("window.agentView.bind.call(window.agentView, window.__stub)", ctxA);
    ok(true, "Agent 视图 bind 无异常");
  }

  console.log("== 悬浮窗与共享会话（AgentChat 引擎） ==");
  {
    const ctxF = f1.ctx;
    // AgentChat 全局对象与共享会话
    const ac = vm.runInContext("window.AgentChat", ctxF);
    ok(!!ac && typeof ac.sendChat === "function" && typeof ac.attach === "function", "AgentChat 全局引擎可用");
    ok(!!ac.chatSessionId && ac.chatSessionId.startsWith("s_"), "会话 sessionId 已生成并共享");
    // 视图容器与悬浮窗容器同时挂载 → pushMsg 双端同步
    const listA = f1.dummyEl("");
    const listB = f1.dummyEl("");
    ac.attach(listA, null);
    ac.attach(listB, null);
    ac.pushMsg("user", "测试共享消息");
    ok(listA.innerHTML.includes("测试共享消息") && listB.innerHTML.includes("测试共享消息"), "悬浮窗与视图容器共享同一消息流（双端同步）");
    ok(ac.messages.some((m) => m.html.includes("测试共享消息")), "消息写入共享数组（视图/悬浮窗历史互通）");
    // sendChat 走真实后端意图链路，结果进共享流
    await vm.runInContext("window.AgentChat.sendChat('扫描逾期任务')", ctxF);
    ok(ac.messages.some((m) => m.role === "ai" && m.html.includes("逾期")), "悬浮窗 sendChat 直达后端意图路由并回显");
    // 视图侧快捷提问复用同一引擎（连通性验证）
    const before = ac.messages.length;
    await vm.runInContext("window.AgentChat.handleQuick('生成周报')", ctxF);
    ok(ac.messages.length > before && ac.messages.some((m) => m.html.includes("周报")), "快捷提问与视图技能按钮走同一 AgentChat 引擎");
    // 清空对话：共享消息流 + 所有容器回到空态
    ac.clearMessages();
    ok(ac.messages.length === 0 && !listA.innerHTML.includes("测试共享消息") && !listB.innerHTML.includes("测试共享消息"), "清空对话：共享消息流与双端容器同步清空");
  }

  console.log("== 记录清除（清空会话 / 清空日志） ==");
  {
    // 清空会话：后端多轮追问状态重置接口
    const sc = await api("POST", "/api/agent/session/clear", { sessionId: "s_test_clear" }, token);
    ok(sc.status === 200 && sc.data.ok === true, "清空会话接口可用（重置多轮追问状态）");
    // 制造日志 → 管理员清空 → 日志与统计归零
    await api("POST", "/api/agent/run", { skill: "scan_overdue", params: {} }, token);
    const logsBefore = await api("GET", "/api/agent/logs", null, token);
    ok(logsBefore.data.length >= 1, "执行日志已产生");
    const cl = await api("DELETE", "/api/agent/logs", null, token);
    ok(cl.status === 200 && cl.data.ok === true, "清空日志（管理员）成功");
    const logsAfter = await api("GET", "/api/agent/logs", null, token);
    ok(logsAfter.data.length === 0, "清空后日志为空");
    const statsAfter = await api("GET", "/api/agent/stats", null, token);
    ok(statsAfter.data.today === 0, "执行统计随日志归零");
    // 权限：非 owner 清空日志被拒
    const reg2 = await api("POST", "/api/auth/register", { username: "member1", password: "pass1234" }, null);
    const cl2 = await api("DELETE", "/api/agent/logs", null, reg2.data.token);
    ok(cl2.status === 403, "非管理员清空日志被拒绝（403）");
  }

  console.log("== 深化功能（依赖/里程碑/CSV/报告/回顾/邮件） ==");
  const S = App.DB.state;
  // 任务依赖
  const ta = await App.DB.createTask({ title: "任务 A（前置）", projectId: S.projects[0].id });
  const tb = await App.DB.createTask({ title: "任务 B（依赖 A）", projectId: S.projects[0].id, dependencies: [ta.id] });
  ok((tb.dependencies || []).includes(ta.id), "任务依赖保存成功");
  const tb2 = await App.DB.updateTask(tb.id, { dependencies: [] });
  ok(tb2.dependencies.length === 0, "依赖可清空");
  // 里程碑归属
  const msid = S.milestones[0].id;
  const tc = await App.DB.createTask({ title: "里程碑任务", projectId: S.projects[0].id, milestoneId: msid });
  ok(tc.milestoneId === msid, "任务归属里程碑成功");
  await App.DB.milestones.remove(msid);
  ok(!App.DB.state.tasks.some((t) => t.milestoneId === msid), "删除里程碑后任务 milestoneId 被清理");

  // CSV 导入导出
  const csvText = "标题,描述,优先级,截止日期,状态,负责人\nCSV导入任务A,来自CSV,高,2026-09-01,待办,\nCSV导入任务B,来自CSV,中,,进行中,";
  const imp = await api("POST", "/api/import-csv", { csv: csvText, projectId: S.projects[0].id }, token);
  ok(imp.status === 200 && imp.data.created === 2, "CSV 导入创建 2 个任务");
  await App.DB.bootstrap();
  ok(App.DB.state.tasks.some((t) => t.title === "CSV导入任务A"), "导入任务进入内存");
  const exp = await api("GET", "/api/tasks/export.csv", null, token);
  ok(exp.status === 200 && exp.data.includes("标题") && exp.data.includes("CSV导入任务A"), "CSV 导出包含数据");

  // 报告
  const rep = await api("GET", "/api/reports", null, token);
  ok(rep.status === 200 && Array.isArray(rep.data.timeByDay) && rep.data.timeByDay.length === 30, "报告：30 天工时数据");
  ok(Array.isArray(rep.data.projects) && rep.data.totals.tasks > 0, "报告：项目与统计汇总");

  // 回顾
  const rt = await App.DB.retros.create({ title: "v1 复盘", projectId: S.projects[0].id, type: "kpt", items: { c1: ["按时交付"], c2: ["测试不足"], c3: ["提前写测试"] } });
  ok(App.DB.state.retros.some((x) => x.id === rt.id), "创建复盘成功");
  await App.DB.retros.update(rt.id, { items: { c1: ["按时交付"], c2: [], c3: [] } });
  ok(App.DB.state.retros.find((x) => x.id === rt.id).items.c1.length === 1, "复盘可编辑");
  await App.DB.retros.remove(rt.id);
  ok(!App.DB.state.retros.some((x) => x.id === rt.id), "复盘可删除");

  // 邮件配置（非 owner 拒绝；owner 保存；未配置时通知不阻塞）
  const denyMail = await api("POST", "/api/mail/config", { enabled: true, host: "smtp.test" }, regNoOwner.data.token);
  ok(denyMail.status === 403, "非管理员不能配置 SMTP(403)");
  const cfgMail = await api("POST", "/api/mail/config", { enabled: false, host: "smtp.example.com", port: 25, from: "a@b.c" }, token);
  ok(cfgMail.status === 200, "管理员保存 SMTP 配置");
  const cfgGet = await api("GET", "/api/mail/config", null, token);
  ok(cfgGet.data.host === "smtp.example.com" && !cfgGet.data.hasPass, "SMTP 配置可读取且密码不回显");

  // 表格模式 / 报告 / 回顾 视图渲染
  {
    const ctxT = f1.ctx;
    ctxT.__stubT = f1.dummyEl("");
    vm.runInContext("Views.tasks.view.mode = 'table'", ctxT);
    const html = vm.runInContext("Views.tasks.view.render(null)", ctxT);
    ok(html.includes("表格（批量）") && html.includes("data-batch") && html.includes("data-batchact"), "表格模式渲染成功（批量控件齐全）");
    vm.runInContext("Views.tasks.view.bind.call(Views.tasks.view, window.__stubT)", ctxT);
    ok(true, "表格模式 bind 无异常");
    const rv = vm.runInContext("window.reportsView", ctxT);
    await rv.load();
    const rhtml = rv.render();
    ok(rhtml.includes("报告中心") && rhtml.includes("项目报表"), "报告中心渲染成功");
    const rthtml = vm.runInContext("window.retrosView.render()", ctxT);
    ok(rthtml.includes("回顾") && rthtml.includes("KPT"), "回顾视图渲染成功");
  }

  console.log("== 联动分析技能与建议动作 ==");
  // 造联动场景：A（未完成）→ B 依赖 A；B 逾期
  const depA = await App.DB.createTask({ title: "联动前置任务", projectId: S.projects[0].id, priority: "high", dueDate: "2020-01-01" });
  const depB = await App.DB.createTask({ title: "联动被阻塞任务", projectId: S.projects[0].id, dependencies: [depA.id], dueDate: "2020-01-05" });
  const ph = await api("POST", "/api/agent/run", { skill: "project_health", params: {} }, token);
  ok(ph.status === 200 && ph.data.text.includes("项目健康诊断"), "项目健康诊断技能执行成功");
  ok(ph.data.actions && ph.data.actions.length > 0, "健康诊断给出行动建议（actions）");
  const dc = await api("POST", "/api/agent/run", { skill: "dependency_chain", params: {} }, token);
  ok(dc.status === 200 && dc.data.text.includes("依赖链分析") && dc.data.text.includes("联动前置任务"), "依赖链分析识别出关键任务");
  const wa = await api("POST", "/api/agent/run", { skill: "workload_analysis", params: {} }, token);
  ok(wa.status === 200 && wa.data.text.includes("负载分析"), "负载分析技能执行成功");
  const rr = await api("POST", "/api/agent/run", { skill: "risk_radar", params: {} }, token);
  ok(rr.status === 200 && rr.data.text.includes("风险雷达"), "风险雷达技能执行成功");

  // 执行建议动作（move_task 移动被阻塞任务 → 检查权限 + 数据变更）
  const moveAction = dc.data.actions.find((a) => a.tool === "move_task");
  if (moveAction) {
    const act = await api("POST", "/api/agent/action", { tool: moveAction.tool, args: moveAction.args }, token);
    ok(act.status === 200 && act.data.ok === true, "建议动作执行成功（move_task）");
  } else ok(true, "（无 move 建议，跳过）");
  const actUpd = await api("POST", "/api/agent/action", { tool: "update_task", args: { taskId: depB.id, dueDate: "2030-01-01" } }, token);
  ok(actUpd.status === 200, "update_task 动作执行成功");
  const tAfter = await api("GET", "/api/tasks", null, token);
  ok(tAfter.data.find((x) => x.id === depB.id).dueDate === "2030-01-01", "动作真实修改了任务数据");
  // 越权执行：普通成员对他人项目任务执行动作 → 403
  const viewerAct = await api("POST", "/api/agent/action", { tool: "update_task", args: { taskId: depB.id, dueDate: "2031-01-01" } }, regNoOwner.data.token);
  ok(viewerAct.status === 403, "无权限成员执行动作被拒绝(403)");
  // 不存在的工具
  const badAct = await api("POST", "/api/agent/action", { tool: "not_exist", args: {} }, token);
  ok(badAct.status === 404, "不存在工具被拒绝(404)");

  console.log("== Agent 智能层（意图/会话/分级/幂等/统计/开关） ==");
  // 意图识别单元测试
  const AgentMod = require("./server/agent");
  ok(AgentMod.recognizeIntent("帮我生成周报").def.intent === "weekly_report", "意图识别：周报");
  ok(AgentMod.recognizeIntent("创建任务叫测试").def.intent === "create_task", "意图识别：创建任务");
  ok(AgentMod.recognizeIntent("完成看板拖拽").def.intent === "complete_task", "意图识别：完成任务");
  ok(AgentMod.recognizeIntent("项目健康诊断").def.intent === "project_health", "意图识别：健康诊断");
  const recNull = AgentMod.recognizeIntent("xyzzy qwerty 随便说点什么");
  ok(!recNull, "意图识别：乱码无命中");

  // chat 意图路由（只读直接执行）
  const c1 = await api("POST", "/api/agent/chat", { text: "生成周报" }, token);
  ok(c1.status === 200 && c1.data.reply.includes("周报"), "chat 意图路由：周报直接执行");
  ok(c1.data.source && c1.data.source.skill === "weekly_report", "chat 返回来源引用（幻觉防控）");
  // 写操作 → 待确认 actions（不自动执行）
  const c2 = await api("POST", "/api/agent/chat", { text: "创建任务叫 端到端智能任务 明天截止 高优先级" }, token);
  ok(c2.status === 200 && c2.data.actions && c2.data.actions.length === 1 && c2.data.actions[0].tool === "create_task", "写操作转为待确认 actions");
  ok(!App.DB.state.tasks.some((x) => x.title === "端到端智能任务"), "确认前任务未创建（人工确认护栏）");
  const c2a = await api("POST", "/api/agent/action", { tool: c2.data.actions[0].tool, args: c2.data.actions[0].args }, token);
  await App.DB.bootstrap();
  ok(c2a.status === 200 && App.DB.state.tasks.some((x) => x.title === "端到端智能任务"), "点击确认后任务创建成功");
  // 频率防抖：10 秒内重复同操作（同参数）
  const c2b = await api("POST", "/api/agent/chat", { text: "创建任务叫 端到端智能任务 明天截止 高优先级" }, token);
  ok(c2b.data.reply.includes("已经执行过"), "同操作 10 秒防抖");
  // 多轮追问
  const c3 = await api("POST", "/api/agent/chat", { text: "创建任务" }, token);
  ok(c3.data.reply.includes("任务叫什么名字"), "多轮追问：标题缺失");
  const c3b = await api("POST", "/api/agent/chat", { text: "多轮追问任务" }, token);
  ok(c3b.data.reply.includes("截止日期"), "多轮追问：截止日期");
  const c3c = await api("POST", "/api/agent/chat", { text: "没有" }, token);
  ok(c3c.data.actions && c3c.data.actions.some((a) => a.tool === "create_task"), "追问补全后生成确认 actions");
  // 复合意图
  const c4 = await api("POST", "/api/agent/chat", { text: "生成周报，扫描逾期任务" }, token);
  ok(c4.data.reply.includes("周报") && c4.data.reply.includes("逾期"), "复合意图拆分执行");
  // 意图不明 → 转人工
  const c5 = await api("POST", "/api/agent/chat", { text: "给我变个魔术吧" }, token);
  ok(c5.data.handoff && c5.data.handoff.suggestions.length > 0, "意图不明降级 + 转人工摘要");
  // 幂等：同 requestId 返回相同结果
  const rid = "req_test_1";
  const c6a = await api("POST", "/api/agent/chat", { text: "今日摘要", requestId: rid }, token);
  const c6b = await api("POST", "/api/agent/chat", { text: "今日摘要", requestId: rid }, token);
  ok(c6a.data.reply === c6b.data.reply, "requestId 幂等（重复请求返回相同结果）");
  // 统计 / 审计 / 开关
  const st = await api("GET", "/api/agent/stats", null, token);
  ok(st.status === 200 && st.data.today > 0 && st.data.successRate >= 0, "执行统计可用");
  const au = await api("GET", "/api/agent/audit", null, token);
  ok(au.status === 200 && au.data.permission.enforced && au.data.controls.enabled === true, "安全审计清单可用");
  const off = await api("POST", "/api/agent/controls", { enabled: false }, token);
  ok(off.status === 200 && off.data.enabled === false, "运维开关：停用 Agent");
  const cOff = await api("POST", "/api/agent/chat", { text: "生成周报" }, token);
  ok(cOff.data.reply.includes("停用"), "停用后对话被拒绝");
  await api("POST", "/api/agent/controls", { enabled: true }, token);

  console.log("== 删除级联 ==");
  const delPid = App.DB.state.projects[0].id;
  await App.DB.deleteProject(delPid);
  ok(!App.DB.state.tasks.some((x) => x.projectId === delPid), "删项目后任务级联清理");

  srv.kill();
  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("测试崩溃:", e); srv.kill(); process.exit(1); });
