/* ============================================================
   灵犀工作台 · 扩展视图：甘特图 / 日历 / 客户 / 想法 / 画布 / 里程碑 / 文件 / 通知 / 回顾 / 报告
   原生 JS 实现，零外部依赖
   ============================================================ */
"use strict";

/* ================= 新弹窗 ================= */

function openClientModal(c) {
  const S = App.DB.state;
  const isNew = !c;
  const projOptions = [{ value: "", label: "个人客户" }].concat(S.projects.map((p) => ({ value: p.id, label: p.name })));
  const body = `
    <div class="field"><label>客户 / 联系人名称 <span class="req">*</span></label><input class="input" name="title" value="${escapeHtml(c ? c.title : "")}" placeholder="例如：某某公司 / 张老师"></div>
    <div class="form-grid">
      <div class="field"><label>所属组织</label><input class="input" name="org" value="${escapeHtml(c ? c.org || "" : "")}" placeholder="公司或机构"></div>
      <div class="field"><label>关联项目</label>${App.UI.selectHtml("projectId", projOptions, c ? c.projectId || "" : "")}</div>
      <div class="field"><label>邮箱</label><input class="input" name="email" value="${escapeHtml(c ? c.email || "" : "")}" placeholder="contact@example.com"></div>
      <div class="field"><label>电话</label><input class="input" name="phone" value="${escapeHtml(c ? c.phone || "" : "")}"></div>
    </div>
    <div class="field"><label>备注</label><textarea class="textarea" name="desc" rows="3" placeholder="合作背景、偏好等">${escapeHtml(c ? c.desc || "" : "")}</textarea></div>`;
  const footer = `${!isNew ? `<button class="btn btn-danger" data-del style="margin-right:auto">${App.ICONS.trash}删除</button>` : ""}<button class="btn" data-cancel>取消</button><button class="btn btn-primary" data-save>${App.ICONS.check}保存</button>`;
  const m = App.UI.modal({ title: isNew ? "新建客户" : "编辑客户", body, footer });
  const save = async () => {
    const title = m.body.querySelector("[name=title]").value.trim();
    if (!title) { App.UI.toast("请填写名称", "error"); return; }
    const data = { title, org: m.body.querySelector("[name=org]").value.trim(), projectId: m.body.querySelector("[name=projectId]").value || null,
      email: m.body.querySelector("[name=email]").value.trim(), phone: m.body.querySelector("[name=phone]").value.trim(), desc: m.body.querySelector("[name=desc]").value.trim() };
    try {
      if (isNew) await App.DB.clients.create(data); else await App.DB.clients.update(c.id, data);
      m.close(); App.UI.toast(isNew ? "客户已创建" : "客户已更新"); App.render();
    } catch (e) { App.UI.toast(e.message, "error"); }
  };
  m.foot.querySelector("[data-save]").addEventListener("click", save);
  m.foot.querySelector("[data-cancel]").addEventListener("click", () => m.close());
  if (!isNew) m.foot.querySelector("[data-del]").addEventListener("click", async () => {
    const ok = await App.UI.confirm({ title: "删除客户", text: `确定删除「${c.title}」吗？`, okText: "删除", danger: true });
    if (!ok) return;
    await App.DB.clients.remove(c.id); m.close(); App.UI.toast("已删除"); App.render();
  });
}

function openIdeaModal(idea, defaults = {}) {
  const S = App.DB.state;
  const isNew = !idea;
  const projOptions = [{ value: "", label: "个人想法" }].concat(S.projects.map((p) => ({ value: p.id, label: p.name })));
  const body = `
    <div class="field"><label>想法标题 <span class="req">*</span></label><input class="input" name="title" value="${escapeHtml(idea ? idea.title : "")}" placeholder="一个好主意…"></div>
    <div class="field"><label>想法描述</label><textarea class="textarea" name="desc" rows="4" placeholder="背景、价值、预期效果">${escapeHtml(idea ? idea.desc || "" : "")}</textarea></div>
    <div class="form-grid">
      <div class="field"><label>关联项目</label>${App.UI.selectHtml("projectId", projOptions, idea ? idea.projectId || "" : defaults.projectId || "")}</div>
      <div class="field"><label>状态</label>${App.UI.selectHtml("status", [{ value: "new", label: "新想法" }, { value: "doing", label: "评估中" }, { value: "adopted", label: "已采纳" }, { value: "closed", label: "已关闭" }], idea ? idea.status || "new" : "new")}</div>
    </div>`;
  const footer = `${!isNew ? `<button class="btn btn-danger" data-del style="margin-right:auto">${App.ICONS.trash}删除</button>` : ""}<button class="btn" data-cancel>取消</button><button class="btn btn-primary" data-save>${App.ICONS.check}保存</button>`;
  const m = App.UI.modal({ title: isNew ? "提出想法" : "编辑想法", body, footer });
  const save = async () => {
    const title = m.body.querySelector("[name=title]").value.trim();
    if (!title) { App.UI.toast("请填写标题", "error"); return; }
    const data = { title, desc: m.body.querySelector("[name=desc]").value.trim(), projectId: m.body.querySelector("[name=projectId]").value || null, status: m.body.querySelector("[name=status]").value };
    try {
      if (isNew) await App.DB.ideas.create(data); else await App.DB.ideas.update(idea.id, data);
      m.close(); App.UI.toast(isNew ? "想法已提交" : "想法已更新"); App.render();
    } catch (e) { App.UI.toast(e.message, "error"); }
  };
  m.foot.querySelector("[data-save]").addEventListener("click", save);
  m.foot.querySelector("[data-cancel]").addEventListener("click", () => m.close());
  if (!isNew) m.foot.querySelector("[data-del]").addEventListener("click", async () => {
    const ok = await App.UI.confirm({ title: "删除想法", text: `确定删除「${idea.title}」吗？`, okText: "删除", danger: true });
    if (!ok) return;
    await App.DB.ideas.remove(idea.id); m.close(); App.UI.toast("已删除"); App.render();
  });
}

