/* 后端 API 冒烟测试：认证 / 多用户权限 / CRUD / 文件 / 投票 / 通知 */
"use strict";
const { spawn } = require("child_process");
const path = require("path");

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const node = process.execPath;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL: " + name); }
}

const srv = spawn(node, ["server.js"], { cwd: __dirname, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "ignore", "inherit"] });

const api = async (method, pathname, body, token) => {
  const res = await fetch(BASE + pathname, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  return { status: res.status, data };
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 等待服务器就绪（轮询健康检查）
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(BASE + "/"); if (r.status === 200) break; } catch (e) {}
    await wait(300);
  }
  console.log("== 认证 ==");
  const regA = await api("POST", "/api/auth/register", { username: "alice", password: "pass1234", displayName: "小灵" });
  ok(regA.status === 200 && regA.data.user.role === "owner", "首个注册用户成为管理员(owner)");
  const tokA = regA.data.token;

  const regB = await api("POST", "/api/auth/register", { username: "bob", password: "pass1234", displayName: "阿布" });
  ok(regB.status === 200 && regB.data.user.role === "member", "第二个注册用户为 member");
  const tokB = regB.data.token;

  const bad = await api("POST", "/api/auth/login", { username: "alice", password: "wrong" });
  ok(bad.status === 401, "错误密码被拒绝");

  const dup = await api("POST", "/api/auth/register", { username: "alice", password: "x12345" });
  ok(dup.status === 409, "重复用户名被拒绝");

  console.log("== 项目与成员 ==");
  const proj = await api("POST", "/api/projects", { name: "朋友协作项目", desc: "测试", color: "#4f6bff" }, tokA);
  ok(proj.status === 200, "A 创建项目");
  const pid = proj.data.id;

  const noSee = await api("GET", "/api/bootstrap", null, tokB);
  ok(noSee.status === 200 && noSee.data.projects.length === 0, "B 看不到未加入的项目");

  const addB = await api("POST", `/api/projects/${pid}/members`, { userId: regB.data.user.id, role: "editor" }, tokA);
  ok(addB.status === 200, "A 邀请 B 为编辑");
  const bSee = await api("GET", "/api/bootstrap", null, tokB);
  ok(bSee.data.projects.length === 1 && bSee.data.projects[0].myRole === "editor", "B 现在能看到项目且角色为 editor");
  ok(bSee.data.notifications.some((n) => n.title === "新项目邀请"), "B 收到项目邀请通知");

  console.log("== 权限控制 ==");
  const t1 = await api("POST", "/api/tasks", { title: "B 创建的任务", projectId: pid }, tokB);
  ok(t1.status === 200, "editor 可以创建任务");
  const t2 = await api("POST", "/api/tasks", { title: "B 的私有任务" }, tokB);
  ok(t2.status === 200, "B 可以创建个人任务");

  const regC = await api("POST", "/api/auth/register", { username: "carol", password: "pass1234", displayName: "小卡" });
  const tokC = regC.data.token;
  await api("POST", `/api/projects/${pid}/members`, { userId: regC.data.user.id, role: "viewer" }, tokA);
  const cDeny = await api("POST", "/api/tasks", { title: "只读尝试写", projectId: pid }, tokC);
  ok(cDeny.status === 403, "viewer 写任务被拒绝(403)");
  const cRead = await api("GET", "/api/bootstrap", null, tokC);
  ok(cRead.data.tasks.some((t) => t.id === t1.data.id), "viewer 可以读项目任务");

  console.log("== 评论与通知 ==");
  const cm = await api("POST", `/api/tasks/${t1.data.id}/comments`, { content: "这个任务交给我了" }, tokB);
  ok(cm.status === 200 && cm.data.user.displayName === "阿布", "B 评论成功且带用户信息");
  const cms = await api("GET", `/api/tasks/${t1.data.id}/comments`, null, tokC);
  ok(cms.data.length === 1, "viewer 可以读评论");

  console.log("== 文件上传下载 ==");
  const fdata = Buffer.from("灵犀工作台测试文件内容").toString("base64");
  const up = await api("POST", "/api/files", { name: "note.txt", mime: "text/plain", data: fdata, projectId: pid }, tokB);
  ok(up.status === 200 && up.data.size > 0, "文件上传成功");
  const dl = await fetch(`${BASE}/api/files/${up.data.id}/download`, { headers: { Authorization: "Bearer " + tokB } });
  const dlText = await dl.text();
  ok(dl.status === 200 && dlText.includes("灵犀工作台"), "文件下载内容正确");

  console.log("== 想法投票 ==");
  const idea = await api("POST", "/api/ideas", { title: "给工作台加番茄钟", desc: "提高专注力", projectId: pid }, tokA);
  const vote = await api("POST", `/api/ideas/${idea.data.id}/vote`, {}, tokB);
  ok(vote.status === 200 && vote.data.votes.length === 1, "B 投票成功");
  const unvote = await api("POST", `/api/ideas/${idea.data.id}/vote`, {}, tokB);
  ok(unvote.data.votes.length === 0, "再次投票取消");

  console.log("== 画布 / 里程碑 / 日历 ==");
  const cv = await api("POST", "/api/canvas", { projectId: pid, type: "swot", cells: { s: "团队稳定", w: "人手少", o: "AI 红利", t: "竞争加剧" } }, tokA);
  ok(cv.status === 200 && cv.data.type === "swot", "SWOT 画布创建成功");
  const ms = await api("POST", "/api/milestones", { title: "v1.0 发布", startDate: "2026-08-01", endDate: "2026-09-01", projectId: pid }, tokA);
  ok(ms.status === 200, "里程碑创建成功");
  const ev = await api("POST", "/api/events", { title: "版本评审会", date: "2026-08-28", projectId: pid }, tokA);
  ok(ev.status === 200, "日历事件创建成功");

  console.log("== 数据隔离 ==");
  const bGoals = await api("GET", "/api/goals", null, tokB);
  await api("POST", "/api/goals", { title: "B 的个人目标" }, tokB);
  const aGoals = await api("GET", "/api/goals", null, tokA);
  ok(!aGoals.data.some((g) => g.title === "B 的个人目标"), "A 看不到 B 的个人目标");

  console.log("== 项目删除级联 ==");
  const del = await api("DELETE", `/api/projects/${pid}`, null, tokA);
  ok(del.status === 200, "项目删除成功");
  const after = await api("GET", "/api/bootstrap", null, tokB);
  ok(after.data.projects.length === 0 && !after.data.tasks.some((t) => t.projectId === pid), "删除后任务/评论级联清理");

  srv.kill();
  console.log(`\n结果：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("测试崩溃:", e); srv.kill(); process.exit(1); });
