/* 前后端 API 接口一致性检查 v2
 * 前端：提取 API.get/post/put/del / fetch 调用的 URL（模板字符串 ${x} → :id，动态 col 展开）
 * 后端：静态路由正则 + 动态循环硬编码展开
 * 输出：前端调用但后端未定义（悬空接口） + 后端定义但前端未调用（信息性）
 */
const fs = require("fs");
const path = require("path");

const dir = __dirname;
const FE_FILES = ["js/core.js", "js/views.js", "js/views-extra.js", "js/views-modal.js", "js/views-agent.js", "js/app.js", "js/ui.js"];
const BE_FILE = "server/server.js";

/* ---------- 前端调用提取 ---------- */
function extractFrontend() {
  const calls = [];
  for (const f of FE_FILES) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, "utf8");
    const re = /(?:API\.(get|post|put|del)|App\.API\.(get|post|put|del)|fetch)\s*\(\s*(`[^`]*`|"[^"]*"|'[^']*')/g;
    for (const m of src.matchAll(re)) {
      let method = (m[1] || m[2] || "").toUpperCase();
      if (method === "DEL") method = "DELETE";
      let raw = m[3];
      let url = raw.slice(1, -1);
      if (url.includes("${")) {
        // 已知资源名变量 ${col} 展开为具体集合；其余变量视为 :id
        if (/col\}/.test(url)) {
          const RES = ["clients", "ideas", "canvas", "milestones", "events", "retros"];
          for (const col of RES) {
            const u2 = url.replace(/\$\{col\}/g, col).replace(/\$\{[^}]*\}/g, ":id");
            calls.push({ file: f, line: src.slice(0, m.index).split("\n").length, method, url: u2 });
          }
          continue;
        }
        url = url.replace(/\$\{[^}]*\}/g, ":id");
      }
      if (!url.includes("/api/")) continue;
      const line = src.slice(0, m.index).split("\n").length;
      calls.push({ file: f, line, method: method || "GET", url });
    }
  }
  // 动态 col 拼接展开（makeProjectResource）
  const RESOURCE_COLS = ["clients", "ideas", "canvas", "milestones", "events", "retros"];
  for (const col of RESOURCE_COLS) {
    calls.push({ file: "core.js(dyn)", line: -1, method: "POST", url: `/api/${col}` });
    calls.push({ file: "core.js(dyn)", line: -1, method: "PUT", url: `/api/${col}/:id` });
    calls.push({ file: "core.js(dyn)", line: -1, method: "DELETE", url: `/api/${col}/:id` });
  }
  return calls;
}

/* ---------- 后端路由提取 ---------- */
function extractBackend() {
  const routes = [];
  const src = fs.readFileSync(path.join(dir, BE_FILE), "utf8");
  // 静态路由（path 不含 "+" 拼接）
  const re = /on\("(GET|POST|PUT|DELETE)",\s*"(\/api\/[^"]*)"/g;
  for (const m of src.matchAll(re)) {
    if (m[2] === "/api/" || m[2] === "/api") continue; // 跳过动态拼接片段 "/api/" + col
    routes.push({ method: m[1], pattern: m[2] });
  }
  // 动态循环：goals/notes 个人资源 + projectResource 项目资源 + retros
  const DYNAMIC = [
    { method: "GET", pattern: "/api/goals" }, { method: "POST", pattern: "/api/goals" },
    { method: "PUT", pattern: "/api/goals/:id" }, { method: "DELETE", pattern: "/api/goals/:id" },
    { method: "GET", pattern: "/api/notes" }, { method: "POST", pattern: "/api/notes" },
    { method: "PUT", pattern: "/api/notes/:id" }, { method: "DELETE", pattern: "/api/notes/:id" },
  ];
  for (const col of ["clients", "ideas", "milestones", "events", "retros"]) {
    DYNAMIC.push({ method: "GET", pattern: `/api/${col}` }, { method: "POST", pattern: `/api/${col}` },
      { method: "PUT", pattern: `/api/${col}/:id` }, { method: "DELETE", pattern: `/api/${col}/:id` });
  }
  // 画布：仅 POST 特殊处理（无 GET/PUT/DELETE 通用路由）
  return routes.concat(DYNAMIC);
}

/* pattern → 正则（:param 视为 [^/]+） */
function patternToRegex(pattern) {
  const segs = pattern.split("/").map((s) => (s.startsWith(":") ? "[^/]+" : s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")));
  return new RegExp("^" + segs.join("/") + "$");
}

const fe = extractFrontend();
const be = extractBackend();

/* 前端 → 后端匹配 */
const missing = [];
const seen = new Set();
for (const c of fe) {
  const key = c.method + " " + c.url;
  if (seen.has(key)) continue;
  seen.add(key);
  const norm = c.url.replace(/:id/g, "X");
  let matched = be.some((r) => r.method === c.method && patternToRegex(r.pattern).test(norm));
  if (!matched) missing.push(c);
}

console.log("======== 前端接口调用总数（去重）:", seen.size, " ========");
console.log("\n--- ❌ 前端调用但后端未定义（悬空接口） ---");
if (!missing.length) console.log("  （无）");
for (const m of missing) console.log(`  ${m.method.padEnd(6)} ${m.url.padEnd(34)} ← ${m.file}:${m.line}`);

/* 后端 → 前端匹配（信息性） */
console.log("\n--- ℹ️ 后端已定义但前端未直接调用 ---");
const unused = [];
for (const r of be) {
  const norm = r.pattern.replace(/:[a-zA-Z]+/g, "X");
  const used = fe.some((c) => c.method === r.method && c.url.replace(/:id/g, "X") === norm);
  if (!used) unused.push(r);
}
if (!unused.length) console.log("  （无）");
for (const u of unused) console.log(`  ${u.method.padEnd(6)} ${u.pattern}`);
