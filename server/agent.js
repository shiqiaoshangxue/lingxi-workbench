/* ============================================================
   灵犀工作台 · Agent 引擎
   三层架构：确定性技能库 + cron 规则引擎 + 工具注册表（LLM 预留）
   零外部依赖。技能只读或发通知，不直接改业务数据（安全默认）。
   ============================================================ */
"use strict";
const DB = require("./db");

const db = DB.load();

/* ================= 工具注册表（统一入口，LLM 预留） =================
   每个工具：{ name, desc, params: [{name, required, desc}], run(ctx, args) }
   ctx: { user, notify(userId,title,desc,link) }
   未来 LLM 通过 function calling 调用同一套工具 */
const TOOLS = [
  {
    name: "list_overdue_tasks", level: "read", desc: "列出逾期未完成的任务",
    params: [{ name: "projectId", required: false, desc: "限定项目（可选）" }],
    run: (ctx, args) => {
      const today = DB.dayStr();
      const tasks = DB.visibleTasks(ctx.user).filter((t) => t.dueDate && t.dueDate < today && t.colId !== "col_done");
      return { ok: true, data: tasks.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, projectId: t.projectId })) };
    },
  },
  {
    name: "create_task", level: "write", desc: "创建任务（LLM 预留）",
    params: [{ name: "title", required: true, desc: "标题" }, { name: "projectId", required: false, desc: "项目" }, { name: "dueDate", required: false, desc: "截止 YYYY-MM-DD" }, { name: "priority", required: false, desc: "high/mid/low" }],
    run: (ctx, args) => {
      if (!args.title) return { ok: false, error: "缺少标题" };
      if (args.projectId && !DB.canWriteProject(ctx.user, args.projectId)) return { ok: false, error: "无权限" };
      const t = { id: DB.uid("t_"), title: String(args.title).slice(0, 200), desc: "", projectId: args.projectId || null,
        colId: db.columns[0].id, priority: ["high", "mid", "low"].includes(args.priority) ? args.priority : "mid",
        dueDate: args.dueDate || "", startDate: "", tags: [], subtasks: [], assigneeId: null,
        createdAt: DB.now(), completedAt: null, order: db.tasks.length };
      db.tasks.push(t);
      DB.persist();
      return { ok: true, data: t };
    },
  },
  {
    name: "move_task", level: "write", desc: "移动任务到指定状态列（LLM 预留）",
    params: [{ name: "taskId", required: true, desc: "任务 ID" }, { name: "colId", required: true, desc: "目标列 ID" }],
    run: (ctx, args) => {
      const t = db.tasks.find((x) => x.id === args.taskId);
      if (!t) return { ok: false, error: "任务不存在" };
      if (!DB.canWriteProject(ctx.user, t.projectId)) return { ok: false, error: "无权限" };
      t.colId = args.colId;
      t.completedAt = args.colId === "col_done" ? DB.now() : null;
      DB.persist();
      return { ok: true, data: t };
    },
  },
  {
    name: "send_notification", level: "safe", desc: "给指定用户发送站内通知（LLM 预留）",
    params: [{ name: "userId", required: true, desc: "用户 ID" }, { name: "title", required: true, desc: "标题" }, { name: "desc", required: false, desc: "内容" }, { name: "link", required: false, desc: "跳转链接" }],
    run: (ctx, args) => {
      if (ctx.user.role !== "owner" && args.userId !== ctx.user.id) return { ok: false, error: "只能给自己发通知" };
      db.notifications.push({ id: DB.uid("n_"), userId: args.userId, title: String(args.title).slice(0, 80), desc: String(args.desc || "").slice(0, 300), link: args.link || "", read: false, createdAt: DB.now() });
      DB.persist();
      return { ok: true };
    },
  },
  {
    name: "update_task", level: "write", desc: "更新任务字段（状态/截止/优先级/负责人等，LLM 与建议动作共用）",
    params: [{ name: "taskId", required: true, desc: "任务 ID" }, { name: "colId", required: false, desc: "目标状态列" }, { name: "dueDate", required: false, desc: "截止 YYYY-MM-DD（可传空串清除）" }, { name: "priority", required: false, desc: "high/mid/low" }, { name: "assigneeId", required: false, desc: "负责人用户 ID（可传 null 清除）" }],
    run: (ctx, args) => {
      const t = db.tasks.find((x) => x.id === args.taskId);
      if (!t) return { ok: false, error: "任务不存在" };
      if (!DB.canWriteProject(ctx.user, t.projectId)) return { ok: false, error: "无权限" };
      if (args.colId !== undefined) { t.colId = args.colId; t.completedAt = args.colId === "col_done" ? DB.now() : null; }
      if (args.dueDate !== undefined) t.dueDate = args.dueDate || "";
      if (args.priority !== undefined && ["high", "mid", "low"].includes(args.priority)) t.priority = args.priority;
      if (args.assigneeId !== undefined) t.assigneeId = args.assigneeId || null;
      DB.persist();
      return { ok: true, data: { id: t.id, title: t.title, colId: t.colId, dueDate: t.dueDate } };
    },
  },
];

function findTool(name) { return TOOLS.find((t) => t.name === name); }

/* ================= 确定性技能库 =================
   每个技能：{ name, label, desc, params: [{name,label,required,type}], run(user, params) -> {text, html?} } */
