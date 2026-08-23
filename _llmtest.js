/* LLM function-calling 路径验证（stub fetch，无需真实网络） */
"use strict";
const fs = require("fs");
const path = require("path");

const DB = require("./server/db");
const Agent = require("./server/agent");
const db = DB.load();

// 备份 db.json，测试后还原（本测试不应改业务数据）
const DBPATH = path.join(__dirname, "server", "data", "db.json");
const bak = DBPATH + ".bak_" + Date.now();
fs.copyFileSync(DBPATH, bak);

// 启用 LLM 配置（mock）
db.agentConfig = db.agentConfig || {};
db.agentConfig.llm = { enabled: true, apiKey: "test-key", provider: "deepseek", baseUrl: "http://mock.local/v1", model: "mock" };

const user = { id: (db.users && db.users[0] && db.users[0].id) || "u_test", role: "owner" };
const noop = () => {};

// ---- fetch 桩 ----
let callN = 0;
global.fetch = async (url, opts) => {
  callN++;
  const body = JSON.parse(opts.body);
  const msgs = body.messages;
  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  const text = (lastUser && lastUser.content) || "";
  const hasToolMsg = msgs.some((m) => m.role === "tool");

  // 第二次调用（带 tool 结果）：返回总结文案
  if (hasToolMsg) {
    return { ok: true, json: async () => ({ choices: [{ message: { role: "assistant", content: "已为你处理，请查看结果。" } }] }) };
  }
  // 第一次调用：按场景返回 tool_calls 或 content
  let message;
  if (text.includes("创建") || text.includes("任务叫")) {
    message = { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "create_task", arguments: JSON.stringify({ title: "LLM测试任务", dueDate: "2099-01-01", priority: "high" }) } }] };
  } else if (text.includes("逾期")) {
    message = { role: "assistant", content: null, tool_calls: [{ id: "call_2", type: "function", function: { name: "list_overdue_tasks", arguments: JSON.stringify({}) } }] };
  } else {
    message = { role: "assistant", content: "我是灵犀工作台助手，已接入大模型，可以帮你用自然语言操作工作台。" };
  }
  return { ok: true, json: async () => ({ choices: [{ message }] }) };
};

function assert(cond, msg) { if (!cond) { console.error("❌ FAIL:", msg); process.exitCode = 1; } else { console.log("✅", msg); } }

(async () => {
  // 场景1：写操作 → 生成确认动作，且未真正写入
  const before = db.tasks.length;
  const r1 = await Agent.llmChat(user, "s1", "帮我创建一个任务叫 LLM测试任务，2099年1月1日截止，高优先级", "req1", noop);
  assert(r1 && r1.source && r1.source.llm === true, "场景1：返回 LLM 结果");
  assert(r1 && r1.actions && r1.actions.length === 1 && r1.actions[0].tool === "create_task", "场景1：write 工具转为确认动作");
  assert(db.tasks.length === before, "场景1：write 未直接执行（任务数不变）");

  // 场景2：读操作 → 直接执行，无确认动作
  const r2 = await Agent.llmChat(user, "s2", "列出逾期任务", "req2", noop);
  assert(r2 && r2.actions && r2.actions.length === 0, "场景2：read 工具无确认动作");
  assert(r2 && typeof r2.reply === "string" && r2.reply.length > 0, "场景2：返回自然语言总结");

  // 场景3：纯问答 → 直接回复
  const r3 = await Agent.llmChat(user, "s3", "你是谁", "req3", noop);
  assert(r3 && r3.actions && r3.actions.length === 0, "场景3：问答无动作");
  assert(r3 && r3.reply.includes("灵犀"), "场景3：返回问答内容");

  // 场景4：确定性引擎未被破坏
  const r4 = Agent.intentChat(user, "s4", "创建任务叫 确定性回归测试 明天截止", "req4");
  assert(r4 && r4.actions && r4.actions.length === 1 && r4.actions[0].tool === "create_task", "场景4：确定性 create_task 仍生效");

  // 还原 db.json
  fs.copyFileSync(bak, DBPATH);
  fs.unlinkSync(bak);
  console.log(callN >= 4 ? "✅ fetch 被调用多次（含二次总结）" : "ℹ️ fetch 调用次数: " + callN);
  console.log(process.exitCode ? "\n存在失败项" : "\n全部通过");
})();