function openCanvasModal(cv) {
  const S = App.DB.state;
  const isNew = !cv;
  const projOptions = S.projects.map((p) => ({ value: p.id, label: p.name }));
  const type = cv ? cv.type : "swot";
  const cells = App.CANVAS_TYPES[type].cells;
  const cellHtml = Object.keys(cells).map((k) => `
    <div class="field" style="margin-bottom:10px">
      <label>${cells[k]}</label>
      <textarea class="textarea" name="cell_${k}" rows="3" placeholder="${cells[k]}…">${escapeHtml(cv ? (cv.cells || {})[k] || "" : "")}</textarea>
    </div>`).join("");
  const body = `
    <div class="field"><label>关联项目 <span class="req">*</span></label>${App.UI.selectHtml("projectId", projOptions, cv ? cv.projectId : "")}</div>
    <div class="field"><label>画布类型</label>
      <div class="flex gap-8">
        ${Object.keys(App.CANVAS_TYPES).map((t) => `<span class="filter-chip ${type === t ? "active" : ""}" data-type="${t}">${App.CANVAS_TYPES[t].label}</span>`).join("")}
      </div>
    </div>
    <div data-cells>${cellHtml}</div>`;
  const footer = `${!isNew ? `<button class="btn btn-danger" data-del style="margin-right:auto">${App.ICONS.trash}删除</button>` : ""}<button class="btn" data-cancel>取消</button><button class="btn btn-primary" data-save>${App.ICONS.check}保存</button>`;
  const m = App.UI.modal({ title: isNew ? "新建画布" : "编辑画布", body, footer, width: "wide" });
  let curType = type;
  m.body.querySelectorAll("[data-type]").forEach((chip) => chip.addEventListener("click", () => {
    curType = chip.dataset.type;
    m.body.querySelectorAll("[data-type]").forEach((x) => x.classList.remove("active"));
    chip.classList.add("active");
    const c2 = App.CANVAS_TYPES[curType].cells;
    m.body.querySelector("[data-cells]").innerHTML = Object.keys(c2).map((k) => `
      <div class="field" style="margin-bottom:10px"><label>${c2[k]}</label>
      <textarea class="textarea" name="cell_${k}" rows="3" placeholder="${c2[k]}…"></textarea></div>`).join("");
  }));
  const save = async () => {
    const projectId = m.body.querySelector("[name=projectId]").value;
    if (!projectId) { App.UI.toast("请选择项目", "error"); return; }
    const c2 = App.CANVAS_TYPES[curType].cells;
    const cells = {};
    Object.keys(c2).forEach((k) => { const v = m.body.querySelector(`[name=cell_${k}]`); if (v) cells[k] = v.value.trim(); });
    const data = { projectId, type: curType, cells };
    try {
      if (isNew) await App.DB.canvas.create(data); else await App.DB.canvas.update(cv.id, data);
      m.close(); App.UI.toast(isNew ? "画布已创建" : "画布已更新"); App.render();
    } catch (e) { App.UI.toast(e.message, "error"); }
  };
  m.foot.querySelector("[data-save]").addEventListener("click", save);
  m.foot.querySelector("[data-cancel]").addEventListener("click", () => m.close());
  if (!isNew) m.foot.querySelector("[data-del]").addEventListener("click", async () => {
    const ok = await App.UI.confirm({ title: "删除画布", text: "确定删除这张画布吗？", okText: "删除", danger: true });
    if (!ok) return;
    await App.DB.canvas.remove(cv.id); m.close(); App.UI.toast("已删除"); App.render();
  });
}

function openMilestoneModal(ms, defaults = {}) {
  const S = App.DB.state;
  const isNew = !ms;
  const projOptions = S.projects.map((p) => ({ value: p.id, label: p.name }));
  const body = `
    <div class="field"><label>里程碑名称 <span class="req">*</span></label><input class="input" name="title" value="${escapeHtml(ms ? ms.title : "")}" placeholder="例如：v1.0 发布"></div>
    <div class="field"><label>描述</label><input class="input" name="desc" value="${escapeHtml(ms ? ms.desc || "" : "")}" placeholder="这个里程碑意味着什么"></div>
    <div class="form-grid">
      <div class="field"><label>关联项目</label>${App.UI.selectHtml("projectId", projOptions, ms ? ms.projectId : (defaults.projectId || ""))}</div>
      <div class="field"><label>颜色</label>${App.UI.colorDotsHtml("mcolor", App.NOTE_COLORS, ms ? ms.color : App.NOTE_COLORS[0])}</div>
      <div class="field"><label>开始日期</label><input class="input" type="date" name="startDate" value="${escapeHtml(ms ? ms.startDate || "" : "")}"></div>
      <div class="field"><label>目标日期</label><input class="input" type="date" name="endDate" value="${escapeHtml(ms ? ms.endDate || "" : "")}"></div>
    </div>`;
  const footer = `${!isNew ? `<button class="btn btn-danger" data-del style="margin-right:auto">${App.ICONS.trash}删除</button>` : ""}<button class="btn" data-cancel>取消</button><button class="btn btn-primary" data-save>${App.ICONS.check}保存</button>`;
  const m = App.UI.modal({ title: isNew ? "新建里程碑" : "编辑里程碑", body, footer });
  m.body.querySelectorAll("[data-colorpicker=mcolor] .color-dot").forEach((dot) => dot.addEventListener("click", () => {
    m.body.querySelectorAll("[data-colorpicker=mcolor] .color-dot").forEach((x) => x.classList.remove("sel"));
    dot.classList.add("sel");
  }));
  const save = async () => {
    const title = m.body.querySelector("[name=title]").value.trim();
    if (!title) { App.UI.toast("请填写名称", "error"); return; }
    const data = { title, desc: m.body.querySelector("[name=desc]").value.trim(), projectId: m.body.querySelector("[name=projectId]").value || null,
      color: m.body.querySelector("[data-colorpicker=mcolor] .color-dot.sel")?.dataset.color || App.NOTE_COLORS[0],
      startDate: m.body.querySelector("[name=startDate]").value || "", endDate: m.body.querySelector("[name=endDate]").value || "" };
    try {
      if (isNew) await App.DB.milestones.create(data); else await App.DB.milestones.update(ms.id, data);
      m.close(); App.UI.toast(isNew ? "里程碑已创建" : "里程碑已更新"); App.render();
    } catch (e) { App.UI.toast(e.message, "error"); }
  };
  m.foot.querySelector("[data-save]").addEventListener("click", save);
  m.foot.querySelector("[data-cancel]").addEventListener("click", () => m.close());
  if (!isNew) m.foot.querySelector("[data-del]").addEventListener("click", async () => {
    const ok = await App.UI.confirm({ title: "删除里程碑", text: `确定删除「${ms.title}」吗？`, okText: "删除", danger: true });
    if (!ok) return;
    await App.DB.milestones.remove(ms.id); m.close(); App.UI.toast("已删除"); App.render();
  });
}

function openEventModal(ev, defaults = {}) {
  const S = App.DB.state;
  const isNew = !ev;
  const projOptions = [{ value: "", label: "个人日程" }].concat(S.projects.map((p) => ({ value: p.id, label: p.name })));
  const body = `
    <div class="field"><label>事件标题 <span class="req">*</span></label><input class="input" name="title" value="${escapeHtml(ev ? ev.title : "")}" placeholder="例如：版本评审会"></div>
    <div class="form-grid">
      <div class="field"><label>日期 <span class="req">*</span></label><input class="input" type="date" name="date" value="${escapeHtml(ev ? ev.date : (defaults.date || App.todayStr()))}"></div>
      <div class="field"><label>关联项目</label>${App.UI.selectHtml("projectId", projOptions, ev ? ev.projectId || "" : defaults.projectId || "")}</div>
    </div>
    <div class="field"><label>描述</label><textarea class="textarea" name="desc" rows="3">${escapeHtml(ev ? ev.desc || "" : "")}</textarea></div>`;
  const footer = `${!isNew ? `<button class="btn btn-danger" data-del style="margin-right:auto">${App.ICONS.trash}删除</button>` : ""}<button class="btn" data-cancel>取消</button><button class="btn btn-primary" data-save>${App.ICONS.check}保存</button>`;
  const m = App.UI.modal({ title: isNew ? "新建日程" : "编辑日程", body, footer, width: "narrow" });
  const save = async () => {
    const title = m.body.querySelector("[name=title]").value.trim();
    const date = m.body.querySelector("[name=date]").value;
    if (!title || !date) { App.UI.toast("标题和日期必填", "error"); return; }
    const data = { title, date, projectId: m.body.querySelector("[name=projectId]").value || null, desc: m.body.querySelector("[name=desc]").value.trim() };
    try {
      if (isNew) await App.DB.events.create(data); else await App.DB.events.update(ev.id, data);
      m.close(); App.UI.toast(isNew ? "日程已创建" : "日程已更新"); App.render();
    } catch (e) { App.UI.toast(e.message, "error"); }
  };
  m.foot.querySelector("[data-save]").addEventListener("click", save);
  m.foot.querySelector("[data-cancel]").addEventListener("click", () => m.close());
  if (!isNew) m.foot.querySelector("[data-del]").addEventListener("click", async () => {
    const ok = await App.UI.confirm({ title: "删除日程", text: `确定删除「${ev.title}」吗？`, okText: "删除", danger: true });
    if (!ok) return;
    await App.DB.events.remove(ev.id); m.close(); App.UI.toast("已删除"); App.render();
  });
}

