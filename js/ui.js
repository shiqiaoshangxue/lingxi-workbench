/* ============================================================
   灵犀工作台 · UI 组件库：弹窗 / 确认框 / Toast / 下拉
   ============================================================ */
"use strict";

const UI = (() => {
  /* ---------- Toast ---------- */
  function toast(msg, type = "success") {
    const root = document.getElementById("toast-root");
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    const icon = type === "success" ? ICONS.check : type === "error" ? ICONS.alert : ICONS.inbox;
    el.innerHTML = `${icon}<span>${escapeHtml(msg)}</span>`;
    root.appendChild(el);
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 300);
    }, 2400);
  }

  /* ---------- 确认框 ---------- */
  function confirm({ title = "确认操作", text = "", okText = "确认", danger = false }) {
    return new Promise((resolve) => {
      const mask = document.createElement("div");
      mask.className = "modal-mask";
      mask.innerHTML = `
        <div class="modal narrow">
          <div class="modal-body" style="padding-top:26px">
            ${danger ? `<div class="confirm-icon">${ICONS.alert}</div>` : ""}
            <div class="confirm-title">${escapeHtml(title)}</div>
            <div class="confirm-text">${escapeHtml(text)}</div>
          </div>
          <div class="modal-foot">
            <button class="btn" data-act="cancel">取消</button>
            <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok" style="${danger ? "background:var(--danger);color:#fff;border:none" : ""}">${escapeHtml(okText)}</button>
          </div>
        </div>`;
      document.body.appendChild(mask);
      const close = (val) => { mask.remove(); resolve(val); };
      mask.addEventListener("click", (e) => {
        if (e.target === mask) close(false);
        const btn = e.target.closest("[data-act]");
        if (btn) close(btn.dataset.act === "ok");
      });
      const onKey = (e) => { if (e.key === "Escape") { close(false); document.removeEventListener("keydown", onKey); } };
      document.addEventListener("keydown", onKey);
    });
  }

  /* ---------- 弹窗 ---------- */
  function modal({ title, body, footer, width = "", onClose }) {
    const mask = document.createElement("div");
    mask.className = "modal-mask";
    mask.innerHTML = `
      <div class="modal ${width}">
        <div class="modal-head">
          <div class="modal-title">${escapeHtml(title)}</div>
          <button class="modal-close">${ICONS.close}</button>
        </div>
        <div class="modal-body"></div>
        <div class="modal-foot"></div>
      </div>`;
    document.body.appendChild(mask);
    const mEl = mask.querySelector(".modal");
    const bodyEl = mask.querySelector(".modal-body");
    const footEl = mask.querySelector(".modal-foot");
    if (body !== undefined && body !== null) bodyEl.innerHTML = body;
    if (footer !== undefined && footer !== null) footEl.innerHTML = footer;

    const close = (val) => {
      mask.remove();
      document.removeEventListener("keydown", onKey);
      if (onClose) onClose(val);
    };
    mask.querySelector(".modal-close").addEventListener("click", () => close());
    mask.addEventListener("mousedown", (e) => { if (e.target === mask) close(); });
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);

    // 焦点进入第一个输入框
    const first = bodyEl.querySelector("input, textarea, select");
    if (first) setTimeout(() => first.focus(), 60);

    return { el: mEl, body: bodyEl, foot: footEl, close, mask };
  }

  /* ---------- 下拉菜单 ---------- */
  function dropdown(anchor, items) {
    const old = document.querySelector(".menu[data-ui-menu]");
    if (old) old.remove();
    const menu = document.createElement("div");
    menu.className = "menu";
    menu.dataset.uiMenu = "1";
    items.forEach((it) => {
      if (it.sep) {
        const sep = document.createElement("div");
        sep.className = "menu-sep";
        menu.appendChild(sep);
        return;
      }
      const el = document.createElement("div");
      el.className = `menu-item${it.danger ? " danger" : ""}`;
      el.innerHTML = `${it.icon || ""}<span>${escapeHtml(it.label)}</span>`;
      el.addEventListener("click", () => { menu.remove(); it.onClick && it.onClick(); });
      menu.appendChild(el);
    });
    anchor.appendChild(menu);
    setTimeout(() => {
      const close = (e) => {
        if (!menu.contains(e.target) && e.target !== anchor) menu.remove();
        document.removeEventListener("mousedown", close);
      };
      document.addEventListener("mousedown", close);
    }, 10);
  }

  /* ---------- 表单辅助 ---------- */
  function field(label, inputHtml, hint = "") {
    return `<div class="field"><label>${escapeHtml(label)}</label>${inputHtml}${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
  }

  function inputHtml(name, value = "", placeholder = "") {
    return `<input class="input" name="${name}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">`;
  }

  function textareaHtml(name, value = "", placeholder = "", rows = 4) {
    return `<textarea class="textarea" name="${name}" rows="${rows}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`;
  }

  function selectHtml(name, options, selected = "") {
    const opts = options.map((o) => `<option value="${escapeHtml(o.value)}" ${o.value === selected ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("");
    return `<select class="select" name="${name}">${opts}</select>`;
  }

  /* 彩色圆点选择器 */
  function colorDotsHtml(name, colors, selected, size = 24) {
    const dots = colors.map((c) => `<span class="color-dot ${c === selected ? "sel" : ""}" data-color="${c}" style="background:${c};width:${size}px;height:${size}px"></span>`).join("");
    return `<div class="color-dots" data-colorpicker="${name}">${dots}</div>`;
  }

  return { toast, confirm, modal, dropdown, field, inputHtml, textareaHtml, selectHtml, colorDotsHtml };
})();

window.UI = UI;
window.App.UI = UI;