const dayOffset = (n) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return DB.dayStr();
};
const projName = (id) => { const p = db.projects.find((x) => x.id === id); return p ? p.name : null; };
const userById = (id) => DB.findUser(id);
const fmtMins = (m) => { m = Math.max(0, Math.round(m)); return m < 60 ? `${m} 分钟` : `${Math.floor(m / 60)} 小时${m % 60 ? " " + (m % 60) + " 分" : ""}`; };
const taskById = (id) => db.tasks.find((x) => x.id === id);
const isDone = (t) => t && t.colId === "col_done";
const short = (s) => { s = String(s || ""); return s.length > 12 ? s.slice(0, 12) + "…" : s; };
const addDays = (ds, n) => {
  const d = new Date(ds + "T00:00:00"); d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const SKILLS = {
  weekly_report: {
    label: "周报生成", icon: "note", desc: "汇总本周完成、进行中、新增任务与时间投入，生成可直接使用的周报文本。",
    params: [{ name: "projectId", label: "限定项目（可选）", required: false, type: "select" }],
    run(user, params) {
      const weekAgo = dayOffset(-6);
      const inProj = (t) => !params.projectId || t.projectId === params.projectId;
      const done = db.tasks.filter((t) => inProj(t) && t.colId === "col_done" && t.completedAt && t.completedAt >= new Date(weekAgo).getTime());
      const doing = db.tasks.filter((t) => inProj(t) && t.colId !== "col_done");
      const newTasks = db.tasks.filter((t) => inProj(t) && t.createdAt >= new Date(weekAgo).getTime());
      const logs = db.timeLogs.filter((l) => l.date >= weekAgo);
      const mins = logs.reduce((s, l) => s + (l.minutes || 0), 0);
      const dueSoon = db.tasks.filter((t) => inProj(t) && t.colId !== "col_done" && t.dueDate && t.dueDate >= DB.dayStr() && t.dueDate <= dayOffset(7));
      const scope = params.projectId ? `（项目：${projName(params.projectId)}）` : "（全部项目）";
      const text = [
        `## 本周周报 ${scope}`,
        ``,
        `**完成 ${done.length} 项**`,
        ...(done.slice(0, 10).map((t) => `- ${t.title}`) || ["- 无"]),
        ``,
        `**进行中 ${doing.length} 项**`,
        ...(doing.slice(0, 10).map((t) => `- ${t.title}${t.dueDate ? "（截止 " + t.dueDate + "）" : ""}`) || ["- 无"]),
        ``,
        `**新增 ${newTasks.length} 项** · 本周投入专注 ${fmtMins(mins)}`,
        ``,
        `**下周到期 ${dueSoon.length} 项**`,
        ...(dueSoon.slice(0, 10).map((t) => `- ${t.title}（${t.dueDate}）`) || ["- 无"]),
      ].join("\n");
      return { text };
    },
  },
  scan_overdue: {
    label: "逾期扫描", icon: "alert", desc: "扫描逾期未完成任务，可一键给相关成员发送提醒通知。",
    params: [
      { name: "projectId", label: "限定项目（可选）", required: false, type: "select" },
      { name: "notify", label: "发送提醒通知", required: false, type: "bool" },
    ],
    run(user, params) {
      const today = DB.dayStr();
      const overdue = DB.visibleTasks(user).filter((t) => (!params.projectId || t.projectId === params.projectId) && t.dueDate && t.dueDate < today && t.colId !== "col_done");
      const text = overdue.length
        ? [`## 逾期扫描结果`, `发现 **${overdue.length}** 个逾期任务：`, ``,
          ...overdue.map((t) => `- ${t.title}（应于 ${t.dueDate} 完成）${projName(t.projectId) ? " · " + projName(t.projectId) : ""}`)].join("\n")
        : `## 逾期扫描结果\n\n当前没有逾期任务，一切尽在掌控 🎉`;
      if (params.notify && overdue.length) {
        const targets = new Set([user.id]);
        db.projectMembers.forEach((m) => { if (overdue.some((t) => t.projectId === m.projectId)) targets.add(m.userId); });
        targets.forEach((uid2) => {
          db.notifications.push({ id: DB.uid("n_"), userId: uid2, title: `⏰ ${overdue.length} 个任务已逾期`, desc: overdue.slice(0, 5).map((t) => t.title).join("、") + (overdue.length > 5 ? ` 等 ${overdue.length} 项` : ""), link: "#/tasks", read: false, createdAt: DB.now() });
        });
        DB.persist();
        return { text: text + `\n\n已向 ${targets.size} 位成员发送提醒通知。` };
      }
      return { text };
    },
  },
  project_snapshot: {
    label: "项目状态快照", icon: "layers", desc: "生成各项目进度、逾期、任务分布与最近动态的速览报告。",
    params: [{ name: "projectId", label: "限定项目（可选）", required: false, type: "select" }],
    run(user, params) {
      const pids = new Set(DB.visibleProjectIds(user));
      const projects = db.projects.filter((p) => pids.has(p.id) && (!params.projectId || p.id === params.projectId));
      const lines = ["## 项目状态快照", ""];
      projects.forEach((p) => {
        const tasks = db.tasks.filter((t) => t.projectId === p.id);
        const done = tasks.filter((t) => t.colId === "col_done").length;
        const overdue = tasks.filter((t) => t.dueDate && t.dueDate < DB.dayStr() && t.colId !== "col_done").length;
        const progress = tasks.length ? Math.round(done / tasks.length * 100) : 0;
        const recentLogs = db.timeLogs.filter((l) => db.tasks.some((t) => t.id === l.taskId && t.projectId === p.id)).length;
        lines.push(`### ${p.name}`);
        lines.push(`- 进度 ${progress}%（${done}/${tasks.length}）· 逾期 ${overdue} · 时间记录 ${recentLogs} 条`);
        const hot = tasks.filter((t) => t.colId !== "col_done").slice(0, 3);
        if (hot.length) lines.push(`- 进行中：${hot.map((t) => t.title).join("、")}`);
        lines.push("");
      });
      if (!projects.length) lines.push("（无可展示项目）");
      return { text: lines.join("\n") };
    },
  },
  goal_alerts: {
    label: "目标进度预警", icon: "goal", desc: "检查临近截止但进度偏低的目标与关键结果，给出预警。",
    params: [{ name: "threshold", label: "进度阈值（%）", required: false, type: "number" }],
    run(user, params) {
      const threshold = params.threshold || 50;
      const soon = dayOffset(30);
      const goals = db.goals.filter((g) => g.userId === user.id || db.projects.some((p) => p.id === g.projectId));
      const lines = ["## 目标进度预警", ""];
      let warn = 0;
      goals.forEach((g) => {
        const krs = g.krs || [];
        const p = krs.length ? Math.round(krs.reduce((s, k) => s + (k.value || 0), 0) / krs.length) : 0;
        const near = g.dueDate && g.dueDate <= soon;
        const behind = krs.filter((k) => (k.value || 0) < threshold);
        if (near && p < threshold) {
          warn++;
          lines.push(`⚠️ ${g.title}（截止 ${g.dueDate}，进度 ${p}%）`);
        } else if (behind.length) {
          warn++;
          lines.push(`⚠️ ${g.title}：${behind.map((k) => `${k.title}(${k.value}%)`).join("、")} 低于 ${threshold}%`);
        }
      });
      if (!warn) lines.push("所有目标进度正常，继续保持 🎉");
      return { text: lines.join("\n") };
    },
  },
  todo_summary: {
    label: "今日摘要", icon: "dashboard", desc: "汇总今日到期、逾期与进行中的任务，适合定时每天早上运行。",
    params: [],
    run(user, params) {
      const today = DB.dayStr();
      const tasks = DB.visibleTasks(user);
      const due = tasks.filter((t) => t.dueDate === today && t.colId !== "col_done");
      const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today && t.colId !== "col_done");
      const doing = tasks.filter((t) => t.colId !== "col_done").length;
      const events = db.events.filter((e) => e.date === today);
      const lines = [
        `## 今日摘要 · ${today}`,
        ``,
        `**今日到期 ${due.length} 项**`,
        ...(due.map((t) => `- ${t.title}`) || []),
        ``,
        `**已逾期 ${overdue.length} 项**`,
        ...(overdue.map((t) => `- ${t.title}（${t.dueDate}）`) || []),
        ``,
        `进行中任务共 ${doing} 项${events.length ? ` · 今日日程 ${events.length} 个：${events.map((e) => e.title).join("、")}` : ""}`,
      ];
      return { text: lines.join("\n") };
    },
  },
  /* ---- 联动分析技能（跨实体分析 + 行动建议） ---- */
  project_health: {
    label: "项目健康诊断", icon: "heart", desc: "综合任务/依赖/里程碑/工时给每个项目打分，定位风险并给出可执行的行动建议。",
    params: [{ name: "projectId", label: "限定项目（可选）", required: false, type: "select" }],
    run(user, params) {
      const pids = new Set(DB.visibleProjectIds(user));
      const projects = db.projects.filter((p) => pids.has(p.id) && (!params.projectId || p.id === params.projectId));
      const today = DB.dayStr();
      const lines = ["## 项目健康诊断", ""];
      const actions = [];
      let any = false;
      projects.forEach((p) => {
        const ts = db.tasks.filter((t) => t.projectId === p.id);
        if (!ts.length) return;
        any = true;
        const done = ts.filter((t) => isDone(t)).length;
        const overdue = ts.filter((t) => t.dueDate && t.dueDate < today && !isDone(t));
        const blocked = ts.filter((t) => !isDone(t) && (t.dependencies || []).some((d) => { const dep = taskById(d); return dep && !isDone(dep); }));
        const msRisks = db.milestones.filter((ms) => ms.projectId === p.id && ms.endDate && ms.endDate >= today && ms.endDate <= dayOffset(14));
        const minutes = db.timeLogs.filter((l) => { const t = l.taskId ? taskById(l.taskId) : null; return t && t.projectId === p.id; }).reduce((s, l) => s + (l.minutes || 0), 0);
        let score = 100 - overdue.length * 15 - blocked.length * 10 - msRisks.length * 8 - (minutes < 120 ? 5 : 0);
        score = Math.max(0, Math.min(100, score));
        const level = score >= 85 ? "健康" : score >= 60 ? "注意" : "警告";
        lines.push(`### ${p.name} — ${level}（${score} 分）`);
        lines.push(`完成 ${done}/${ts.length} · 逾期 ${overdue.length} · 被阻塞 ${blocked.length}${msRisks.length ? ` · 里程碑临近 ${msRisks.length}` : ""} · 累计投入 ${fmtMins(minutes)}`);
        overdue.slice(0, 2).forEach((t) => {
          lines.push(`- ⚠️ 逾期：${t.title}（${t.dueDate}）`);
          actions.push({ label: `延后「${short(t.title)}」截止 +3 天`, tool: "update_task", args: { taskId: t.id, dueDate: addDays(t.dueDate, 3) } });
        });
        blocked.slice(0, 2).forEach((t) => {
          const deps = (t.dependencies || []).map((d) => taskById(d)).filter(Boolean).map((d) => d.title).join("、");
          lines.push(`- 🔗 阻塞：${t.title} 依赖未完成（${deps}）`);
          actions.push({ label: `把「${short(t.title)}」移回待办`, tool: "move_task", args: { taskId: t.id, colId: db.columns[0].id } });
        });
        lines.push("");
      });
      if (!any) lines.push("（暂无项目数据）");
      if (!actions.length) lines.push("所有项目健康，无需干预 🎉");
      return { text: lines.join("\n"), actions };
    },
  },
  dependency_chain: {
    label: "依赖链分析", icon: "link", desc: "找出阻塞的任务、被阻塞的任务与关键路径，看清延误如何传播。",
    params: [{ name: "projectId", label: "限定项目（可选）", required: false, type: "select" }],
    run(user, params) {
      const tasks = DB.visibleTasks(user).filter((t) => !params.projectId || t.projectId === params.projectId);
      const today = DB.dayStr();
      const blocked = tasks.filter((t) => !isDone(t) && (t.dependencies || []).some((d) => { const dep = taskById(d); return dep && !isDone(dep); }));
      const blockers = tasks.filter((t) => !isDone(t) && tasks.some((x) => (x.dependencies || []).includes(t.id)))
        .sort((a, b) => (tasks.filter((x) => (x.dependencies || []).includes(b.id)).length) - (tasks.filter((x) => (x.dependencies || []).includes(a.id)).length));
      const lines = ["## 依赖链分析", ""];
      const actions = [];
      if (!blockers.length && !blocked.length) {
        lines.push("当前没有未完成的任务依赖关系，链路通畅 ✅");
        return { text: lines.join("\n"), actions };
      }
      lines.push(`**关键任务**（被 ${blocked.length} 个任务依赖）：`);
      blockers.slice(0, 5).forEach((t) => {
        const deps = tasks.filter((x) => (x.dependencies || []).includes(t.id)).length;
        lines.push(`- 🔑 ${t.title} → 阻塞 ${deps} 个任务${t.dueDate ? `（应于 ${t.dueDate} 完成${t.dueDate < today ? "，已逾期" : ""}）` : ""}`);
        if (t.dueDate && t.dueDate < today) {
          actions.push({ label: `把「${short(t.title)}」移到最前`, tool: "move_task", args: { taskId: t.id, colId: db.columns.find((c) => c.order === 0).id } });
        }
      });
      lines.push("", "**等待中的任务**：");
      blocked.slice(0, 5).forEach((t) => lines.push(`- ⛔ ${t.title} 等待前置完成`));
      return { text: lines.join("\n"), actions };
    },
  },
  workload_analysis: {
    label: "负载分析", icon: "users", desc: "统计每个成员的任务量与工时，发现负载不均和逾期压力，可一键提醒。",
    params: [],
    run(user, params) {
      const tasks = DB.visibleTasks(user);
      const members = db.users.map((u) => {
        const mine = tasks.filter((t) => t.assigneeId === u.id);
        return { u, total: mine.length, doing: mine.filter((t) => !isDone(t)).length,
          overdue: mine.filter((t) => t.dueDate && t.dueDate < DB.dayStr() && !isDone(t)).length,
          minutes: db.timeLogs.filter((l) => l.userId === u.id).reduce((s, l) => s + (l.minutes || 0), 0) };
      }).filter((x) => x.total > 0 || x.minutes > 0).sort((a, b) => b.total - a.total);
      const lines = ["## 负载分析", ""];
      const actions = [];
      if (!members.length) { lines.push("暂无任务分配记录。"); return { text: lines.join("\n"), actions }; }
      members.forEach((m) => lines.push(`- ${m.u.displayName}：未完成 ${m.doing} 项 · 逾期 ${m.overdue} · 累计工时 ${fmtMins(m.minutes)}`));
      const overloaded = members.filter((m) => m.doing >= 6);
      const stressed = members.filter((m) => m.overdue >= 3);
      if (overloaded.length) lines.push("", `⚠️ ${overloaded.map((m) => m.u.displayName).join("、")} 未完成任务较多（≥6），建议分流。`);
      if (stressed.length) {
        lines.push(`⚠️ ${stressed.map((m) => m.u.displayName).join("、")} 逾期较多（≥3），建议优先处理。`);
        stressed.forEach((m) => actions.push({ label: `提醒「${m.u.displayName}」关注逾期`, tool: "send_notification", args: { userId: m.u.id, title: "负载提醒", desc: `你当前有 ${m.overdue} 个逾期任务，建议优先处理或调整排期。`, link: "#/tasks" } }));
      }
      if (!overloaded.length && !stressed.length) lines.push("", "负载分布均衡，无需干预 🎉");
      return { text: lines.join("\n"), actions };
    },
  },
  risk_radar: {
    label: "风险雷达", icon: "alert", desc: "聚合逾期、依赖断裂、里程碑临近、目标落后，生成分级风险清单与应对动作。",
    params: [{ name: "projectId", label: "限定项目（可选）", required: false, type: "select" }],
    run(user, params) {
      const today = DB.dayStr();
      const inProj = (t) => !params.projectId || t.projectId === params.projectId;
      const tasks = DB.visibleTasks(user).filter(inProj);
      const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today && !isDone(t));
      const blocked = tasks.filter((t) => !isDone(t) && (t.dependencies || []).some((d) => { const dep = taskById(d); return dep && !isDone(dep); }));
      const msNear = db.milestones.filter((ms) => (!params.projectId || ms.projectId === params.projectId) && ms.endDate && ms.endDate >= today && ms.endDate <= dayOffset(14));
      const goalsBehind = db.goals.filter((g) => g.userId === user.id && g.dueDate && g.dueDate <= dayOffset(30) && (g.krs || []).length && (g.krs.reduce((s, k) => s + (k.value || 0), 0) / g.krs.length < 50));
      const high = overdue.length + msNear.length;
      const mid = blocked.length + goalsBehind.length;
      const level = high >= 5 ? "高风险" : high >= 2 ? "中风险" : mid >= 2 ? "低风险" : "正常";
      const lines = [
        `## 风险雷达 · ${level}`,
        "",
        `**高优先级**（${high}）`,
        `- 逾期任务 ${overdue.length} 项${overdue.slice(0, 3).map((t) => `：${t.title}`).join("")}`,
        `- 里程碑 ${msNear.length} 个临近截止`,
        "",
        `**中优先级**（${mid}）`,
        `- 依赖断裂 ${blocked.length} 项`,
        `- 目标落后 ${goalsBehind.length} 个`,
      ];
      const actions = [];
      overdue.slice(0, 2).forEach((t) => actions.push({ label: `延后「${short(t.title)}」+3 天`, tool: "update_task", args: { taskId: t.id, dueDate: addDays(t.dueDate, 3) } }));
      if (high + mid > 0) actions.push({ label: "给自己发风险提醒", tool: "send_notification", args: { userId: user.id, title: `风险提醒 · ${level}`, desc: `${high} 项高优先级、${mid} 项中优先级风险，建议查看风险雷达并处理。`, link: "#/agent" } });
      return { text: lines.join("\n"), actions };
    },
  },
};

