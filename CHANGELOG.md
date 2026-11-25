# 更新日志 / Changelog

本项目采用 [语义化版本 (SemVer)](https://semver.org/lang/zh-CN/) 记录每一次功能迭代、优化与修复。

---

## [v1.2.2] - 2026-11-25

**安全加固 & 社区规范版**：修复 3 处 webhook 与预览模式高危鉴权隐患，补齐回归测试、三语文档与 GitHub CI。

### 🔒 安全修复 (Security)
- **双路径统一校验 Webhook 密钥 (`src/worker/index.js`)**：根路径 `POST /` 与 `/webhook` 现均强制校验 `X-Telegram-Bot-Api-Secret-Token`（并采用恒定时间比对），彻底堵住伪造站长指令的侧门。*(旧版仍使用根路径 `/` 接收 Webhook 的用户升级后，请重新访问一次 `/setup?secret=你的WEBHOOK_SECRET` 完成切换。)*
- **强制 `/setup` 密钥守卫 (`src/worker/index.js`)**：未配置 `WEBHOOK_SECRET` 时 `/setup` 直接返回 `500` 拒绝执行，防止空密钥状态下被他人任意调用。
- **锁定 `DEV_PREVIEW` 仅限本机生效且默认访客 (`src/worker/auth.js` / `.dev.vars.example`)**：`DEV_PREVIEW="true"` 仅在 `localhost` / `127.0.0.1` / `[::1]` / `*.localhost` 主机上生效且缺省角色降级为 `guest`；`.dev.vars.example` 默认值改为 `DEV_PREVIEW="false"`、`SUPERGROUP_ID=""`，防止误部署提权。
- **新增 3 组安全回归单测 (`tests/worker.test.js`)**：覆盖双路径 Webhook 鉴权、`/setup` 空密钥拒访及 `DEV_PREVIEW` 域名隔离与默认角色约束。

### 📝 文档与仓库规范 (Docs & Chore)
- 新增繁体中文文档 (`README_ZH_TW.md`、`docs/SETUP_GUIDE_ZH_TW.md`)，全面同步 `README_EN.md`、`AGENTS.md` 与 `wrangler.toml` 必填变量说明。
- 新增 `SECURITY.md` 安全漏洞私密反馈指南与 `.github/ISSUE_TEMPLATE/`（Bug / 功能建议模板）。

---

## [v1.2.1] - 2026-11-25

**GitHub 主页视觉精装版**：全面升级仓库门面颜值、动效演示与搜索曝光。

### 🎨 视觉与文档升级 (Docs & Showcase)
- **定制矢量玫瑰瓷 Banner (`docs/assets/banner.svg`)** 与 **GitHub 社交分享封面图 (`docs/assets/social-preview.png`)**。
- **15 秒聚焦打字机动态演示 (`docs/assets/showcase.webp`)**：以 100% 真实运行界面呈现 5 大核心场景（玫瑰名片 → 四层防广告护盾 → 公开/私密双层小站 → Komari 10 段探针 → 深色暗黑主题），在 GitHub 首页自动循环播放。
- **四屏高清实机画廊 (`docs/assets/preview-row1.png` / `preview-row2.png`)**：真实 2x Retina 画面搭配 iPhone 钛金属边框与状态栏呈现。
- **重排中文主页 `README.md`**：居中 Hero 头部、GitHub 原生 Mermaid 四层防广告流程图、折叠式多平台部署卡片，并补全 GitHub Topics 检索标签。

---

## [v1.2.0] - 2026-11-25

**傻瓜式一键部署 & 群内 `/bind` 秒绑通知群版**：彻底消除新手查 `-100...` 群 ID 和手动配置环境变量的门槛。

### ✨ 新增功能 (Added)
- **群内 `/bind` 一键绑定私聊通知群（及 `/unbind` 解绑）**
  - 新人建好开启「话题 (Topics)」的私密群、把机器人设为管理员后，在群里发一句 **`/bind`**，机器人自动校验身份、话题开关与「管理话题」权限，并将群 ID 持久化至 KV（`config:supergroup_id`），同时自动注册管理群快捷指令与站长私聊指令。
  - **严格防劫持鉴权**：配置 `ADMIN_IDS` 时仅允许管理员操作；已有绑定群时仅允许原群管理员迁移；全新空白部署时仅允许群主（`creator`）首次绑定。
  - 100% 向后兼容 `SUPERGROUP_ID` 环境变量配置，老用户升级零改动。
- **Deploy to Cloudflare 一键按钮 & 保姆级零基础文档**
  - 仓库首页加入官方 **Deploy to Cloudflare** 一键部署按钮。
  - 新增 [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md)《零基础 5 分钟上手教程》，手把手教新手从 `@BotFather` 申请第一个机器人、拿 UID、免费部署、`/setup` 激活到 `/bind` 绑定通知群与手机端可视化装扮。

### 🎨 细节精修 (Polish)
- **柔和珊瑚玫瑰色访客话题图标**：机器人为新访客创建 Telegram 话题时默认采用协调的珊瑚玫瑰色 (`icon_color: 0xFB6F5F`)，让「通知群」内话题列表视觉更统一美观。

---

## [v1.1.0] - 2026-11-25

**性能优化 & 开屏视觉精修版**：站长打开面板提速约 10 倍、KV 消耗降低约 50 倍，并上线可定制的玫瑰瓷开屏加载页与探针隐私开关。

### ⚡ 性能与架构优化 (Performance)
- **站长概览单键缓存 (`cache:visitor_summary`)**：站长打开小程序不再每次并发读取上百个访客 KV 键，改为单键缓存读取（有新私聊或拉黑/信任/清空操作时自动失效刷新），KV 读取量降低约 **50 倍**。
- **一次性历史索引迁移 (`visitors:migrated`)**：兼容迁移旧版 `user:*` 数据后自动标记完成，日常运行 **0 次 `KV.list` 消耗**。
- **管理员内存极速鉴权**：配置 `ADMIN_IDS` 后，站长与访客身份鉴权在内存 `<0.1ms` 完成，**0 次 Telegram API 请求、0 次 KV 写入**；未配置时仍自动回退至管理群管理员检测。
- **前端 SWR 本地秒开缓存**：按用户隔离缓存上次首屏状态，二次打开 **0ms 即刻渲染**，后台静默同步最新数据。

### 🎨 视觉与交互升级 (UI / UX)
- **可自定义开屏加载页（支持 3 种风格）**：可在 **⚙️ 设置 → 名片与徽章** 中自由切换 **「✨ 徽章呼吸」**、**「🌹 表情跳动」**、**「🪄 卡片骨架屏」** 并自定义加载提示文案与表情。
- **Worker 边缘 HTML 注入 (`window.__ROSE_SPLASH__`)**：开屏配置在访问首页 HTML 时由 Cloudflare Worker 边缘直接安全注入，**哪怕陌生访客首次冷启动也能 0ms 看到专属开屏**，无默认闪烁。
- **Telegram 原生顶栏/底栏色同步**：通过 `setHeaderColor` / `setBackgroundColor` / `setBottomBarColor` 与深浅色玫瑰瓷主题无缝融为一体，消除顶栏色差线。

### 🔒 隐私控制 (Security)
- **Komari 探针「仅自己可见」开关**：支持在 **⚙️ 设置 → Komari 探针** 中将探针设为仅站长可见；开启后访客端隐藏「探针」菜单，且服务端 `/api/probe` 对非站长返回 `403`。

---

## [v1.0.0] - 2026-11-25

首个完整正式版本发布（基线版本），涵盖个人面板、小站导航、Komari 探针监控、双向私聊防骚扰与可选群签到系统。

### ✨ 新增功能 (Added)
- **名片主页与双模式切换**
  - 底部浮动玻璃胶囊导航栏（`名片 · 小站 · 探针 · 访客`），深浅色主题自适应 Telegram 配色。
  - 默认「个人名片模式」：分栏玫瑰瓷质感名片、个人标签、可自定义标题与内容的「来信礼仪」卡片、社交与一键复制联系入口、置顶公告。
  - **站长速览卡片（仅管理员可见，服务端隔离）**：实时展示已拦截广告次数、活跃/信任/封禁访客数与最近联系访客列表，点击直达详情。
  - 一键切换「群社区签到模式」：支持群聊与小程序同步每日签到、连签奖励、7 阶等级进度条、8 枚成就徽章墙与积分榜。
- **Telegram 贴纸 / 收藏自定义表情作主徽章**
  - 原生支持 `.webp` 静态、`.webm` 动态视频与 `.tgs` 动态矢量贴纸（Cloudflare Worker 边缘实时解压 60fps Lottie JSON）。
  - 支持私聊快捷指令 `/set`（兼容 `/setbadge`）秒换，或小程序内粘贴贴纸包链接可视化挑选。
- **公开 / 私密双层个人小站**
  - 分类筛选、实时搜索、上下排序、一键切换「公开可见 / 仅我可见」；私密站点在服务端严格剔除，访客不可见。
- **Komari 节点探针实时监控**
  - 兼容 Komari v2 (`/api/rpc2` 扁平数值指标与嵌套对象) 与 v1 (`/api/nodes`)，支持公开/私有凭证、15 秒 KV 缓存、10 段式玫瑰在线比例条与硬件规格展开；未配置时自动对访客隐藏探针 Tab。
  - 内置重定向循环快速检测，避免同域 Flexible SSL 误配耗尽 Worker 子请求额度。
- **双向私聊管理与四层反广告护盾**
  - 兼容 `telegram_private_chatbot` 的 `TOPIC_MAP` KV 结构与 `POST /` 根路径 Webhook，支持无痛升级。
  - **四档人机验证**：Emoji 找茬/点选（默认）、自定义 TG 表情包看图猜题（私聊 `/add` 或小程序内录入）、常识题库、CF Turnstile 严格模式，配合换题与静默冷却机制。
  - **四层智能防骚扰**：CAS 全球黑名单联防、未验证首条广告图/转发/外链风险拦截与自动升级、蜜罐诱饵陷阱、去混淆关键词过滤与 `edited_message` 偷改监听。
  - **双向归档与清理**：自动统计双向消息数、归档往来图片（HMAC 签名私密代理 + 灯箱）与链接，支持仅清面板归档或清空话题 + 48 小时内私聊。
- **模块化选配 & AI 引导安装**
  - 内置 `AGENTS.md` 与中英双语部署文档，支持 Cloudflare Dashboard、Windows、macOS、Linux VPS、Docker 与自托管部署。
