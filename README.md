# 灵犀工作台 · Lingxi Workbench

一款**前后端一体**的全中文协作工作台，**AGPL-3.0 开源**。所有代码为原创实现，可自由增删功能、修改界面。

> **v2.0 重大更新**：从单机版（localStorage）升级为前后端一体（Node.js + 持久化 JSON 库），支持**多用户协作、项目成员管理、角色权限（owner/editor/viewer）、任务分配通知、评论、文件上传下载、想法投票、SWOT/精益画布、甘特图、里程碑、日历、通知中心**。

---

## 一键启动

需要 **Node.js 18+**（推荐 20+）。

```bash
cd workbench
node server/server.js
```

打开浏览器访问 `http://localhost:3000`，**第一个注册的账号自动成为管理员**。

> 也可设置端口：`PORT=8080 node server/server.js`
> 所有数据保存在 `server/data/db.json`（文件存储，零依赖），删除即清空。

---

## 完整功能

| 模块 | 路径 | 说明 |
| ---- | ---- | ---- |
| 🏠 我的工作台 | `dashboard` | 今日任务、进行中、本周专注、目标进度、最近笔记 |
| 📁 项目 | `projects` | 项目卡片、进度、**成员管理（owner/editor/viewer）**、归档 |
| ✅ 任务 | `tasks` | 列表筛选、子任务、标签、**开始日期/截止日期/负责人/评论** |
| 🗂 看板 | `kanban` | 拖拽流转、可自定义列 |
| ⏱ 时间追踪 | `timetrack` | 任务计时器、周专注趋势、日志 |
| 🎯 目标 | `goals` | OKR 风格（KR 进度滑块） |
| 📚 知识库 | `notes` | Markdown 笔记、分类、置顶 |
| 📊 甘特图 | `gantt` | 月刻度 + 任务条 + 里程碑菱形 + 今天线 |
| 📅 日历 | `calendar` | 月历 + 日程 + 任务到期标记 |
| 🚩 里程碑 | `milestones` | **任务组模型**（关联任务自动汇总进度）+ 时间线 |
| 📊 报告中心 | `reports` | 30 天工时趋势 + 项目/成员工时/客户报表 + CSV 导出 |
| 🔁 回顾 | `retros` | KPT / 好评-改进-行动 复盘模板 |
| 💡 想法 | `ideas` | 团队投票 + 状态流转 |
| 🏢 客户 | `clients` | 联系人 / 组织 / 关联项目 |
| 🧩 画布 | `canvas` | **7 种模板**：SWOT / 精益 / 商业模式 / 价值主张 / 客户旅程 / 移情图 / 精益创业 |
| 📁 文件库 | `files` | 上传 / 下载（50MB 上限） |
| 🔔 通知 | `notifications` | 任务分配 / 评论 / 项目邀请 / 全部已读 |
| 🤖 Agent 助手 | `agent` | 4 技能（周报/逾期/快照/预警）+ 自动化规则 + 对话（可接 LLM） |
| ⚙ 设置 | `settings` | 昵称/邮箱 · 主题 · JSON/CSV 导入导出 · SMTP 邮件 · 示例数据 |

任务详情支持：**前置依赖**、**归属里程碑**、开始/截止日期、负责人、评论。任务视图支持**列表 / 表格（批量编辑）**双模式。

> 右下角紫色渐变按钮 = Agent 快捷入口

## 特色

- **全中文 UI**，前后端均零外部依赖（仅 Node 标准库）
- **字节跳动风格**精致设计，圆角、阴影、动效、渐变
- **深色 / 浅色双主题**（设置切换，本地存储）
- **多用户协作**：管理员建项目→ 邀请朋友→ 分配角色（负责人/可编辑/只读）
- **任务分配 + 自动通知**：指派任务给成员，对方登录后顶部铃铛收到通知
- **评论内嵌到任务详情**：每个任务独立讨论串
- **数据完全自托管**：JSON 文件存储，便于备份、迁移
- **响应式**：从 1024px 笔记本到 4K 屏