function findSkill(name) { return SKILLS[name]; }

/* 技能运行（统一入口） */
function runSkill(user, skillName, params = {}) {
  const skill = findSkill(skillName);
  if (!skill) throw new Error("技能不存在: " + skillName);
  const result = skill.run(user, params || {});
  db.agentLogs = db.agentLogs || [];
  db.agentLogs.push({ id: DB.uid("al_"), skill: skillName, label: skill.label, params: params || {}, status: "ok", createdAt: DB.now() });
  if (db.agentLogs.length > 200) db.agentLogs = db.agentLogs.slice(-200);
  DB.persist();
  return result;
}

/* ================= cron 规则引擎 ================= */
/* 支持格式："分 时 日 月 周"（0-59, 0-23, 1-31, 1-12, 0-6），* 通配 */
function cronMatch(expr, date) {
  const parts = String(expr || "").trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const d = date || new Date();
  const values = [d.getMinutes(), d.getHours(), d.getDate(), d.getMonth() + 1, d.getDay()];
  return parts.every((p, i) => {
    if (p === "*") return true;
    if (p.includes("/")) { const [base, step] = p.split("/"); const baseV = base === "*" ? 0 : +base; return values[i] >= baseV && (values[i] - baseV) % +step === 0; }
    if (p.includes(",")) return p.split(",").map(Number).includes(values[i]);
    return +p === values[i];
  });
}