/* ================= 甘特图 ================= */
const ganttView = {
  proj: "all",
  render() {
    const S = App.DB.state;
    if (this.proj !== "all" && !S.projects.find((p) => p.id === this.proj)) this.proj = "all";
    const tasks = S.tasks.filter((t) => (this.proj === "all" ? true : t.projectId === this.proj) && (t.startDate || t.dueDate));
    const milestones = S.milestones.filter((ms) => (this.proj === "all" ? true : ms.projectId === this.proj) && ms.startDate);
    const rows = tasks.map((t) => ({ type: "task", id: t.id, title: t.title, start: t.startDate || t.dueDate, end: t.dueDate || t.startDate, color: t.colId === "col_done" ? "#9aa0b0" : "#4f6bff", done: t.colId === "col_done" }))
      .concat(milestones.map((ms) => ({ type: "ms", id: ms.id, title: ms.title, start: ms.startDate, end: ms.startDate, color: ms.color || "#8b5cf6" })));

    const projChips = `<span class="filter-chip ${this.proj === "all" ? "active" : ""}" data-proj="all">全部项目</span>` +
      S.projects.map((p) => `<span class="filter-chip ${this.proj === p.id ? "active" : ""}" data-proj="${p.id}">${App.escapeHtml(p.name)}</span>`).join("");

    if (!rows.length) {
      return `
      <div class="view">
        <div class="page-head"><div><div class="page-title">甘特图</div><div class="page-desc">以时间线查看任务与里程碑的排期</div></div>
        <div class="page-actions"><button class="btn" data-new-ms>${App.ICONS.plus}新建里程碑</button></div></div>
        <div class="filter-bar">${projChips}</div>
        ${App.v.empty("calendar", "暂无排期数据", "给任务设置「开始日期/截止日期」，或新建里程碑，就会在这里呈现时间线。", `<button class="btn btn-primary" data-act="new-task">${App.ICONS.plus}新建任务</button>`)}
      </div>`;
    }

    // 时间范围
    const today = App.todayStr();
    const allDates = rows.flatMap((r) => [r.start, r.end]).filter(Boolean);
    let min = allDates.reduce((a, b) => (a < b ? a : b), today);
    let max = allDates.reduce((a, b) => (a > b ? a : b), today);
    // 前后各扩展 7 天，避免贴边
    const ex = (d, n) => { const t = new Date(d + "T00:00:00"); t.setDate(t.getDate() + n); return App.dateStr(t); };
    min = ex(min, -7); max = ex(max, 7);
    const totalDays = Math.max(1, Math.round((new Date(max) - new Date(min)) / 86400000));
    const X = (d) => 120 + (Math.round((new Date(d) - new Date(min)) / 86400000) / totalDays) * 560;
    const barW = (d1, d2) => Math.max(12, (Math.round((new Date(d2) - new Date(d1)) / 86400000) / totalDays) * 560);

    // 顶部日期刻度：按月
    const months = [];
    let cur = new Date(min + "T00:00:00");
    while (cur <= new Date(max + "T00:00:00")) {
      const key = `${cur.getFullYear()}-${cur.getMonth() + 1}`;
      const last = months[months.length - 1];
      if (!last || last.key !== key) months.push({ key, label: `${cur.getFullYear()}年${cur.getMonth() + 1}月`, start: App.dateStr(cur) });
      cur.setMonth(cur.getMonth() + 1);
    }
    const H = 90 + rows.length * 34 + 60;
    const monthCells = months.map((mth) => {
      const x1 = X(mth.start);
      const x2 = (() => { const d = new Date(mth.start + "T00:00:00"); d.setMonth(d.getMonth() + 1); return X(App.dateStr(d)); })();
      return `<rect x="${x1}" y="40" width="${Math.max(0, x2 - x1 - 2)}" height="26" fill="var(--surface-3)" opacity="0.55" rx="4"/><text x="${x1 + 6}" y="57" font-size="12" fill="var(--text-2)" font-weight="600">${mth.label}</text>`;
    }).join("");

    // 今天线
    const todayX = X(today);
    const todayLine = `<line x1="${todayX}" y1="40" x2="${todayX}" y2="${H - 46}" stroke="var(--primary)" stroke-width="1" stroke-dasharray="4 4"/><text x="${todayX + 3}" y="52" font-size="11" fill="var(--primary)" font-weight="600">今天</text>`;

    const rowHtml = rows.map((r, i) => {
      const y = 74 + i * 34;
      const isOver = r.type === "task" && r.end && r.end < today && !r.done;
      const label = `<text x="8" y="${y + 16}" font-size="12.5" fill="var(--text)" font-weight="500" dominant-baseline="central" style="max-width:110px;overflow:hidden">${escapeHtml(r.title.length > 12 ? r.title.slice(0, 12) + "…" : r.title)}</text>`;
      let bar;
      if (r.type === "ms") {
        bar = `<path d="M ${X(r.start)} ${y + 9} l 8 8 l -8 8 l -8 -8 z" fill="${r.color}"/><text x="${X(r.start) + 14}" y="${y + 17}" font-size="11" fill="${r.color}" font-weight="600">${escapeHtml(r.title)}</text>`;
      } else {
        const w = barW(r.start, r.end);
        bar = `<rect x="${X(r.start)}" y="${y + 4}" width="${w}" height="18" rx="9" fill="${r.color}" opacity="${r.done ? 0.45 : 0.9}"/><text x="${X(r.start) + 6}" y="${y + 17}" font-size="11" fill="#fff" font-weight="600">${escapeHtml(r.title.length > 8 ? r.title.slice(0, 8) + "…" : r.title)}</text>${isOver ? `<text x="${X(r.start) + w + 5}" y="${y + 17}" font-size="11" fill="var(--danger)" font-weight="600">已逾期</text>` : ""}`;
      }
      return `<g>${label}${bar}</g>`;
    }).join("");

    return `
    <div class="view">
      <div class="page-head"><div><div class="page-title">甘特图</div><div class="page-desc">以时间线查看任务与里程碑的排期 · 共 ${rows.length} 项</div></div>
      <div class="page-actions"><button class="btn" data-new-ms>${App.ICONS.plus}新建里程碑</button><button class="btn btn-primary" data-new-task>${App.ICONS.plus}新建任务</button></div></div>
      <div class="filter-bar">${projChips}</div>
      <div class="card" style="overflow-x:auto;padding:14px">
        <svg viewBox="0 0 680 ${H}" width="100%" style="min-width:760px" role="img">
          <text x="8" y="26" font-size="12" fill="var(--text-3)" font-weight="600">任务 / 里程碑</text>
          ${monthCells}${todayLine}
          <line x1="120" y1="40" x2="120" y2="${H - 46}" stroke="var(--border)" stroke-width="0.5"/>
          ${rowHtml}
        </svg>
      </div>
    </div>`;
  },
  bind(el) {
    el.querySelectorAll("[data-proj]").forEach((c) => c.addEventListener("click", () => { this.proj = c.dataset.proj; App.render(); }));
    el.querySelectorAll("[data-new-task]").forEach((b) => b.addEventListener("click", () => openTaskModal(null, { defaults: { projectId: this.proj !== "all" ? this.proj : null } })));
    el.querySelectorAll("[data-new-ms]").forEach((b) => b.addEventListener("click", () => openMilestoneModal(null, { projectId: this.proj !== "all" ? this.proj : null })));
  },
};

