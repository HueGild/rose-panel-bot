# 🌸 RosePanel Bot

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Telegram Mini App](https://img.shields.io/badge/Telegram-Mini%20App-26A5E4?logo=telegram&logoColor=white)](https://core.telegram.org/bots/webapps)
[![License: MIT](https://img.shields.io/badge/License-MIT-A32952.svg)](LICENSE)

🇨🇳 **简体中文** | [🇺🇸 English](README_EN.md)

一个运行在 **Cloudflare Workers（0 服务器成本、天然自带 HTTPS）** 上的高颜值 **Telegram Mini App 个人面板 + 公开/私密双层小站导航 + Komari 节点探针 + 双向私聊防骚扰与媒体归档机器人 + 可开关的群签到积分徽章系统**。

采用柔和玫瑰粉奶白「电影票根」美学与悬浮毛玻璃底部导航栏，自动适配 Telegram 浅色 / 深色模式。

---

## 📑 目录

- [✨ 核心亮点](#-核心亮点)
- [📋 前置准备（全平台通用）](#-前置准备全平台通用)
- [🚀 部署方式一：Cloudflare 网页一键连接 GitHub（最推荐 ★）](#-部署方式一cloudflare-网页一键连接-github最推荐-)
- [🪟 部署方式二：Windows 电脑部署](#-部署方式二windows-电脑部署)
- [🍎 部署方式三：macOS 电脑部署](#-部署方式三macos-电脑部署)
- [🐧 部署方式四：Linux VPS 部署（Debian / Ubuntu / CentOS / Rocky / Arch / Docker）](#-部署方式四linux-vps-部署debian--ubuntu--centos--rocky--arch--docker)
- [⚙️ 环境变量与 KV 绑定说明](#️-环境变量与-kv-绑定说明)
- [🌐 绑定自定义域名 & 激活机器人](#-绑定自定义域名--激活机器人)
- [🤖 指令速查表](#-指令速查表)
- [🔒 隐私与安全说明](#-隐私与安全说明)
- [❓ 常见问题 (FAQ)](#-常见问题-faq)

---

## ✨ 核心亮点

1. **🎫 票根名片 & 双模式自由切换**
   - **极简个人名片模式（默认）**：电影票根造型名片（头像、状态标签、简介、社交链接、置顶公告），纯净无多余干扰。
   - **群社区签到积分模式（设置内一键开启）**：群员发送 `/me`、`/panel`、`/checkin`、`/rank` 或打开小程序即可参与每日签到、连签递增奖励、7 阶等级进度条、8 枚自动解锁成就徽章与积分排行榜。
2. **✨ Telegram 贴纸 / 收藏自定义表情作票根徽章**
   - 支持直接将你收藏的 **TG 静态贴纸 (`.webp`)、动态视频贴纸 (`.webm`)、矢量动态贴纸 (`.tgs` 边缘自动解压为 60fps Lottie)** 与 **TG Premium 自定义表情**设为票根主徽章；
   - 私聊机器人发送 `/setbadge` 后发任意贴纸/表情/贴纸包链接即可秒换，也可在小程序设置里输入 `t.me/addstickers/...` 或 `t.me/addemoji/...` 可视化挑选整套徽章。
3. **🌐 个人小站（公开展示 + 站长私密常用书签双层隔离）**
   - 支持分类、搜索、排序，每个站点可一键设为 **「公开可见」** 或 **「🔒 仅我可见（私密隐藏）」**；
   - 私密站点由 Worker 后端鉴权后直接剔除，访客抓包也完全看不到。
4. **📡 Komari 节点探针实时监控**
   - 自动兼容 **Komari v2 JSON-RPC (`/api/rpc2`)** 与 **Komari v1 REST (`/api/nodes` + `/api/recent/{uuid}`)**；
   - 10 段式玫瑰在线比例条 + 单节点 CPU / 内存 / 硬盘 / 实时速率与硬件详情展开，支持公开站及私有 Token/Cookie 安全代理。
5. **👤 双向私聊防骚扰 + 往来图片相册 / 链接库 / 一键清空（仅站长可见）**
   - 100% 兼容 `telegram_private_chatbot` 的 KV 结构，支持 0 延迟本地人机验证与 Forum Topics 独立话题；
   - 自动统计双向聊过多少条消息，自动归档往来图片（HMAC 签名私密代理 + 九宫格全屏灯箱）与链接清单；
   - 支持一键拉黑、永久信任、结单、私密备注，以及两档快速清空记录（仅清空面板归档 / 删除管理群话题 + 尝试撤回 48h 内私聊）。

---

## 📋 前置准备（全平台通用）

在开始任何一种部署方式之前，请先在 Telegram 准备好以下 3 项信息：

1. **创建机器人并获取 `BOT_TOKEN`**
   - 私聊 [@BotFather](https://t.me/BotFather) 发送 `/newbot`，按提示创建机器人，记下 `BOT_TOKEN` 和用户名（例如 `MyPanelBot`，不含 `@`）。
   - 发送 `/mybots` → 选择你的机器人 → **Bot Settings** → **Allow Groups** 确保已开启。
2. **准备管理员话题群组（用于双向私聊转发）**
   - 新建一个 Telegram 群组 → 群设置中开启 **话题（Topics）**。
   - 将你的机器人拉入该群并设为 **管理员**（至少授予 **管理话题 / 删除消息** 权限）。
   - 获取群组 ID（以 `-100` 开头，例如 `-1001234567890`；可右键复制群内任意消息链接 `https://t.me/c/1234567890/1`，在数字前加上 `-100` 即得）。
3. **获取你自己的 Telegram 数字 UID**
   - 私聊 `@userinfobot` 或 `@RawDataBot` 即可看到自己的纯数字 ID（用于 `ADMIN_IDS`；若不填，系统也会自动识别管理员群组里的群主/管理员）。

---

## 🚀 部署方式一：Cloudflare 网页一键连接 GitHub（最推荐 ★）

> **零成本、无需在自己电脑装环境、无需买服务器！以后同步仓库自动更新。**

1. 点击本页面右上角的 **Fork**，将 `rose-panel-bot` 复刻到你自己的 GitHub 账号。
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
3. 左侧菜单进入 **Workers & Pages** → 点击 **Create（创建）** → 选择 **Workers** → 点击 **Import a repository（连接 GitHub 仓库）**。
4. 授权 Cloudflare 访问你的 GitHub，选择你刚才 Fork 的 `rose-panel-bot` 仓库：
   - **Project name**：`rose-panel-bot`（可自定义）
   - **Build command**：`npm run build`
   - **Deploy command**：`npx wrangler deploy`
   - 点击 **Save and Deploy** 完成首次部署。
5. 部署完成后进入该 Worker 的 **Settings（设置）→ Variables and Secrets & Bindings**：
   - 在 **Bindings（绑定）** 中确认已绑定名为 `TOPIC_MAP` 的 KV Namespace（Wrangler v4 会自动创建；如需迁移旧版 `telegram_private_chatbot`，直接绑定原有的 `TOPIC_MAP` KV 即可）。
   - 按下方 [环境变量说明](#️-环境变量与-kv-绑定说明) 填入 `BOT_TOKEN`、`SUPERGROUP_ID`、`ADMIN_IDS`、`BOT_USERNAME`、`APP_SHORT_NAME`、`WEBHOOK_SECRET`。
6. 完成最后一步：[绑定域名 & 访问 `/setup` 激活机器人](#-绑定自定义域名--激活机器人)。

---

## 🪟 部署方式二：Windows 电脑部署

> 适合习惯在本地 Windows 电脑通过命令行部署或二次开发的用户。部署到 Cloudflare 后**关闭电脑机器人依然 24 小时在线**。

### 1. 安装基础环境（PowerShell）
打开 **PowerShell**（或 Windows Terminal），使用 `winget` 安装 Git 和 Node.js LTS（或前往 [nodejs.org](https://nodejs.org/) 下载安装包）：

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
```
安装完成后**重新打开 PowerShell**，确认版本（建议 Node.js >= 20）：
```powershell
node -v
npm -v
```

### 2. 拉取代码并登录 Cloudflare
```powershell
git clone https://github.com/mango0114/rose-panel-bot.git
cd rose-panel-bot
npm install

# 浏览器弹窗登录你的 Cloudflare 账号
npx wrangler login
```

### 3. 创建 KV、写入密钥并一键部署
```powershell
# 1. 创建 KV Namespace（记住返回的 id）
npx wrangler kv namespace create TOPIC_MAP

# 2. 编辑 wrangler.toml，取消注释 id = "..." 并填入上面生成的 KV id（或保持自动创建）

# 3. 构建前端并部署到 Cloudflare Workers
npm run deploy

# 4. 设置敏感环境变量（按提示粘贴即可）
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
```
其余普通变量（`SUPERGROUP_ID`、`ADMIN_IDS`、`BOT_USERNAME`、`APP_SHORT_NAME`）可直接填在 Cloudflare Dashboard 的 **Settings → Variables** 中。

---

## 🍎 部署方式三：macOS 电脑部署

### 1. 安装 Node.js 与 Git（Terminal）
推荐使用 Homebrew（如未安装可从 [nodejs.org](https://nodejs.org/) 直接下载 macOS `.pkg` 安装包）：
```bash
brew install git node
node -v && npm -v
```

### 2. 克隆、登录并部署
```bash
git clone https://github.com/mango0114/rose-panel-bot.git
cd rose-panel-bot
npm install

# 登录 Cloudflare
npx wrangler login

# 可选：先跑一遍单元测试确认环境正常
npm test

# 构建前端并部署到 Cloudflare Workers
npm run deploy

# 写入机密变量
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
```

### 3. 本地浏览器可视化预览（开发调试）
```bash
cp .dev.vars.example .dev.vars
# 保持 DEV_PREVIEW="true"，启动本地预览（支持顶部一键切换「站长/访客」视角）
npm run preview
# 浏览器打开 http://127.0.0.1:8787
```

---

## 🐧 部署方式四：Linux VPS 部署（Debian / Ubuntu / CentOS / Rocky / Arch / Docker）

> 💡 **架构说明**：本项目运行在 Cloudflare Workers 边缘网络上，**VPS 有两种用法**：
> - **用法 A（最省心，推荐）**：在任意 Linux VPS 上用 Wrangler 一键推送到 Cloudflare Workers（推送完毕后即使释放/停机 VPS，机器人依然永久在线）。
> - **用法 B（纯自托管在自己 VPS 上）**：在 VPS 上常驻运行本地 Worker 引擎（`wrangler dev`）+ Nginx / Caddy 反向代理提供 HTTPS。

### 第一步：按你的 VPS 操作系统安装 Git & Node.js 22

#### Debian / Ubuntu (20.04 / 22.04 / 24.04)
```bash
sudo apt update && sudo apt install -y curl git ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

#### CentOS Stream / Rocky Linux / AlmaLinux / RHEL (8 / 9)
```bash
sudo dnf install -y curl git
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs
node -v
```

#### Arch Linux
```bash
sudo pacman -Syu --noconfirm git nodejs npm
```

#### Alpine Linux
```bash
apk add --no-cache git nodejs npm
```

---

### 第二步 A：从 VPS 一键推送到 Cloudflare Workers（无浏览器服务器可用 API Token）

因为 VPS 没有图形浏览器，先在 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) 创建一个使用 **Edit Cloudflare Workers** 模板的 Token，然后执行：

```bash
git clone https://github.com/mango0114/rose-panel-bot.git
cd rose-panel-bot
npm ci

export CLOUDFLARE_API_TOKEN="你的_Cloudflare_API_Token"
npm run deploy

# 写入敏感机密
echo "你的_BOT_TOKEN" | npx wrangler secret put BOT_TOKEN
echo "你的随机_WEBHOOK_SECRET" | npx wrangler secret put WEBHOOK_SECRET
```

---

### 第二步 B：使用 Docker 一行部署（不污染宿主机环境，全 Linux 发行版通用）

```bash
git clone https://github.com/mango0114/rose-panel-bot.git
cd rose-panel-bot

docker run --rm -it \
  -v "$PWD":/app -w /app \
  -e CLOUDFLARE_API_TOKEN="你的_Cloudflare_API_Token" \
  node:22-alpine sh -c "npm ci && npm run deploy"
```

---

### 第二步 C：完全自托管在自己的 VPS 上常驻运行（不走 Cloudflare Workers）

如果你希望数据完全留在自己 VPS 本地（使用 Wrangler 本地持久化 KV + Caddy 自动 HTTPS）：

1. 配置本地变量并构建：
```bash
git clone https://github.com/mango0114/rose-panel-bot.git
cd rose-panel-bot
npm ci && npm run build
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars：填入真实 BOT_TOKEN / SUPERGROUP_ID / ADMIN_IDS / BOT_USERNAME / APP_SHORT_NAME / WEBHOOK_SECRET
# ⚠️ 生产环境务必将 DEV_PREVIEW="false" 或删除该行！
nano .dev.vars
```
2. 使用 `systemd` 后台常驻运行（监听本地 `127.0.0.1:8787`，数据持久化在 `.wrangler/state`）：
```bash
sudo tee /etc/systemd/system/rose-panel-bot.service > /dev/null <<'EOF'
[Unit]
Description=RosePanel Telegram Mini App Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/rose-panel-bot
ExecStart=/usr/bin/npx wrangler dev --ip 127.0.0.1 --port 8787 --persist-to ./.wrangler/state --show-interactive-dev-session=false
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now rose-panel-bot
```
3. 使用 **Caddy**（自动申请免费 SSL 证书，Telegram Mini App 强制要求 HTTPS）反向代理到你的域名：
```caddyfile
panel.yourdomain.com {
    reverse_proxy 127.0.0.1:8787
}
```
*(如使用 Nginx，配置 `proxy_pass http://127.0.0.1:8787;` 并通过 Certbot 配置 HTTPS 证书即可。)*

---

## ⚙️ 环境变量与 KV 绑定说明

| 变量名 | 类型 | 必填 | 说明 |
| :--- | :--- | :---: | :--- |
| `TOPIC_MAP` | KV Binding | ✅ | 存储面板配置、小站、访客档案、图片/链接索引与签到数据 |
| `BOT_TOKEN` | Secret | ✅ | Telegram Bot Token（切勿明文提交到 GitHub） |
| `SUPERGROUP_ID` | Text | 私聊必填 | 开启了话题功能的管理员群组 ID（例如 `-1001234567890`） |
| `ADMIN_IDS` | Text | 推荐 | 管理员数字 UID，多个用逗号分隔（不填则自动识别管理员群组中的群主/管理员） |
| `BOT_USERNAME` | Text | 推荐 | 机器人用户名，不含 `@`（用于群聊直达小程序链接） |
| `APP_SHORT_NAME` | Text | 推荐 | BotFather `/newapp` 设置的小程序短名（如 `panel`） |
| `WEBHOOK_SECRET` | Secret | 推荐 | 随机字母数字串，用于校验 Telegram Webhook 与保护 `/setup` |
| `KOMARI_URL` | Text | 可选 | Komari 探针地址（也可部署后直接在小程序设置中填写） |
| `KOMARI_API_KEY` | Secret | 可选 | 私有 Komari 站点的 Bearer Token 或 Cookie（公开探针留空） |
| `ENABLE_CHECKIN` | Text | 可选 | `"true"` 开启群签到积分模式，默认 `"false"`（极简个人名片） |

---

## 🌐 绑定自定义域名 & 激活机器人

1. **推荐绑定自定义域名**（Telegram 内加载比 `*.workers.dev` 更稳）：
   - 在 Cloudflare Dashboard → 进入你的 Worker → **Settings → Domains & Routes → Add → Custom Domain**，填入你的子域名（如 `panel.yourdomain.com`）。
2. **一键激活 Webhook 与底部小程序菜单**：
   - 在浏览器访问一次：
     ```text
     https://<你的域名>/setup?secret=<你的WEBHOOK_SECRET>
     ```
   - 看到 `"ok": true` 后，你的私聊左下角即自动出现 **「个人面板」** 小程序入口！
3. **注册群聊直达小程序短名（仅 15 秒，支持在群聊和话题里直接滑出小程序）**：
   - 私聊 [@BotFather](https://t.me/BotFather) 发送 `/newapp` → 选择你的 Bot → 填标题与简介 → 上传封面图 → Web App URL 填 `https://<你的域名>/` → 短名填 `panel`（与 `APP_SHORT_NAME` 一致）。

---

## 🤖 指令速查表

### 通用指令（私聊 / 群聊）
| 指令 | 作用 |
| :--- | :--- |
| `/start` / `/panel` / `/me` | 打开个人面板小程序（开启群签到后展示个人票根与快捷签到按钮） |
| `/checkin` | 群内 / 私聊一键每日签到领积分（开启群社区模式后生效） |
| `/rank` | 查看群积分排行榜 TOP 10（开启群社区模式后生效） |

### 站长私聊专属（在机器人私聊发送）
| 指令 | 作用 |
| :--- | :--- |
| `/setbadge` | 进入徽章捕获模式：发送任意 TG 贴纸、收藏自定义表情或贴纸包链接，一键设为票根主徽章 |
| `/resetbadge` | 恢复默认内置玫瑰矢量徽章 |

### 管理员话题群内（在对应访客的话题中发送）
| 指令 | 作用 |
| :--- | :--- |
| `/info` | 弹出访客资料卡（含双向聊天统计、图片/链接数、小程序直达与一键风控按钮） |
| `/ban` / `/unban` | 拉黑 / 解除拉黑该访客 |
| `/trust` / `/reset` | 设为永久信任 / 重置人机验证 |
| `/close` / `/open` | 结束对话 / 重新开启对话 |

---

## 🔒 隐私与安全说明

- **代码仓库零敏感信息**：本项目所有密钥（`BOT_TOKEN`、`WEBHOOK_SECRET`、`KOMARI_API_KEY`）、群组 ID、个人私密小站、访客记录均只保存在你自己的 Cloudflare 账号环境变量与 KV 中，**不会写入 Git 仓库**。
- **Telegram 官方 HMAC-SHA256 鉴权**：Mini App 所有请求均通过 `initData` 签名校验身份，防伪造、防重放。
- **后端严格隔离**：
  - 标记为「仅我可见」的私密小站由 Worker 服务端直接剔除，访客无法通过抓包获取；
  - 访客聊天往来图片采用 30 分钟时效的 HMAC 签名代理，仅管理员查看相册时临时签发，`BOT_TOKEN` 永不下发至前端。

---

## ❓ 常见问题 (FAQ)

- **Q：从旧版 `telegram_private_chatbot` 升级会丢数据吗？**
  - 不会！直接将本项目的 `TOPIC_MAP` 绑定到你原有的 KV Namespace 即可无缝继承全部已有访客、话题映射与拉黑列表，并且根路径 `POST /` 与 `/webhook` 双兼容，升级过程零停机。
- **Q：为什么点开访客的图片相册看不到升级前的旧图片？**
  - Telegram Bot API 不允许机器人反查历史聊天记录，因此图片相册与链接清单会从升级完成后开始自动记录每一条往来消息。
- **Q：清空聊天记录能删掉对方私聊窗口里的消息吗？**
  - 选择「彻底清空」时，机器人会瞬间删除管理员群里的整个访客话题（无 48 小时限制），并自动批量撤回记录到的 **48 小时内** 私聊消息（超过 48 小时的私聊消息受 Telegram 官方 API 限制无法由机器人删除）。

---

## 📄 开源协议

MIT License © 2026 [mango0114](https://github.com/mango0114)