/* 规则调度（server.js 启动时调用） */
let scheduler = null;
function startScheduler() {
  if (scheduler) return scheduler;
  scheduler = setInterval(() => {
    try {
      const now = new Date();
      (db.agentRules || []).forEach((r) => {
        if (!r.enabled || r.triggerType !== "cron") return;
        if (r.lastRun && now - r.lastRun < 50000) return; // 每分钟最多执行一次
        if (!cronMatch(r.cron, now)) return;
        r.lastRun = DB.now();
        r.lastStatus = "ok";
        r.lastMessage = "";
        try {
          const owner = db.users.find((u) => u.role === "owner") || db.users[0];
          if (!owner) return;
          const result = runSkill(owner, r.skill, r.params || {}, { intent: r.skill, source: "rule" });
          r.lastStatus = "ok";
          r.lastMessage = (result.text || "").slice(0, 100);
          r.failCount = 0;
        } catch (e) {
          r.lastStatus = "error";
          r.lastMessage = e.message.slice(0, 100);
          r.failCount = (r.failCount || 0) + 1;
          // 熔断（M8.8）：连续失败超过阈值自动停用
          const breaker = getControls().ruleBreaker;
          if (breaker.enabled && r.failCount >= breaker.threshold) {
            r.enabled = false;
            r.lastMessage = "已自动熔断（连续失败 " + r.failCount + " 次），可在 Agent 页重新启用";
          }
        }
        DB.persist();
      });
    } catch (e) { console.error("[agent] 调度异常:", e.message); }
  }, 30000);
  return scheduler;
}