/* ================= 日历 ================= */
const calendarView = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  render() {
    const S = App.DB.state;
    const y = this.year, mo = this.month;
    const first = new Date(y, mo, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const today = App.todayStr();
    const eventsByDay = {};
    S.events.forEach((e) => { if (e.date) (eventsByDay[e.date] = eventsByDay[e.date] || []).push(e); });
    const tasksByDay = {};
    S.tasks.forEach((t) => { if (t.dueDate && t.colId !== "col_done") (tasksByDay[t.dueDate] = tasksByDay[t.dueDate] || []).push(t); });

    let cells = "";
    for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell muted" style="background:transparent;border:none"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const evs = eventsByDay[ds] || [];
      const ts = tasksByDay[ds] || [];
      const isToday = ds === today;
      cells += `
      <div class="cal-cell card" data-day="${ds}" style="min-height:86px;cursor:pointer;padding:6px;display:flex;flex-direction:column;gap:3px">
        <span class="small ${isToday ? "cal-today" : ""}" style="${isToday ? "width:22px;height:22px;border-radius:50%;background:var(--primary);color:#fff;display:grid;place-items:center;font-weight:700" : ""}">${d}</span>
        ${evs.slice(0, 2).map((e) => `<span class="cal-chip" style="background:var(--primary-soft);color:var(--primary)">${escapeHtml(e.title.length > 8 ? e.title.slice(0, 8) + "…" : e.title)}</span>`).join("")}
        ${ts.length ? `<span class="cal-chip" style="background:var(--warning-soft);color:var(--warning)">${ts.length} 个任务到期</span>` : ""}
        ${evs.length > 2 ? `<span class="small muted">+${evs.length - 2}</span>` : ""}
      </div>`;
    }

    const weekHead = ["日", "一", "二", "三", "四", "五", "六"].map((w) => `<div class="small muted" style="text-align:center;padding:6px 0;font-weight:700">周${w}</div>`).join("");
    const monthEvents = S.events.filter((e) => e.date && e.date.startsWith(`${y}-${String(mo + 1).padStart(2, "0")}`)).sort((a, b) => a.date.localeCompare(b.date));

    return `
    <div class="view">
      <div class="page-head"><div><div class="page-title">日历</div><div class="page-desc">${y} 年 ${mo + 1} 月 · 日程与任务到期一览</div></div>
      <div class="page-actions">
        <button class="btn" data-prev>${App.ICONS.chevronLeft}上月</button>
        <button class="btn" data-now>本月</button>
        <button class="btn" data-next>下月${App.ICONS.chevronRight}</button>
        <button class="btn btn-primary" data-new>${App.ICONS.plus}新建日程</button>
      </div></div>
      <div class="grid" style="grid-template-columns:1fr 300px;gap:16px">
        <div>
          <div class="card" style="padding:12px">
            <div class="grid" style="grid-template-columns:repeat(7,1fr);gap:6px">${weekHead}</div>
            <div class="grid" style="grid-template-columns:repeat(7,1fr);gap:6px">${cells}</div>
          </div>
        </div>
        <div>
          <div class="section-head"><span class="section-title">本月日程</span><span class="section-sub">${monthEvents.length} 项</span></div>
          <div class="card card-pad">
            ${monthEvents.length ? monthEvents.map((e) => {
              const p = S.projects.find((x) => x.id === e.projectId);
              return `<div class="list-item" data-ev="${e.id}"><span class="proj-dot" style="background:${p ? p.color : "var(--primary)"}"></span><div class="flex-1" style="min-width:0"><div class="li-title ellipsis">${escapeHtml(e.title)}</div><div class="li-sub">${App.fmtDate(e.date)}${p ? " · " + escapeHtml(p.name) : ""}</div></div></div>`;
            }).join("") : `<div class="muted small" style="padding:10px 4px">本月暂无日程，点击日期可快速创建</div>`}
          </div>
        </div>
      </div>
    </div>`;
  },
  bind(el) {
    el.querySelector("[data-prev]").addEventListener("click", () => { this.month--; if (this.month < 0) { this.month = 11; this.year--; } App.render(); });
    el.querySelector("[data-next]").addEventListener("click", () => { this.month++; if (this.month > 11) { this.month = 0; this.year++; } App.render(); });
    el.querySelector("[data-now]").addEventListener("click", () => { this.year = new Date().getFullYear(); this.month = new Date().getMonth(); App.render(); });
    el.querySelector("[data-new]").addEventListener("click", () => openEventModal(null));
    el.querySelectorAll("[data-day]").forEach((c) => c.addEventListener("click", () => openEventModal(null, { date: c.dataset.day })));
    el.querySelectorAll("[data-ev]").forEach((row) => row.addEventListener("click", () => {
      const e = App.DB.state.events.find((x) => x.id === row.dataset.ev);
      if (e) openEventModal(e);
    }));
  },
};

