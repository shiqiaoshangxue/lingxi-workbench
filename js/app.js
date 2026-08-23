/* ============================================================
   灵犀工作台 · 应用入口：登录门禁 / 壳层 / 路由 / 搜索 / 全局交互
   架构：前后端一体（服务端为数据真源）
   ============================================================ */
"use strict";

(function () {
  const S = () => App.DB.state;
  const THEME_KEY = "lingxi-theme";

  /* ---------- 主题 ---------- */
  function applyTheme() {
    document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) || "light";
  }

  /* ---------- 登录视图 ---------- */
  function renderLogin() {
    const fab = document.querySelector("[data-agent-fab]");
    if (fab) fab.style.display = "none";
    const fp = document.querySelector("[data-agent-floating]");
    if (fp) fp.hidden = true;
    const content = document.getElementById("content");
    content.innerHTML = `
    <div style="min-height:100%;display:grid;place-items:center;padding:40px 20px">
      <div class="card" style="width:400px;max-width:100%;padding:36px 34px;border-radius:20px">
        <div class="flex" style="flex-direction:column;align-items:center;gap:6px;margin-bottom:26px">
          <span class="brand-logo" style="width:54px;height:54px;border-radius:16px">${App.ICONS.logo}</span>
          <div class="brand-name" style="font-size:20px;margin-top:8px">灵犀工作台</div>
          <div class="muted small">前后端一体 · 多用户协作</div>
        </div>
        <div class="flex" style="justify-content:center;gap:8px;margin-bottom:20px">
          <span class="filter-chip active" data-mode="login">登录</span>
          <span class="filter-chip" data-mode="register">注册</span>
        </div>
        <div data-form>
          <div class="field"><label>用户名</label><input class="input" data-un placeholder="你的用户名" autocomplete="username"></div>
          <div class="field"><label>密码</label><input class="input" data-pw type="password" placeholder="至少 4 位" autocomplete="current-password"></div>
          <div class="field" data-namefield style="display:none"><label>昵称</label><input class="input" data-name placeholder="伙伴们看到的名字（可选）"></div>
        </div>
        <button class="btn btn-primary btn-lg" style="width:100%;justify-content:center" data-submit>登录</button>
        <div class="hint mt-12" style="text-align:center">首次使用请先注册，第一个注册的账号将成为管理员</div>
        <div class="muted small mt-8" style="text-align:center">提示：请先启动服务端（node server/server.js），再打开本页</div>
      </div>
    </div>`;

    let mode = "login";
    const un = content.querySelector("[data-un]");
    const pw = content.querySelector("[data-pw]");
    const nm = content.querySelector("[data-name]");
    const submit = content.querySelector("[data-submit]");
    const switchMode = (m) => {
      mode = m;
      content.querySelectorAll("[data-mode]").forEach((c) => c.classList.toggle("active", c.dataset.mode === m));
      content.querySelector("[data-namefield]").style.display = m === "register" ? "" : "none";
      submit.textContent = m === "register" ? "注册并登录" : "登录";
    };
    content.querySelectorAll("[data-mode]").forEach((c) => c.addEventListener("click", () => switchMode(c.dataset.mode)));
    const go = async () => {
      if (!un.value.trim()) { App.UI.toast("请输入用户名", "error"); return; }
      if (pw.value.length < 4) { App.UI.toast("密码至少 4 位", "error"); return; }
      submit.disabled = true;
      try {
        const d = mode === "register"
          ? await App.API.post("/api/auth/register", { username: un.value, password: pw.value, displayName: nm.value })
          : await App.API.post("/api/auth/login", { username: un.value, password: pw.value });
        App.API.setToken(d.token);
        App.UI.toast(mode === "register" ? "注册成功，欢迎！" : "欢迎回来！");
        await boot();
      } catch (e) {
        App.UI.toast(e.message, "error");
      }
      submit.disabled = false;
    };
    submit.addEventListener("click", go);
    pw.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  }

  /* ---------- 启动（拉取数据） ---------- */
  async function boot() {
    try {
      await App.DB.bootstrap();
      const theme = localStorage.getItem(THEME_KEY) || "light";
      document.documentElement.dataset.theme = theme;
      buildShell();
      setupSearch();
      setupGlobal();
      setupAgentFloating();
      window.addEventListener("hashchange", render);
      render();
      // 本地调试辅助：?fab=1 自动展开悬浮窗（验证用）
      if (new URLSearchParams(location.search).get("fab") === "1") toggleFloating(true);
    } catch (e) {
      if (e.status === 401) {
        App.API.clearToken();
        renderLogin();
        App.UI.toast("登录已过期，请重新登录", "error");
      } else {
        renderLogin();
        App.UI.toast("无法连接服务器：" + e.message + "，请确认已启动 node server/server.js", "error");
      }
    }
  }

  /* ---------- 壳层 ---------- */
  function buildShell() {
    const navGroups = [
      { label: "工作区", items: [
        { view: "dashboard", label: "我的工作台", icon: "dashboard" },
        { view: "projects", label: "项目", icon: "project" },
        { view: "tasks", label: "任务", icon: "task", badge: () => S().tasks.filter((t) => t.colId !== "col_done").length },
        { view: "kanban", label: "看板", icon: "kanban" },
      ]},
      { label: "规划", items: [
        { view: "gantt", label: "甘特图", icon: "calendar" },
        { view: "calendar", label: "日历", icon: "clock" },
        { view: "milestones", label: "里程碑", icon: "flag" },
        { view: "reports", label: "报告中心", icon: "trendingUp" },
        { view: "ideas", label: "想法", icon: "sparkles" },
      ]},
      { label: "资源", items: [
        { view: "clients", label: "客户", icon: "users" },
        { view: "canvas", label: "画布", icon: "layers" },
        { view: "retros", label: "回顾", icon: "refresh" },
        { view: "files", label: "文件库", icon: "inbox" },
        { view: "notes", label: "知识库", icon: "note", badge: () => S().notes.length },
      ]},
      { label: "专注", items: [
        { view: "timetrack", label: "时间追踪", icon: "timer" },
        { view: "goals", label: "目标", icon: "goal", badge: () => S().goals.length },
      ]},
      { label: "系统", items: [
        { view: "notifications", label: "通知", icon: "alert", badge: () => S().notifications.filter((n) => !n.read).length },
        { view: "agent", label: "Agent 助手", icon: "sparkles" },
        { view: "settings", label: "设置", icon: "settings" },
      ]},
    ];

    const sidebar = document.getElementById("sidebar");
    sidebar.innerHTML = `
      <div class="brand">
        <span class="brand-logo">${App.ICONS.logo}</span>
        <div>
          <div class="brand-name">灵犀工作台</div>
          <div class="brand-sub">Lingxi Workbench</div>
        </div>
      </div>
      <nav class="nav">
        ${navGroups.map((g) => `
          <div class="nav-group">${g.label}</div>
          ${g.items.map((it) => `
            <div class="nav-item" data-view="${it.view}">
              ${App.ICONS[it.icon]}
              <span>${it.label}</span>
              <span class="badge" data-badge="${it.view}"></span>
            </div>`).join("")}
        `).join("")}
      </nav>
      <div class="sidebar-foot">
        <span class="avatar" data-avatar></span>
        <div style="min-width:0">
          <div class="u-name ellipsis" data-username></div>
          <div class="u-sub">${S().isAdmin ? "管理员" : "成员"}</div>
        </div>
      </div>`;

    sidebar.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", () => App.Router.go(item.dataset.view));
    });

    const topbar = document.getElementById("topbar");
    topbar.innerHTML = `
      <div class="topbar-title" data-topbar-title></div>
      <div class="search-box" style="position:relative">
        ${App.ICONS.search}
        <input placeholder="搜索任务、项目、笔记、客户…" data-search>
        <div class="search-pop" data-searchpop hidden></div>
      </div>
      <div class="topbar-spacer"></div>
      <button class="icon-btn" data-notify title="通知">${App.ICONS.alert}<span class="notify-badge" data-notify-badge hidden></span></button>
      <button class="icon-btn" data-theme-toggle title="切换主题">${App.ICONS.sun}</button>
      <button class="btn btn-primary" data-quick-task>${App.ICONS.plus}<span>新建任务</span></button>`;
  }

  /* ---------- 渲染 ---------- */
  function render() {
    if (!App.API.token) { renderLogin(); return; }
    const route = App.Router.parse();
    const reg = Views[route.view];
    if (!reg) { App.Router.go("dashboard"); return; }
    App.Router.current = route;

    // Agent 视图：先拉取数据再渲染（避免重复加载）
    if (route.view === "agent" && window.agentView && !window.agentView.data.loaded) {
      window.agentView.load().then(() => { window.agentView.data.loaded = true; render(); });
      return;
    }
    // 报告中心：先拉取报表数据
    if (route.view === "reports" && window.reportsView && !window.reportsView.data) {
      window.reportsView.load().then(() => render());
      return;
    }

    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.view === route.view || (route.view === "note" && item.dataset.view === "notes"));
    });
    document.querySelectorAll(".nav-item [data-badge]").forEach((b) => {
      const getter = navBadge(b.dataset.badge);
      if (!getter) return;
      const v = getter();
      b.textContent = v > 0 ? v : "";
      b.style.display = v > 0 ? "" : "none";
    });

    document.querySelector("[data-topbar-title]").textContent = reg.title;
    const fab = document.querySelector("[data-agent-fab]");
    if (fab) fab.style.display = "";

    const un = (S().user && S().user.displayName) || "我";
    document.querySelector("[data-username]").textContent = un;
    document.querySelector("[data-avatar]").textContent = un.slice(0, 1);

    // 通知铃铛未读数
    const unread = S().notifications.filter((n) => !n.read).length;
    const nb = document.querySelector("[data-notify-badge]");
    if (nb) { nb.hidden = unread === 0; nb.textContent = unread > 99 ? "99+" : unread; }
    // 悬浮球未读角标（同源）
    updateFabBadge();

    const content = document.getElementById("content");
    content.innerHTML = reg.view.render(route.param);
    reg.view.bind(content, route.param);
    content.scrollTop = 0;
  }

  function navBadge(view) {
    const map = {
      tasks: () => S().tasks.filter((t) => t.colId !== "col_done").length,
      goals: () => S().goals.length,
      notes: () => S().notes.length,
      notifications: () => S().notifications.filter((n) => !n.read).length,
    };
    return map[view] || null;
  }

  /* ---------- 全局搜索 ---------- */
  function setupSearch() {
    const input = document.querySelector("[data-search]");
    const pop = document.querySelector("[data-searchpop]");
    const search = debounce(() => {
      const q = input.value.trim().toLowerCase();
      if (!q) { pop.hidden = true; return; }
      const S = App.DB.state;
      const items = [];
      S.tasks.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 5).forEach((t) =>
        items.push({ icon: "task", title: t.title, sub: "任务", go: () => App.Router.go("tasks") }));
      S.projects.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 4).forEach((p) =>
        items.push({ icon: "project", title: p.name, sub: "项目", go: () => App.Router.go("projects") }));
      S.notes.filter((n) => n.title.toLowerCase().includes(q) || (n.content || "").toLowerCase().includes(q)).slice(0, 4).forEach((n) =>
        items.push({ icon: "note", title: n.title, sub: "笔记", go: () => App.Router.go("note", n.id) }));
      S.goals.filter((g) => g.title.toLowerCase().includes(q)).slice(0, 3).forEach((g) =>
        items.push({ icon: "goal", title: g.title, sub: "目标", go: () => App.Router.go("goals") }));
      S.clients.filter((c) => (c.title + (c.org || "")).toLowerCase().includes(q)).slice(0, 3).forEach((c) =>
        items.push({ icon: "users", title: c.title, sub: "客户", go: () => App.Router.go("clients") }));
      S.ideas.filter((i) => i.title.toLowerCase().includes(q)).slice(0, 3).forEach((i) =>
        items.push({ icon: "sparkles", title: i.title, sub: "想法", go: () => App.Router.go("ideas") }));

      if (!items.length) {
        pop.innerHTML = `<div class="search-pop-empty">没有找到「${escapeHtml(input.value)}」相关的内容</div>`;
      } else {
        pop.innerHTML = `<div class="search-pop-head">搜索结果</div>` + items.map((it) => `
          <div class="search-pop-item" data-go>
            ${App.ICONS[it.icon]}
            <div style="min-width:0">
              <div class="sp-title ellipsis">${escapeHtml(it.title)}</div>
              <div class="sp-sub">${it.sub}</div>
            </div>
          </div>`).join("");
        pop.querySelectorAll("[data-go]").forEach((row, i) =>
          row.addEventListener("click", () => { pop.hidden = true; input.value = ""; items[i].go(); }));
      }
      pop.hidden = false;
    }, 180);
    input.addEventListener("input", search);
    input.addEventListener("focus", () => { if (input.value.trim()) search(); });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-box")) pop.hidden = true;
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Escape") { pop.hidden = true; input.blur(); } });
  }

  /* ---------- 全局事件 ---------- */
  function setupGlobal() {
    document.querySelector("[data-theme-toggle]").addEventListener("click", () => {
      const cur = localStorage.getItem(THEME_KEY) === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, cur);
      applyTheme();
      document.querySelector("[data-theme-toggle]").innerHTML = cur === "dark" ? App.ICONS.moon : App.ICONS.sun;
    });
    document.querySelector("[data-quick-task]").addEventListener("click", () => openTaskModal(null));
    document.querySelector("[data-notify]").addEventListener("click", () => App.Router.go("notifications"));
    document.addEventListener("keydown", (e) => {
      const tag = document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "n" || e.key === "N") openTaskModal(null);
      // Esc 关闭悬浮窗
      if (e.key === "Escape") { const fp = document.querySelector("[data-agent-floating]"); if (fp && !fp.hidden) toggleFloating(false); }
    });
  }

  /* ---------- Agent 悬浮球（默认形态：小圆球，点击才展开悬浮窗） ---------- */
  let floatingInited = false;
  const FAB_BALL_ICON = App.ICONS.sparkles; // 悬浮球图标
  const FAB_CLOSE_ICON = App.ICONS.close;   // 展开后球变为关闭钮
  function setFabIcon(open) {
    const fab = document.querySelector("[data-agent-fab]");
    if (!fab) return;
    const badge = fab.querySelector("[data-fab-badge]");
    fab.innerHTML = (open ? FAB_CLOSE_ICON : FAB_BALL_ICON) + (badge ? badge.outerHTML : "");
  }
  function updateFabBadge() {
    const b = document.querySelector("[data-fab-badge]");
    if (!b) return;
    const unread = S().notifications.filter((n) => !n.read).length;
    b.hidden = unread === 0;
    b.textContent = unread > 99 ? "99+" : unread;
  }
  function toggleFloating(show) {
    const fab = document.querySelector("[data-agent-fab]");
    const panel = document.querySelector("[data-agent-floating]");
    if (!panel) return;
    const open = show != null ? show : panel.hidden;
    panel.hidden = !open;
    fab.classList.toggle("open", open);
    setFabIcon(open);
    if (open) {
      const list = panel.querySelector("[data-float-list]");
      const input = panel.querySelector("[data-float-input]");
      AgentChat.attach(list, input);
      input.focus();
    }
  }
  function setupAgentFloating() {
    if (floatingInited) return;
    floatingInited = true;
    const panel = document.createElement("div");
    panel.className = "agent-floating";
    panel.dataset.agentFloating = "";
    panel.hidden = true;
    const chips = ["怎么用", "怎么邀请朋友", "生成周报", "扫描逾期任务"].map((q) => `<span class="filter-chip" data-float-quick>${q}</span>`).join("");
    panel.innerHTML = `
      <div class="agent-float-head">
        <span class="goal-icon" style="background:var(--primary-soft);color:var(--primary)">${App.ICONS.sparkles}</span>
        <div style="min-width:0">
          <div class="li-title" style="font-size:14px">Agent 助手</div>
          <div class="small muted ellipsis" style="font-size:11px">悬浮窗 · 与 Agent 助手页共享会话</div>
        </div>
        <span style="flex:1"></span>
        <button class="icon-btn" data-float-clear title="清空对话">${App.ICONS.trash}</button>
        <button class="icon-btn" data-float-full title="打开完整视图">${App.ICONS.external}</button>
        <button class="icon-btn" data-float-close title="收起">${App.ICONS.close}</button>
      </div>
      <div class="chat-list agent-float-list" data-float-list></div>
      <div class="flex gap-8 flex-wrap" style="padding:0 12px 8px">${chips}</div>
      <div class="agent-float-input">
        <input class="input" data-float-input placeholder="问我：怎么用？怎么邀请朋友？">
        <button class="btn btn-primary" data-float-send title="发送">${App.ICONS.send || App.ICONS.check}</button>
      </div>`;
    document.body.appendChild(panel);

    document.querySelector("[data-agent-fab]").addEventListener("click", () => toggleFloating());
    panel.querySelector("[data-float-close]").addEventListener("click", () => toggleFloating(false));
    panel.querySelector("[data-float-full]").addEventListener("click", () => { toggleFloating(false); App.Router.go("agent"); });
    panel.querySelector("[data-float-clear]").addEventListener("click", async () => {
      const ok = await App.UI.confirm({ title: "清空对话", text: "将清空当前聊天记录（悬浮窗与 Agent 助手页同步），确定？", okText: "清空" });
      if (!ok) return;
      AgentChat.clearMessages();
      try { await App.API.post("/api/agent/session/clear", { sessionId: AgentChat.chatSessionId }); } catch (e) {}
      App.UI.toast("对话已清空");
    });
    panel.querySelector("[data-float-send]").addEventListener("click", () => AgentChat.sendChat(null, panel.querySelector("[data-float-input]")));
    panel.querySelector("[data-float-input]").addEventListener("keydown", (e) => { if (e.key === "Enter") AgentChat.sendChat(null, panel.querySelector("[data-float-input]")); });
    panel.querySelectorAll("[data-float-quick]").forEach((c) => c.addEventListener("click", () => AgentChat.handleQuick(c.textContent)));
  }

  /* ---------- 启动 ---------- */
  window.addEventListener("DOMContentLoaded", () => {
    applyTheme();
    const params = new URLSearchParams(location.search);
    // 本地调试辅助：?token=xxx 可直接以指定身份进入（token 为短期 JWT）
    const tk = params.get("token");
    if (tk && !App.API.token) App.API.setToken(tk);
    const v = params.get("v");
    if (v && v !== "dashboard") location.hash = `#/${v}`;
    if (App.API.token) {
      boot();
    } else {
      document.getElementById("sidebar").innerHTML = "";
      document.getElementById("topbar").innerHTML = "";
      renderLogin();
    }
  });

  window.App.render = render;
  window.App.boot = boot;
})();
