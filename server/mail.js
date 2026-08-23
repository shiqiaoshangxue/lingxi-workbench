/* ============================================================
   灵犀工作台 · 邮件发送（零依赖 SMTP 客户端）
   - 支持明文（25/587）与 SSL（465，tls.connect）
   - AUTH LOGIN 认证
   - 未配置 SMTP 或收件人无邮箱时静默跳过
   ============================================================ */
"use strict";
const net = require("net");
const tls = require("tls");

function sendMail(cfg, to, subject, text) {
  return new Promise((resolve, reject) => {
    if (!cfg || !cfg.enabled || !cfg.host) return reject(new Error("SMTP 未配置"));
    if (!to) return reject(new Error("收件人邮箱为空"));
    const port = cfg.port || (cfg.ssl ? 465 : 25);
    const socketCtor = cfg.ssl ? tls.connect.bind(tls, { host: cfg.host, port, rejectUnauthorized: false }) : net.connect.bind(net);
    const sock = socketCtor(port, cfg.host);
    let buffer = "";
    let step = 0;
    const userB64 = Buffer.from(String(cfg.user || "")).toString("base64");
    const passB64 = Buffer.from(String(cfg.pass || "")).toString("base64");
    const lines = [
      `MAIL FROM:<${cfg.from || "no-reply@localhost"}>`,
      `RCPT TO:<${to}>`,
      "DATA",
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      text,
      ".",
      "QUIT",
    ];
    const timeout = setTimeout(() => { try { sock.destroy(); } catch (e) {} reject(new Error("SMTP 超时")); }, 15000);
    const send = (cmd) => sock.write(cmd + "\r\n");

    sock.on("connect", () => { send(`EHLO lingxi-workbench`); });
    sock.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const resp = buffer.split("\r\n");
      buffer = resp.pop() || "";
      resp.forEach((line) => {
        if (!line) return;
        const code = parseInt(line.slice(0, 3), 10);
        const isFinal = line.length >= 4 && line[3] === " ";
        if (!isFinal) return; // 多行响应等待最终行
        step++;
        if (step === 1) { // EHLO 后：尝试 AUTH 或直接发信
          if (cfg.user) send("AUTH LOGIN");
          else send(lines.shift());
          return;
        }
        if (step === 2 && cfg.user) { send(userB64); return; }
        if (step === 3 && cfg.user) { send(passB64); return; }
        if (code >= 400) { cleanup(); reject(new Error("SMTP 错误: " + line)); return; }
        const next = lines.shift();
        if (next === undefined) { cleanup(); resolve({ ok: true }); return; }
        if (next === ".") sock.end(); // DATA 结束后结束会话
        send(next);
      });
    });
    sock.on("error", (e) => { cleanup(); reject(e); });
    sock.on("close", () => { cleanup(); resolve({ ok: true }); });
    function cleanup() { clearTimeout(timeout); try { sock.destroy(); } catch (e) {} }
  });
}

module.exports = { sendMail };
