/* ============================================================
   灵犀工作台 · Agent 全局聊天引擎（悬浮窗 / Agent 视图共享）
   AgentChat 持有唯一会话状态（messages 数组 + 同一 sessionId），
   Agent 助手视图与全局悬浮窗通过 attach() 挂载同一引擎：
   - 两处消息实时互通（共享 messages 数组）
   - 同一后端会话（sessionId 持久化于 localStorage）
   - 意图路由 / 确认卡 / 转人工 / 来源引用 全部复用
   ============================================================ */
"use strict";

window.AgentChat = (() => {
  const messages = []; // 共享消息流 [{ role: "user"|"ai", html }]
  const containers = new Set(); // 已挂载的消息容器 { list, input, emptyHtml }

  const chatSessionId = localStorage.getItem("lingxi-chat-session") || (() => {
    const id = "s_" + Date.now().toString(36);
    localStorage.setItem("lingxi-chat-session", id);
    return id;
  })();

  const EMPTY = `<div class="muted small" style="text-align:center;padding:30px 10px">你好，我是工作台助手，悬浮窗与 Agent 助手页共享同一会话。<br>可以问我使用问题，或点击下方技能一键运行。<br>当前为<b>确定性模式</b>（零依赖），在「Agent 助手 → 配置」页填入 LLM API Key 后升级为自然语言对话。</div>`;

  /* ---------- 消息渲染 ---------- */
  function renderInto(list) {
    if (!list) return;
    list.innerHTML = messages.length
      ? messages.map((m) => `
        <div class="chat-msg ${m.role}">
          <div class="chat-avatar ${m.role}">${m.role === "user" ? "我" : "AI"}</div>
          <div class="chat-bubble">${m.html}</div>
        </div>`).join("")
      : EMPTY;
    list.scrollTop = list.scrollHeight;
  }

  function pushMsg(role, html) {
    messages.push({ role, html });
    containers.forEach((c) => renderInto(c.list));
    return messages.length - 1;
  }

  /* 挂载 / 卸载容器（视图 bind 与悬浮窗打开时调用） */
  function attach(list, input, emptyHtml) {
    if (!list) return;
    containers.add({ list, input, emptyHtml: emptyHtml || EMPTY });
    renderInto(list);
  }
  function detach(list) {
    for (const c of containers) if (c.list === list) containers.delete(c);
  }

  /* 清空对话（共享消息流 + 所有已挂载容器回到空态；视图与悬浮窗同步生效） */
  function clearMessages() {
    messages.length = 0;
    containers.forEach((c) => renderInto(c.list));
    return true;
  }

  /* ---------- 交互渲染：actions / 转人工 / 来源引用 ---------- */
  function bindActions(div, actions) {
    if (!actions || !actions.length) return;
    div.querySelectorAll("[data-act]").forEach((btn, i) => btn.addEventListener("click", async () => {
      const a = actions[i];
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = "执行中…";
      try {
        const res = await App.API.post("/api/agent/action", { tool: a.tool, args: a.args });
        if (res.ok === false) throw new Error(res.error || "执行失败");
        btn.textContent = "✓ 已执行";
        App.UI.toast("已执行：" + a.label);
        await App.DB.bootstrap();
        if (window.App && App.render) App.render();
      } catch (e) { btn.textContent = "失败"; App.UI.toast(e.message, "error"); }
      setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1600);
    }));
  }

  function renderChatResult(r) {
    const parts = [];
    if (r.reply) parts.push(App.mdRender(r.reply));
    const actionsHtml = (r.actions || []).map((a, i) => {
      const danger = a.level === "destructive" ? "btn-danger" : "btn-primary";
      return `<button class="btn btn-sm ${danger}" data-act="${i}" style="margin-top:4px">${App.ICONS.check}${App.escapeHtml(a.label)}</button>`;
    }).join(" ");
    if (r.actions && r.actions.length) parts.push(`<div class="flex gap-8 flex-wrap mt-8" style="border-top:1px dashed var(--border);padding-top:8px">${actionsHtml}</div>`);
    if (r.handoff) {
      parts.push(`<div style="background:var(--warning-soft);border-radius:10px;padding:10px 12px;margin-top:8px">
        <div style="font-weight:600;color:var(--warning)">🤝 建议转人工处理</div>
        <div class="small mt-4">问题：${App.escapeHtml(r.handoff.question || "")}<br>建议：${(r.handoff.suggestions || []).join("；")}</div>
        <button class="btn btn-sm mt-8" data-handoff-copy>复制问题摘要</button>
      </div>`);
    }
    if (r.source && (r.source.skill || r.source.tool)) {
      parts.push(`<div class="small muted mt-8" style="opacity:0.7">来源：${App.escapeHtml(r.source.skill || r.source.tool || "")}${r.source.rows ? " · " + r.source.rows + " 行数据" : ""}${r.source.pendingConfirm ? " · 待确认" : ""}${r.source.error ? " · 失败" : ""}</div>`);
    }
    const idx = pushMsg("ai", parts.join(""));
    const container = [...containers][0];
    const div = container && container.list ? container.list.querySelectorAll(".chat-msg")[idx] : null;
    if (div) {
      bindActions(div, r.actions || []);
      const hc = div.querySelector("[data-handoff-copy]");
      if (hc) hc.addEventListener("click", () => {
        const txt = "【转人工】问题：" + (r.handoff.question || "") + "\n建议：" + (r.handoff.suggestions || []).join("；");
        navigator.clipboard && navigator.clipboard.writeText(txt).then(() => App.UI.toast("摘要已复制")).catch(() => {});
      });
    }
  }

  /* ---------- 发送 / 技能运行 ---------- */
  async function sendChat(text, inputEl) {
    const t = String(text != null ? text : (inputEl ? inputEl.value : "")).trim();
    if (!t) return;
    if (inputEl) inputEl.value = "";
    pushMsg("user", App.escapeHtml(t));
    try {
      const r = await App.API.post("/api/agent/chat", { text: t, sessionId: chatSessionId, requestId: "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
      renderChatResult(r);
    } catch (e) { pushMsg("ai", `<span style="color:var(--danger)">${App.escapeHtml(e.message)}</span>`); }
  }

  async function runSkillByName(name, params, label) {
    try {
      const r = await App.API.post("/api/agent/run", { skill: name, params });
      renderChatResult({ reply: `<b>技能「${App.escapeHtml(label || name)}」分析结果：</b><br>` + (r.text || "（无输出）"), actions: r.actions || [], source: { skill: name } });
    } catch (e) { pushMsg("ai", `<span style="color:var(--danger)">${App.escapeHtml(e.message)}</span>`); }
  }

  /* 快捷提问（悬浮窗 + 视图通用）：生成周报/扫描逾期直接跑技能，其余走对话 */
  function handleQuick(q) {
    if (q === "生成周报") return runSkillByName("weekly_report", {}, "周报生成");
    if (q === "扫描逾期任务") return runSkillByName("scan_overdue", {}, "逾期扫描");
    return sendChat(q);
  }

  return { messages, chatSessionId, attach, detach, clearMessages, pushMsg, renderInto, sendChat, runSkillByName, handleQuick, EMPTY };
})();
