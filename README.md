# 🌸 RosePanel Bot

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Telegram Mini App](https://img.shields.io/badge/Telegram-Mini%20App-26A5E4?logo=telegram&logoColor=white)](https://core.telegram.org/bots/webapps)
[![Release](https://img.shields.io/github/v/release/mango0114/rose-panel-bot?color=A32952&label=Release)](https://github.com/mango0114/rose-panel-bot/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-A32952.svg)](LICENSE)

🇨🇳 **简体中文** | [🇺🇸 English](README_EN.md) | [🐣 零基础保姆教程](docs/SETUP_GUIDE.md) | [📋 更新日志](CHANGELOG.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mango0114/rose-panel-bot)

基于 **Cloudflare Workers** 的一体化 **Telegram Mini App 个人面板 + 公开/私密小站导航 + Komari 服务器探针 + 双向私聊防骚扰与媒体归档机器人 + 可选群签到积分系统**。

---

## ✨ 核心功能

- **🪪 玫瑰瓷个人名片 / 群签到双模式**
  - **个人名片模式（默认）**：纯净展示头像、状态、简介、社交链接、个人标签、可自定义「来信礼仪」卡片与置顶公告；站长自己打开底部还会附带 **仅自己可见的「站长速览」**（已拦截广告数、活跃访客数与最近联系快捷入口）。
  - **群社区模式（设置内一键开关）**：支持群内 `/me`、`/panel`、`/checkin`、`/rank` 与小程序同步每日签到、连签递增奖励、7 阶等级进度条、8 枚成就徽章墙与排行榜。
- **✨ TG 贴纸 / 收藏自定义表情作名片主徽章**
  - 支持静态 `.webp`、动态视频 `.webm`、矢量动态 `.tgs`（Worker 边缘自动解压 60fps Lottie）与 TG Premium 自定义表情。
  - 私聊发 `/set`（兼容 `/setbadge`）后直接发送贴纸/表情/贴纸包链接即可秒换，或在小程序设置里粘贴 `t.me/addstickers/...` / `t.me/addemoji/...` 可视化挑选。
- **🌐 个人小站（公开展示 + 站长私密书签）**
  - 分类筛选、搜索、上下排序，单站点支持一键切换 **「公开可见」** 或 **「🔒 仅我可见」**；私密站点由服务端直接剔除，访客抓包不可见。
- **📡 Komari 探针实时监控**
  - 原生兼容 **Komari v2 (`/api/rpc2`)** 与 **v1 (`/api/nodes`)**，支持公开与私有站点安全代理、10 段式玫瑰在线比例条、CPU/内存/硬盘/实时流量与硬件详情展开。
- **👤 双向私聊管理 + 往来图片相册 / 链接库 / 一键清空（仅站长可见）**
  - 自动按访客创建独立 Telegram 话题（Forum Topics），双向统计聊过多少条消息，自动归档往来图片（HMAC 签名私密代理 + 全屏灯箱）与链接清单；
  - 支持私密备注、一键拉黑/解封/永久信任/结单，以及两档快速清空记录（仅清空面板归档 / 删除管理群话题 + 撤回 48h 内私聊）。

---

## 🛡️ 它是如何做人机验证与防骚扰的？

内置 **三档人机验证模式**，可在小程序 **⚙️ 设置 → 社区与防骚扰** 中随时一键切换：

| 模式 | 原理与体验 | 防刷与冷却机制 |
| :--- | :--- | :--- |
| **🎯 Emoji 找茬 / 点选（默认推荐）** | 3×3 纯图标按钮随机交替出题（8 同 1 异找茬，或中文提示点对应图标），**0 延迟、真人 0.5 秒通过** | 错 1 次立刻换新题并打乱位置；连错 2 次自动静默冷却 10 分钟（次数与时长可自定义） |
| **🎭 表情包看图猜题（私房趣味）** | 私聊 `/add`（兼容 `/addverify`）录入你收藏的动图/静图 TG 贴纸与自定义问答，或在小程序内直接拉取贴纸包出题，**全网独一无二题库、文本协议号 0 破解率** | 支持多题轮换、答错换下一张贴纸、通过后自动清理贴纸 + 蜜罐与冷却保护 |
| **📝 常识题库** | 本地 2×2 常识问答按钮，0 外部依赖 | 同样享有错 1 次换题、连错 2 次自动冷却保护 |
| **🛡️ CF Turnstile 严格模式** | 面对大规模定向扫号攻击时一键开启，直接在 Telegram 内嵌 WebApp 中完成 Cloudflare Turnstile 服务端核验 | 服务端 `siteverify` 强校验；未配置 Turnstile 密钥时自动回退至 Emoji 模式防卡死 |

- **四层智能反广告护盾（毫秒级零卡顿）**：
  1. **CAS 全球黑名单联防**：陌生人首次联系查询免费公开的 [Combot Anti-Spam (CAS)](https://cas.chat/) 数据库（KV 缓存 6h/24h），命中已知广告协议号直接静默拦截，**真人 0 感知**；
  2. **高危广告自动升级 & 拦截首条海报图**：未验证前直接发 **USDT / 赌场 / 机场等纯图片海报**、**频道转发**、**外链**、**零宽混淆**或**广告昵称**时，拒收暂存并自动升级至 CF Turnstile 严格核验；
  3. **蜜罐陷阱 + 换题冷却**：诱饵按钮自动拉黑盲点脚本，答错换新题，连错进入静默冷却；
  4. **去混淆关键词屏蔽 & 编辑偷改监听**：自动去除零宽字符/全角/西里尔同形字混淆，同时监听 `edited_message` 拦截「先发正常话、几秒后改广告」的绕过行为。
- **30 天免打扰**：验证通过后 30 天内无需重复验证；站长也可随时设为 **⭐ 永久信任** 或 **🚫 一键拉黑**。
- **API 与数据安全**：Mini App 接口全部通过 Telegram 官方 `initData` HMAC-SHA256 验签；私密小站与访客聊天图片均做服务端鉴权隔离，`BOT_TOKEN` 绝不暴露到前端。

---

## 💎 核心优点

1. **0 服务器成本 & 天然 HTTPS**：直接跑在 Cloudflare Workers 免费额度上，全球边缘加速，无需买 VPS、无需折腾 SSL 证书。
2. **手机端全可视化配置**：改名片、增删公开/私密小站、填 Komari 地址并测试连接、换 TG 徽章、切验证模式或群签到开关，全部在 TG 小程序里点两下实时生效，不用改代码重部署。
3. **无痛兼容迁移**：完全兼容 `telegram_private_chatbot` 的 `TOPIC_MAP` KV 结构与 `POST /` 根路径 Webhook，老用户绑定原 KV 即可无缝保留所有访客与拉黑数据。
4. **隐私干净**：仓库代码不含任何个人密钥、群 ID、KV ID 或私密站点，Fork 即用。
5. **模块化可轻量化 & 原生支持 AI 引导安装**：不想用那么多模块？只配 `BOT_TOKEN` 就能以极简形态运行（未配探针时访客端自动隐藏探针 Tab）；仓库根目录内置了标准的 [AGENTS.md](AGENTS.md)，当你用 AI 编程助手帮你安装时，AI 会先自动查询并询问你要开启哪些模块、跳过哪些模块！

---

## 🧩 模块化按需选配 & 🤖 AI 引导安装

你可以按自己需要自由组合模块，**未启用的模块零负担、不干扰界面**：

| 模块 | 默认状态 | 开启条件 | 说明 |
| :--- | :---: | :--- | :--- |
| **🎫 个人票根 + 🌐 公开/私密小站** | 核心必选 | `BOT_TOKEN` + `TOPIC_MAP` KV | 极简轻量化运行即可拥有高颜值个人面板、TG 贴纸徽章与双层小站 |
| **📡 Komari 节点探针** | 按需选配 | 填入 `KOMARI_URL`（或在小程序内填写） | 不填则访客端自动隐藏「探针」Tab，保持轻量化 |
| **👤 双向私聊 + 四层反广告护盾** | 按需选配 | 填入 `SUPERGROUP_ID` | 自动开启话题转发、往来图片/链接相册、CAS 黑名单与防海报广告 |
| **🛡️ CF Turnstile 严格验证** | 按需选配 | 填入 `TURNSTILE_SITE_KEY` & `SECRET` | 高危广告自动升级核验，或在设置里手动切换 |
| **🌸 群签到积分与徽章系统** | 按需选配 | `ENABLE_CHECKIN="true"` 或设置内一键开 | 部署到群聊时开启，个人用时保持关闭 |
| **🔌 更多可选扩展** | 默认不装 | 借助 AI 按需扩展 | 如需哪吒/Uptime Kuma 探针、频道评论区守护等，安装时告知 AI 即可按 [AGENTS.md](AGENTS.md) 规范按需加装 |

> **🤖 借助 AI 一键选配安装（Antigravity / Claude Code / Codex / Cursor 通用）**：  
> 克隆或打开本仓库后，直接对你的 AI 助手说：
> ```text
> 请阅读仓库里的 AGENTS.md，先询问我需要开启哪些模块（或选择轻量化安装），再帮我一步步部署这个 Telegram 个人面板机器人。
> ```

---

## 🚀 极简部署指南（4 种方式任选）

> **🐣 从零开始？** 没申请过机器人也没部署过 Cloudflare？直接看 **[零基础 5 分钟保姆教程](docs/SETUP_GUIDE.md)**，照图点几下即可上线！  
> **✨ 免查群 ID 黑科技**：建好开启「话题 (Topics)」的私密群、拉机器人当管理员后，直接在群里发一句 **`/bind`** 即可秒绑定为私聊通知群，完全不用查 `-100` 群 ID 或回 Cloudflare 填 `SUPERGROUP_ID`！

### 方式一：一键点击 Deploy to Cloudflare（最傻瓜 ★，免装本地环境）

1. 直接点击页面顶部的 **Deploy to Cloudflare** 按钮（或 Fork 后在 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages → Create → Workers → Import a repository** 选择 `rose-panel-bot`）：
   - **Build command**：`npm run build`
   - **Deploy command**：`npx wrangler deploy`
   - 点击 **Save and Deploy**。
2. 进入 Worker 的 **Settings → Variables & Bindings**：
   - 确认已绑定名为 `TOPIC_MAP` 的 KV Namespace（Wrangler v4 会自动创建，也可绑定已有 KV）。
   - 添加核心变量：`BOT_TOKEN`、`WEBHOOK_SECRET`、`ADMIN_IDS`、`BOT_USERNAME`（详见下表）。
3. 浏览器访问一次 `https://<你的域名>/setup?secret=<WEBHOOK_SECRET>`，再在你的话题群里发一句 `/bind` 即全部就绪！

### 方式二：Windows 电脑部署（PowerShell）

```powershell
# 1. 安装 Git 与 Node.js LTS（已安装可跳过）
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e

# 2. 克隆、登录并一键部署（部署完关掉电脑机器人仍 24h 在线）
git clone https://github.com/mango0114/rose-panel-bot.git
cd rose-panel-bot
npm install
npx wrangler login
npm run deploy

# 3. 写入机密变量
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
```

### 方式三：macOS 电脑部署（Terminal）

```bash
brew install git node
git clone https://github.com/mango0114/rose-panel-bot.git
cd rose-panel-bot
npm install
npx wrangler login
npm run deploy
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
```

### 方式四：Linux VPS 部署（全主流系统 & Docker）

#### 1. 按系统安装 Git & Node.js 22
- **Debian / Ubuntu**：
  ```bash
  sudo apt update && sudo apt install -y curl git ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
  ```
- **CentOS Stream / Rocky Linux / AlmaLinux / RHEL**：
  ```bash
  sudo dnf install -y curl git
  curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash - && sudo dnf install -y nodejs
  ```
- **Arch Linux**：`sudo pacman -Syu --noconfirm git nodejs npm`
- **Alpine Linux**：`apk add --no-cache git nodejs npm`

#### 2. 推送到 Cloudflare Workers（无浏览器服务器使用 API Token）
```bash
git clone https://github.com/mango0114/rose-panel-bot.git
cd rose-panel-bot && npm ci
export CLOUDFLARE_API_TOKEN="你的_Cloudflare_API_Token"
npm run deploy
echo "你的_BOT_TOKEN" | npx wrangler secret put BOT_TOKEN
echo "你的随机_WEBHOOK_SECRET" | npx wrangler secret put WEBHOOK_SECRET
```

#### 3. Docker 一行部署（不污染宿主机，全系统通用）
```bash
git clone https://github.com/mango0114/rose-panel-bot.git && cd rose-panel-bot
docker run --rm -it -v "$PWD":/app -w /app -e CLOUDFLARE_API_TOKEN="你的_API_Token" node:22-alpine sh -c "npm ci && npm run deploy"
```

#### 4. 纯 VPS 自托管常驻（不走 Cloudflare Workers，配 Caddy 自动 HTTPS）
```bash
npm ci && npm run build && cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 填入真实变量（生产环境务必删掉 DEV_PREVIEW="true"）
npx wrangler dev --ip 127.0.0.1 --port 8787 --persist-to ./.wrangler/state --show-interactive-dev-session=false
```
再用 Caddy 反向代理 `reverse_proxy 127.0.0.1:8787` 绑定你的 HTTPS 域名即可（配合 `systemd` 守护进程）。

---

## ⚙️ 环境变量一览 & 激活最后一步

| 变量名 | 类型 | 必填 | 说明 |
| :--- | :--- | :---: | :--- |
| `TOPIC_MAP` | KV Binding | ✅ | 持久化面板配置、小站、访客与媒体归档、签到数据 |
| `BOT_TOKEN` | Secret | ✅ | Telegram Bot Token |
| `SUPERGROUP_ID` | Text | 可选 | 管理员话题群 ID（**推荐部署后直接在群里发 `/bind` 一键绑定，免手填**） |
| `ADMIN_IDS` | Text | 推荐 | 管理员数字 UID（不填则自动识别管理员群的群主/管理员） |
| `BOT_USERNAME` | Text | 推荐 | 机器人用户名，不含 `@` |
| `APP_SHORT_NAME` | Text | 推荐 | BotFather `/newapp` 设置的短名（如 `panel`） |
| `WEBHOOK_SECRET` | Secret | 推荐 | 随机字符串，保护 Webhook 与 `/setup` |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET` | Text / Secret | 可选 | 开启 CF Turnstile 严格验证模式时填写 |
| `KOMARI_URL` / `KOMARI_API_KEY` | Text / Secret | 可选 | Komari 探针地址与私有凭证（也可部署后在小程序里填） |

**最后一步激活（10 秒）**：
1. （推荐）在 Cloudflare Worker **Settings → Domains & Routes** 绑定自定义域名（如 `panel.yourdomain.com`）。
2. 浏览器访问一次 `https://<你的域名>/setup?secret=<你的WEBHOOK_SECRET>`，看到 `"ok": true` 即完成 Webhook 与左下角「个人面板」按钮注册。
3. （群聊滑出小程序）在 `@BotFather` 发 `/newapp` 绑定 `https://<你的域名>/` 与短名 `panel`。

---

## 🤖 常用指令

- **通用**：`/start`、`/panel`、`/me`、`/checkin`（群社区模式）、`/rank`（群社区模式）
- **站长私聊**：`/set`（跟贴纸链接或发贴纸秒设动态徽章，兼容 `/setbadge`）、`/add`（录入收藏表情包看图验证题，兼容 `/addverify`）、`/resetbadge`、`/cancel`
- **管理群话题内**：`/bind`（一键绑定通知群）、`/unbind`（解绑）、`/info`、`/ban`、`/unban`、`/trust`、`/reset`、`/close`、`/open`

---

## 🙏 致谢与技术栈

- 协议适配与兼容：[Komari Monitor](https://github.com/komari-monitor/komari) · [Combot Anti-Spam (CAS)](https://cas.chat/) · [jikssha/telegram_private_chatbot](https://github.com/jikssha/telegram_private_chatbot)
- 开源基础设施：[Cloudflare Workers](https://workers.cloudflare.com/) · [Telegram Mini Apps](https://core.telegram.org/bots/webapps) · [React](https://react.dev/) · [Vite](https://vitejs.dev/) · [Lucide Icons](https://lucide.dev/) · [lottie-web](https://github.com/airbnb/lottie-web)

MIT License © 2026 [mango0114](https://github.com/mango0114)
