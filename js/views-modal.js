/* ============================================================
   灵犀工作台 · 弹窗组件：任务（含评论）/ 项目（含成员）/ 目标 / 笔记 / 时间日志
   ============================================================ */
"use strict";

/* ---------- 任务编辑弹窗（含评论） ---------- */
function openTaskModal(task, opts = {}) {
  const S = App.DB.state;
  const isNew = !task;
  const d = opts.defaults || {};

  const colOptions = S.columns.map((c) => ({ value: c.id, label: c.name }));
  const projOptions = [{ value: "", label: "无项目" }].concat(S.projects.map((p) => ({ value: p.id, label: p.name })));
  const priOptions = [
    { value: "high", label: "高 · 优先处理" },
    { value: "mid", label: "中 · 常规" },
    { value: "low", label: "低 · 有空再做" },
  ];

  // 负责人选项：项目成员 + 自己
  const assigneeOptions = [];
  if (S.user) assigneeOptions.push({ value: S.user.id, label: `${S.user.displayName}（我）` });
  if (task && task.projectId) {
    S.members.filter((mm) => mm.projectId === task.projectId && mm.userId !== S.user.id && mm.user).forEach((mm) =>
      assigneeOptions.push({ value: mm.userId, label: mm.user.displayName }));
  }
  const assigneeHtml = assigneeOptions.length
    ? App.UI.selectHtml("assigneeId", [{ value: "", label: "未分配" }].concat(assigneeOptions), task ? task.assigneeId || "" : "")
    : `<input class="input" value="仅你自己" disabled>`;

  // 前置任务（依赖）与里程碑：基于当前/目标项目
  const curProjId = task ? task.projectId : (d.projectId || null);
  const projTasks = S.tasks.filter((x) => x.projectId === curProjId && x.id !== (task ? task.id : null));
  const depOptions = projTasks.map((x) => ({ value: x.id, label: x.title.length > 22 ? x.title.slice(0, 22) + "…" : x.title }));
  const depSelHtml = depOptions.length
    ? `<select class="select" name="dependencies" multiple size="4" style="min-height:96px">${depOptions.map((o) => `<option value="${o.value}" ${(task && (task.dependencies || []).includes(o.value)) ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select>
       <div class="hint">按住 Ctrl/Cmd 可多选 · 前置任务完成前，本任务不建议开始</div>`
    : `<div class="muted small">（在「所属项目」下创建其他任务后，可在此设置依赖）</div>`;
  const msOptions = [{ value: "", label: "不归属里程碑" }].concat(S.milestones.filter((m) => m.projectId === curProjId).map((m) => ({ value: m.id, label: m.title })));
  const msSelHtml = S.milestones.some((m) => m.projectId === curProjId)
    ? App.UI.selectHtml("milestoneId", msOptions, task ? task.milestoneId || "" : "")
    : `<div class="muted small">（暂无里程碑，可在「里程碑」模块创建）</div>`;

  const tags = task ? task.tags || [] : (d.tags || []);
  const subs = task ? task.subtasks || [] : [];
  const comments = task ? S.comments.filter((c) => c.taskId === task.id).sort((a, b) => a.createdAt - b.createdAt) : [];

  const subsHtml = (list) => list.map((s) =>
    `<div class="subtask-row">
       <span class="check ${s.done ? "on" : ""}" data-subcheck>${App.ICONS.check}</span>
       <span class="st-title ${s.done ? "done" : ""}" data-subtitle>${escapeHtml(s.title)}</span>
       <span class="st-del" data-subdel>${App.ICONS.close}</span>
     </div>`).join("");

  const commentsHtml = comments.length ? comments.map((c) => `
    <div class="list-item" style="padding:9px 4px;align-items:flex-start">
      <span class="avatar" style="width:26px;height:26px;font-size:11px">${escapeHtml((c.user && c.user.displayName || "?").slice(0, 1))}</span>
      <div class="flex-1" style="min-width:0">
        <div class="flex gap-8"><span class="small" style="font-weight:600">${escapeHtml(c.user ? c.user.displayName : "未知")}</span>
          <span class="small muted">${App.fmtDate(App.dateStr(new Date(c.createdAt)))}</span></div>
        <div class="small mt-4" style="word-break:break-word">${App.mdRender(c.content)}</div>
      </div>
      <button class="row-btn danger" data-cmdel="${c.id}" style="display:${(c.userId === S.user.id) || S.isAdmin ? "" : "none"}">${App.ICONS.trash}</button>
    </div>`).join("")
    : `<div class="muted small" style="padding:6px 2px">还没有评论，说点什么吧</div>`;

  const body = `
    <div class="field">
      <label>任务标题 <span class="req">*</span></label>
      <input class="input" name="title" value="${escapeHtml(task ? task.title : (d.title || ""))}" placeholder="要做点什么？">
    </div>
    <div class="field">
      <label>任务描述</label>
      <textarea class="textarea" name="desc" rows="3" placeholder="补充细节（可选）">${escapeHtml(task ? task.desc || "" : "")}</textarea>
    </div>
    <div class="form-grid">
      <div class="field"><label>所属项目</label>${App.UI.selectHtml("projectId", projOptions, task ? task.projectId || "" : d.projectId || "")}</div>
      <div class="field"><label>状态</label>${App.UI.selectHtml("colId", colOptions, task ? task.colId : (d.colId || S.columns[0].id))}</div>
      <div class="field"><label>优先级</label>${App.UI.selectHtml("priority", priOptions, task ? task.priority : (d.priority || "mid"))}</div>
      <div class="field"><label>截止日期</label><input class="input" type="date" name="dueDate" value="${escapeHtml(task ? task.dueDate || "" : d.dueDate || "")}"></div>
      <div class="field"><label>开始日期（甘特图）</label><input class="input" type="date" name="startDate" value="${escapeHtml(task ? task.startDate || "" : "")}"></div>
      <div class="field"><label>负责人</label>${assigneeHtml}</div>
      <div class="field"><label>归属里程碑</label>${msSelHtml}</div>
      <div class="field"><label>前置任务（依赖）</label>${depSelHtml}</div>
    </div>
    <div class="field">
      <label>标签</label>
      <div class="tag-input-wrap" data-tagwrap>
        ${tags.map((t) => `<span class="tag-chip">${escapeHtml(t)}<span class="x" data-tagdel>×</span></span>`).join("")}
        <input class="tag-input" placeholder="输入后按回车添加">
      </div>
    </div>
    <div class="field">
      <label>子任务</label>
      <div class="subtask-list">${subsHtml(subs)}</div>
      <button class="btn btn-sm mt-8" data-addsub>${App.ICONS.plus}添加子任务</button>
    </div>
    ${!isNew ? `
    <div class="field">
      <label>评论</label>
      <div class="card" style="padding:10px 12px;background:var(--surface-2);border:none">
        ${commentsHtml}
        <div class="flex gap-8 mt-8">
          <input class="input" data-cminput placeholder="写下评论… 支持 Markdown" style="flex:1">
          <button class="btn btn-primary btn-sm" data-cmsend>${App.ICONS.send || App.ICONS.check}发送</button>
        </div>
      </div>
    </div>` : ""}`;

  const footer = `
    ${!isNew ? `<button class="btn btn-danger" data-del style="margin-right:auto">${App.ICONS.trash}删除</button>` : ""}
    <button class="btn" data-cancel>取消</button>
    <button class="btn btn-primary" data-save>${App.ICONS.check}保存</button>`;

  const m = App.UI.modal({ title: isNew ? "新建任务" : "编辑任务", body, footer, width: "wide" });

  /* 标签交互 */
  const tagWrap = m.body.querySelector("[data-tagwrap]");
  const tagInput = tagWrap.querySelector(".tag-input");
  const tagList = [];
  tags.forEach((t) => tagList.push(t));
  tagWrap.addEventListener("click", (e) => {
    const x = e.target.closest("[data-tagdel]");
    if (!x) return;
    const chip = x.closest(".tag-chip");
    const v = chip.textContent.replace("×", "").trim();
    chip.remove();
    const idx = tagList.indexOf(v);
    if (idx >= 0) tagList.splice(idx, 1);
  });
  tagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = tagInput.value.trim();
      if (v && !tagList.includes(v)) {
        tagList.push(v);
        const chip = document.createElement("span");
        chip.className = "tag-chip";
        chip.innerHTML = `${escapeHtml(v)}<span class="x" data-tagdel>×</span>`;
        tagWrap.insertBefore(chip, tagInput);
      }
      tagInput.value = "";
    }
  });

  /* 子任务交互 */
  const subList = m.body.querySelector(".subtask-list");
  const subData = subs.slice();
  const renderSubs = () => { subList.innerHTML = subsHtml(subData); };
  m.body.querySelector("[data-addsub]").addEventListener("click", () => {
    const title = prompt("子任务标题", "");
    if (title && title.trim()) { subData.push({ id: App.uid(), title: title.trim(), done: false }); renderSubs(); }
  });
  subList.addEventListener("click", (e) => {
    const row = e.target.closest(".subtask-row");
    if (!row) return;
    const idx = [...subList.children].indexOf(row);
    if (e.target.closest("[data-subdel]")) { subData.splice(idx, 1); renderSubs(); }
    else if (e.target.closest("[data-subcheck]")) { subData[idx].done = !subData[idx].done; renderSubs(); }
    else if (e.target.closest("[data-subtitle]")) {
      const v = prompt("修改子任务", subData[idx].title);
      if (v && v.trim()) { subData[idx].title = v.trim(); renderSubs(); }
    }
  });

  /* 评论交互 */
  const cmInput = m.body.querySelector("[data-cminput]");
  const cmSend = m.body.querySelector("[data-cmsend]");
  if (cmSend) {
    cmSend.addEventListener("click", async () => {
      const content = cmInput.value.trim();
      if (!content) { App.UI.toast("评论不能为空", "error"); return; }
      try {
        await App.DB.createComment(task.id, content);
        m.close();
        openTaskModal(App.DB.state.tasks.find((x) => x.id === task.id));
        App.UI.toast("评论已发布");
      } catch (e) { App.UI.toast(e.message, "error"); }
    });
    cmInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); cmSend.click(); } });
  }
  m.body.querySelectorAll("[data-cmdel]").forEach((b) => b.addEventListener("click", async () => {
    await App.DB.deleteComment(b.dataset.cmdel);
    m.close();
    openTaskModal(App.DB.state.tasks.find((x) => x.id === task.id));
    App.UI.toast("评论已删除");
  }));

  const save = async () => {
    const title = m.body.querySelector("[name=title]").value.trim();
    if (!title) { App.UI.toast("请填写任务标题", "error"); return; }
    const data = {
      title,
      desc: m.body.querySelector("[name=desc]").value.trim(),
      projectId: m.body.querySelector("[name=projectId]").value || null,
      colId: m.body.querySelector("[name=colId]").value,
      priority: m.body.querySelector("[name=priority]").value,
      dueDate: m.body.querySelector("[name=dueDate]").value || "",
      startDate: m.body.querySelector("[name=startDate]").value || "",
      tags: tagList,
      subtasks: subData.map((s) => ({ id: s.id, title: s.title, done: s.done })),
    };
    const as = m.body.querySelector("[name=assigneeId]");
    if (as) data.assigneeId = as.value || null;
    const ms = m.body.querySelector("[name=milestoneId]");
    if (ms) data.milestoneId = ms.value || null;
    const dep = m.body.querySelector("[name=dependencies]");
    if (dep) data.dependencies = [...dep.selectedOptions].map((o) => o.value);
    try {
      if (isNew) await App.DB.createTask(data);
      else await App.DB.updateTask(task.id, data);
      m.close();
      App.UI.toast(isNew ? "任务已创建" : "任务已更新");
      App.render();
    } catch (e) { App.UI.toast(e.message, "error"); }
  };

  m.foot.querySelector("[data-save]").addEventListener("click", save);
  m.foot.querySelector("[data-cancel]").addEventListener("click", () => m.close());
  if (!isNew) {
    m.foot.querySelector("[data-del]").addEventListener("click", async () => {
      const ok = await App.UI.confirm({ title: "删除任务", text: `确定删除「${task.title}」吗？相关的时间记录和评论会一并删除。`, okText: "删除", danger: true });
      if (!ok) return;
      await App.DB.deleteTask(task.id);
      m.close();
      App.UI.toast("任务已删除");
      App.render();
    });
  }

  m.body.querySelector("[name=title]").addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
}

/* ---------- 项目编辑弹窗（含成员管理） ---------- */
function openProjectModal(proj) {
  const S = App.DB.state;
  const isNew = !proj;
  const members = proj ? S.members.filter((mm) => mm.projectId === proj.id) : [];
  const memberRows = members.length ? members.map((mm) => {
    const roleOptions = [{ value: "owner", label: "负责人" }, { value: "editor", label: "可编辑" }, { value: "viewer", label: "只读" }];
    const canManage = S.isAdmin || (proj && proj.myRole === "owner");
    return `
    <div class="list-item" style="padding:8px 6px">
      ${App.v ? App.v.avatar(mm.user ? mm.user.displayName : "?") : `<span class="avatar">?</span>`}
      <div class="flex-1" style="min-width:0">
        <div class="li-title" style="font-size:13px">${escapeHtml(mm.user ? mm.user.displayName : "未知用户")}</div>
        <div class="li-sub">${escapeHtml(mm.user ? mm.user.username : "")}</div>
      </div>
      ${canManage ? `<select class="select" data-role="${mm.userId}" style="min-width:86px;padding:5px 24px 5px 9px;font-size:12px">${roleOptions.map((r) => `<option value="${r.value}" ${mm.role === r.value ? "selected" : ""}>${r.label}</option>`).join("")}</select>` : `<span class="tag tag-gray">${({ owner: "负责人", editor: "可编辑", viewer: "只读" })[mm.role] || mm.role}</span>`}
      ${canManage && mm.userId !== S.user.id ? `<button class="row-btn danger" data-delmember="${mm.userId}">${App.ICONS.close}</button>` : ""}
    </div>`;
  }).join("") : `<div class="muted small" style="padding:8px 2px">暂无成员</div>`;

  const body = `
    <div class="field"><label>项目名称 <span class="req">*</span></label><input class="input" name="name" value="${escapeHtml(proj ? proj.name : "")}" placeholder="例如：灵思Agent 平台"></div>
    <div class="field"><label>项目描述</label><textarea class="textarea" name="desc" rows="3" placeholder="这个项目要达成什么？">${escapeHtml(proj ? proj.desc || "" : "")}</textarea></div>
    <div class="form-grid">
      <div class="field"><label>项目颜色</label>${App.UI.colorDotsHtml("color", App.PROJ_COLORS, proj ? proj.color : App.PROJ_COLORS[0])}</div>
      <div class="field"><label>状态</label>${App.UI.selectHtml("status", [{ value: "active", label: "进行中" }, { value: "archived", label: "已归档" }], proj ? proj.status : "active")}</div>
    </div>
    ${!isNew ? `
    <div class="field">
      <label>项目成员（${members.length}）</label>
      <div style="border-top:1px solid var(--border)">${memberRows}</div>
      <div class="flex gap-8 mt-8">
        <select class="select" data-adduser style="flex:1">
          <option value="">选择用户添加…</option>
          ${S.allUsers.filter((u) => u.id !== S.user.id && !members.find((mm) => mm.userId === u.id)).map((u) => `<option value="${u.id}">${escapeHtml(u.displayName)}（${escapeHtml(u.username)}）</option>`).join("")}
        </select>
        <select class="select" data-addrole style="width:100px">
          <option value="editor">可编辑</option>
          <option value="viewer">只读</option>
        </select>
        <button class="btn btn-sm" data-addmember ${S.isAdmin || proj.myRole === "owner" ? "" : "disabled"}>${App.ICONS.plus}添加</button>
      </div>
      <div class="hint">仅项目负责人可管理成员。给朋友分配「可编辑」即可共同协作。</div>
    </div>` : ""}`;

  const footer = `
    ${!isNew ? `<button class="btn btn-danger" data-del style="margin-right:auto">${App.ICONS.trash}删除项目</button>` : ""}
    <button class="btn" data-cancel>取消</button>
    <button class="btn btn-primary" data-save>${App.ICONS.check}保存</button>`;

  const m = App.UI.modal({ title: isNew ? "新建项目" : "编辑项目", body, footer, width: "wide" });

  m.body.querySelectorAll("[data-colorpicker=color] .color-dot").forEach((dot) => {
    dot.addEventListener("click", () => {
      m.body.querySelectorAll("[data-colorpicker=color] .color-dot").forEach((x) => x.classList.remove("sel"));
      dot.classList.add("sel");
    });
  });

  /* 成员管理 */
  const addUser = m.body.querySelector("[data-adduser]");
  if (addUser) {
    m.body.querySelector("[data-addmember]").addEventListener("click", async () => {
      const uid2 = addUser.value;
      const role = m.body.querySelector("[data-addrole]").value;
      if (!uid2) { App.UI.toast("请选择用户", "error"); return; }
      try {
        await App.DB.addMember(proj.id, uid2, role);
        m.close(); openProjectModal(App.DB.state.projects.find((x) => x.id === proj.id));
        App.UI.toast("成员已添加");
      } catch (e) { App.UI.toast(e.message, "error"); }
    });
    m.body.querySelectorAll("[data-role]").forEach((sel) => sel.addEventListener("change", async () => {
      try { await App.DB.addMember(proj.id, sel.dataset.role, sel.value); App.UI.toast("角色已更新"); } catch (e) { App.UI.toast(e.message, "error"); }
    }));
    m.body.querySelectorAll("[data-delmember]").forEach((b) => b.addEventListener("click", async () => {
      const ok = await App.UI.confirm({ title: "移除成员", text: "确定移除该成员吗？", okText: "移除", danger: true });
      if (!ok) return;
      try {
        await App.DB.removeMember(proj.id, b.dataset.delmember);
        m.close(); openProjectModal(App.DB.state.projects.find((x) => x.id === proj.id));
        App.UI.toast("成员已移除");
      } catch (e) { App.UI.toast(e.message, "error"); }
    }));
  }

  const save = async () => {
    const name = m.body.querySelector("[name=name]").value.trim();
    if (!name) { App.UI.toast("请填写项目名称", "error"); return; }
    const color = m.body.querySelector("[data-colorpicker=color] .color-dot.sel")?.dataset.color || App.PROJ_COLORS[0];
    const data = { name, desc: m.body.querySelector("[name=desc]").value.trim(), color, status: m.body.querySelector("[name=status]").value };
    try {
      if (isNew) await App.DB.createProject(data);
      else await App.DB.updateProject(proj.id, data);
      m.close();
      App.UI.toast(isNew ? "项目已创建" : "项目已更新");
      App.render();
    } catch (e) { App.UI.toast(e.message, "error"); }
  };

  m.foot.querySelector("[data-save]").addEventListener("click", save);
  m.foot.querySelector("[data-cancel]").addEventListener("click", () => m.close());
  if (!isNew) {
    m.foot.querySelector("[data-del]").addEventListener("click", async () => {
      const cnt = S.tasks.filter((t) => t.projectId === proj.id).length;
      const ok = await App.UI.confirm({
        title: "删除项目",
        text: `确定删除「${proj.name}」吗？项目下的 ${cnt} 个任务、评论、文件等将全部删除，且不可恢复。`,
        okText: "删除", danger: true,
      });
      if (!ok) return;
      await App.DB.deleteProject(proj.id);
      m.close();
      App.UI.toast("项目已删除");
      App.render();
    });
  }
}

/* ---------- 目标编辑弹窗 ---------- */
function openGoalModal(goal) {
  const S = App.DB.state;
  const isNew = !goal;
  const krs = goal ? goal.krs || [] : [];

  const krHtml = (list) => list.map((k, i) =>
    `<div class="kr-item" style="margin-top:8px">
       <span style="color:var(--text-3);font-weight:700;font-size:12px">${i + 1}</span>
       <input class="input" data-krtitle value="${escapeHtml(k.title)}" placeholder="关键结果" style="flex:1;padding:7px 11px">
       <input type="range" data-krval min="0" max="100" step="5" value="${k.value || 0}" style="width:90px;accent-color:var(--primary)">
       <span class="kr-val mono" data-krnum>${k.value || 0}%</span>
       <span class="st-del" data-krdel>${App.ICONS.close}</span>
     </div>`).join("");

  const body = `
    <div class="field"><label>目标名称 <span class="req">*</span></label><input class="input" name="title" value="${escapeHtml(goal ? goal.title : "")}" placeholder="例如：打造体验一流的个人工作台"></div>
    <div class="field"><label>目标描述</label><textarea class="textarea" name="desc" rows="2" placeholder="为什么设定这个目标？">${escapeHtml(goal ? goal.desc || "" : "")}</textarea></div>
    <div class="form-grid">
      <div class="field"><label>目标颜色</label>${App.UI.colorDotsHtml("gcolor", App.NOTE_COLORS, goal ? goal.color : App.NOTE_COLORS[0])}</div>
      <div class="field"><label>截止日期</label><input class="input" type="date" name="dueDate" value="${escapeHtml(goal ? goal.dueDate || "" : "")}"></div>
    </div>
    <div class="field">
      <label>关键结果（KRs）</label>
      <div data-krlist>${krHtml(krs)}</div>
      <button class="btn btn-sm mt-8" data-addkr>${App.ICONS.plus}添加关键结果</button>
    </div>`;

  const footer = `
    ${!isNew ? `<button class="btn btn-danger" data-del style="margin-right:auto">${App.ICONS.trash}删除目标</button>` : ""}
    <button class="btn" data-cancel>取消</button>
    <button class="btn btn-primary" data-save>${App.ICONS.check}保存</button>`;

  const m = App.UI.modal({ title: isNew ? "新建目标" : "编辑目标", body, footer, width: "wide" });

  const krList = m.body.querySelector("[data-krlist]");
  const krData = krs.map((k) => ({ id: k.id, title: k.title, value: k.value }));
  const renderKrs = () => { krList.innerHTML = krHtml(krData); };
  const bindKr = () => {
    krList.querySelectorAll(".kr-item").forEach((row, i) => {
      const titleIn = row.querySelector("[data-krtitle]");
      const valIn = row.querySelector("[data-krval]");
      const numIn = row.querySelector("[data-krnum]");
      titleIn.addEventListener("input", () => { krData[i].title = titleIn.value; });
      valIn.addEventListener("input", () => { krData[i].value = +valIn.value; numIn.textContent = valIn.value + "%"; });
      row.querySelector("[data-krdel]").addEventListener("click", () => { krData.splice(i, 1); renderKrs(); bindKr(); });
    });
  };
  m.body.querySelector("[data-addkr]").addEventListener("click", () => {
    krData.push({ id: App.uid(), title: "", value: 0 });
    renderKrs(); bindKr();
    const last = krList.lastElementChild.querySelector("[data-krtitle]");
    if (last) last.focus();
  });
  renderKrs(); bindKr();

  m.body.querySelectorAll("[data-colorpicker=gcolor] .color-dot").forEach((dot) => {
    dot.addEventListener("click", () => {
      m.body.querySelectorAll("[data-colorpicker=gcolor] .color-dot").forEach((x) => x.classList.remove("sel"));
      dot.classList.add("sel");
    });
  });

  const save = async () => {
    const title = m.body.querySelector("[name=title]").value.trim();
    if (!title) { App.UI.toast("请填写目标名称", "error"); return; }
    const data = {
      title,
      desc: m.body.querySelector("[name=desc]").value.trim(),
      color: m.body.querySelector("[data-colorpicker=gcolor] .color-dot.sel")?.dataset.color || App.NOTE_COLORS[0],
      dueDate: m.body.querySelector("[name=dueDate]").value || "",
      krs: krData.filter((k) => k.title.trim()).map((k) => ({ id: k.id, title: k.title.trim(), value: clamp(+k.value, 0, 100) })),
    };
    try {
      if (isNew) await App.DB.createGoal(data);
      else await App.DB.updateGoal(goal.id, data);
      m.close();
      App.UI.toast(isNew ? "目标已创建" : "目标已更新");
      App.render();
    } catch (e) { App.UI.toast(e.message, "error"); }
  };

  m.foot.querySelector("[data-save]").addEventListener("click", save);
  m.foot.querySelector("[data-cancel]").addEventListener("click", () => m.close());
  if (!isNew) {
    m.foot.querySelector("[data-del]").addEventListener("click", async () => {
      const ok = await App.UI.confirm({ title: "删除目标", text: `确定删除目标「${goal.title}」及其全部关键结果吗？`, okText: "删除", danger: true });
      if (!ok) return;
      await App.DB.deleteGoal(goal.id);
      m.close();
      App.UI.toast("目标已删除");
      App.render();
    });
  }
}

/* ---------- 笔记编辑弹窗 ---------- */
function openNoteModal(note) {
  const S = App.DB.state;
  const isNew = !note;
  const cats = [...new Set(S.notes.map((n) => n.category).filter(Boolean))];
  const body = `
    <div class="field"><label>笔记标题 <span class="req">*</span></label><input class="input" name="title" value="${escapeHtml(note ? note.title : "")}" placeholder="给笔记起个名字"></div>
    <div class="form-grid">
      <div class="field"><label>分类</label><input class="input" name="category" list="note-cats" value="${escapeHtml(note ? note.category || "" : "随笔")}" placeholder="例如：产品 / 读书"><datalist id="note-cats">${cats.map((c) => `<option value="${escapeHtml(c)}">`).join("")}</datalist></div>
      <div class="field"><label>置顶</label>
        <div style="display:flex;gap:10px;align-items:center;padding-top:4px">
          <span class="filter-chip ${note && note.pinned ? "active" : ""}" data-pin data-on="${note && note.pinned ? 1 : 0}">${App.ICONS.pin}置顶显示</span>
        </div>
      </div>
    </div>
    <div class="field">
      <label>内容（支持 Markdown）</label>
      <textarea class="textarea" name="content" rows="12" placeholder="支持 # 标题、**加粗**、- 列表、> 引用、\`代码\` 等语法">${escapeHtml(note ? note.content || "" : "")}</textarea>
      <div class="hint">支持 Markdown：标题 / 加粗 / 列表 / 引用 / 代码块 / 链接</div>
    </div>`;
  const footer = `
    ${!isNew ? `<button class="btn btn-danger" data-del style="margin-right:auto">${App.ICONS.trash}删除笔记</button>` : ""}
    <button class="btn" data-cancel>取消</button>
    <button class="btn btn-primary" data-save>${App.ICONS.check}保存</button>`;
  const m = App.UI.modal({ title: isNew ? "新建笔记" : "编辑笔记", body, footer, width: "wide" });

  let pinned = !!(note && note.pinned);
  const pinChip = m.body.querySelector("[data-pin]");
  pinChip.addEventListener("click", () => {
    pinned = !pinned;
    pinChip.classList.toggle("active", pinned);
    pinChip.dataset.on = pinned ? 1 : 0;
  });

  const save = async () => {
    const title = m.body.querySelector("[name=title]").value.trim();
    if (!title) { App.UI.toast("请填写笔记标题", "error"); return; }
    const data = {
      title,
      category: m.body.querySelector("[name=category]").value.trim() || "随笔",
      content: m.body.querySelector("[name=content]").value,
      pinned,
    };
    try {
      if (isNew) await App.DB.createNote(data);
      else await App.DB.updateNote(note.id, data);
      m.close();
      App.UI.toast(isNew ? "笔记已创建" : "笔记已更新");
      App.render();
    } catch (e) { App.UI.toast(e.message, "error"); }
  };

  m.foot.querySelector("[data-save]").addEventListener("click", save);
  m.foot.querySelector("[data-cancel]").addEventListener("click", () => m.close());
  if (!isNew) {
    m.foot.querySelector("[data-del]").addEventListener("click", async () => {
      const ok = await App.UI.confirm({ title: "删除笔记", text: `确定删除「${note.title}」吗？`, okText: "删除", danger: true });
      if (!ok) return;
      await App.DB.deleteNote(note.id);
      m.close();
      App.UI.toast("笔记已删除");
      App.render();
    });
  }
}

/* ---------- 时间日志弹窗 ---------- */
function openLogModal() {
  const S = App.DB.state;
  const taskOptions = [{ value: "", label: "未关联任务" }].concat(
    S.tasks.map((t) => ({ value: t.id, label: t.title.length > 28 ? t.title.slice(0, 28) + "…" : t.title }))
  );
  const body = `
    <div class="field"><label>关联任务</label>${App.UI.selectHtml("taskId", taskOptions, "")}</div>
    <div class="form-grid">
      <div class="field"><label>时长（分钟）<span class="req">*</span></label><input class="input" name="minutes" type="number" min="1" max="1440" value="30"></div>
      <div class="field"><label>日期</label><input class="input" name="date" type="date" value="${App.todayStr()}"></div>
    </div>
    <div class="field"><label>备注</label><input class="input" name="note" placeholder="这段时间做了什么？"></div>`;
  const footer = `<button class="btn" data-cancel>取消</button><button class="btn btn-primary" data-save>${App.ICONS.check}记录</button>`;
  const m = App.UI.modal({ title: "记录专注时间", body, footer, width: "narrow" });

  m.foot.querySelector("[data-save]").addEventListener("click", async () => {
    const minutes = parseInt(m.body.querySelector("[name=minutes]").value, 10);
    if (!minutes || minutes < 1) { App.UI.toast("请输入有效时长", "error"); return; }
    try {
      await App.DB.createTimeLog({
        taskId: m.body.querySelector("[name=taskId]").value || null,
        minutes,
        date: m.body.querySelector("[name=date]").value || App.todayStr(),
        note: m.body.querySelector("[name=note]").value.trim(),
      });
      m.close();
      App.UI.toast("已记录专注时间");
      App.render();
    } catch (e) { App.UI.toast(e.message, "error"); }
  });
  m.foot.querySelector("[data-cancel]").addEventListener("click", () => m.close());
}

window.openTaskModal = openTaskModal;
window.openProjectModal = openProjectModal;
window.openGoalModal = openGoalModal;
window.openNoteModal = openNoteModal;
window.openLogModal = openLogModal;