/* ================= 客户 ================= */
const clientsView = {
  render() {
    const S = App.DB.state;
    const list = S.clients;
    const cards = list.map((c) => {
      const p = S.projects.find((x) => x.id === c.projectId);
      return `
      <div class="card card-hover" data-client="${c.id}" style="cursor:pointer;padding:18px 20px">
        <div class="flex">
          <span class="goal-icon" style="background:var(--primary-soft);color:var(--primary)">${App.ICONS.users}</span>
          <div class="flex-1" style="min-width:0">
            <div class="li-title ellipsis" style="font-size:14.5px">${escapeHtml(c.title)}</div>
            <div class="li-sub">${escapeHtml(c.org || "未填组织")}</div>
          </div>
          <div class="row-actions"><button class="row-btn" data-edit>${App.ICONS.edit}</button><button class="row-btn danger" data-del>${App.ICONS.trash}</button></div>
        </div>
        ${c.email || c.phone ? `<div class="small muted mt-12">${c.email ? escapeHtml(c.email) : ""}${c.email && c.phone ? " · " : ""}${c.phone ? escapeHtml(c.phone) : ""}</div>` : ""}
        ${c.desc ? `<div class="small muted mt-4" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(c.desc)}</div>` : ""}
        <div class="flex mt-12">${p ? `<span class="tag tag-primary">${escapeHtml(p.name)}</span>` : `<span class="tag tag-gray">个人客户</span>`}</div>
      </div>`;
    }).join("");
    return `
    <div class="view">
      <div class="page-head"><div><div class="page-title">客户</div><div class="page-desc">${list.length} 位客户与联系人</div></div>
      <div class="page-actions"><button class="btn btn-primary" data-new>${App.ICONS.plus}新建客户</button></div></div>
      ${list.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">${cards}</div>` : App.v.empty("users", "还没有客户", "把合作方、重要联系人沉淀下来，随时可查。", `<button class="btn btn-primary" data-new>${App.ICONS.plus}新建客户</button>`)}
    </div>`;
  },
  bind(el) {
    el.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", () => openClientModal(null)));
    el.querySelectorAll("[data-client]").forEach((card) => {
      const c = App.DB.state.clients.find((x) => x.id === card.dataset.client);
      card.querySelector("[data-edit]").addEventListener("click", (e) => { e.stopPropagation(); openClientModal(c); });
      card.querySelector("[data-del]").addEventListener("click", (e) => {
        e.stopPropagation();
        App.UI.confirm({ title: "删除客户", text: `确定删除「${c.title}」吗？`, okText: "删除", danger: true }).then((okk) => {
          if (!okk) return;
          App.DB.clients.remove(c.id).then(() => { App.UI.toast("已删除"); App.render(); });
        });
      });
      card.addEventListener("click", (e) => { if (!e.target.closest(".row-actions")) openClientModal(c); });
    });
  },
};

/* ================= 想法（投票） ================= */
const ideasView = {
  render() {
    const S = App.DB.state;
    const list = S.ideas.slice().sort((a, b) => ((b.votes || []).length) - ((a.votes || []).length));
    const cards = list.map((it) => {
      const votes = (it.votes || []).length;
      const mine = (it.votes || []).includes(S.user && S.user.id);
      const p = S.projects.find((x) => x.id === it.projectId);
      const statusMap = { new: ["新想法", "tag-primary"], doing: ["评估中", "tag-warning"], adopted: ["已采纳", "tag-success"], closed: ["已关闭", "tag-gray"] };
      const st = statusMap[it.status] || statusMap.new;
      return `
      <div class="card card-hover" style="padding:18px 20px;display:flex;gap:14px">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:52px">
          <button class="btn btn-sm ${mine ? "btn-primary" : ""}" data-vote="${it.id}" title="投票">${App.ICONS.heart}</button>
          <span class="small mono" style="font-weight:700">${votes}</span>
        </div>
        <div class="flex-1" style="min-width:0">
          <div class="flex gap-8">
            <span class="li-title" style="font-size:14.5px">${escapeHtml(it.title)}</span>
            <span class="tag ${st[1]}">${st[0]}</span>
          </div>
          ${it.desc ? `<div class="small muted mt-4" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(it.desc)}</div>` : ""}
          <div class="flex mt-12">
            ${p ? `<span class="tag tag-gray">${escapeHtml(p.name)}</span>` : ""}
            <div class="right row-actions" style="display:flex"><button class="row-btn" data-edit>${App.ICONS.edit}</button><button class="row-btn danger" data-del>${App.ICONS.trash}</button></div>
          </div>
        </div>
      </div>`;
    }).join("");
    return `
    <div class="view">
      <div class="page-head"><div><div class="page-title">想法</div><div class="page-desc">收集好点子，投票排序 · 共 ${list.length} 个</div></div>
      <div class="page-actions"><button class="btn btn-primary" data-new>${App.ICONS.plus}提出想法</button></div></div>
      ${list.length ? `<div class="list">${cards}</div>` : App.v.empty("sparkles", "还没有想法", "灵光一现就记下来，让团队一起投票。", `<button class="btn btn-primary" data-new>${App.ICONS.plus}提出想法</button>`)}
    </div>`;
  },
  bind(el) {
    el.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", () => openIdeaModal(null)));
    el.querySelectorAll("[data-vote]").forEach((b) => b.addEventListener("click", async () => {
      try { await App.DB.voteIdea(b.dataset.vote); App.render(); } catch (e) { App.UI.toast(e.message, "error"); }
    }));
    el.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
      const it = App.DB.state.ideas.find((x) => x.id === b.closest("[data-vote]") ? b.closest("[data-vote]").dataset.vote : null);
      const card = b.closest(".card");
      const voteBtn = card.querySelector("[data-vote]");
      const idea = App.DB.state.ideas.find((x) => x.id === voteBtn.dataset.vote);
      if (idea) openIdeaModal(idea);
    }));
    el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      const card = b.closest(".card");
      const id = card.querySelector("[data-vote]").dataset.vote;
      const idea = App.DB.state.ideas.find((x) => x.id === id);
      const ok = await App.UI.confirm({ title: "删除想法", text: `确定删除「${idea.title}」吗？`, okText: "删除", danger: true });
      if (!ok) return;
      await App.DB.ideas.remove(id); App.UI.toast("已删除"); App.render();
    }));
  },
};

/* ================= 画布 ================= */
const canvasView = {
  render() {
    const S = App.DB.state;
    const list = S.canvas;
    const cards = list.map((cv) => {
      const p = S.projects.find((x) => x.id === cv.projectId);
      const type = App.CANVAS_TYPES[cv.type] || App.CANVAS_TYPES.swot;
      const fill = Object.values(cv.cells || {}).filter((v) => v.trim()).length;
      return `
      <div class="card card-hover" data-canvas="${cv.id}" style="cursor:pointer;padding:18px 20px">
        <div class="flex">
          <span class="goal-icon" style="background:var(--accent-soft);color:var(--accent)">${App.ICONS.layers}</span>
          <div class="flex-1">
            <div class="li-title" style="font-size:14.5px">${type.label}</div>
            <div class="li-sub">${p ? escapeHtml(p.name) : "未关联项目"} · ${fill}/${Object.keys(type.cells).length} 格已填写</div>
          </div>
          <div class="row-actions"><button class="row-btn" data-edit>${App.ICONS.edit}</button><button class="row-btn danger" data-del>${App.ICONS.trash}</button></div>
        </div>
        <div class="progress mt-12"><i style="width:${Math.round(fill / Object.keys(type.cells).length * 100)}%"></i></div>
      </div>`;
    }).join("");
    return `
    <div class="view">
      <div class="page-head"><div><div class="page-title">画布</div><div class="page-desc">SWOT 与精益画布，把想法结构化</div></div>
      <div class="page-actions"><button class="btn btn-primary" data-new>${App.ICONS.plus}新建画布</button></div></div>
      ${list.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px">${cards}</div>` : App.v.empty("layers", "还没有画布", "用 SWOT 分析机会风险，或用精益画布梳理商业模式。", `<button class="btn btn-primary" data-new>${App.ICONS.plus}新建画布</button>`)}
    </div>`;
  },
  bind(el) {
    el.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", () => openCanvasModal(null)));
    el.querySelectorAll("[data-canvas]").forEach((card) => {
      const cv = App.DB.state.canvas.find((x) => x.id === card.dataset.canvas);
      card.querySelector("[data-edit]").addEventListener("click", (e) => { e.stopPropagation(); openCanvasModal(cv); });
      card.querySelector("[data-del]").addEventListener("click", (e) => {
        e.stopPropagation();
        App.UI.confirm({ title: "删除画布", text: "确定删除这张画布吗？", okText: "删除", danger: true }).then((okk) => {
          if (!okk) return;
          App.DB.canvas.remove(cv.id).then(() => { App.UI.toast("已删除"); App.render(); });
        });
      });
      card.addEventListener("click", (e) => { if (!e.target.closest(".row-actions")) openCanvasModal(cv); });
    });
  },
};

/* ================= 里程碑 ================= */
const milestonesView = {
  render() {
    const S = App.DB.state;
    const list = S.milestones.slice().sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"));
    const today = App.todayStr();
    const items = list.map((ms) => {
      const p = S.projects.find((x) => x.id === ms.projectId);
      const tasks = S.tasks.filter((t) => t.milestoneId === ms.id);
      const done = tasks.filter((t) => t.colId === "col_done").length;
      const prog = tasks.length ? Math.round(done / tasks.length * 100) : 0;
      const over = ms.endDate && ms.endDate < today;
      return `
      <div class="list-item" data-ms="${ms.id}" style="align-items:flex-start">
        <div style="display:flex;flex-direction:column;align-items:center;padding-top:4px">
          <span style="width:14px;height:14px;border-radius:50%;background:${ms.color || "#8b5cf6"};box-shadow:0 0 0 4px ${(ms.color || "#8b5cf6")}22"></span>
          <span style="width:2px;flex:1;min-height:40px;background:var(--border)"></span>
        </div>
        <div class="flex-1" style="min-width:0;padding-bottom:18px">
          <div class="flex gap-8">
            <span class="li-title" style="font-size:14.5px">${escapeHtml(ms.title)}</span>
            ${over ? `<span class="tag tag-danger">已逾期</span>` : ""}
          </div>
          ${ms.desc ? `<div class="small muted">${escapeHtml(ms.desc)}</div>` : ""}
          <div class="small muted mt-4">${ms.startDate ? App.fmtDate(ms.startDate) : "未定"} → ${ms.endDate ? App.fmtDate(ms.endDate) : "未定"}${p ? " · " + escapeHtml(p.name) : ""}</div>
          ${tasks.length ? `<div class="flex gap-8 mt-8"><div class="progress flex-1" style="max-width:180px"><i style="width:${prog}%"></i></div><span class="small muted mono">${done}/${tasks.length}</span></div>` : ""}
          ${tasks.length ? `<div class="flex gap-8 flex-wrap mt-8">${tasks.slice(0, 6).map((t) => `<span class="tag ${t.colId === "col_done" ? "tag-success" : "tag-gray"}" data-opentask="${t.id}">${escapeHtml(t.title.length > 10 ? t.title.slice(0, 10) + "…" : t.title)}</span>`).join("")}${tasks.length > 6 ? `<span class="tag tag-primary">+${tasks.length - 6}</span>` : ""}</div>` : ""}
        </div>
        <div class="row-actions" style="padding-top:6px"><button class="row-btn" data-edit>${App.ICONS.edit}</button><button class="row-btn danger" data-del>${App.ICONS.trash}</button></div>
      </div>`;
    }).join("");
    return `
    <div class="view">
      <div class="page-head"><div><div class="page-title">里程碑</div><div class="page-desc">关键节点的路线图 · 共 ${list.length} 个</div></div>
      <div class="page-actions"><button class="btn btn-primary" data-new>${App.ICONS.plus}新建里程碑</button></div></div>
      ${list.length ? `<div class="card card-pad"><div class="list">${items}</div></div>` : App.v.empty("flag", "还没有里程碑", "把 v1.0、上线、里程碑会议等关键节点标记出来。", `<button class="btn btn-primary" data-new>${App.ICONS.plus}新建里程碑</button>`)}
    </div>`;
  },
  bind(el) {
    el.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", () => openMilestoneModal(null)));
    el.querySelectorAll("[data-opentask]").forEach((tag) => tag.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = App.DB.state.tasks.find((x) => x.id === tag.dataset.opentask);
      if (t) openTaskModal(t);
    }));
    el.querySelectorAll("[data-ms]").forEach((row) => {
      const ms = App.DB.state.milestones.find((x) => x.id === row.dataset.ms);
      row.querySelector("[data-edit]").addEventListener("click", () => openMilestoneModal(ms));
      row.querySelector("[data-del]").addEventListener("click", async () => {
        const ok = await App.UI.confirm({ title: "删除里程碑", text: `确定删除「${ms.title}」吗？`, okText: "删除", danger: true });
        if (!ok) return;
        await App.DB.milestones.remove(ms.id); App.UI.toast("已删除"); App.render();
      });
    });
  },
};

/* ================= 文件库 ================= */
const filesView = {
  render() {
    const S = App.DB.state;
    const list = S.files.slice().sort((a, b) => b.createdAt - a.createdAt);
    const uploaderName = (id) => { const u = S.members.find((m) => m.userId === id); return u && u.user ? u.user.displayName : "我"; };
    const rows = list.map((f) => {
      const p = S.projects.find((x) => x.id === f.projectId);
      return `
      <div class="list-item">
        <span class="goal-icon" style="background:var(--teal-soft);color:var(--teal)">${App.ICONS.download}</span>
        <div class="flex-1" style="min-width:0">
          <div class="li-title ellipsis">${escapeHtml(f.name)}</div>
          <div class="li-sub">${App.fmtSize(f.size)} · ${uploaderName(f.uploadedBy)} · ${App.fmtDate(App.dateStr(new Date(f.createdAt)))}${p ? " · " + escapeHtml(p.name) : ""}</div>
        </div>
        <button class="btn btn-sm" data-dl="${f.id}">${App.ICONS.download}下载</button>
        <button class="row-btn danger" data-del="${f.id}">${App.ICONS.trash}</button>
      </div>`;
    }).join("");
    return `
    <div class="view">
      <div class="page-head"><div><div class="page-title">文件库</div><div class="page-desc">项目资料集中存放 · ${list.length} 个文件</div></div>
      <div class="page-actions"><button class="btn btn-primary" data-upload>${App.ICONS.upload}上传文件</button></div></div>
      <input type="file" data-fileinput hidden multiple>
      ${list.length ? `<div class="card"><div class="list" style="padding:8px">${rows}</div></div>` : App.v.empty("inbox", "文件库为空", "上传项目文档、设计稿、资料，成员都可以下载。", `<button class="btn btn-primary" data-upload>${App.ICONS.upload}上传第一个文件</button>`)}
    </div>`;
  },
  bind(el) {
    const input = el.querySelector("[data-fileinput]");
    const doUpload = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = String(reader.result).split(",")[1] || "";
          await App.DB.uploadFile({ name: file.name, mime: file.type || "application/octet-stream", data, projectId: null });
          App.UI.toast(`「${file.name}」上传成功`);
          resolve();
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    el.querySelectorAll("[data-upload]").forEach((b) => b.addEventListener("click", () => input.click()));
    input.addEventListener("change", async () => {
      const files = [...input.files];
      input.value = "";
      if (!files.length) return;
      App.UI.toast(`正在上传 ${files.length} 个文件…`, "info");
      try {
        for (const f of files) await doUpload(f);
        App.render();
      } catch (e) { App.UI.toast("上传失败：" + e.message, "error"); }
    });
    el.querySelectorAll("[data-dl]").forEach((b) => b.addEventListener("click", () => {
      const f = App.DB.state.files.find((x) => x.id === b.dataset.dl);
      if (!f) return;
      const a = document.createElement("a");
      a.href = `/api/files/${f.id}/download?t=${Date.now()}`;
      a.download = f.name;
      a.click();
    }));
    el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      const f = App.DB.state.files.find((x) => x.id === b.dataset.del);
      const ok = await App.UI.confirm({ title: "删除文件", text: `确定删除「${f.name}」吗？`, okText: "删除", danger: true });
      if (!ok) return;
      await App.DB.deleteFile(f.id); App.UI.toast("已删除"); App.render();
    }));
  },
};

/* ================= 通知 ================= */
const notificationsView = {
  render() {
    const S = App.DB.state;
    const list = S.notifications;
    const unread = list.filter((n) => !n.read).length;
    const items = list.map((n) => `
      <div class="list-item ${n.read ? "" : "pop-in"}" data-nid="${n.id}" data-link="${escapeHtml(n.link || "")}" style="${n.read ? "opacity:0.65" : ""}">
        <span class="dot ${n.read ? "" : "pulse"}" style="background:${n.read ? "var(--text-3)" : "var(--primary)"}"></span>
        <div class="flex-1" style="min-width:0">
          <div class="li-title">${escapeHtml(n.title)}</div>
          <div class="li-sub">${escapeHtml(n.desc || "")} · ${App.fmtDate(App.dateStr(new Date(n.createdAt)))}</div>
        </div>
        ${n.read ? "" : `<span class="tag tag-primary">未读</span>`}
      </div>`).join("");
    return `
    <div class="view">
      <div class="page-head"><div><div class="page-title">通知</div><div class="page-desc">${unread ? unread + " 条未读" : "全部已读"}</div></div>
      <div class="page-actions"><button class="btn" data-readall ${unread ? "" : "disabled"}>${App.ICONS.check}全部标为已读</button></div></div>
      ${list.length ? `<div class="card"><div class="list" style="padding:8px">${items}</div></div>` : App.v.empty("inbox", "暂无通知", "任务分配、评论、项目邀请等动态会出现在这里。")}
    </div>`;
  },
  bind(el) {
    el.querySelector("[data-readall]").addEventListener("click", async () => {
      await App.DB.readNotifications(); App.UI.toast("已全部标为已读"); App.render();
    });
    el.querySelectorAll("[data-nid]").forEach((row) => row.addEventListener("click", async () => {
      await App.DB.markRead(row.dataset.nid);
      const link = row.dataset.link;
      App.render();
      if (link) App.Router.go(link.replace(/^#\//, ""));
    }));
  },
};

/* ---------- 扩展视图注册 ---------- */
window.ExtraViews = { gantt: ganttView, calendar: calendarView, clients: clientsView, ideas: ideasView, canvas: canvasView, milestones: milestonesView, files: filesView, notifications: notificationsView };
window.openClientModal = openClientModal;
window.openIdeaModal = openIdeaModal;
window.openCanvasModal = openCanvasModal;
window.openMilestoneModal = openMilestoneModal;
window.openEventModal = openEventModal;

/* ================= 回顾（Retrospective） ================= */
const RETRO_TYPES = {
  kpt: { label: "KPT 复盘", cols: ["保持 Keep", "问题 Problem", "尝试 Try"] },
  wia: { label: "好评-改进-行动", cols: ["做得好", "待改进", "下一步行动"] },
};

function openRetroModal(rt, defaults = {}) {
  const S = App.DB.state;
  const isNew = !rt;
  const projOptions = S.projects.map((p) => ({ value: p.id, label: p.name }));
  const type = rt ? (rt.type || "kpt") : "kpt";
  const items = (rt && rt.items) || {};
  const textareaFor = (i) => (items["c" + (i + 1)] || []).join("\n");
  const colsHtml = RETRO_TYPES[type].cols.map((c, i) => `
    <div class="field" style="margin-bottom:0">
      <label>${c}</label>
      <textarea class="textarea" name="col${i + 1}" rows="5" placeholder="每行一条，例如：&#10;· 按时完成了迭代计划">${escapeHtml(textareaFor(i))}</textarea>
    </div>`).join("");
  const body = `
    <div class="field"><label>复盘主题 <span class="req">*</span></label><input class="input" name="title" value="${escapeHtml(rt ? rt.title : "")}" placeholder="例如：v1.0 迭代复盘"></div>
    <div class="form-grid">
      <div class="field"><label>关联项目</label>${App.UI.selectHtml("projectId", projOptions, rt ? rt.projectId : (defaults.projectId || ""))}</div>
      <div class="field"><label>模板</label>
        <div class="flex gap-8">${Object.keys(RETRO_TYPES).map((t) => `<span class="filter-chip ${type === t ? "active" : ""}" data-rtype="${t}">${RETRO_TYPES[t].label}</span>`).join("")}</div>
      </div>
    </div>
    <div data-rcols style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">${colsHtml}</div>`;
  const footer = `${!isNew ? `<button class="btn btn-danger" data-del style="margin-right:auto">${App.ICONS.trash}删除</button>` : ""}<button class="btn" data-cancel>取消</button><button class="btn btn-primary" data-save>${App.ICONS.check}保存</button>`;
  const m = App.UI.modal({ title: isNew ? "新建复盘" : "编辑复盘", body, footer, width: "wide" });
  let curType = type;
  m.body.querySelectorAll("[data-rtype]").forEach((chip) => chip.addEventListener("click", () => {
    curType = chip.dataset.rtype;
    m.body.querySelectorAll("[data-rtype]").forEach((x) => x.classList.remove("active"));
    chip.classList.add("active");
    const cols = RETRO_TYPES[curType].cols;
    m.body.querySelector("[data-rcols]").innerHTML = cols.map((c, i) => `
      <div class="field" style="margin-bottom:0"><label>${c}</label>
      <textarea class="textarea" name="col${i + 1}" rows="5" placeholder="每行一条"></textarea></div>`).join("");
  }));
  const save = async () => {
    const title = m.body.querySelector("[name=title]").value.trim();
    if (!title) { App.UI.toast("请填写复盘主题", "error"); return; }
    const items = {};
    RETRO_TYPES[curType].cols.forEach((_, i) => {
      const v = m.body.querySelector(`[name=col${i + 1}]`);
      items["c" + (i + 1)] = v ? v.value.split("\n").map((x) => x.trim().replace(/^[·\-*]\s*/, "")).filter(Boolean) : [];
    });
    const data = { title, projectId: m.body.querySelector("[name=projectId]").value || null, type: curType, items };
    try {
      if (isNew) await App.DB.retros.create(data); else await App.DB.retros.update(rt.id, data);
      m.close(); App.UI.toast(isNew ? "复盘已创建" : "复盘已更新"); App.render();
    } catch (e) { App.UI.toast(e.message, "error"); }
  };
  m.foot.querySelector("[data-save]").addEventListener("click", save);
  m.foot.querySelector("[data-cancel]").addEventListener("click", () => m.close());
  if (!isNew) m.foot.querySelector("[data-del]").addEventListener("click", async () => {
    const ok = await App.UI.confirm({ title: "删除复盘", text: `确定删除「${rt.title}」吗？`, okText: "删除", danger: true });
    if (!ok) return;
    await App.DB.retros.remove(rt.id); m.close(); App.UI.toast("已删除"); App.render();
  });
}

