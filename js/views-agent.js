/* ============================================================
   灵犀工作台 · Agent 中心视图
   四页签：助手对话 / 技能库 / 自动化规则 / 配置与日志
   确定性技能零依赖运行；LLM 配置后升级为自然语言对话
   ============================================================ */
"use strict";

const agentView = {
  data: { skills: [], rules: [], logs: [], projects: [], llm: null, isOwner: false },
  stats: null,
  audit: null,
  messages: [],

  async load() {
    try {
      const [b, st, au] = await Promise.all([
        App.API.get("/api/agent/bootstrap"),
        App.API.get("/api/agent/stats"),
        App.API.get("/api/agent/audit"),
      ]);
      this.data = b;
      this.stats = st;
      this.audit = au;
      return true;
    } catch (e) { App.UI.toast(e.message, "error"); return false; }
  },

  render() {
    const d = this.data;
    const skillCards = d.skills.map((s) => `
      <div class="card card-hover" style="padding:16px 18px;display:flex;flex-direction:column;gap:8px">
        <div class="flex">
          <span class="goal-icon" style="background:var(--primary-soft);color:var(--primary)">${App.ICONS[s.icon] || App.ICONS.sparkles}</span>
          <div class="flex-1"><div class="li-title" style="font-size:14px">${App.escapeHtml(s.label)}</div></div>
        </div>
        <div class="small muted" style="min-height:34px">${App.escapeHtml(s.desc)}</div>
        <button class="btn btn-sm" data-run="${s.name}" style="align-self:flex-start">${App.ICONS.play}运行</button>
      </div>`).join("");

    const ruleRows = d.rules.length ? d.rules.map((r) => `
      <div class="list-item">
        <span class="dot" style="background:${r.enabled ? "var(--success)" : "var(--text-3)"}"></span>
        <div class="flex-1" style="min-width:0">
          <div class="li-title">${App.escapeHtml(r.name)}</div>
          <div class="li-sub mono">${App.escapeHtml(r.cron)} · ${App.escapeHtml(d.skills.find((s) => s.name === r.skill)?.label || r.skill)} · 上次：${r.lastStatus === "ok" ? "成功" : r.lastStatus === "error" ? "失败" : "未执行"}${r.lastMessage ? " - " + App.escapeHtml(r.lastMessage) : ""}</div>
        </div>
        <span class="filter-chip ${r.enabled ? "active" : ""}" data-toggle="${r.id}" style="padding:4px 12px">${r.enabled ? "已启用" : "已停用"}</span>
        <button class="row-btn danger" data-delrule="${r.id}">${App.ICONS.trash}</button>
      </div>`).join("")
      : `<div class="muted small" style="padding:14px 4px">还没有自动化规则，点右上角「新建规则」开始。示例：<span class="mono">0 9 * * 1</span> 每周一 9 点自动生成周报。</div>`;

    const logRows = d.logs.length ? d.logs.slice(0, 15).map((l) => `
      <div class="log-row">
        <span class="log-dur" style="color:${l.status === "ok" ? "var(--success)" : "var(--danger)"};min-width:auto">${l.status === "ok" ? "成功" : "失败"}</span>
        <div class="flex-1" style="min-width:0"><div class="li-title ellipsis" style="font-size:13px">${App.escapeHtml(l.label || l.skill)}</div></div>
        <span class="small muted">${App.fmtDate(App.dateStr(new Date(l.createdAt)))}</span>
      </div>`).join("")
      : `<div class="muted small" style="padding:14px 4px">暂无执行记录</div>`;

    const chatHtml = ""; // 聊天消息由全局 AgentChat 引擎渲染（视图与悬浮窗共享）

    const quickChips = ["怎么用", "怎么邀请朋友", "生成周报", "扫描逾期任务"].map((q) => `<span class="filter-chip" data-quick>${q}</span>`).join("");

    return `
    <div class="view">
      <div class="page-head">
        <div>
          <div class="page-title">Agent 助手</div>
          <div class="page-desc">技能库 + 自动化规则 + 对话助手 · ${d.llm && d.llm.enabled ? "LLM 模式" : "确定性模式"}</div>
        </div>
      </div>
      <div class="filter-bar">
        <span class="filter-chip active" data-tab="chat">💬 助手</span>
        <span class="filter-chip" data-tab="skills">⚙ 技能库</span>
        <span class="filter-chip" data-tab="rules">⏱ 自动化规则</span>
        <span class="filter-chip" data-tab="config">🧩 配置与日志</span>
      </div>

      <div data-panel="chat" class="agent-panel">
        <div class="card" style="display:flex;flex-direction:column;height:460px">
          <div class="chat-list" data-chatlist style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px">${chatHtml}</div>
          <div class="flex gap-8 flex-wrap" style="padding:0 14px 10px;align-items:center">
            ${quickChips}
            <span style="flex:1"></span>
            <button class="icon-btn" data-clearchat title="清空对话">${App.ICONS.trash}</button>
          </div>
          <div style="border-top:1px solid var(--border);padding:12px 14px;display:flex;gap:10px">
            <input class="input" data-chatinput placeholder="问我：怎么用？怎么邀请朋友？" style="flex:1">
            <button class="btn btn-primary" data-chatsend>${App.ICONS.send || App.ICONS.check}发送</button>
          </div>
        </div>
      </div>

      <div data-panel="skills" class="agent-panel" hidden>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px">${skillCards}</div>
      </div>

      <div data-panel="rules" class="agent-panel" hidden>
        <div class="page-head" style="margin-bottom:12px">
          <div class="section-head" style="margin:0"><span class="section-title">定时自动化</span><span class="section-sub">cron 表达式：分 时 日 月 周</span></div>
          <button class="btn btn-primary" data-newrule style="margin-left:auto">${App.ICONS.plus}新建规则</button>
        </div>
        <div class="card"><div class="list" style="padding:8px">${ruleRows}</div></div>
      </div>

      <div data-panel="config" class="agent-panel" hidden>
        ${this.renderStats()}
        ${this.renderAudit()}
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:16px">
          <div class="section">
            <div class="section-head"><span class="section-title">LLM 配置（可选）</span><span class="section-sub">${d.llm && d.llm.enabled ? "已启用" : "未启用"}</span></div>
            <div class="card card-pad">
              ${d.isOwner ? `
              <div class="field"><label>服务商</label>
                <div class="flex gap-8">
                  <span class="filter-chip ${(d.llm && d.llm.provider === "deepseek") || !d.llm ? "active" : ""}" data-prov="deepseek">DeepSeek</span>
                  <span class="filter-chip ${d.llm && d.llm.provider === "openai" ? "active" : ""}" data-prov="openai">OpenAI</span>
                  <span class="filter-chip ${d.llm && d.llm.provider === "custom" ? "active" : ""}" data-prov="custom">自定义</span>
                </div>
              </div>
              <div class="field"><label>API 地址（Base URL）</label><input class="input" data-baseurl placeholder="留空使用默认（DeepSeek: https://api.deepseek.com/v1）" value="${App.escapeHtml(d.llm ? d.llm.baseUrl || "" : "")}"></div>
              <div class="field"><label>模型</label><input class="input" data-model placeholder="deepseek-chat / gpt-4o-mini" value="${App.escapeHtml(d.llm ? d.llm.model || "" : "")}"></div>
              <div class="field"><label>API Key ${d.llm && d.llm.hasKey ? "（已保存，留空不修改）" : ""}</label><input class="input" data-apikey type="password" placeholder="sk-..."></div>
              <div class="flex gap-8">
                <span class="filter-chip ${d.llm && d.llm.enabled ? "active" : ""}" data-llen>启用 LLM 对话</span>
                <button class="btn btn-primary" data-savecfg>${App.ICONS.check}保存配置</button>
              </div>
              <div class="hint mt-8">Key 仅保存在本机服务端 db.json。启用后助手将具备自然语言能力（通过工具注册表操作工作台，遵守权限）。</div>` : `<div class="muted small">仅管理员可配置 LLM。管理员配置后，所有成员都能使用对话助手。</div>`}
            </div>
          </div>
          <div class="section">
            <div class="section-head"><span class="section-title">执行日志</span><span class="section-sub">最近记录</span>${d.isOwner ? `<button class="btn btn-sm" data-clearlogs style="margin-left:auto">${App.ICONS.trash}清空日志</button>` : ""}</div>
            <div class="card card-pad">${logRows}</div>
          </div>
        </div>
      </div>
    </div>`;
  },

  /* 执行统计面板（M7） */
  renderStats() {
    const st = this.stats;
    if (!st) return "";
    const intentBars = (st.byIntent || []).map((x) => {
      const max = Math.max(...(st.byIntent || []).map((i) => i.count), 1);
      return `<div class="flex gap-8" style="justify-content:space-between;padding:3px 0"><span class="small" style="width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${App.escapeHtml(x.intent)}</span><div class="progress flex-1"><i style="width:${Math.round(x.count / max * 100)}%"></i></div><span class="small muted mono">${x.count}</span></div>`;
    }).join("");
    return `
    <div class="section">
      <div class="section-head"><span class="section-title">执行统计</span><span class="section-sub">今日 · 成功率 ${st.successRate}% · 平均 ${st.avgDurationMs}ms</span></div>
      <div class="grid grid-4" style="gap:12px">
        <div class="card stat-card" style="--glow:var(--primary-soft)"><div class="stat-num" style="font-size:22px">${st.today}</div><div class="stat-label">今日执行</div></div>
        <div class="card stat-card" style="--glow:var(--success-soft)"><div class="stat-num" style="font-size:22px">${st.successRate}%</div><div class="stat-label">成功率</div></div>
        <div class="card stat-card" style="--glow:var(--warning-soft)"><div class="stat-num" style="font-size:22px">${st.avgDurationMs}ms</div><div class="stat-label">平均耗时</div></div>
        <div class="card stat-card" style="--glow:var(--accent-soft)"><div class="stat-num" style="font-size:22px">${st.total}</div><div class="stat-label">累计执行</div></div>
      </div>
      <div class="card card-pad mt-12">
        <div class="small muted mb-8">今日意图分布（对话/手动/规则：${st.bySource.chat}/${st.bySource.manual}/${st.bySource.rule}）</div>
        ${intentBars || `<div class="muted small">暂无数据，先和助手聊几句吧</div>`}
        ${(st.byError || []).length ? `<div class="small muted mt-8">错误：${st.byError.map((e) => `${App.escapeHtml(e.code)}×${e.count}`).join(" · ")}</div>` : ""}
      </div>
    </div>`;
  },

  /* 安全护栏审计面板（M5.9） */
  renderAudit() {
    const au = this.audit;
    if (!au) return "";
    const c = au.controls;
    const item = (k, v) => `<div class="list-item" style="padding:7px 4px"><span class="dot" style="background:var(--success)"></span><span class="small" style="width:110px;font-weight:600">${k}</span><span class="small muted flex-1">${App.escapeHtml(v)}</span></div>`;
    return `
    <div class="section">
      <div class="section-head"><span class="section-title">安全护栏审计</span><span class="section-sub">M5 · 自检清单</span></div>
      <div class="card card-pad" style="padding:12px 16px">
        ${item("权限模型", au.permission.model)}
        ${item("写操作分级", "read 只读 / safe 低风险 / write 需确认 / destructive 二次确认")}
        ${item("确认策略", au.confirmPolicy)}
        ${item("禁止自动执行", au.forbiddenAuto.join("、"))}
        ${item("幻觉防控", "确定性技能基于真实数据，无幻觉；LLM 模式强制附数据来源")}
        ${item("隐私", au.privacy.storage + " · token " + au.privacy.tokenTTL)}
        ${item("频率限制", "同操作 10 秒去重 · 规则连续失败自动熔断")}
        ${item("今日执行数", au.todayRuns + " / " + c.maxRunsPerDay + "（每日上限）")}
      </div>
      ${c && this.data.isOwner ? this.renderControls(c) : ""}
    </div>`;
  },

  /* 运维开关（M8.8） */
  renderControls(c) {
    return `
    <div class="card card-pad mt-12">
      <div class="section-head" style="margin-bottom:10px"><span class="section-title">运维开关（仅管理员）</span></div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <div class="flex gap-8"><span class="filter-chip ${c.enabled ? "active" : ""}" data-ctrl="enabled">Agent 启用中 / 已停用</span></div>
        <div class="field" style="margin:0"><label>每日执行上限</label><input class="input" data-ctrlmax type="number" value="${c.maxRunsPerDay}" style="padding:6px 10px"></div>
        <div class="field" style="margin:0"><label>LLM 日调用上限（预留）</label><input class="input" data-ctrlllm type="number" value="${c.llmMaxCallsPerDay}" style="padding:6px 10px"></div>
        <div class="flex gap-8"><span class="filter-chip ${c.ruleBreaker.enabled ? "active" : ""}" data-ctrl="breaker">规则熔断启用中 / 已关闭</span></div>
        <button class="btn btn-primary" data-savectrl>${App.ICONS.check}保存开关</button>
      </div>
      <div class="hint mt-8">Agent 停用后，所有对话与技能调用都会被拒绝。规则熔断：连续失败超过阈值自动停用该规则。</div>
    </div>`;
  },

  async bind(el) {
    const d = this.data;
    const chatList = el.querySelector("[data-chatlist]");
    const chatInput = el.querySelector("[data-chatinput]");

    /* 页签切换 */
    el.querySelectorAll("[data-tab]").forEach((c) => c.addEventListener("click", () => {
      el.querySelectorAll("[data-tab]").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      el.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== c.dataset.tab; });
    }));

    /* 聊天（v2.4+：全局 AgentChat 引擎，视图与悬浮窗共享会话） */
    AgentChat.attach(chatList, chatInput);
    el.querySelector("[data-chatsend]").addEventListener("click", () => AgentChat.sendChat(null, chatInput));
    chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") AgentChat.sendChat(null, chatInput); });
    el.querySelectorAll("[data-quick]").forEach((c) => c.addEventListener("click", () => AgentChat.handleQuick(c.textContent)));
    /* 清空对话（前端共享消息流 + 后端会话状态同步重置） */
    const clearBtn = el.querySelector("[data-clearchat]");
    if (clearBtn) clearBtn.addEventListener("click", async () => {
      const ok = await App.UI.confirm({ title: "清空对话", text: "将清空当前聊天记录（视图与悬浮窗同步），确定？", okText: "清空" });
      if (!ok) return;
      AgentChat.clearMessages();
      try { await App.API.post("/api/agent/session/clear", { sessionId: AgentChat.chatSessionId }); } catch (e) {}
      App.UI.toast("对话已清空");
    });
    el.querySelectorAll("[data-run]").forEach((b) => b.addEventListener("click", () => {
      const name = b.dataset.run;
      const skill = d.skills.find((s) => s.name === name);
      const label = skill ? skill.label : name;
      const hasParams = skill && skill.params && skill.params.length;
      if (!hasParams) { AgentChat.runSkillByName(name, {}, label); return; }
      // 有参数时弹表单
      const fields = skill.params.map((p) => {
        let input;
        if (p.type === "select") {
          const opts = [{ value: "", label: "全部项目" }].concat(d.projects.map((x) => ({ value: x.id, label: x.name })));
          input = App.UI.selectHtml(p.name, opts, "");
        } else if (p.type === "bool") {
          input = `<div class="flex gap-8"><span class="filter-chip" data-bool="${p.name}">${p.label}</span></div>`;
        } else {
          input = `<input class="input" name="${p.name}" placeholder="${App.escapeHtml(p.label)}">`;
        }
        return `<div class="field"><label>${App.escapeHtml(p.label)}</label>${input}</div>`;
      }).join("");
      const m = App.UI.modal({
        title: `运行「${skill.label}」`, width: "narrow",
        body: fields,
        footer: `<button class="btn" data-cancel>取消</button><button class="btn btn-primary" data-go>${App.ICONS.play}运行</button>`,
      });
      m.foot.querySelector("[data-go]").addEventListener("click", async () => {
        const params = {};
        skill.params.forEach((p) => {
          if (p.type === "bool") { const chip = m.body.querySelector(`[data-bool="${p.name}"]`); params[p.name] = !!(chip && chip.classList.contains("active")); }
          else { const v = m.body.querySelector(`[name="${p.name}"]`); params[p.name] = v ? v.value : ""; }
        });
        m.close();
        AgentChat.runSkillByName(name, params, label);
      });
      m.foot.querySelector("[data-cancel]").addEventListener("click", () => m.close());
      m.body.querySelectorAll("[data-bool]").forEach((chip) => chip.addEventListener("click", () => chip.classList.toggle("active")));
    }));

    /* 规则 */
    el.querySelector("[data-newrule]").addEventListener("click", () => {
      const skillOpts = d.skills.map((s) => ({ value: s.name, label: s.label }));
      const body = `
        <div class="field"><label>规则名称 <span class="req">*</span></label><input class="input" name="name" placeholder="例如：每天早上推送今日摘要"></div>
        <div class="field"><label>技能</label>${App.UI.selectHtml("skill", skillOpts, "todo_summary")}</div>
        <div class="field"><label>cron 表达式 <span class="req">*</span></label><input class="input mono" name="cron" value="0 9 * * *" placeholder="分 时 日 月 周">
          <div class="chip-row mt-8">
            <span class="filter-chip" data-cron="0 9 * * *">每天 9:00</span>
            <span class="filter-chip" data-cron="0 9 * * 1">每周一 9:00</span>
            <span class="filter-chip" data-cron="30 18 * * 5">每周五 18:30</span>
            <span class="filter-chip" data-cron="0 8 1 * *">每月 1 日 8:00</span>
          </div></div>`;
      const m = App.UI.modal({ title: "新建自动化规则", body, footer: `<button class="btn" data-cancel>取消</button><button class="btn btn-primary" data-save>${App.ICONS.check}创建</button>` });
      const cronInput = m.body.querySelector("[name=cron]");
      m.body.querySelectorAll("[data-cron]").forEach((c) => c.addEventListener("click", () => { cronInput.value = c.dataset.cron; }));
      m.foot.querySelector("[data-save]").addEventListener("click", async () => {
        const name = m.body.querySelector("[name=name]").value.trim();
        const cron = cronInput.value.trim();
        if (!name || !cron) { App.UI.toast("请填写名称和 cron", "error"); return; }
        try {
          await App.API.post("/api/agent/rules", { name, cron, skill: m.body.querySelector("[name=skill]").value });
          m.close(); App.UI.toast("规则已创建"); await this.load(); App.render();
        } catch (e) { App.UI.toast(e.message, "error"); }
      });
      m.foot.querySelector("[data-cancel]").addEventListener("click", () => m.close());
    });
    el.querySelectorAll("[data-toggle]").forEach((c) => c.addEventListener("click", async () => {
      const r = d.rules.find((x) => x.id === c.dataset.toggle);
      if (!r) return;
      try { await App.API.put(`/api/agent/rules/${r.id}`, { enabled: !r.enabled }); await this.load(); App.render(); } catch (e) { App.UI.toast(e.message, "error"); }
    }));
    el.querySelectorAll("[data-delrule]").forEach((b) => b.addEventListener("click", async () => {
      const ok = await App.UI.confirm({ title: "删除规则", text: "确定删除这条自动化规则吗？", okText: "删除", danger: true });
      if (!ok) return;
      try { await App.API.del(`/api/agent/rules/${b.dataset.delrule}`); await this.load(); App.render(); } catch (e) { App.UI.toast(e.message, "error"); }
    }));

    /* LLM 配置 */
    let prov = (d.llm && d.llm.provider) || "deepseek";
    el.querySelectorAll("[data-prov]").forEach((c) => c.addEventListener("click", () => {
      prov = c.dataset.prov;
      el.querySelectorAll("[data-prov]").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
    }));
    const llenChip = el.querySelector("[data-llen]");
    if (llenChip) {
      llenChip.addEventListener("click", () => llenChip.classList.toggle("active"));
      el.querySelector("[data-savecfg]").addEventListener("click", async () => {
        const defaults = { deepseek: "https://api.deepseek.com/v1", openai: "https://api.openai.com/v1", custom: "" };
        const payload = {
          provider: prov,
          baseUrl: el.querySelector("[data-baseurl]").value.trim() || defaults[prov],
          model: el.querySelector("[data-model]").value.trim(),
          apiKey: el.querySelector("[data-apikey]").value.trim(),
          enabled: llenChip.classList.contains("active"),
        };
        try { await App.API.post("/api/agent/config", { llm: payload }); App.UI.toast("LLM 配置已保存"); await this.load(); App.render(); }
        catch (e) { App.UI.toast(e.message, "error"); }
      });
    }

    /* 清空执行日志（仅管理员；统计随日志归零） */
    const clBtn = el.querySelector("[data-clearlogs]");
    if (clBtn) clBtn.addEventListener("click", async () => {
      const ok = await App.UI.confirm({ title: "清空执行日志", text: "将删除全部执行记录（含执行统计来源），此操作不可恢复。确定？", okText: "清空", danger: true });
      if (!ok) return;
      try {
        await App.API.del("/api/agent/logs");
        App.UI.toast("执行日志已清空");
        await this.load(); App.render();
      } catch (e) { App.UI.toast(e.message, "error"); }
    });

    /* 运维开关（M8.8） */
    const ctrlChips = el.querySelectorAll("[data-ctrl]");
    if (ctrlChips.length) {
      ctrlChips.forEach((chip) => chip.addEventListener("click", () => chip.classList.toggle("active")));
      el.querySelector("[data-savectrl]").addEventListener("click", async () => {
        const getChip = (name) => el.querySelector(`[data-ctrl="${name}"]`).classList.contains("active");
        try {
          await App.API.post("/api/agent/controls", {
            enabled: getChip("enabled"),
            maxRunsPerDay: +el.querySelector("[data-ctrlmax]").value || 300,
            llmMaxCallsPerDay: +el.querySelector("[data-ctrlllm]").value || 100,
            ruleBreaker: { enabled: getChip("breaker"), threshold: 3 },
          });
          App.UI.toast("开关已保存");
          await this.load(); App.render();
        } catch (e) { App.UI.toast(e.message, "error"); }
      });
    }
  },
};

window.agentView = agentView;

/* 注册进全局视图注册表 */
if (typeof Views !== "undefined") {
  Views.agent = { title: "Agent 助手", view: agentView };
}
