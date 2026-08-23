/* ============================================================
   灵犀工作台 · 视图层：8 个核心视图 + 笔记详情
   ============================================================ */
"use strict";

/* ---------- 全局计时器 ---------- */
const Timer = (() => {
  const KEY = "lingxi-timer";
  let taskId = null, running = false, startTs = 0, accMs = 0, tickId = null, el = null;

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify({ taskId, running, startTs, accMs })); } catch (e) {}
  }
  function restore() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d) { taskId = d.taskId; running = d.running; startTs = d.startTs; accMs = d.accMs; }
    } catch (e) {}
  }
  restore();

  function elapsed() { return accMs + (running ? Date.now() - startTs : 0); }
  function fmt() {
    const s = Math.floor(elapsed() / 1000);
    return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
  function tick() {
    if (el) el.textContent = fmt();
  }
  function start(id) {
    if (id !== undefined) taskId = id;
    if (running) return;
    running = true; startTs = Date.now();
    tickId = setInterval(tick, 500);
    persist();
  }
  function pause() {
    if (!running) return;
    accMs += Date.now() - startTs; running = false;
    clearInterval(tickId); tickId = null;
    persist();
  }
  function stop() {
    const total = elapsed();
    if (total >= 1000) {
      const minutes = Math.max(1, Math.round(total / 60000));
      // 异步落库，不阻塞
      App.DB.createTimeLog({ taskId: taskId || null, minutes, date: App.todayStr(), note: "专注计时" }).catch(() => {});
    }
    accMs = 0; running = false; taskId = null; startTs = 0;
    clearInterval(tickId); tickId = null;
    persist();
    return total;
  }
  function bindEl(displayEl) { el = displayEl; tick(); }
  return { start, pause, stop, fmt, get running() { return running; }, get taskId() { return taskId; }, bindEl };
})();

/* ---------- 公共渲染辅助 ---------- */
const v = {
  pri(level) {
    const p = App.PRIORITY[level] || App.PRIORITY.mid;
    return `<span class="pri ${p.cls}">${p.label}</span>`;
  },
  due(s) {
    if (!s) return "";
    const d = App.daysUntil(s);
    let cls = "";
    if (d !== null && d < 0) cls = "overdue";
    return `<span class="k-due ${cls}">${App.ICONS.calendar}<span>${App.fmtDate(s)}${d !== null && d < 0 ? " · 已逾期" : ""}</span></span>`;
  },
  proj(p) {
    if (!p) return "";
    return `<span class="k-proj"><span class="proj-dot" style="background:${p.color}"></span><span>${App.escapeHtml(p.name)}</span></span>`;
  },
  empty(icon, title, desc, btnHtml = "") {
    return `<div class="empty pop-in">${App.ICONS[icon] || App.ICONS.inbox}<div class="empty-title">${App.escapeHtml(title)}</div><div class="empty-desc">${App.escapeHtml(desc)}</div>${btnHtml}</div>`;
  },
  avatar(name) {
    return `<span class="avatar">${App.escapeHtml((name || "我").slice(0, 1))}</span>`;
  },
};
window.App.v = v;

/* 任务勾选切换（跨视图复用） */
async function toggleTaskDone(taskId) {
  const S = App.DB.state;
  const t = S.tasks.find((x) => x.id === taskId);
  if (!t) return;
  let colId;
  if (t.colId === "col_done") {
    colId = (S.columns[1] || S.columns[0]).id;
    App.UI.toast("已恢复为进行中");
  } else {
    colId = "col_done";
    App.UI.toast("任务已完成 🎉");
  }
  try {
    await App.DB.updateTask(t.id, { colId });
  } catch (e) { App.UI.toast(e.message, "error"); }
  App.render();
}

/* ============================================================
   视图：我的工作台
   ============================================================ */
const dashboardView = {
  render() {
    const S = App.DB.state;
    const today = App.todayStr();
    const todayTasks = S.tasks.filter((t) => t.dueDate === today && t.colId !== "col_done");
    const doingTasks = S.tasks.filter((t) => t.colId !== "col_done").sort((a, b) => (a.dueDate || "9999") < (b.dueDate || "9999") ? -1 : 1);
    const overdue = S.tasks.filter((t) => t.dueDate && t.dueDate < today && t.colId !== "col_done");
    const doneCnt = S.tasks.filter((t) => t.colId === "col_done").length;
    const week = App.Stats.weekTime();
    const weekMin = week.reduce((s, x) => s + x.minutes, 0);
    const todayMin = App.Stats.timeOn(today);
    const goals = S.goals.map((g) => ({ g, p: App.Stats.goalProgress(g) })).sort((a, b) => b.p - a.p).slice(0, 3);
    const userName = (S.user && S.user.displayName) || "朋友";
    const hour = new Date().getHours();
    const greet = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";

    const todayList = todayTasks.length
      ? todayTasks.map((t) => taskRowHtml(t, true)).join("")
      : `<div class="muted small" style="padding:14px 4px">今天没有到期的任务，享受从容的一天 ☕</div>`;

    const doingList = doingTasks.length
      ? doingTasks.slice(0, 6).map((t) => taskRowHtml(t)).join("")
      : `<div class="muted small" style="padding:14px 4px">没有进行中的任务，开始第一件事吧</div>`;

    const goalHtml = goals.length ? goals.map(({ g, p }) => `
      <div class="list-item" data-goal="${g.id}">
        <span class="goal-icon" style="background:var(--accent-soft);color:${g.color}">${App.ICONS.target}</span>
        <div class="flex-1" style="min-width:0">
          <div class="li-title ellipsis">${App.escapeHtml(g.title)}</div>
          <div class="flex gap-8 mt-4">
            <div class="progress flex-1" style="min-width:70px"><i style="width:${p}%"></i></div>
            <span class="small muted mono">${p}%</span>
          </div>
        </div>
      </div>`).join("")
      : `<div class="muted small" style="padding:14px 4px">还没有目标，去设立一个吧</div>`;

    const notes = S.notes.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt).slice(0, 3);

    return `
    <div class="view">
      <div class="page-head">
        <div>
          <div class="page-title">${greet}，${App.escapeHtml(userName)} 👋</div>
          <div class="page-desc">${App.fmtDate(today)} · 把今天最重要的事，做成今天完成的事</div>
        </div>
        <div class="page-actions">
          <button class="btn" data-act="new-log">${App.ICONS.clock}记录时间</button>
          <button class="btn" data-act="new-note">${App.ICONS.note}记笔记</button>
          <button class="btn btn-primary" data-act="new-task">${App.ICONS.plus}新建任务</button>
        </div>
      </div>

      <div class="grid grid-4 mb-16">
        <div class="card card-hover stat-card" style="--glow:var(--primary-soft)">
          <div class="stat-icon" style="background:var(--primary-soft);color:var(--primary)">${App.ICONS.task}</div>
          <div class="stat-num">${todayTasks.length}</div>
          <div class="stat-label">今日待办</div>
          ${overdue.length ? `<div class="stat-trend trend-down">${overdue.length} 项已逾期</div>` : `<div class="stat-trend trend-up">没有逾期 · 很好</div>`}
        </div>
        <div class="card card-hover stat-card" style="--glow:var(--success-soft)">
          <div class="stat-icon" style="background:var(--success-soft);color:var(--success)">${App.ICONS.check}</div>
          <div class="stat-num">${doneCnt}</div>
          <div class="stat-label">累计完成</div>
          <div class="stat-trend trend-up">${S.tasks.length ? Math.round(doneCnt / S.tasks.length * 100) : 0}% 完成率</div>
        </div>
        <div class="card card-hover stat-card" style="--glow:var(--warning-soft)">
          <div class="stat-icon" style="background:var(--warning-soft);color:var(--warning)">${App.ICONS.timer}</div>
          <div class="stat-num">${App.fmtDurShort(weekMin)}</div>
          <div class="stat-label">本周专注</div>
          <div class="stat-trend trend-up">今日 ${App.fmtDurShort(todayMin)}</div>
        </div>
        <div class="card card-hover stat-card" style="--glow:var(--accent-soft)">
          <div class="stat-icon" style="background:var(--accent-soft);color:var(--accent)">${App.ICONS.award}</div>
          <div class="stat-num">${goals.length}</div>
          <div class="stat-label">进行中目标</div>
          <div class="stat-trend">${goals.length ? "平均 " + Math.round(goals.reduce((s, x) => s + x.p, 0) / goals.length) + "% 进度" : "去设立目标"}</div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns:1.6fr 1fr;gap:16px">
        <div>
          <div class="section">
            <div class="section-head">
              <span class="section-title">今日任务</span>
              <span class="section-sub">今天到期 · ${todayTasks.length} 项</span>
              <span class="section-more" data-act="go-tasks">查看全部 →</span>
            </div>
            <div class="card card-pad">
              <div class="list">${todayList}</div>
            </div>
          </div>
          <div class="section">
            <div class="section-head">
              <span class="section-title">进行中</span>
              <span class="section-sub">未完成任务</span>
              <span class="section-more" data-act="go-tasks">全部任务 →</span>
            </div>
            <div class="card card-pad">
              <div class="list">${doingList}</div>
            </div>
          </div>
        </div>
        <div>
          <div class="section">
            <div class="section-head">
              <span class="section-title">本周专注</span>
              <span class="section-sub">最近 7 天</span>
              <span class="section-more" data-act="go-timetrack">详情 →</span>
            </div>
            <div class="card card-pad">
              ${weekBarsHtml(week, "slim")}
              <div class="flex mt-12" style="justify-content:space-between">
                <span class="small muted">本周累计 <b class="mono">${App.fmtDur(weekMin)}</b></span>
                <button class="btn btn-sm" data-act="go-timetrack">${App.ICONS.play}开始专注</button>
              </div>
            </div>
          </div>
          <div class="section">
            <div class="section-head">
              <span class="section-title">目标进度</span>
              <span class="section-more" data-act="go-goals">全部 →</span>
            </div>
            <div class="card card-pad">
              <div class="list">${goalHtml}</div>
            </div>
          </div>
          <div class="section">
            <div class="section-head">
              <span class="section-title">最近笔记</span>
              <span class="section-more" data-act="go-notes">知识库 →</span>
            </div>
            <div class="card card-pad">
              ${notes.length ? notes.map((n) => `
                <div class="list-item" data-note="${n.id}">
                  <span class="proj-dot" style="background:${n.pinned ? "var(--warning)" : "var(--primary)"}"></span>
                  <div class="flex-1" style="min-width:0">
                    <div class="li-title ellipsis">${App.escapeHtml(n.title)}</div>
                    <div class="li-sub">${App.escapeHtml(n.category)} · 更新于 ${App.fmtDate(App.dateStr(new Date(n.updatedAt || n.createdAt)))}</div>
                  </div>
                </div>`).join("") : `<div class="muted small" style="padding:10px 4px">知识库空空如也</div>`}
            </div>
          </div>
        </div>
      </div>
    </div>`;
  },

  bind(el) {
    el.querySelectorAll("[data-task]").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-check]")) { toggleTaskDone(row.dataset.task); return; }
        const t = App.DB.state.tasks.find((x) => x.id === row.dataset.task);
        if (t) openTaskModal(t);
      });
    });
    el.querySelectorAll("[data-goal]").forEach((row) => row.addEventListener("click", () => App.Router.go("goals")));
    el.querySelectorAll("[data-note]").forEach((row) => row.addEventListener("click", () => App.Router.go("note", row.dataset.note)));
    el.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
      const a = b.dataset.act;
      if (a === "new-task") openTaskModal(null);
      else if (a === "new-note") openNoteModal(null);
      else if (a === "new-log") openLogModal();
      else if (a === "go-tasks") App.Router.go("tasks");
      else if (a === "go-timetrack") App.Router.go("timetrack");
      else if (a === "go-goals") App.Router.go("goals");
      else if (a === "go-notes") App.Router.go("notes");
    }));
  },
};