const retrosView = {
  render() {
    const S = App.DB.state;
    const list = S.retros.slice().sort((a, b) => b.createdAt - a.createdAt);
    const cards = list.map((rt) => {
      const p = S.projects.find((x) => x.id === rt.projectId);
      const t = RETRO_TYPES[rt.type] || RETRO_TYPES.kpt;
      const items = rt.items || {};
      const total = Object.keys(items).reduce((s, k) => s + (items[k] || []).length, 0);
      return `
      <div class="card card-hover" data-retro="${rt.id}" style="padding:18px 20px;cursor:pointer">
        <div class="flex">
          <span class="goal-icon" style="background:var(--warning-soft);color:var(--warning)">${App.ICONS.refresh}</span>
          <div class="flex-1" style="min-width:0">
            <div class="li-title ellipsis">${escapeHtml(rt.title)}</div>
            <div class="li-sub">${p ? escapeHtml(p.name) : "未关联项目"} · ${t.label} · ${total} 条</div>
          </div>
          <div class="row-actions"><button class="row-btn" data-edit>${App.ICONS.edit}</button><button class="row-btn danger" data-del>${App.ICONS.trash}</button></div>
        </div>
        <div class="grid mt-12" style="grid-template-columns:1fr 1fr 1fr;gap:8px">
          ${t.cols.map((c, i) => {
            const its = items["c" + (i + 1)] || [];
            return `<div style="background:var(--surface-2);border-radius:10px;padding:10px">
              <div class="small" style="font-weight:600;margin-bottom:6px">${c}</div>
              ${its.slice(0, 4).map((x) => `<div class="small muted" style="padding:2px 0">· ${escapeHtml(x)}</div>`).join("") || `<div class="small muted">—</div>`}
            </div>`;
          }).join("")}
        </div>
      </div>`;
    }).join("");
    return `
    <div class="view">
      <div class="page-head"><div><div class="page-title">回顾</div><div class="page-desc">复盘迭代，持续改进 · 共 ${list.length} 次</div></div>
      <div class="page-actions"><button class="btn btn-primary" data-new>${App.ICONS.plus}新建复盘</button></div></div>
      ${list.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:16px">${cards}</div>` : App.v.empty("refresh", "还没有复盘", "一个迭代结束后，用 KPT 模板复盘：保持什么、问题在哪、下次尝试什么。", `<button class="btn btn-primary" data-new>${App.ICONS.plus}新建复盘</button>`)}
    </div>`;
  },
  bind(el) {
    el.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", () => openRetroModal(null)));
    el.querySelectorAll("[data-retro]").forEach((card) => {
      const rt = App.DB.state.retros.find((x) => x.id === card.dataset.retro);
      card.querySelector("[data-edit]").addEventListener("click", (e) => { e.stopPropagation(); openRetroModal(rt); });
      card.querySelector("[data-del]").addEventListener("click", (e) => {
        e.stopPropagation();
        App.UI.confirm({ title: "删除复盘", text: `确定删除「${rt.title}」吗？`, okText: "删除", danger: true }).then(async (okk) => {
          if (!okk) return;
          await App.DB.retros.remove(rt.id); App.UI.toast("已删除"); App.render();
        });
      });
      card.addEventListener("click", (e) => { if (!e.target.closest(".row-actions")) openRetroModal(rt); });
    });
  },
};

/* ================= 报告中心 ================= */
const reportsView = {
  data: null,
  async load() {
    try { this.data = await App.DB.reports(); return true; } catch (e) { App.UI.toast(e.message, "error"); return false; }
  },
  render() {
    const d = this.data;
    if (!d) return `<div class="view"><div class="page-head"><div class="page-title">报告中心</div></div><div class="skeleton" style="height:200px"></div></div>`;
    const T = d.totals;
    const fmt = (m) => App.fmtDurShort(m);
    const maxDay = Math.max(...d.timeByDay.map((x) => x.minutes), 1);
    const last14 = d.timeByDay.slice(-14);
    const dayBars = last14.map((x) => {
      const h = Math.round((x.minutes / maxDay) * 100);
      return `<div class="bar-col"><span class="bar-val">${x.minutes ? Math.round(x.minutes / 60 * 10) / 10 : ""}</span>
        <div class="bar ${x.minutes ? "" : "empty-bar"}" style="height:${Math.max(h, x.minutes ? 8 : 3)}%"></div>
        <span class="bar-label">${x.date.slice(5)}</span></div>`;
    }).join("");
    const projRows = d.projects.map((p) => `
      <tr><td><span class="proj-dot" style="background:${p.color}"></span>${escapeHtml(p.name)}</td>
      <td>${p.tasks}</td><td>${p.done}</td><td style="color:${p.overdue ? "var(--danger)" : "inherit"}">${p.overdue}</td>
      <td><div class="flex gap-8"><div class="progress flex-1" style="min-width:60px"><i style="width:${p.progress}%"></i></div><span class="small mono">${p.progress}%</span></div></td>
      <td class="mono">${fmt(p.minutes)}</td></tr>`).join("") || `<tr><td colspan="6" class="muted small">暂无数据</td></tr>`;
    const userRows = d.timeByUser.filter((u) => u.minutes).map((u) => `<tr><td>${escapeHtml(u.name)}</td><td class="mono">${fmt(u.minutes)}</td></tr>`).join("") || `<tr><td colspan="2" class="muted small">暂无数据</td></tr>`;
    const clientRows = d.clients.map((c) => `<tr><td>${escapeHtml(c.title)}</td><td>${escapeHtml(c.projectName)}</td><td>${c.tasks}</td><td class="mono">${fmt(c.minutes)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted small">暂无客户数据</td></tr>`;
    return `
    <div class="view">
      <div class="page-head"><div><div class="page-title">报告中心</div><div class="page-desc">工时与项目数据一览</div></div>
      <div class="page-actions">
        <button class="btn" data-exportcsv>${App.ICONS.download}导出任务 CSV</button>
      </div></div>

      <div class="grid grid-4 mb-16">
        <div class="card stat-card" style="--glow:var(--primary-soft)"><div class="stat-icon" style="background:var(--primary-soft);color:var(--primary)">${App.ICONS.task}</div><div class="stat-num">${T.tasks}</div><div class="stat-label">任务总数</div></div>
        <div class="card stat-card" style="--glow:var(--success-soft)"><div class="stat-icon" style="background:var(--success-soft);color:var(--success)">${App.ICONS.check}</div><div class="stat-num">${T.done}</div><div class="stat-label">已完成 · ${T.tasks ? Math.round(T.done / T.tasks * 100) : 0}%</div></div>
        <div class="card stat-card" style="--glow:var(--danger-soft)"><div class="stat-icon" style="background:var(--danger-soft);color:var(--danger)">${App.ICONS.alert}</div><div class="stat-num">${T.overdue}</div><div class="stat-label">逾期任务</div></div>
        <div class="card stat-card" style="--glow:var(--warning-soft)"><div class="stat-icon" style="background:var(--warning-soft);color:var(--warning)">${App.ICONS.timer}</div><div class="stat-num">${fmt(T.minutes)}</div><div class="stat-label">累计专注</div></div>
      </div>

      <div class="section"><div class="section-head"><span class="section-title">近 14 天工时趋势</span><span class="section-sub">小时/天</span></div>
        <div class="card card-pad"><div class="bars">${dayBars}</div></div></div>

      <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px">
        <div class="section"><div class="section-head"><span class="section-title">项目报表</span></div>
          <div class="card" style="overflow-x:auto"><table class="table"><thead><tr><th>项目</th><th>任务</th><th>完成</th><th>逾期</th><th>进度</th><th>工时</th></tr></thead><tbody>${projRows}</tbody></table></div></div>
        <div class="section"><div class="section-head"><span class="section-title">成员工时</span></div>
          <div class="card" style="overflow-x:auto"><table class="table"><thead><tr><th>成员</th><th>累计工时</th></tr></thead><tbody>${userRows}</tbody></table></div></div>
      </div>

      <div class="section"><div class="section-head"><span class="section-title">客户报表</span></div>
        <div class="card" style="overflow-x:auto"><table class="table"><thead><tr><th>客户</th><th>关联项目</th><th>任务数</th><th>工时</th></tr></thead><tbody>${clientRows}</tbody></table></div></div>
    </div>`;
  },
  bind(el) {
    el.querySelector("[data-exportcsv]").addEventListener("click", async () => {
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
  },
};

/* 将扩展视图合并进全局视图注册表（Views 为全局词法绑定，跨 script 可见） */
if (typeof Views !== "undefined") {
  const titleMap = { gantt: "甘特图", calendar: "日历", clients: "客户", ideas: "想法", canvas: "画布", milestones: "里程碑", files: "文件库", notifications: "通知", retros: "回顾", reports: "报告中心" };
  Object.keys(window.ExtraViews).forEach((k) => {
    Views[k] = { title: titleMap[k] || k, view: window.ExtraViews[k] };
  });
  Views.retros = { title: "回顾", view: retrosView };
  Views.reports = { title: "报告中心", view: reportsView };
}
window.reportsView = reportsView;
window.retrosView = retrosView;
window.openRetroModal = openRetroModal;