---

## 目录结构

```
workbench/
├── index.html              # 前端入口
├── css/style.css           # 设计系统
├── js/                     # 前端
│   ├── icons.js            # 内联 SVG 图标
│   ├── core.js             # API 客户端 + 数据模型 + 统计 + Markdown + 7 种画布模板
│   ├── ui.js               # Toast/弹窗/确认/下拉
│   ├── views-modal.js      # 弹窗（任务含评论/依赖/里程碑/项目含成员/目标/笔记/日志）
│   ├── views.js            # 8 个基础视图（任务支持列表/表格批量双模式）
│   ├── views-extra.js      # 10 个扩展视图（甘特/日历/客户/想法/画布/里程碑/文件/通知/回顾/报告）
│   ├── agent-chat.js       # AgentChat 全局聊天引擎（共享 messages + sessionId，悬浮窗与 Agent 视图共用）
│   ├── views-agent.js      # Agent 助手视图（对话/技能/规则/配置）· chat Tab 挂载 AgentChat
│   └── app.js              # 入口（登录门禁 + 路由 + 搜索 + 主题 + Agent 悬浮窗注入）
├── server/                 # 后端（零依赖 node:http）
│   ├── server.js           # 路由 + 认证 + 静态托管 + 文件上传 + CSV + 报告 + SMTP
│   ├── db.js               # JSON 文件存储 + 原子写入（rename 重试）+ 写队列
│   ├── agent.js            # Agent 引擎：工具注册表 + 技能库 + cron 规则调度
│   ├── mail.js             # 零依赖 SMTP 客户端（明文/SSL + AUTH LOGIN）
│   └── _apitest.js         # 25 项 API 冒烟测试
├── Dockerfile              # 容器化部署（node:20-alpine）
├── docker-compose.yml      # 一键部署（数据卷挂载 ./data）
├── _regression.js          # 端到端回归测试（启动真实服务 + 走通全链路，当前 113 项）
├── _apicheck.js            # 前后端接口一致性检查（找出前端调用但后端未定义的路由）
├── README.md
└── LICENSE                 # AGPL-3.0
```

> **改动后自检**：`node _regression.js` 跑回归；新增/改动接口后跑 `node _apicheck.js` 确认无悬空路由。

---

## 启动方式汇总

| 场景 | 步骤 |
| ---- | ---- |
| **本机部署（个人/小团队）** | `node server/server.js` → 访问 `http://localhost:3000` |
| **局域网（朋友访问）** | 同上，对方访问 `http://<你的IP>:3000` |
| **Docker 一键部署** | `docker compose up -d` → 访问 `http://localhost:3000`（数据持久化在 `./data`） |
| **后台运行** | Linux/Mac: `nohup node server/server.js &` / Windows: 用任务计划程序 |
| **开机自启** | 注册为系统服务（systemd / Windows Service） |
| **生产部署** | 建议前置 Nginx 反向代理 + HTTPS（AGPL 要求对外提供服务的网络场景下须可获取源码） |

---

## URL 参数

| 参数 | 作用 |
| ---- | ---- |
| `?v=xxx` | 直接进入指定视图（如 `?v=gantt`） |
| `?theme=dark` | 强制深色主题 |
| `?token=xxx` | 本地调试用：URL 携带 token 直接以指定身份进入（**仅本地使用**，token 会在地址栏暴露） |

---

## API 概览

REST 风格，前缀 `/api/`。所有 `/api/auth/login` 和 `/api/auth/register` 之外接口需 `Authorization: Bearer <token>`。