/* 任务行（dashboard / tasks 复用） */
function taskRowHtml(t, showDue = false) {
  const S = App.DB.state;
  const p = S.projects.find((x) => x.id === t.projectId);
  const done = t.colId === "col_done";
  const mins = App.Stats.taskTime(t);
  return `
    <div class="list-item" data-task="${t.id}">
      <span class="check ${done ? "on" : ""}" data-check>${App.ICONS.check}</span>
      <div class="flex-1" style="min-width:0">
        <div class="li-title ellipsis" style="${done ? "text-decoration:line-through;color:var(--text-3)" : ""}">${App.escapeHtml(t.title)}</div>
        <div class="li-sub flex gap-8 flex-wrap" style="margin-top:2px">
          ${p ? `<span class="flex gap-4"><span class="proj-dot" style="background:${p.color}"></span>${App.escapeHtml(p.name)}</span>` : ""}
          ${t.tags && t.tags.length ? t.tags.map((g) => `<span class="tag tag-gray">#${App.escapeHtml(g)}</span>`).join("") : ""}
        </div>
      </div>
      ${showDue ? v.due(t.dueDate) : ""}
      ${mins ? `<span class="small muted mono">${App.fmtDurShort(mins)}</span>` : ""}
      ${v.pri(t.priority)}
    </div>`;
}

/* 周条形图（timetrack / dashboard 复用） */
function weekBarsHtml(week, mode = "") {
  const max = Math.max(...week.map((x) => x.minutes), 1);
  return `<div class="bars">
    ${week.map((x) => {
      const h = Math.round((x.minutes / max) * 100);
      return `<div class="bar-col">
        <span class="bar-val">${x.minutes ? Math.round(x.minutes / 60 * 10) / 10 : ""}</span>
        <div class="bar ${x.minutes ? "" : "empty-bar"}" style="height:${Math.max(h, x.minutes ? 8 : 3)}%"></div>
        <span class="bar-label">${x.label}</span>
      </div>`;
    }).join("")}
  </div>`;
}

/* ============================================================
   视图：项目
   ============================================================ */
const projectsView = {
  render() {
    const S = App.DB.state;
    const projects = S.projects.filter((p) => p.status !== "archived");
    const archived = S.projects.filter((p) => p.status === "archived");
    const cards = (list) => list.map((p) => {
      const canDel = S.isAdmin || !!(S.user && S.members && S.members.some((m) => m.projectId === p.id && m.userId === S.user.id && m.role === "owner"));
      const tasks = S.tasks.filter((t) => t.projectId === p.id);
      const done = tasks.filter((t) => t.colId === "col_done").length;
      const prog = App.Stats.projectProgress(p.id);
      const mins = tasks.reduce((s, t) => s + App.Stats.taskTime(t), 0);
      return `
      <div class="card card-hover" data-proj="${p.id}" style="cursor:pointer;padding:20px;display:flex;flex-direction:column;gap:12px">
        <div class="flex">
          <span class="proj-dot" style="width:14px;height:14px;border-radius:5px;background:${p.color}"></span>
          <div class="flex-1" style="min-width:0">
            <div class="li-title ellipsis" style="font-size:14.5px">${App.escapeHtml(p.name)}</div>
          </div>
          <div class="row-actions">
            <button class="row-btn" data-edit>${App.ICONS.edit}</button>
            ${canDel ? `<button class="row-btn danger" data-del>${App.ICONS.trash}</button>` : ""}
          </div>
        </div>
        <div class="small muted" style="min-height:38px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${App.escapeHtml(p.desc || "暂无描述")}</div>
        <div>
          <div class="flex gap-12" style="justify-content:space-between">
            <span class="small muted">${tasks.length} 个任务 · ${done} 已完成</span>
            <span class="small mono" style="font-weight:700">${prog}%</span>
          </div>
          <div class="progress mt-8"><i style="width:${prog}%"></i></div>
        </div>
        <div class="flex">
          <span class="tag tag-gray">${App.ICONS.timer}${mins ? " " + App.fmtDurShort(mins) : " 暂无计时"}</span>
          <span class="right small muted">${App.fmtDate(App.dateStr(new Date(p.createdAt)))}创建</span>
        </div>
      </div>`;
    }).join("");

    return `
    <div class="view">
      <div class="page-head">
        <div>
          <div class="page-title">项目</div>
          <div class="page-desc">${S.projects.length} 个项目 · 归档 ${archived.length} 个</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" data-act="new">${App.ICONS.plus}新建项目</button>
        </div>
      </div>
      ${S.projects.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">${cards(projects)}${archived.length ? cards(archived) : ""}</div>` : v.empty("project", "还没有项目", "创建一个项目，把所有任务装进一个清晰的空间。", `<button class="btn btn-primary" data-act="new">${App.ICONS.plus}新建项目</button>`)}
      ${archived.length ? `<div class="section-head mt-24"><span class="section-sub">已归档项目在列表底部以原样式展示</span></div>` : ""}
    </div>`;
  },

  bind(el) {
    el.querySelectorAll("[data-act=new]").forEach((b) => b.addEventListener("click", () => openProjectModal(null)));
    el.querySelectorAll("[data-proj]").forEach((card) => {
      const p = App.DB.state.projects.find((x) => x.id === card.dataset.proj);
      card.querySelector("[data-edit]").addEventListener("click", (e) => { e.stopPropagation(); openProjectModal(p); });
      const delBtn = card.querySelector("[data-del]");
      if (delBtn) delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = await App.UI.confirm({ title: "删除项目", text: `确定删除「${p.name}」吗？项目下的任务、评论、文件将全部删除。`, okText: "删除", danger: true });
        if (!ok) return;
        try {
          await App.DB.deleteProject(p.id);
          App.UI.toast("项目已删除"); App.render();
        } catch (err) {
          App.UI.toast(err.message || "删除失败", "error");
        }
      });
      card.addEventListener("click", (e) => {
        if (e.target.closest(".row-actions")) return;
        App.Router.go("tasks", `proj:${p.id}`);
      });
    });
  },
};

/* ============================================================
   视图：任务
   ============================================================ */
const tasksView = {
  filter: { col: "all", proj: "all", pri: "all" },
  mode: "list",
  selected: new Set(),

  render(param) {
    const S = App.DB.state;
    if (param && param.startsWith("proj:")) {
      this.filter.proj = param.slice(5);
      this.filter.col = "all";
      this.filter.pri = "all";
    }
    const f = this.filter;
    let tasks = S.tasks.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    if (f.col !== "all") tasks = tasks.filter((t) => t.colId === f.col);
    if (f.proj !== "all") tasks = tasks.filter((t) => (t.projectId || "none") === f.proj);
    if (f.pri !== "all") tasks = tasks.filter((t) => t.priority === f.pri);

    const projChips = `<option value="all">全部项目</option><option value="none">无项目</option>` +
      S.projects.map((p) => `<option value="${p.id}" ${f.proj === p.id ? "selected" : ""}>${App.escapeHtml(p.name)}</option>`).join("");

    const colName = (id) => { const c = S.columns.find((x) => x.id === id); return c ? c.name : id; };
    const priName = { high: "高", mid: "中", low: "低" };
    const userOpts = (() => {
      const map = new Map();
      if (S.user) map.set(S.user.id, `${S.user.displayName}（我）`);
      S.members.forEach((mm) => { if (mm.user && !map.has(mm.userId)) map.set(mm.userId, mm.user.displayName); });
      return [{ value: "", label: "未分配" }].concat([...map.entries()].map(([v, l]) => ({ value: v, label: l })));
    })();
    const userSel = (sel, tid) => userOpts.map((o) => `<option value="${o.value}" ${o.value === sel ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("");
    const msName = (id) => { const ms = S.milestones.find((x) => x.id === id); return ms ? ms.title : ""; };

    const tableRows = tasks.map((t) => `
      <tr data-task="${t.id}">
        <td style="width:34px"><input type="checkbox" data-batch="${t.id}" ${this.selected.has(t.id) ? "checked" : ""} style="width:16px;height:16px;accent-color:var(--primary)"></td>
        <td class="ellipsis" style="max-width:230px;cursor:pointer;font-weight:500" data-open>
          ${escapeHtml(t.title)}
          ${(t.dependencies || []).length ? `<span class="tag tag-accent" title="有 ${t.dependencies.length} 个前置任务">${App.ICONS.link}${t.dependencies.length}</span>` : ""}
        </td>
        <td><select data-f="priority" data-id="${t.id}" class="select" style="padding:4px 24px 4px 8px;font-size:12px">${["high", "mid", "low"].map((p) => `<option value="${p}" ${t.priority === p ? "selected" : ""}>${priName[p]}</option>`).join("")}</select></td>
        <td><select data-f="colId" data-id="${t.id}" class="select" style="padding:4px 24px 4px 8px;font-size:12px">${S.columns.map((c) => `<option value="${c.id}" ${t.colId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}</select></td>
        <td><select data-f="assigneeId" data-id="${t.id}" class="select" style="padding:4px 24px 4px 8px;font-size:12px;max-width:110px">${userSel(t.assigneeId || "", t.id)}</select></td>
        <td><input type="date" data-f="dueDate" data-id="${t.id}" value="${escapeHtml(t.dueDate || "")}" style="border:none;background:transparent;font-size:12px;color:var(--text);width:110px"></td>
        <td>${t.milestoneId ? `<span class="tag tag-teal">${escapeHtml(msName(t.milestoneId))}</span>` : `<span class="muted small">—</span>`}</td>
      </tr>`).join("");

    const batchBar = `
    <div class="batch-bar" data-batchbar ${this.selected.size ? "" : "hidden"}>
      <b style="color:var(--primary)">已选 <span data-batchcount>${this.selected.size}</span> 项</b>
      <span class="small muted">批量：</span>
      <select class="select" data-batchact="colId" style="padding:5px 24px 5px 9px;font-size:12px"><option value="">状态…</option>${S.columns.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select>
      <select class="select" data-batchact="priority" style="padding:5px 24px 5px 9px;font-size:12px"><option value="">优先级…</option><option value="high">高</option><option value="mid">中</option><option value="low">低</option></select>
      <select class="select" data-batchact="assigneeId" style="padding:5px 24px 5px 9px;font-size:12px"><option value="">负责人…</option>${userOpts.slice(1).map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join("")}</select>
      <button class="btn btn-sm btn-danger" data-batchdel>${App.ICONS.trash}删除</button>
      <button class="btn btn-sm" data-batchclear>取消选择</button>
    </div>`;

    const rows = tasks.map((t) => taskRowHtml(t, true)).join("");

    return `
    <div class="view">
      <div class="page-head">
        <div>
          <div class="page-title">任务</div>
          <div class="page-desc">共 ${tasks.length} 项 · 点击任意任务即可编辑</div>
        </div>
        <div class="page-actions">
          <button class="btn" data-act="board">${App.ICONS.kanban}看板视图</button>
          <button class="btn btn-primary" data-act="new">${App.ICONS.plus}新建任务</button>
        </div>
      </div>

      <div class="filter-bar">
        <span class="filter-chip ${this.mode === "list" ? "active" : ""}" data-mode="list">${App.ICONS.listIcon}列表</span>
        <span class="filter-chip ${this.mode === "table" ? "active" : ""}" data-mode="table">${App.ICONS.grid}表格（批量）</span>
        <span class="filter-chip ${f.col === "all" ? "active" : ""}" data-col="all">全部</span>
        <span class="filter-chip ${f.col === "col_todo" ? "active" : ""}" data-col="col_todo">待办</span>
        <span class="filter-chip ${f.col === "col_doing" ? "active" : ""}" data-col="col_doing">进行中</span>
        <span class="filter-chip ${f.col === "col_done" ? "active" : ""}" data-col="col_done">已完成</span>
        <select class="select" data-proj>${projChips}</select>
        <select class="select" data-pri>
          <option value="all" ${f.pri === "all" ? "selected" : ""}>全部优先级</option>
          <option value="high" ${f.pri === "high" ? "selected" : ""}>高</option>
          <option value="mid" ${f.pri === "mid" ? "selected" : ""}>中</option>
          <option value="low" ${f.pri === "low" ? "selected" : ""}>低</option>
        </select>
      </div>

      ${this.mode === "table" ? batchBar : ""}
      ${tasks.length
        ? (this.mode === "table"
            ? `<div class="card" style="overflow-x:auto;padding:6px"><table class="table"><thead><tr><th></th><th>任务</th><th>优先级</th><th>状态</th><th>负责人</th><th>截止</th><th>里程碑</th></tr></thead><tbody>${tableRows}</tbody></table></div>`
            : `<div class="card"><div class="list" style="padding:8px">${rows}</div></div>`)
        : v.empty("task", "没有符合条件的任务", "换个筛选条件，或新建一个任务。")}
    </div>`;
  },

  bind(el) {
    const S = App.DB.state;
    const updateBatchBar = () => {
      const bar = el.querySelector("[data-batchbar]");
      if (!bar) return;
      bar.hidden = this.selected.size === 0;
      const cnt = bar.querySelector("[data-batchcount]");
      if (cnt) cnt.textContent = this.selected.size;
    };
    el.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
      const a = b.dataset.act;
      if (a === "new") openTaskModal(null, { defaults: {} });
      else if (a === "board") App.Router.go("kanban");
    }));
    el.querySelectorAll("[data-mode]").forEach((c) => c.addEventListener("click", () => {
      this.mode = c.dataset.mode; this.selected.clear(); App.render();
    }));
    el.querySelectorAll("[data-col]").forEach((c) => c.addEventListener("click", () => {
      this.filter.col = c.dataset.col; App.render();
    }));
    el.querySelectorAll("[data-proj]").forEach((s) => s.addEventListener("change", () => {
      this.filter.proj = s.value; App.render();
    }));
    el.querySelectorAll("[data-pri]").forEach((s) => s.addEventListener("change", () => {
      this.filter.pri = s.value; App.render();
    }));
    el.querySelectorAll("[data-task]").forEach((row) => {
      if (row.tagName === "TR") {
        row.addEventListener("click", (e) => {
          if (e.target.closest("select,input,button")) return;
          const t = S.tasks.find((x) => x.id === row.dataset.task);
          if (t) openTaskModal(t);
        });
        return;
      }
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-check]")) { toggleTaskDone(row.dataset.task); return; }
        const t = S.tasks.find((x) => x.id === row.dataset.task);
        if (t) openTaskModal(t);
      });
    });

    /* 表格模式：单元格编辑 */
    el.querySelectorAll("[data-f]").forEach((c) => c.addEventListener("change", async () => {
      const id = c.dataset.id, f = c.dataset.f;
      const val = (f === "assigneeId" && !c.value) ? null : c.value;
      try { await App.DB.updateTask(id, { [f]: val }); App.UI.toast("已更新"); } catch (e) { App.UI.toast(e.message, "error"); }
    }));
    /* 批量选择与操作 */
    el.querySelectorAll("[data-batch]").forEach((c) => c.addEventListener("change", () => {
      if (c.checked) this.selected.add(c.dataset.batch); else this.selected.delete(c.dataset.batch);
      updateBatchBar();
    }));
    el.querySelectorAll("[data-batchact]").forEach((s) => s.addEventListener("change", async () => {
      const f = s.dataset.batchact;
      const val = (f === "assigneeId" && !s.value) ? null : s.value;
      let n = 0;
      for (const id of this.selected) {
        try { await App.DB.updateTask(id, { [f]: val }); n++; } catch (e) { /* 忽略单项失败 */ }
      }
      App.UI.toast(`已批量更新 ${n} 项`);
      this.selected.clear();
      App.render();
    }));
    const delBtn = el.querySelector("[data-batchdel]");
    if (delBtn) {
      delBtn.addEventListener("click", async () => {
        const n = this.selected.size;
        const ok = await App.UI.confirm({ title: "批量删除", text: `确定删除选中的 ${n} 个任务吗？关联评论/时间记录将一并删除。`, okText: "删除", danger: true });
        if (!ok) return;
        let done = 0;
        for (const id of this.selected) { try { await App.DB.deleteTask(id); done++; } catch (e) {} }
        App.UI.toast(`已删除 ${done} 项`);
        this.selected.clear();
        App.render();
      });
    }
    const clearBtn = el.querySelector("[data-batchclear]");
    if (clearBtn) clearBtn.addEventListener("click", () => { this.selected.clear(); App.render(); });
  },
};

/* ============================================================
   视图：看板
   ============================================================ */
const kanbanView = {
  dragTaskId: null,

  render() {
    const S = App.DB.state;
    const cols = S.columns.slice().sort((a, b) => a.order - b.order);
    const byCol = (cid) => S.tasks.filter((t) => t.colId === cid).sort((a, b) => (a.order || 0) - (b.order || 0));

    const colHtml = (c) => {
      const tasks = byCol(c.id);
      const cards = tasks.map((t) => {
        const p = S.projects.find((x) => x.id === t.projectId);
        const subs = (t.subtasks || []).filter((s) => s.done).length;
        const total = (t.subtasks || []).length;
        const mins = App.Stats.taskTime(t);
        // 依赖链阻塞检测：有未完成的前置任务
        const depIds = t.dependencies || [];
        const depBlocked = depIds.some((did) => { const dep = S.tasks.find((x) => x.id === did); return dep && dep.colId !== "col_done"; });
        const depTitles = depIds.map((did) => S.tasks.find((x) => x.id === did)).filter(Boolean).filter((x) => x.colId !== "col_done").map((x) => x.title);
        return `
        <div class="k-card ${depBlocked && t.colId !== "col_done" ? "k-blocked" : ""}" draggable="true" data-task="${t.id}" data-col="${c.id}">
          <div class="flex gap-4" style="margin-bottom:7px">
            ${v.pri(t.priority)}
            ${t.tags && t.tags.length ? t.tags.slice(0, 2).map((g) => `<span class="tag tag-gray">#${App.escapeHtml(g)}</span>`).join("") : ""}
            ${depIds.length ? `<span class="tag tag-accent" title="前置任务：${App.escapeHtml(depTitles.join("、") || "已全部完成")}">${App.ICONS.link}${depIds.length}</span>` : ""}
          </div>
          <div class="k-title">${App.escapeHtml(t.title)}</div>
          ${depBlocked && t.colId !== "col_done" ? `<div class="small" style="color:var(--danger);font-weight:600;margin-top:6px">⛔ 等待前置：${App.escapeHtml(depTitles.slice(0, 2).join("、"))}</div>` : ""}
          <div class="k-meta">
            ${p ? v.proj(p) : ""}
            ${v.due(t.dueDate)}
          </div>
          <div class="k-foot">
            ${total ? `<span class="k-sub">${App.ICONS.task}${subs}/${total}</span>` : ""}
            ${mins ? `<span class="k-sub">${App.ICONS.timer}${App.fmtDurShort(mins)}</span>` : ""}
            <span class="right row-actions" style="display:flex">
              <button class="row-btn" data-edit>${App.ICONS.edit}</button>
            </span>
          </div>
        </div>`;
      }).join("");
      return `
      <div class="kanban-col" data-col="${c.id}">
        <div class="kanban-col-head">
          <span class="dot" style="background:${c.color}"></span>
          <span class="col-name">${App.escapeHtml(c.name)}</span>
          <span class="col-count">${tasks.length}</span>
          <button class="row-btn" data-colmenu>${App.ICONS.more}</button>
        </div>
        <div class="kanban-col-body" data-dropzone>${cards}</div>
        <button class="col-add-btn" data-coladd>${App.ICONS.plus}添加任务</button>
      </div>`;
    };

    return `
    <div class="view">
      <div class="page-head">
        <div>
          <div class="page-title">看板</div>
          <div class="page-desc">拖拽卡片流转状态 · 点击卡片编辑详情</div>
        </div>
        <div class="page-actions">
          <button class="btn" data-act="new">${App.ICONS.plus}新建任务</button>
        </div>
      </div>
      <div class="kanban-wrap">
        ${cols.map(colHtml).join("")}
        <div class="kanban-col" style="border-style:dashed;background:transparent;justify-content:center;align-items:center;cursor:pointer" data-addcol>
          <div class="muted flex gap-8" style="font-weight:600">${App.ICONS.plus}添加列</div>
        </div>
      </div>
    </div>`;
  },

  bind(el) {
    const S = App.DB.state;
    const wrap = el.querySelector(".kanban-wrap");

    // 卡片点击 / 编辑
    el.querySelectorAll("[data-task]").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-edit]")) return;
        const t = S.tasks.find((x) => x.id === card.dataset.task);
        if (t) openTaskModal(t);
      });
      card.querySelector("[data-edit]").addEventListener("click", (e) => {
        e.stopPropagation();
        const t = S.tasks.find((x) => x.id === card.dataset.task);
        if (t) openTaskModal(t);
      });
    });

    // 拖拽
    wrap.addEventListener("dragstart", (e) => {
      const card = e.target.closest(".k-card");
      if (!card) return;
      this.dragTaskId = card.dataset.task;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.dataset.task);
    });
    wrap.addEventListener("dragend", (e) => {
      e.target.classList.remove("dragging");
      el.querySelectorAll(".kanban-col").forEach((c) => c.classList.remove("drop-target"));
      this.dragTaskId = null;
    });
    wrap.addEventListener("dragover", (e) => {
      const col = e.target.closest(".kanban-col[data-col]");
      if (!col) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.querySelectorAll(".kanban-col").forEach((c) => c.classList.remove("drop-target"));
      col.classList.add("drop-target");
    });
    wrap.addEventListener("drop", async (e) => {
      e.preventDefault();
      const col = e.target.closest(".kanban-col[data-col]");
      const taskId = e.dataTransfer.getData("text/plain") || this.dragTaskId;
      if (!col || !taskId) return;
      const t = S.tasks.find((x) => x.id === taskId);
      if (!t) return;
      const changed = t.colId !== col.dataset.col;
      if (!changed) { App.render(); return; }
      try {
        await App.DB.updateTask(taskId, { colId: col.dataset.col });
        App.UI.toast(col.dataset.col === "col_done" ? "任务已完成 🎉" : "已移动");
      } catch (err) { App.UI.toast(err.message, "error"); }
      App.render();
    });

    // 列菜单（重命名 / 清空 / 删除）
    el.querySelectorAll("[data-colmenu]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const col = btn.closest(".kanban-col");
        const c = S.columns.find((x) => x.id === col.dataset.col);
        if (!c) return;
        App.UI.dropdown(btn, [
          { label: "重命名列", icon: App.ICONS.edit, onClick: async () => {
            const name = prompt("列名称", c.name);
            if (name && name.trim()) {
              try { await App.DB.updateColumn(c.id, { name: name.trim() }); App.render(); } catch (err) { App.UI.toast(err.message, "error"); }
            }
          }},
          { label: "清空此列", icon: App.ICONS.trash, onClick: async () => {
            const cnt = S.tasks.filter((t) => t.colId === c.id).length;
            if (!cnt) { App.UI.toast("该列没有任务"); return; }
            const ok = await App.UI.confirm({ title: "清空列", text: `将「${c.name}」中的 ${cnt} 个任务移到「待办」列，确定？`, okText: "移走" });
            if (!ok) return;
            const target = (S.columns.find((x) => x.id !== c.id && x.order === 0) || S.columns[0]).id;
            try {
              const tasks = S.tasks.filter((t) => t.colId === c.id);
              for (const t of tasks) await App.DB.updateTask(t.id, { colId: target });
              App.UI.toast("已清空");
            } catch (err) { App.UI.toast(err.message, "error"); }
            App.render();
          }},
          { sep: true },
          { label: "删除列", icon: App.ICONS.close, danger: true, onClick: async () => {
            if (S.columns.length <= 1) { App.UI.toast("至少保留一列", "error"); return; }
            const cnt = S.tasks.filter((t) => t.colId === c.id).length;
            const ok = await App.UI.confirm({ title: "删除列", text: `删除「${c.name}」${cnt ? `，其中 ${cnt} 个任务将移到「待办」列` : ""}，确定？`, okText: "删除", danger: true });
            if (!ok) return;
            try { await App.DB.deleteColumn(c.id); App.UI.toast("列已删除"); } catch (err) { App.UI.toast(err.message, "error"); }
            App.render();
          }},
        ]);
      });
    });

    // 添加列
    el.querySelector("[data-addcol]").addEventListener("click", async () => {
      const name = prompt("新列名称", "");
      if (!name || !name.trim()) return;
      try { await App.DB.createColumn({ name: name.trim() }); App.UI.toast("列已添加"); } catch (err) { App.UI.toast(err.message, "error"); }
      App.render();
    });

    // 列内添加任务
    el.querySelectorAll("[data-coladd]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const col = btn.closest(".kanban-col");
        openTaskModal(null, { defaults: { colId: col.dataset.col } });
      });
    });

    el.querySelector("[data-act=new]").addEventListener("click", () => openTaskModal(null));
  },
};

/* ============================================================
   视图：时间追踪
   ============================================================ */
const timetrackView = {
  render() {
    const S = App.DB.state;
    const week = App.Stats.weekTime();
    const today = App.todayStr();
    const todayMin = App.Stats.timeOn(today);
    const totalMin = App.Stats.totalTime();
    const runningTask = Timer.taskId ? S.tasks.find((t) => t.id === Timer.taskId) : null;

    const logs = S.timeLogs.slice().sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).slice(0, 12);
    const taskName = (id) => { const t = S.tasks.find((x) => x.id === id); return t ? t.title : "未关联任务"; };

    return `
    <div class="view">
      <div class="page-head">
        <div>
          <div class="page-title">时间追踪</div>
          <div class="page-desc">记录专注时间 · 累计 ${App.fmtDur(totalMin)}</div>
        </div>
        <div class="page-actions">
          <button class="btn" data-act="new-log">${App.ICONS.plus}手动记录</button>
        </div>
      </div>

      <div class="grid" style="grid-template-columns:340px 1fr;gap:16px">
        <div class="card timer-card">
          <div class="stat-icon" style="width:44px;height:44px;border-radius:14px;background:var(--primary-soft);color:var(--primary);margin:0 auto;display:grid;place-items:center">${App.ICONS.timer}</div>
          <div class="timer-display" data-timer>${Timer.fmt()}</div>
          <div class="timer-label">
            ${Timer.running
              ? (runningTask ? `正在专注：「${App.escapeHtml(runningTask.title)}」` : "正在专注 · 未关联任务")
              : (Timer.taskId ? `已暂停 · 计时中` : "选择一个任务开始专注")}
          </div>
          <div class="timer-controls" style="flex-direction:column;gap:12px">
            <select class="select" data-timertask style="max-width:240px">
              <option value="">未关联任务</option>
              ${S.tasks.filter((t) => t.colId !== "col_done").map((t) => `<option value="${t.id}" ${Timer.taskId === t.id ? "selected" : ""}>${App.escapeHtml(t.title.length > 20 ? t.title.slice(0, 20) + "…" : t.title)}</option>`).join("")}
            </select>
            <div class="flex gap-12">
              ${Timer.running
                ? `<button class="timer-btn stop" data-timerpause title="暂停">${App.ICONS.pause}</button>`
                : `<button class="timer-btn play" data-timerstart title="开始">${App.ICONS.play}</button>`}
              <button class="timer-btn stop" data-timerstop title="停止并记录">${App.ICONS.stop}</button>
            </div>
          </div>
        </div>

        <div class="card card-pad">
          <div class="section-head" style="margin-bottom:8px">
            <span class="section-title">本周专注趋势</span>
            <span class="section-sub right">共 ${App.fmtDur(week.reduce((s, x) => s + x.minutes, 0))}</span>
          </div>
          ${weekBarsHtml(week)}
          <div class="grid grid-2 mt-16" style="gap:10px">
            <div class="card card-pad" style="padding:14px 16px;background:var(--surface-2);border:none">
              <div class="small muted">今日专注</div>
              <div class="stat-num" style="font-size:20px">${App.fmtDurShort(todayMin)}</div>
            </div>
            <div class="card card-pad" style="padding:14px 16px;background:var(--surface-2);border:none">
              <div class="small muted">日均专注（近7天）</div>
              <div class="stat-num" style="font-size:20px">${App.fmtDurShort(Math.round(week.reduce((s, x) => s + x.minutes, 0) / 7))}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="section mt-24">
        <div class="section-head">
          <span class="section-title">最近记录</span>
          <span class="section-sub">最近 12 条</span>
        </div>
        <div class="card card-pad">
          ${logs.length ? `<div>${logs.map((l) => `
            <div class="log-row">
              <span class="log-dur" style="color:var(--primary)">${App.fmtDurShort(l.minutes)}</span>
              <div class="flex-1" style="min-width:0">
                <div class="li-title ellipsis" style="font-size:13px;font-weight:500">${App.escapeHtml(taskName(l.taskId))}</div>
                ${l.note ? `<div class="li-sub">${App.escapeHtml(l.note)}</div>` : ""}
              </div>
              <span class="small muted">${App.fmtDate(l.date)}</span>
              <button class="row-btn danger" data-dellog="${l.id}">${App.ICONS.trash}</button>
            </div>`).join("")}</div>` : v.empty("timer", "暂无时间记录", "点击开始专注，或手动记录一笔时间。")}
        </div>
      </div>
    </div>`;
  },

  bind(el) {
    Timer.bindEl(el.querySelector("[data-timer]"));
    const taskSel = el.querySelector("[data-timertask]");

    // 注意：计时进行中时渲染的是「暂停」按钮，start 按钮不存在，需用可选链避免报错
    el.querySelector("[data-timerstart]")?.addEventListener("click", () => {
      Timer.start(taskSel.value || null);
      App.UI.toast("开始专注 ⏱️");
      App.render();
    });
    el.querySelector("[data-timerpause]")?.addEventListener("click", () => {
      Timer.pause();
      App.UI.toast("已暂停");
      App.render();
    });
    el.querySelector("[data-timerstop]").addEventListener("click", () => {
      const total = Timer.stop();
      App.UI.toast(total >= 60000 ? `已记录 ${App.fmtDur(Math.round(total / 60000))} 专注时间` : "计时太短，未记录");
      App.render();
    });
    taskSel.addEventListener("change", () => {
      if (!Timer.running) Timer.start(taskSel.value || null);
      else { Timer.pause(); Timer.start(taskSel.value || null); }
      App.render();
    });
    el.querySelector("[data-act=new-log]").addEventListener("click", () => openLogModal());
    el.querySelectorAll("[data-dellog]").forEach((b) => b.addEventListener("click", async () => {
      const ok = await App.UI.confirm({ title: "删除记录", text: "删除这条时间记录？", okText: "删除", danger: true });
      if (!ok) return;
      await App.DB.deleteTimeLog(b.dataset.dellog);
      App.UI.toast("已删除"); App.render();
    }));
  },
};

/* ============================================================
   视图：目标
   ============================================================ */
const goalsView = {
  render() {
    const S = App.DB.state;
    const cards = S.goals.map((g) => {
      const p = App.Stats.goalProgress(g);
      return `
      <div class="card card-hover goal-card" data-goal="${g.id}">
        <div class="goal-head">
          <span class="goal-icon" style="background:${g.color}1f;color:${g.color}">${App.ICONS.target}</span>
          <div class="flex-1" style="min-width:0">
            <div class="goal-title ellipsis">${App.escapeHtml(g.title)}</div>
            <div class="goal-meta">${g.dueDate ? "截止 " + App.fmtDate(g.dueDate) : "无截止日期"} · ${(g.krs || []).length} 个关键结果</div>
          </div>
          <div class="row-actions">
            <button class="row-btn" data-edit>${App.ICONS.edit}</button>
            <button class="row-btn danger" data-del>${App.ICONS.trash}</button>
          </div>
        </div>
        <div class="small muted" style="margin-bottom:14px">${App.escapeHtml(g.desc || "暂无描述")}</div>
        <div class="goal-progress-row">
          <div class="progress flex-1 progress-teal"><i style="width:${p}%"></i></div>
          <span class="goal-progress-num" style="color:${p >= 100 ? "var(--success)" : "var(--primary)"}">${p}%</span>
        </div>
        ${(g.krs || []).slice(0, 4).map((k) => `
          <div class="kr-item">
            <span class="check ${k.value >= 100 ? "on" : ""}">${App.ICONS.check}</span>
            <span class="kr-title ${k.value >= 100 ? "done" : ""}">${App.escapeHtml(k.title)}</span>
            <span class="kr-val">${k.value}%</span>
          </div>`).join("")}
      </div>`;
    }).join("");

    return `
    <div class="view">
      <div class="page-head">
        <div>
          <div class="page-title">目标</div>
          <div class="page-desc">用 OKR 的方式，让努力有方向</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" data-act="new">${App.ICONS.plus}新建目标</button>
        </div>
      </div>
      ${S.goals.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px">${cards}</div>` : v.empty("goal", "还没有目标", "设定一个目标，再拆解成可衡量的关键结果。", `<button class="btn btn-primary" data-act="new">${App.ICONS.plus}新建目标</button>`)}
    </div>`;
  },

  bind(el) {
    el.querySelectorAll("[data-act=new]").forEach((b) => b.addEventListener("click", () => openGoalModal(null)));
    el.querySelectorAll("[data-goal]").forEach((card) => {
      const g = App.DB.state.goals.find((x) => x.id === card.dataset.goal);
      card.querySelector("[data-edit]").addEventListener("click", (e) => { e.stopPropagation(); openGoalModal(g); });
      card.querySelector("[data-del]").addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = await App.UI.confirm({ title: "删除目标", text: `确定删除「${g.title}」吗？`, okText: "删除", danger: true });
        if (!ok) return;
        await App.DB.deleteGoal(g.id);
        App.UI.toast("目标已删除"); App.render();
      });
      card.addEventListener("click", (e) => {
        if (e.target.closest(".row-actions")) return;
        openGoalModal(g);
      });
    });
  },
};

/* ============================================================
   视图：知识库
   ============================================================ */
const notesView = {
  cat: "all",
  render() {
    const S = App.DB.state;
    let notes = S.notes.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
    const cats = [...new Set(notes.map((n) => n.category).filter(Boolean))];
    if (this.cat !== "all") notes = notes.filter((n) => n.category === this.cat);

    const cardHtml = (n) => `
      <div class="card card-hover note-card" data-note="${n.id}">
        ${n.pinned ? `<span class="note-pin">${App.ICONS.pin}</span>` : ""}
        <div class="note-title ellipsis">${App.escapeHtml(n.title)}</div>
        <div class="note-preview">${App.escapeHtml(App.mdPreview(n.content))}</div>
        <div class="note-foot">
          <span class="tag tag-primary">${App.escapeHtml(n.category || "随笔")}</span>
          <span class="right">${App.fmtDate(App.dateStr(new Date(n.updatedAt || n.createdAt)))}</span>
          <div class="row-actions">
            <button class="row-btn" data-edit>${App.ICONS.edit}</button>
            <button class="row-btn danger" data-del>${App.ICONS.trash}</button>
          </div>
        </div>
      </div>`;

    return `
    <div class="view">
      <div class="page-head">
        <div>
          <div class="page-title">知识库</div>
          <div class="page-desc">${S.notes.length} 篇笔记 · 支持 Markdown</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" data-act="new">${App.ICONS.plus}新建笔记</button>
        </div>
      </div>
      <div class="filter-bar">
        <span class="filter-chip ${this.cat === "all" ? "active" : ""}" data-cat="all">全部</span>
        ${cats.map((c) => `<span class="filter-chip ${this.cat === c ? "active" : ""}" data-cat="${App.escapeHtml(c)}">${App.escapeHtml(c)}</span>`).join("")}
      </div>
      ${notes.length ? `<div class="note-grid">${notes.map(cardHtml).join("")}</div>` : v.empty("note", "知识库空空如也", "把一闪而过的想法、读过的书、踩过的坑，都记在这里。", `<button class="btn btn-primary" data-act="new">${App.ICONS.plus}写下第一篇</button>`)}
    </div>`;
  },

  bind(el) {
    el.querySelectorAll("[data-act=new]").forEach((b) => b.addEventListener("click", () => openNoteModal(null)));
    el.querySelectorAll("[data-cat]").forEach((c) => c.addEventListener("click", () => {
      this.cat = c.dataset.cat; App.render();
    }));
    el.querySelectorAll("[data-note]").forEach((card) => {
      const n = App.DB.state.notes.find((x) => x.id === card.dataset.note);
      card.querySelector("[data-edit]").addEventListener("click", (e) => { e.stopPropagation(); openNoteModal(n); });
      card.querySelector("[data-del]").addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = await App.UI.confirm({ title: "删除笔记", text: `确定删除「${n.title}」吗？`, okText: "删除", danger: true });
        if (!ok) return;
        await App.DB.deleteNote(n.id);
        App.UI.toast("笔记已删除"); App.render();
      });
      card.addEventListener("click", (e) => {
        if (e.target.closest(".row-actions")) return;
        App.Router.go("note", n.id);
      });
    });
  },
};

/* ============================================================
   视图：笔记详情
   ============================================================ */
const noteView = {
  render(id) {
    const S = App.DB.state;
    const n = S.notes.find((x) => x.id === id);
    if (!n) return v.empty("note", "笔记不存在", "它可能已被删除。");
    return `
    <div class="view" style="max-width:860px">
      <div class="flex mb-16">
        <button class="btn btn-sm" data-back>${App.ICONS.chevronLeft}返回知识库</button>
        <span class="tag tag-primary">${App.escapeHtml(n.category || "随笔")}</span>
        ${n.pinned ? `<span class="tag tag-warning">${App.ICONS.pin}已置顶</span>` : ""}
        <div class="right flex gap-8">
          <button class="btn btn-sm" data-pin>${App.ICONS.pin}${n.pinned ? "取消置顶" : "置顶"}</button>
          <button class="btn btn-sm" data-edit>${App.ICONS.edit}编辑</button>
          <button class="btn btn-sm btn-danger" data-del>${App.ICONS.trash}删除</button>
        </div>
      </div>
      <h1 style="font-size:24px;margin-bottom:6px">${App.escapeHtml(n.title)}</h1>
      <div class="small muted mb-16">更新于 ${App.fmtDate(App.dateStr(new Date(n.updatedAt || n.createdAt)))}</div>
      <div class="card card-pad">
        <div class="note-body">${App.mdRender(n.content)}</div>
      </div>
    </div>`;
  },
  bind(el, id) {
    const n = App.DB.state.notes.find((x) => x.id === id);
    el.querySelector("[data-back]").addEventListener("click", () => App.Router.go("notes"));
    el.querySelector("[data-edit]").addEventListener("click", () => openNoteModal(n));
    el.querySelector("[data-pin]").addEventListener("click", async () => {
      try { await App.DB.updateNote(n.id, { pinned: !n.pinned }); App.UI.toast(n.pinned ? "已置顶" : "已取消置顶"); } catch (e) { App.UI.toast(e.message, "error"); }
      App.render();
    });
    el.querySelector("[data-del]").addEventListener("click", async () => {
      const ok = await App.UI.confirm({ title: "删除笔记", text: `确定删除「${n.title}」吗？`, okText: "删除", danger: true });
      if (!ok) return;
      await App.DB.deleteNote(id);
      App.UI.toast("笔记已删除"); App.Router.go("notes");
    });
  },
};

/* ============================================================
   视图：设置
   ============================================================ */
const settingsView = {
  render() {
    const S = App.DB.state;
    const theme = localStorage.getItem("lingxi-theme") || "light";
    return `
    <div class="view" style="max-width:760px">
      <div class="page-head">
        <div>
          <div class="page-title">设置</div>
          <div class="page-desc">个性化、数据与偏好</div>
        </div>
      </div>

      <div class="section">
        <div class="section-head"><span class="section-title">个人</span></div>
        <div class="card card-pad">
          <div class="field" style="margin-bottom:14px">
            <label>你的称呼</label>
            <div class="flex" style="align-items:flex-start">
              <input class="input" data-user style="max-width:260px" value="${App.escapeHtml(S.user ? S.user.displayName : "")}">
              <button class="btn btn-primary" data-saveuser>保存</button>
            </div>
            <div class="hint">将用于工作台的问候语与头像显示，其他成员也能看到</div>
          </div>
          <div class="field" style="margin-bottom:0">
            <label>邮箱</label>
            <div class="flex" style="align-items:flex-start">
              <input class="input" data-email style="max-width:260px" type="email" placeholder="you@example.com" value="${App.escapeHtml(S.user ? S.user.email || "" : "")}">
              <button class="btn btn-primary" data-saveemail>保存</button>
            </div>
            <div class="hint">填写后，配置 SMTP 的服务器会向该邮箱发送任务分配、评论等邮件通知</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-head"><span class="section-title">外观</span></div>
        <div class="card card-pad">
          <div class="flex gap-12">
            <div class="flex gap-4">
              <span class="filter-chip ${theme !== "dark" ? "active" : ""}" data-theme="light">${App.ICONS.sun}浅色</span>
              <span class="filter-chip ${theme === "dark" ? "active" : ""}" data-theme="dark">${App.ICONS.moon}深色</span>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-head"><span class="section-title">数据</span></div>
        <div class="card card-pad">
          <div class="flex gap-8 flex-wrap">
            <button class="btn" data-export>${App.ICONS.download}导出我的数据</button>
            <button class="btn" data-import>${App.ICONS.upload}导入我的数据</button>
            <button class="btn" data-importcsv>${App.ICONS.upload}导入任务 CSV</button>
            <button class="btn" data-exportcsv>${App.ICONS.download}导出任务 CSV</button>
            ${S.isAdmin ? `<button class="btn" data-seed>${App.ICONS.sparkles}填充示例数据</button>` : ""}
          </div>
          <div class="hint mt-8">CSV 表头格式：标题,描述,优先级,截止日期,开始日期,状态,负责人,标签,里程碑（优先级：高/中/低；状态：待办/进行中/已完成）</div>
        </div>
      </div>

      <div class="section">
        <div class="section-head"><span class="section-title">邮件通知</span><span class="section-sub">SMTP · ${S.mailEnabled ? "已启用" : "未启用"}</span></div>
        <div class="card card-pad">
          ${S.isAdmin ? `
          <div class="form-grid">
            <div class="field"><label>SMTP 服务器</label><input class="input" data-sm-h host placeholder="smtp.example.com"></div>
            <div class="field"><label>端口</label><input class="input" data-sm-port type="number" placeholder="25 / 465 / 587"></div>
            <div class="field"><label>用户名</label><input class="input" data-sm-user placeholder="登录账号"></div>
            <div class="field"><label>密码</label><input class="input" data-sm-pass type="password" placeholder="（留空不修改）"></div>
            <div class="field"><label>发件人地址</label><input class="input" data-sm-from placeholder="no-reply@example.com"></div>
            <div class="field"><label>加密</label>
              <div class="flex gap-8"><span class="filter-chip" data-sm-ssl="0">明文(25/587)</span><span class="filter-chip active" data-sm-ssl="1">SSL(465)</span></div>
            </div>
          </div>
          <div class="flex gap-8">
            <span class="filter-chip" data-sm-enable>启用邮件通知</span>
            <button class="btn btn-primary" data-sm-save>${App.ICONS.check}保存 SMTP</button>
            <button class="btn" data-sm-test>${App.ICONS.send || App.ICONS.check}发送测试邮件</button>
          </div>
          <div class="hint mt-8">配置后，任务分配、评论、项目邀请会通过 SMTP 发邮件（收件人需填写邮箱）。未配置时仅站内通知。</div>` : `<div class="muted small">仅管理员可配置 SMTP。配置后所有成员都能收到邮件通知。</div>`}
        </div>
      </div>

      <div class="section">
        <div class="section-head"><span class="section-title">关于</span></div>
        <div class="card card-pad">
          <div class="flex">
            <span class="brand-logo" style="width:42px;height:42px">${App.ICONS.logo}</span>
            <div>
              <div class="li-title" style="font-size:15px">灵犀工作台 <span class="tag tag-primary" style="vertical-align:2px">v2.2</span></div>
              <div class="small muted">前后端一体 · 多用户协作 · 数据自托管</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  },

  bind(el) {
    const S = App.DB.state;
    el.querySelectorAll("[data-theme]").forEach((c) => c.addEventListener("click", () => {
      localStorage.setItem("lingxi-theme", c.dataset.theme);
      document.documentElement.dataset.theme = c.dataset.theme;
      App.render();
    }));
    el.querySelector("[data-saveuser]").addEventListener("click", async () => {
      const v = el.querySelector("[data-user]").value.trim();
      if (!v) { App.UI.toast("称呼不能为空", "error"); return; }
      try {
        await API.post("/api/profile", { displayName: v });
        App.UI.toast("已保存");
        await App.DB.bootstrap();
        App.render();
      } catch (e) { App.UI.toast(e.message, "error"); }
    });
    const emailInput = el.querySelector("[data-email]");
    if (emailInput) {
      el.querySelector("[data-saveemail]").addEventListener("click", async () => {
        try {
          await API.post("/api/profile", { email: emailInput.value.trim() });
          App.UI.toast("邮箱已保存");
          await App.DB.bootstrap();
        } catch (e) { App.UI.toast(e.message, "error"); }
      });
    }

    /* CSV 导入导出 */
    const importCsvBtn = el.querySelector("[data-importcsv]");
    if (importCsvBtn) {
      importCsvBtn.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file"; input.accept = ".csv,text/csv";
        input.onchange = () => {
          const file = input.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const r = await App.DB.importCsv(reader.result, null);
              App.UI.toast(`导入完成：创建 ${r.created} 个任务${r.errors && r.errors.length ? "，跳过 " + r.errors.length + " 行" : ""}`);
              await App.DB.bootstrap();
              App.render();
            } catch (e) { App.UI.toast("导入失败：" + e.message, "error"); }
          };
          reader.readAsText(file);
        };
        input.click();
      });
    }
    const exportCsvBtn = el.querySelector("[data-exportcsv]");
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener("click", async () => {
        try {
          const csv = await App.DB.exportCsv();
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `任务导出-${App.todayStr()}.csv`;
          a.click();
          URL.revokeObjectURL(a.href);
          App.UI.toast("已导出 CSV");
        } catch (e) { App.UI.toast(e.message, "error"); }
      });
    }

    /* SMTP 邮件配置 */
    const smHost = el.querySelector("[data-sm-host]");
    if (smHost) {
      let ssl = 1, enabled = false;
      el.querySelectorAll("[data-sm-ssl]").forEach((c) => c.addEventListener("click", () => {
        ssl = +c.dataset.smSsl;
        el.querySelectorAll("[data-sm-ssl]").forEach((x) => x.classList.toggle("active", +x.dataset.smSsl === ssl));
      }));
      const enableChip = el.querySelector("[data-sm-enable]");
      enableChip.addEventListener("click", () => { enabled = !enabled; enableChip.classList.toggle("active", enabled); });
      el.querySelector("[data-sm-save]").addEventListener("click", async () => {
        try {
          await App.DB.saveMailConfig({
            enabled, host: smHost.value.trim(), port: el.querySelector("[data-sm-port]").value || (ssl ? 465 : 25),
            user: el.querySelector("[data-sm-user]").value.trim(), pass: el.querySelector("[data-sm-pass]").value,
            from: el.querySelector("[data-sm-from]").value.trim() || "no-reply@localhost", ssl,
          });
          App.UI.toast("SMTP 配置已保存");
          await App.DB.bootstrap();
          App.render();
        } catch (e) { App.UI.toast(e.message, "error"); }
      });
      el.querySelector("[data-sm-test]").addEventListener("click", async () => {
        try { await App.DB.testMail(); App.UI.toast("测试邮件已发送，请查收"); } catch (e) { App.UI.toast(e.message, "error"); }
      });
    }
    el.querySelector("[data-export]").addEventListener("click", () => {
      const dump = { version: 2, exportedAt: new Date().toISOString(), data: {
        goals: S.goals.filter((g) => g.userId === S.user.id),
        notes: S.notes.filter((n) => n.userId === S.user.id),
        clients: S.clients.filter((c) => c.userId === S.user.id || !c.projectId),
        tasks: S.tasks.filter((t) => !t.projectId),
        timeLogs: S.timeLogs.filter((l) => !l.taskId),
        events: S.events.filter((e) => !e.projectId),
      } };
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `灵犀工作台-我的数据-${App.todayStr()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      App.UI.toast("已导出备份文件");
    });
    el.querySelector("[data-import]").addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file"; input.accept = ".json,application/json";
      input.onchange = () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const parsed = JSON.parse(reader.result);
            const data = parsed.data || parsed;
            const r = await API.post("/api/import", { data });
            App.UI.toast(`导入完成：新增 ${r.count} 条数据`);
            await App.DB.bootstrap();
            App.render();
          } catch (e) {
            App.UI.toast("导入失败：" + (e.message || "文件格式不正确"), "error");
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });
    const seedBtn = el.querySelector("[data-seed]");
    if (seedBtn) {
      seedBtn.addEventListener("click", async () => {
        const ok = await App.UI.confirm({ title: "填充示例数据", text: "将生成一个示例项目与若干任务、目标、笔记，方便体验。", okText: "填充" });
        if (!ok) return;
        try {
          await API.post("/api/seed");
          App.UI.toast("示例数据已填充");
          await App.DB.bootstrap();
          App.render();
        } catch (e) { App.UI.toast(e.message, "error"); }
      });
    }
  },
};

/* ---------- 视图注册表（基础视图；扩展视图由 views-extra.js 注册） ---------- */
const Views = {
  dashboard: { title: "我的工作台", view: dashboardView },
  projects: { title: "项目", view: projectsView },
  tasks: { title: "任务", view: tasksView },
  kanban: { title: "看板", view: kanbanView },
  timetrack: { title: "时间追踪", view: timetrackView },
  goals: { title: "目标", view: goalsView },
  notes: { title: "知识库", view: notesView },
  settings: { title: "设置", view: settingsView },
  note: { title: "笔记", view: noteView },
};