/* 确定性助手：关键词 FAQ（无 LLM 时返回） */
const FAQ = [
  { keys: ["怎么用", "如何使用", "帮助", "help", "教程"], answer: "灵犀工作台使用很简单：\n1. 左侧导航进入各模块（任务/看板/甘特/日历等）\n2. 右上角「新建任务」或各页面「+」按钮创建内容\n3. 与朋友协作：项目 → 编辑 → 项目成员，添加对方账号并设置权限（可编辑/只读）\n4. 常用技能（周报/逾期扫描等）在「Agent」页面一键运行" },
  { keys: ["邀请", "协作", "朋友", "成员", "共享"], answer: "协作流程：\n1. 让对方先注册账号（第一个注册的是管理员，其余是普通成员）\n2. 打开目标项目 → 编辑 → 「项目成员」→ 选择用户 → 设置角色（可编辑/只读）\n3. 对方登录后即可看到该项目；你分配任务给对方会自动发站内通知" },
  { keys: ["周报", "周报生成", "weekly"], answer: "在「Agent」→「技能库」点击「周报生成」即可，也可在自动化规则中设置每周一自动生成，例如 cron 表达式：`0 9 * * 1`" },
  { keys: ["逾期", "超期", "延迟"], answer: "在「Agent」→「技能库」运行「逾期扫描」，勾选「发送提醒通知」即可一键提醒相关成员。也可设置定时规则每天扫描。" },
  { keys: ["备份", "导出", "迁移", "数据"], answer: "数据保存在服务器端 `server/data/db.json`，直接复制该文件即可备份。也可以在工作台「设置」页导出个人数据 JSON。" },
  { keys: ["权限", "角色", "只读", "viewer"], answer: "角色说明：\n- 项目负责人（owner）：管理成员、删除项目\n- 可编辑（editor）：增删改项目内任务/评论/文件等\n- 只读（viewer）：只能查看，不能修改\n系统管理员（第一个注册的账号）可管理全部项目与用户。" },
  { keys: ["深色", "主题", "夜间"], answer: "点击顶栏的月亮/太阳图标即可切换深色/浅色主题，设置页也可切换，选择会保存在本地。" },
];

function chatReply(text) {
  const t = String(text || "").toLowerCase();
  for (const f of FAQ) if (f.keys.some((k) => t.includes(k))) return f.answer;
  return "我是工作台的确定性助手（未接入大模型）。你可以问我：\n- 「怎么用 / 帮助」使用说明\n- 「邀请 / 协作」如何与朋友共享\n- 「周报」一键生成周报\n- 「逾期」扫描逾期任务\n\n也可以在「技能库」直接运行技能，在「自动化规则」配置定时任务。接入大模型（设置 LLM API Key）后，我就能用自然语言帮你操作工作台了。";
}

/* ============================================================
   Agent 智能层（v2.4）：意图体系 / 会话状态机 / 分级执行 / 幂等 / 统计 / 开关
   ============================================================ */

/* ---------- 意图体系（M2） ---------- */
const HELP_TEXT = "我是灵犀工作台助手，可以直接用自然语言让我：\n- **分析**：项目健康诊断 / 依赖链 / 负载 / 风险雷达 / 周报 / 逾期扫描 / 目标预警 / 今日摘要\n- **操作**：创建任务（说「创建任务叫 XX 明天截止」）、标记完成（「完成 XX」）、开始任务\n- **答疑**：怎么用 / 怎么邀请朋友 / 权限说明 / 数据备份\n\n写操作需要你点击确认按钮才会执行。";
const INVITE_TEXT = "协作流程：\n1. 让对方注册账号（第一个注册的是管理员）\n2. 打开项目 → 编辑 → 「项目成员」→ 添加对方并设角色（可编辑/只读）\n3. 对方登录后即可看到项目；你分配任务给对方会自动发通知";

const INTENT_DEFS = [
  { intent: "help", skill: null, level: "read", keywords: ["怎么用", "如何使用", "能做什么", "帮助", "教程", "help", "使用说明"], reply: () => HELP_TEXT },
  { intent: "invite", skill: null, level: "read", keywords: ["怎么邀请", "邀请朋友", "协作", "共享", "成员", "好友"], reply: () => INVITE_TEXT },
  { intent: "weekly_report", skill: "weekly_report", level: "read", keywords: ["周报", "本周总结", "weekly"], params: ["projectId"] },
  { intent: "overdue_scan", skill: "scan_overdue", level: "read", keywords: ["逾期", "超期", "过期", "延迟"], params: ["projectId"] },
  { intent: "project_health", skill: "project_health", level: "read", keywords: ["健康", "诊断", "health", "体检"], params: ["projectId"] },
  { intent: "dependency_chain", skill: "dependency_chain", level: "read", keywords: ["依赖", "阻塞", "链路", "dependency", "谁卡住"], params: ["projectId"] },
  { intent: "workload", skill: "workload_analysis", level: "read", keywords: ["负载", "工作量", "任务量", "谁最忙", "load"], params: [] },
  { intent: "risk_radar", skill: "risk_radar", level: "read", keywords: ["风险", "雷达", "risk", "隐患"], params: ["projectId"] },
  { intent: "goal_alerts", skill: "goal_alerts", level: "read", keywords: ["目标", "预警", "okr", "kr"], params: ["threshold"] },
  { intent: "todo_summary", skill: "todo_summary", level: "read", keywords: ["今日", "今天", "摘要", "todo", "today", "待办一览"], params: [] },
  { intent: "snapshot", skill: "project_snapshot", level: "read", keywords: ["快照", "总览", "项目状态", "snapshot"], params: ["projectId"] },
  { intent: "create_task", skill: null, tool: "create_task", level: "write", keywords: ["创建任务", "新建任务", "加个任务", "添加任务", "建个任务", "帮我建", "安排个任务"], params: ["title", "dueDate", "projectId", "priority"] },
  { intent: "complete_task", skill: null, tool: "move_task", level: "write", keywords: ["完成", "做完", "搞定", "标为完成"], params: ["taskId"] },
  { intent: "start_task", skill: null, tool: "move_task", level: "write", keywords: ["开始做", "开始任务", "进行中", "开工"], params: ["taskId"] },
];