| 资源 | 端点 |
| ---- | ---- |
| 认证 | `POST /api/auth/{login,register}`、`GET /api/me`、`POST /api/profile` |
| 引导 | `GET /api/bootstrap`（一次性拉取当前用户可见的全部数据） |
| 项目 | `/api/projects`、`/api/projects/:id`、`/api/projects/:id/members` |
| 任务/看板/列 | `/api/tasks`、`/api/columns` |
| 时间日志 | `/api/timeLogs` |
| 个人资源 | `/api/goals`、`/api/notes` |
| 项目资源 | `/api/{clients,ideas,canvas,milestones,events}` |
| 评论 | `/api/tasks/:id/comments`、`/api/comments/:id` |
| 文件 | `/api/files`（POST 上传 base64）、`/api/files/:id/download` |
| 通知 | `/api/notifications`、`/api/notifications/:id/read`、`/api/notifications/read-all` |
| 用户管理 | `/api/users`（仅 owner） |
| 示例/导入 | `POST /api/seed`（owner）、`POST /api/import`（个人数据） |
| **Agent** | `GET /api/agent/bootstrap`（技能/规则/日志/LLM 配置）、`POST /api/agent/run`（运行技能）、`POST /api/agent/chat`（对话）、`GET/POST/PUT/DELETE /api/agent/rules`（自动化规则）、`GET /api/agent/logs`、`POST /api/agent/config`（LLM 配置） |

---

## Agent 助手

工作台内嵌一个 Agent 引擎，分三层架构，**默认零依赖、零成本**：

### 1. 技能库（9 个技能：4 个基础报表 + 4 个联动分析 + 1 个摘要）

**基础报表**
- 📊 **周报生成**：汇总本周完成/进行中/下周到期
- ⚠️ **逾期扫描**：列出逾期任务，可选一键通知相关成员
- 🗂 **项目状态快照**：各项目进度、逾期、动态速览
- 🎯 **目标进度预警**：截止临近但进度偏低的目标/KR
- 📋 **今日摘要**：今日到期/逾期/进行中/日程

**联动分析（跨实体分析 + 行动建议）**
- 🩺 **项目健康诊断**：综合任务/依赖/里程碑/工时给项目打分（健康/注意/警告），定位逾期与被阻塞任务，附"延后截止 / 移回待办"建议动作
- 🔗 **依赖链分析**：识别关键任务（被最多任务依赖）、阻塞链，看清延误如何传播，附处理建议
- 👥 **负载分析**：按成员统计未完成/逾期/工时，发现负载不均与逾期压力，可一键发提醒
- 🚨 **风险雷达**：聚合逾期+依赖断裂+里程碑临近+目标落后，分级（高/中/低）风险清单与应对动作

> **建议动作（actions）**：分析结果下方会给出可一键执行的按钮（如"延后 XX 截止 +3 天"、"移回待办"、"提醒负责人"），点击即通过工具注册表执行，**遵守角色权限**（无权限成员会被拒绝）。

### 2. 自动化规则（cron 定时）
- 仅 owner 可配置（`Agent 助手` → `自动化规则`）
- 支持 cron 表达式（分 时 日 月 周）+ 4 个常用预设（每天 9:00 / 每周一 9:00 / 每周五 18:30 / 每月 1 日 8:00）
- 引擎每 30 秒检查一次，命中规则的 cron 即执行对应技能

### 3. 智能对话（v2.4 · 意图路由 + 多轮 + 分级执行）

对话接口不再是简单 FAQ，而是**意图路由引擎**：

- **意图识别**（14 个意图）：分析类（周报/逾期/健康诊断/依赖链/负载/风险雷达/目标预警/今日摘要/快照）与操作类（创建任务/完成任务/开始任务）
- **复合意图**：「生成周报，扫描逾期任务」自动拆分串行执行；含写操作时全部转为待确认
- **多轮补全**：「创建任务」→ 追问标题 → 追问截止日期（每参数最多问 2 次，超限转人工）
- **语义消歧**：同义词/别名匹配（如"体检"→健康诊断、"谁最忙"→负载分析）
- **失败降级**：意图不明 → 引导 + 转人工摘要；LLM 未配时确定性模式
- **写操作分级**：`read`（直接执行）→ `write`（必须点确认按钮）→ `destructive`（二次确认）；无权限成员执行被 403 拒绝
- **幂等与防抖**：requestId 幂等（重复请求返回相同结果）；同操作 10 秒去重
- **来源引用**：回复附带来源（技能/工具 + 数据行数），确定性技能无幻觉；LLM 模式强制来源约束
- **会话状态机**：idle → pending_params（追问）→ executing；30 分钟超时重置

