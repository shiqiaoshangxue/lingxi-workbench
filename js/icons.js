/* ============================================================
   灵犀工作台 · 内联 SVG 图标库（零外部依赖，Feather 风格）
   用法：ICONS.name 返回 svg 字符串；ICONS.raw 内嵌 path
   ============================================================ */
"use strict";

const ICONS = (() => {
  // stroke 风格图标（默认）
  const S = (paths, extra = "") =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`;

  return {
    logo: S(`<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8l-3 4.2h2.2L10 16l4.5-5.5h-2.2L14 8z"/>`),
    dashboard: S(`<rect x="3" y="3" width="7.5" height="9" rx="2"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="2"/><rect x="13.5" y="12" width="7.5" height="9" rx="2"/><rect x="3" y="15.5" width="7.5" height="5.5" rx="2"/>`),
    project: S(`<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`),
    task: S(`<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 9l1.4 1.4L12 8"/><path d="M14.5 9.5H17"/><path d="M8 15l1.4 1.4L12 14"/><path d="M14.5 15.5H17"/>`),
    kanban: S(`<rect x="3" y="3" width="5.5" height="18" rx="1.8"/><rect x="9.3" y="3" width="5.5" height="12" rx="1.8"/><rect x="15.5" y="3" width="5.5" height="8" rx="1.8"/>`),
    timer: S(`<circle cx="12" cy="13" r="8"/><path d="M12 9v4.2l2.8 1.6"/><path d="M9 2.5h6"/>`),
    goal: S(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.2"/><circle cx="12" cy="12" r="1.6"/>`),
    note: S(`<path d="M5 3.5A1.5 1.5 0 0 1 6.5 2h8.6L20 6.9V20.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 5 20.5z"/><path d="M14.5 2v5h5"/><path d="M8.5 12h7M8.5 15.5h5"/>`),
    settings: S(`<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08A1.7 1.7 0 0 0 21 10h.09a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z"/>`),
    search: S(`<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>`),
    sun: S(`<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/>`),
    moon: S(`<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/>`),
    plus: S(`<path d="M12 5v14M5 12h14"/>`),
    edit: S(`<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>`),
    trash: S(`<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>`),
    close: S(`<path d="M18 6L6 18M6 6l12 12"/>`),
    check: S(`<path d="M20 6L9 17l-5-5"/>`),
    calendar: S(`<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M16 2.5v4M8 2.5v4M3 9.5h18"/>`),
    tag: S(`<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.4"/>`),
    more: S(`<circle cx="12" cy="5.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18.5" r="1.4"/>`),
    play: S(`<path d="M7 4.5v15l13-7.5z"/>`),
    pause: S(`<rect x="6" y="4.5" width="4" height="15" rx="1.4"/><rect x="14" y="4.5" width="4" height="15" rx="1.4"/>`),
    stop: S(`<rect x="5.5" y="5.5" width="13" height="13" rx="3"/>`),
    pin: S(`<path d="M12 17v5"/><path d="M9 3l6 6-2 4h-2l-2-4z" transform="translate(0,2)"/><path d="M6 9l4 4-2 4"/><path d="M18 9l-4 4 2 4"/>`),
    flag: S(`<path d="M5 21V4"/><path d="M5 4.5c2.5-1.6 5-1.6 7 0s4.5 1.6 7 0V15c-2.5 1.6-5 1.6-7 0s-4.5-1.6-7 0"/>`),
    clock: S(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>`),
    inbox: S(`<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>`),
    download: S(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>`),
    upload: S(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>`),
    sparkles: S(`<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.4L22 18.3l-2.1.9L19 21.6l-.9-2.4-2.1-.9 2.1-.9z"/>`),
    alert: S(`<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>`),
    chevronLeft: S(`<path d="M15 18l-6-6 6-6"/>`),
    chevronRight: S(`<path d="M9 18l6-6-6-6"/>`),
    chevronDown: S(`<path d="M6 9l6 6 6-6"/>`),
    refresh: S(`<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10"/><path d="M20.5 15a9 9 0 0 1-14.9 3.4L1 14"/>`),
    external: S(`<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>`),
    users: S(`<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`),
    layers: S(`<path d="M12 2L2 7l10 5 10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>`),
    award: S(`<circle cx="12" cy="8" r="6"/><path d="M15.5 13l1.5 8-5-3-5 3 1.5-8"/>`),
    trendingUp: S(`<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>`),
    target: S(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>`),
    link: S(`<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>`),
    bold: S(`<path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z"/>`),
    filter: S(`<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>`),
    listIcon: S(`<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>`),
    grid: S(`<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>`),
    heart: S(`<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/>`),
  };
})();