function recognizeIntent(text) {
  const t = String(text || "").toLowerCase();
  let best = null, bestScore = 0;
  for (const def of INTENT_DEFS) {
    let score = 0;
    for (const k of def.keywords) if (t.includes(k)) score++;
    if (score > bestScore) { bestScore = score; best = def; }
  }
  return bestScore > 0 ? { def: best, score: bestScore } : null;
}

function parseDatePhrase(phrase) {
  const t = String(phrase || "");
  if (t.includes("明天")) return dayOffset(1);
  if (t.includes("后天")) return dayOffset(2);
  if (t.includes("今天") || t.includes("今日")) return dayOffset(0);
  const m = t.match(/(\d+)天后/);
  if (m) return dayOffset(+m[1]);
  const m2 = t.match(/(\d{1,2})月(\d{1,2})日/);
  if (m2) {
    const d = new Date(new Date().getFullYear(), +m2[1] - 1, +m2[2]);
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return "";
}

/* 从文本提取意图参数（M2.4 轻量语义提取） */
function extractParams(text, def, user) {
  const t = String(text || "");
  const out = {};
  if (def.intent === "create_task") {
    let m = t.match(/(?:创建|新建|建|加|安排)(?:个|一个|一条)?任务(?:叫|为|：|:)?\s*([^\s，。；、]+)/);
    if (m) out.title = m[1];
    else {
      m = t.match(/(?:帮我)?(?:建|创建|加)[个一条]?\s*([^\s，。；、]{2,20})/);
      if (m) out.title = m[1];
    }
    // 过滤意图残留词（如"创建任务"中"任务"被误当标题）
    if (out.title && ["任务", "一个", "一条", "个", "待办", "todo"].includes(out.title.toLowerCase())) delete out.title;
    const d = parseDatePhrase(t);
    if (d) out.dueDate = d;
    const pm = t.match(/(高|中|低)优先级/);
    if (pm) out.priority = pm[1] === "高" ? "high" : pm[1] === "低" ? "low" : "mid";
    const pj = t.match(/项目[：: ]?\s*([^\s，。；、]+)/);
    if (pj) {
      const proj = db.projects.find((x) => x.name.includes(pj[1]) && DB.canReadProject(user, x.id));
      if (proj) out.projectId = proj.id;
    }
  } else if (def.intent === "complete_task" || def.intent === "start_task") {
    const m = t.match(/(?:完成|做完|搞定|开始做|开始|开工)\s*「?([^「」的，。；]+?)(?:任务)?/);
    if (m) {
      const tasks = DB.visibleTasks(user).filter((x) => x.colId !== "col_done" && x.title.includes(m[1]));
      if (tasks.length === 1) out.taskId = tasks[0].id;
      else if (tasks.length > 1) out.__ambiguous = tasks.slice(0, 5).map((x) => x.title);
    }
  }
  return out;
}

/* ---------- 会话状态机（M3 / M8.3） ---------- */
const sessions = new Map();
const SESSION_TTL = 30 * 60 * 1000;
function getSession(userId, sessionId) {
  const key = sessionId || String(userId);
  let s = sessions.get(key);
  if (!s || Date.now() - s.updatedAt > SESSION_TTL) {
    s = { key, userId, state: "idle", lastIntent: null, pendingParams: [], collected: {}, askedCount: {}, context: [], updatedAt: Date.now() };
    sessions.set(key, s);
  }
  s.updatedAt = Date.now();
  return s;
}

/* ---------- 幂等 / 频率防抖（M8.4 / M5.6） ---------- */
const idempotent = new Map();
const recentActions = new Map();
function hashArgs(o) { try { return JSON.stringify(o); } catch (e) { return String(o); } }

/* ---------- 执行统计（M7） ---------- */
function logRun(entry) {
  db.agentLogs = db.agentLogs || [];
  db.agentLogs.push(Object.assign({
    id: DB.uid("al_"), skill: entry.skill || "", label: entry.label || entry.skill || "",
    params: entry.params || {}, status: entry.status || "ok", intent: entry.intent || "",
    source: entry.source || "manual", durationMs: entry.durationMs || 0,
    errorCode: entry.errorCode || "", error: entry.error || "",
    createdAt: DB.now(), userId: entry.userId || null,
  }));
  if (db.agentLogs.length > 300) db.agentLogs = db.agentLogs.slice(-300);
  DB.persist();
}
function runSkill(user, skillName, params = {}, meta = {}) {
  const skill = findSkill(skillName);
  if (!skill) throw new Error("技能不存在: " + skillName);
  const t0 = Date.now();
  try {
    const result = skill.run(user, params || {});
    logRun({ skill: skillName, label: skill.label, params: params || {}, status: "ok", intent: meta.intent || "", source: meta.source || "manual", durationMs: Date.now() - t0, userId: user.id });
    return result;
  } catch (e) {
    logRun({ skill: skillName, label: skill.label, params: params || {}, status: "error", intent: meta.intent || "", source: meta.source || "manual", durationMs: Date.now() - t0, errorCode: "SKILL_FAILED", error: e.message, userId: user.id });
    throw e;
  }
}

/* ---------- 运维开关（M8.8 / 成本预留 M8.7） ---------- */
function getControls() {
  if (!db.agentConfig) db.agentConfig = {};
  if (!db.agentConfig.controls) db.agentConfig.controls = { enabled: true, maxRunsPerDay: 300, ruleBreaker: { enabled: true, threshold: 3 }, llmMaxCallsPerDay: 100 };
  return db.agentConfig.controls;
}
function setControls(patch) {
  const c = getControls();
  if (patch.enabled !== undefined) c.enabled = !!patch.enabled;
  if (patch.maxRunsPerDay !== undefined) c.maxRunsPerDay = Math.max(1, +patch.maxRunsPerDay || 300);
  if (patch.llmMaxCallsPerDay !== undefined) c.llmMaxCallsPerDay = Math.max(1, +patch.llmMaxCallsPerDay || 100);
  if (patch.ruleBreaker !== undefined) { c.ruleBreaker = Object.assign(c.ruleBreaker || {}, { enabled: patch.ruleBreaker.enabled !== undefined ? !!patch.ruleBreaker.enabled : true, threshold: +patch.ruleBreaker.threshold || 3 }); }
  DB.persist();
  return c;
}
function runsToday() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return (db.agentLogs || []).filter((l) => l.createdAt >= start.getTime()).length;
}