### 4. 配置与运维

- **执行统计**：今日执行/成功率/平均耗时/意图分布/错误分类（埋点日志）
- **安全护栏审计**：权限模型、写操作分级、确认策略、禁止自动执行清单、幻觉防控、隐私、频率限制（自检清单面板）
- **运维开关**（仅 owner）：Agent 总开关、每日执行上限、LLM 日调用上限（预留）、规则熔断阈值（连续失败自动停用规则）
- **LLM 配置**：DeepSeek / OpenAI / 自定义兼容 API（未配置自动降级确定性模式）

### 使用方式
- **手动**：进入 `Agent 助手` → 选 Tab → 点按钮/输入
- **自动**：配置规则后，后台每 30 秒扫描，命中即执行
- **入口**：右下角紫色渐变悬浮按钮，一键直达 Agent

> 未来扩展 LLM 时，会通过工具注册表（`create_task` / `move_card` / `notify` 等）让模型驱动工作台，且复用现有权限校验。

---

## 数据模型

存储于 `server/data/db.json`：

```jsonc
{
  "users": [{ "id", "username", "displayName", "role": "owner|member", ... }],
  "projects": [{ "id", "name", "desc", "color", "status", "ownerId" }],
  "projectMembers": [{ "projectId", "userId", "role": "owner|editor|viewer" }],
  "columns": [...], "tasks": [...], "timeLogs": [...],
  "goals": [...], "notes": [...],
  "clients": [...], "ideas": [...], "canvas": [...],
  "milestones": [...], "events": [...],
  "comments": [...], "files": [...], "notifications": [...]
}
```

---

## 怎么改？

所有代码都是普通前端 + Node 标准库，没有任何构建步骤，可以直接编辑。

| 想做的事 | 改哪里 |
| -------- | ---- |
| 调整配色、间距、阴影 | `css/style.css` 顶部 CSS 变量 |
| 增加/修改图标 | `js/icons.js` |
| 修改默认示例数据 | `server/server.js` 的 `/api/seed` 处理器 |
| 新增数据表/字段 | `server/db.js` 数据访问 + `server/server.js` 路由 + 前端 `core.js` `App.DB.api.*` |
| 新增视图 | `js/views-extra.js` 仿造现有视图，末尾注册到 `ExtraViews` + 导航 |
| 修改权限规则 | `server/db.js` 底部权限辅助函数 |

---

## 开发自检

### 后端 API 冒烟测试
```bash
node server/_apitest.js
```
覆盖：认证（注册/登录/重名）、项目与成员、权限控制（owner/editor/viewer）、评论与通知、文件上传下载、想法投票、画布/里程碑/日历、数据隔离、项目删除级联（25 项）。

### 端到端回归测试
```bash
node _regression.js
```
启动真实服务 + 注册 + 前端 vm 环境，验证：bootstrap、API 链路、多用户可见性、**16 个视图全部渲染**、新功能 API、权限隔离、删除级联（33 项）。

---

## 浏览器兼容

现代浏览器（Edge / Chrome / Firefox / Safari 近 2 年版本）即可。Node 18+。

---

## 许可与合规

- 本项目以 **AGPL-3.0** 协议开源（见 `LICENSE`），所有代码均为原创实现（JavaScript + node:http，零外部依赖）
- 功能设计参考了项目管理领域常见的设计模式，实现完全独立

> **AGPL-3.0 合规要点**：
> - 个人/团队内部使用：几乎零义务
> - 对外提供网络服务（让别人通过浏览器访问你部署的工作台）：必须向使用者提供修改后源码
> - 分发/销售：必须以 AGPL-3.0 协议提供完整对应源码

---

## 许可

GNU Affero General Public License v3.0（见 `LICENSE`）。