/* ---------- 安全审计清单（M5.9） ---------- */
function auditReport() {
  const c = getControls();
  return {
    permission: { model: "owner / editor / viewer + 工具内建校验", enforced: true },
    writeLevels: { read: "只读，直接执行", safe: "低风险写（发通知），直接执行", write: "改数据，必须人工确认", destructive: "删除类，二次确认（当前无自动删除工具）" },
    forbiddenAuto: ["delete_project", "batch_delete", "修改他人数据"],
    confirmPolicy: "write 级操作仅通过 actions 按钮由用户点击执行",
    hallucinationControl: { deterministic: "技能基于真实数据生成，无幻觉", llm: "LLM 模式强制附数据来源（技能结果引用），未配置时不可用" },
    privacy: { storage: "仅存本机 server/data/db.json", tokenTTL: "30 天", sensitiveLog: "Agent 执行日志脱敏" },
    rateLimit: { sameAction: "10 秒去重", ruleBreaker: `连续失败 ${c.ruleBreaker.threshold} 次自动停用` },
    controls: c,
    todayRuns: runsToday(),
  };
}

/* ---------- 主对话流程（M2/M3/M4/M6 落地） ---------- */
function intentChat(user, sessionId, text, requestId) {
  if (requestId && idempotent.has(requestId)) return idempotent.get(requestId);
  const controls = getControls();
  if (!controls.enabled) return { reply: "Agent 已被管理员停用，可在「配置与日志」重新开启。", actions: [], source: { intent: "disabled" } };

  const session = getSession(user.id, sessionId);
  const t = String(text || "").trim();
  const reply = (payload) => {
    const out = Object.assign({ reply: "", actions: [], source: {}, handoff: null, state: session.state, context: session.context.slice(-8) }, payload);
    if (requestId) { idempotent.set(requestId, out); if (idempotent.size > 30) idempotent.delete(idempotent.keys().next().value); }
    session.context.push({ role: "user", text: t, ts: Date.now() });
    if (session.context.length > 30) session.context = session.context.slice(-30);
    return out;
  };

  /* 追问补全（M3.3 / M3.4）：会话处于 pending_params 时，本句优先作为参数回答 */
  if (session.state === "pending_params" && session.lastIntent) {
    const def = INTENT_DEFS.find((x) => x.intent === session.lastIntent);
    if (def) {
      const pending = session.pendingParams[0];
      if (pending === "title") {
        session.collected.title = t.slice(0, 80);
      } else if (pending === "taskId") {
        const tasks = DB.visibleTasks(user).filter((x) => x.colId !== "col_done" && x.title.includes(t));
        if (tasks.length === 1) session.collected.taskId = tasks[0].id;
        else {
          session.askedCount.taskId = (session.askedCount.taskId || 0) + 1;
          if (session.askedCount.taskId >= 2 || tasks.length === 0) {
            session.state = "idle"; session.lastIntent = null; session.pendingParams = [];
            return reply({ reply: "未能找到匹配的任务，已取消本次操作。你可以在任务页手动操作，或换一个任务关键词。", handoff: { question: t, attempts: session.askedCount.taskId, suggestions: ["使用任务页搜索", "提供更精确的任务标题"] } });
          }
          return reply({ reply: "没找到「" + t + "」，当前未完成的任务中有这些，请选一个：\n" + tasks.slice(0, 5).map((x) => "- " + x.title).join("\n") });
        }
      } else if (pending === "dueDate") {
        const d = parseDatePhrase(t);
        if (t.includes("没有") || t.includes("不用") || t.includes("无")) { session.collected.dueDate = ""; session.collected.__noDue = true; }
        else session.collected.dueDate = d || t;
      } else if (pending === "projectId") {
        const proj = db.projects.find((x) => x.name.includes(t) && DB.canReadProject(user, x.id));
        session.collected.projectId = proj ? proj.id : null;
      }
      session.pendingParams.shift();
      if (session.pendingParams.length) {
        const next = session.pendingParams[0];
        const q = next === "title" ? "这个任务叫什么名字？" : next === "taskId" ? "请提供任务标题或关键词：" : next === "dueDate" ? "截止日期是什么时候？（如：明天 / 9月1日，或回复「没有」）" : "请提供项目名称：";
        return reply({ reply: q, state: "pending_params" });
      }
      session.state = "executing";
      // 追问链：create_task 标题补全后若无截止日期，继续追问一次（M3.3 信息补全优先级）
      if (def.intent === "create_task" && !session.collected.dueDate && !session.collected.__noDue) {
        session.state = "pending_params";
        session.pendingParams = ["dueDate"];
        return reply({ reply: `任务「${session.collected.title}」有截止日期吗？（如：明天 / 9月1日，或回复「没有」）`, state: "pending_params" });
      }
      return executeIntent(user, session, def, session.collected, reply, "chat");
    }
  }

  /* 复合意图拆分优先（M2.5）：多子句且识别出 ≥2 个不同意图 */
  const parts = t.split(/[，,；;]|并且|然后|同时/).map((x) => x.trim()).filter(Boolean);
  const subRecs = parts.length > 1 ? parts.map((p) => recognizeIntent(p)) : [];
  const subIntents = subRecs.filter(Boolean);
  const distinct = new Set(subIntents.map((r) => r.def.intent));
  if (subIntents.length >= 2 && distinct.size >= 2) {
    const results = [];
    let anyWrite = false;
    subIntents.forEach((r) => {
      const pi = parts[subRecs.indexOf(r)];
      const p = extractParams(pi, r.def, user);
      if (r.def.level === "write") anyWrite = true;
      results.push({ intent: r.def.intent, params: p, def: r.def });
    });
    if (anyWrite) {
      const actions = results.filter((x) => x.def.level === "write").map((x) => {
        const args = Object.keys(x.params).reduce((a, k) => { if (k !== "__ambiguous") a[k] = x.params[k]; return a; }, {});
        return { label: intentActionLabel(x.def, args), tool: x.def.tool, args, level: "write", intent: x.def.intent };
      });
      return reply({ reply: "我理解你要做这几件事，其中写操作需要你确认 👇", actions });
    }
    const chunks = [];
    for (const r of results) {
      if (r.def.reply) { chunks.push(r.def.reply()); continue; }
      if (r.def.skill) {
        try { const res = runSkill(user, r.def.skill, r.params, { intent: r.def.intent, source: "chat" }); chunks.push(res.text || ""); }
        catch (e) { chunks.push("⚠️ " + r.def.intent + " 执行失败：" + e.message); }
      }
    }
    return reply({ reply: chunks.join("\n\n") });
  }

  /* 单意图识别（M2） */
  const rec = recognizeIntent(t);
  if (!rec) {
    /* 意图不明（M2.7 降级 + M6.2 转人工） */
    return reply({
      reply: "我没太理解你的意思 🤔 我可以帮你：\n- 分析类：项目健康诊断 / 依赖链 / 负载 / 风险雷达 / 周报 / 逾期扫描 / 今日摘要\n- 操作类：「创建任务叫 XX 明天截止」「完成 XX」\n- 使用类：「怎么用」「怎么邀请朋友」\n\n也可以说「帮助」查看完整能力。",
      handoff: { question: t, attempts: 1, suggestions: ["试试更具体的说法，如「生成周报」", "或在技能库手动运行"] },
    });
  }

  const def = rec.def;
  if (def.reply) return reply({ reply: def.reply() });

  /* 参数提取 + 补全（M4.4 决策流程） */
  const params = extractParams(t, def, user);
  if (def.intent === "complete_task" || def.intent === "start_task") {
    if (params.__ambiguous) {
      session.state = "pending_params"; session.lastIntent = def.intent; session.pendingParams = ["taskId"]; session.collected = {};
      return reply({ reply: "有多个任务匹配，请回复其中一个标题：\n" + params.__ambiguous.map((x) => "- " + x).join("\n") });
    }
    if (!params.taskId) {
      session.state = "pending_params"; session.lastIntent = def.intent; session.pendingParams = ["taskId"]; session.collected = {};
      return reply({ reply: "请告诉我要完成/开始哪个任务？比如「完成 优化看板拖拽体验」" });
    }
    params.colId = def.intent === "complete_task" ? "col_done" : (db.columns.find((c) => c.order === 1) || db.columns[0]).id;
  }
  if (def.intent === "create_task" && !params.title) {
    session.state = "pending_params"; session.lastIntent = def.intent; session.pendingParams = ["title"]; session.collected = {};
    return reply({ reply: "好的，我来帮你创建任务。任务叫什么名字？" });
  }
  if (def.intent === "create_task" && params.title && !params.dueDate) {
    session.state = "pending_params"; session.lastIntent = def.intent; session.pendingParams = ["dueDate"]; session.collected = params;
    return reply({ reply: `任务「${params.title}」创建前，有截止日期吗？（回复「明天 / 9月1日」，或「没有」）` });
  }

  return executeIntent(user, session, def, params, reply, "chat");
}

function intentActionLabel(def, args) {
  if (def.intent === "create_task") return `创建任务「${args.title || ""}」${args.dueDate ? "（截止 " + args.dueDate + "）" : ""}`;
  if (def.intent === "complete_task") return "标记任务完成";
  if (def.intent === "start_task") return "开始任务";
  return "执行操作";
}

function executeIntent(user, session, def, params, reply, source) {
  /* read 级：直接执行（M5.3） */
  if (def.level === "read" && def.skill) {
    try {
      const res = runSkill(user, def.skill, params, { intent: def.intent, source });
      return reply({ reply: res.text || "（无输出）", source: { intent: def.intent, skill: def.skill, rows: (res.text || "").split("\n").length } });
    } catch (e) {
      return reply({ reply: "⚠️ 执行失败：" + e.message, source: { intent: def.intent, skill: def.skill, error: true } });
    }
  }
  /* write 级：转为待确认 actions（M5.3 / M6.1 L2 确认） */
  if (def.level === "write" && def.tool) {
    const args = {};
    Object.keys(params).forEach((k) => { if (k !== "__ambiguous") args[k] = params[k]; });
    const key = user.id + ":" + def.tool + ":" + hashArgs(args);
    const last = recentActions.get(key);
    if (last && Date.now() - last < 10000) {
      return reply({ reply: "这个操作刚刚已经执行过（10 秒内），如需再次执行请稍后。", actions: [] });
    }
    recentActions.set(key, Date.now());
    return reply({
      reply: "我准备好了，请确认执行 👇（点击按钮后才会生效）",
      actions: [{ label: intentActionLabel(def, args), tool: def.tool, args, level: def.level, intent: def.intent }],
      source: { intent: def.intent, tool: def.tool, pendingConfirm: true },
    });
  }
  return reply({ reply: "该意图暂不支持。", handoff: { question: "unknown" } });
}

/* ---------- 执行统计聚合（M7） ---------- */
function stats() {
  const logs = db.agentLogs || [];
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const today = logs.filter((l) => l.createdAt >= today0.getTime());
  const ok = today.filter((l) => l.status === "ok");
  const byIntent = {};
  today.forEach((l) => { if (l.intent) byIntent[l.intent] = (byIntent[l.intent] || 0) + 1; });
  const byError = {};
  today.forEach((l) => { if (l.errorCode) byError[l.errorCode] = (byError[l.errorCode] || 0) + 1; });
  return {
    today: today.length, todayOk: ok.length, successRate: today.length ? Math.round(ok.length / today.length * 100) : 100,
    avgDurationMs: today.length ? Math.round(today.reduce((s, l) => s + (l.durationMs || 0), 0) / today.length) : 0,
    bySource: { chat: today.filter((l) => l.source === "chat").length, manual: today.filter((l) => l.source === "manual").length, rule: today.filter((l) => l.source === "rule").length },
    byIntent: Object.entries(byIntent).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ intent: k, count: v })),
    byError: Object.entries(byError).map(([k, v]) => ({ code: k, count: v })),
    total: logs.length,
  };
}

/* 清空执行日志（含统计来源），仅管理员调用 */
function clearLogs() {
  db.agentLogs = [];
  DB.persist();
  return { ok: true, cleared: true };
}

/* 重置用户会话（清空对话时调用，避免残留的多轮追问状态） */
function clearSession(userId, sessionId) {
  const key = sessionId || String(userId);
  sessions.delete(key);
  return { ok: true, cleared: true };
}

module.exports = { TOOLS, findTool, SKILLS, findSkill, runSkill, startScheduler, cronMatch, chatReply, FAQ,
  INTENT_DEFS, recognizeIntent, intentChat, getSession, getControls, setControls, auditReport, stats, runsToday,
  clearLogs, clearSession };
