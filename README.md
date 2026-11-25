# 🌸 RosePanel Bot

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Telegram Mini App](https://img.shields.io/badge/Telegram-Mini%20App-26A5E4?logo=telegram&logoColor=white)](https://core.telegram.org/bots/webapps)
[![License: MIT](https://img.shields.io/badge/License-MIT-A32952.svg)](LICENSE)

一个运行在 **Cloudflare Workers（0 服务器成本、自带 HTTPS）** 上的高颜值 **Telegram Mini App 个人面板 + Komari 节点探针 + 双向私聊防骚扰机器人 + 可开关的群签到积分徽章系统**。

采用柔和玫瑰粉奶白「电影票根」卡片美学与悬浮玻璃底部导航栏，自动适配浅色 / 深色模式。

---

## ✨ 核心亮点

### 1. 双模式自由切换（支持在小程序内一键开关）
- **🎫 极简个人名片模式（默认）**
  - 精致电影票根造型名片（头像、状态标签、简介、社交与联系方式、置顶公告）——**纯净无签到干扰**，适合个人博主与私聊助手。
- **🌸 群社区签到积分模式（可选开启）**
  - 适合部署到 Telegram 群组：群内发送 `/me`、`/panel`、`/checkin`、`/rank` 或直接打开小程序即可体验：
    - 个人专属等级票根卡片（7 阶等级头衔 + 经验进度条 + SVG 徽章插画）
    - 每日签到随机积分 + 连续签到递增奖励 + 7/30 天里程碑加成
    - 近 7 日打卡足迹、8 枚自动解锁成就徽章墙、积分明细与群排行榜

### 2. 🌐 我的个人小站导航（支持公开 + 私密隐藏双层书签）
- 分类筛选胶囊 + 搜索栏 + 精美站点卡片，一键在 TG 内打开或复制链接；
- 每个站点可自由设为 **「公开可见」** 或 **「🔒 仅自己可见（私密隐藏）」**，非管理员请求由 Worker 后端直接剔除私密站点，绝不泄露网址；
- 管理员可直接在卡片上点眼睛按钮一键切换公开/隐藏，或在「⚙️ 设置」中新增、排序、管理个人常用网站。

### 3. ✨ Telegram 贴纸 / 收藏自定义表情设为票根徽章
- 支持将你收藏的 **TG 贴纸（`.webp` 静态、`.webm` 动态视频、`.tgs` 矢量动态 Lottie）** 及 **TG Premium 自定义表情（Custom Emoji）** 直接设为票根右侧主徽章；
- 私聊机器人发送 `/setbadge` 后直接发送任意贴纸、收藏表情或贴纸包链接即可秒设，也可在小程序「⚙️ 设置 → 名片与徽章」里粘贴 `t.me/addstickers/...` / `t.me/addemoji/...` 可视化挑选整套徽章！

### 3. 📡 Komari 服务器探针实时监控
- 原生适配 **[Komari Monitor](https://github.com/komari-monitor/komari)**：自动兼容 **Komari v2 JSON-RPC (`/api/rpc2`)** 与 **Komari v1 REST (`/api/nodes` + `/api/recent/{uuid}`)**；
- 支持公开探针免密拉取，也支持私有站点配置 Bearer Token / Cookie（经由 Worker 后端安全代理与短缓存，绝不暴露凭证）；
- 顶部 10 段式玫瑰进度条总览 + 单节点 CPU / 内存 / 硬盘 / 实时速率 / 总流量与硬件详情展开；
- 内置演示节点开关，方便未接入探针时先行预览效果。

### 4. 👤 双向私聊防骚扰 + 访客资料卡 & 一键拉黑（仅站长可见）
- **100% 兼容 `telegram_private_chatbot` 的 KV 键结构**（`user:*` / `thread:*` / `banned:*` / `verified:*`），老用户可直接复用现有 `TOPIC_MAP` KV 无痛升级；
- 0 延迟本地常识题库人机验证 + Forum Topics 独立话题隔离转发；
- 陌生人私聊创建话题时，自动发送带 **「🎫 查看完整资料卡 / 管理面板」** 按钮的访客卡片，点开直达该访客在小程序中的详情抽屉：
  - 查看 Telegram 头像、昵称、`@username`、UID、首次/最近活跃时间、消息数、话题直达链接；
  - 一键 **🚫 拉黑 / ✅ 解除拉黑 / ⭐ 永久信任 / 🔄 重置验证 / 🔒 结单 / 📝 站长私密备注**，与群内 `/ban` `/unban` `/trust` `/close` `/open` `/info` 指令完全互通。

---

## 🚀 5 分钟免费部署到 Cloudflare Workers

### 第一步：准备 Telegram Bot 与管理群组
1. 找 [@BotFather](https://t.me/BotFather) 创建或选择你的机器人，拿到 `BOT_TOKEN`。
2. 在 [@BotFather](https://t.me/BotFather) 中为机器人注册一个 **Mini App（小程序）**（用于支持在群里一键滑出）：
   - 发送 `/newapp` → 选择你的 Bot → 填写标题与简介 → 上传图标 → Web App URL 填入你部署后的 Worker 地址（如 `https://rose-panel-bot.<你的子域>.workers.dev`）→ 设置短名（例如 `panel`）。
3. （如需双向私聊转发）新建一个 Telegram 群组，在群设置里开启 **话题（Topics）**，把机器人拉进群并设为管理员（开启「管理话题」权限），记录群组 ID（`-100` 开头）。
4. 获取你自己的 Telegram 数字 UID（可找 `@userinfobot` 查看）。

### 第二步：连接 GitHub 自动部署到 Cloudflare Workers
1. Fork 本仓库到你的 GitHub 账号。
2. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Workers** → **Connect to Git**，选择 `rose-panel-bot`。
3. 构建设置填写：
   - **Build command**：`npm run build`
   - **Deploy command**：`npx wrangler deploy`
4. 部署前或部署后进入该 Worker 的 **Settings → Bindings & Variables**：
   - **KV Namespace Binding（必填）**：变量名填 `TOPIC_MAP`（可新建 KV，也可直接绑定你原来 `telegram_private_chatbot` 的 `TOPIC_MAP` 实现无痛迁移！）。
   - **Variables & Secrets**：

| 变量名 | 类型 | 必填 | 说明 |
| :--- | :--- | :---: | :--- |
| `BOT_TOKEN` | Secret | ✅ | Telegram Bot Token |
| `ADMIN_IDS` | Text | ✅ | 管理员数字 UID（多个用逗号分隔） |
| `BOT_USERNAME` | Text | 推荐 | 机器人用户名，不含 `@`（如 `Rose202_bot`） |
| `APP_SHORT_NAME` | Text | 推荐 | BotFather `/newapp` 设置的短名（如 `panel`），用于在群里直接滑出小程序 |
| `SUPERGROUP_ID` | Text | 私聊必填 | 开启了话题功能的管理员群组 ID（如 `-1001234567890`） |
| `WEBHOOK_SECRET` | Secret | 推荐 | 自定义随机字符串，用于校验 Telegram Webhook 与保护 `/setup` |
| `KOMARI_URL` | Text | 可选 | Komari 探针地址（也可部署后直接在小程序设置里填写） |
| `KOMARI_API_KEY` | Secret | 可选 | 私有 Komari 站点的 Token 或 Cookie（公开探针留空） |
| `ENABLE_CHECKIN` | Text | 可选 | `"true"` 开启群签到积分模式，默认 `"false"` |

### 第三步：一键激活 Webhook 与底部小程序按钮
部署成功后，在浏览器访问一次：
```text
https://<你的Worker域名>/setup?secret=<你的WEBHOOK_SECRET>
```
*(如果未设置 `WEBHOOK_SECRET`，直接访问 `/setup` 即可。)*

看到 `"ok": true` 后，回到 Telegram 私聊你的机器人发 `/start`，点击右上角 **⚙️ 设置图标** 即可可视化编辑你的名片、个人小站、Komari 探针地址，或一键开启群签到积分系统！

---

## 🛠️ 本地开发与预览

```bash
git clone https://github.com/mango0114/rose-panel-bot.git
cd rose-panel-bot
npm install

# 复制本地调试环境变量（DEV_PREVIEW=true 支持在普通浏览器切换「站长/访客」视角预览）
cp .dev.vars.example .dev.vars

# 运行单元测试
npm test

# 构建前端并启动本地 Cloudflare Worker 预览（默认 http://127.0.0.1:8787）
npm run preview
```

---

## 📋 机器人指令一览

### 私聊 & 群聊通用
| 指令 | 作用 |
| :--- | :--- |
| `/start` / `/panel` / `/me` | 打开个人面板小程序（开启群签到后展示个人票根与快捷签到按钮） |
| `/checkin` | 群内 / 私聊一键每日签到（开启群社区模式后生效） |
| `/rank` | 查看群积分排行榜 TOP 10（开启群社区模式后生效） |

### 管理员话题群内（在对应访客的话题中发送）
| 指令 | 作用 |
| :--- | :--- |
| `/info` | 弹出访客资料卡 + 小程序直达按钮 + 一键风控按钮 |
| `/ban` / `/unban` | 拉黑 / 解除拉黑该访客 |
| `/trust` / `/reset` | 设为永久信任 / 重置人机验证 |
| `/close` / `/open` | 结束对话 / 重新开启对话 |

---

## 📄 开源协议

MIT License © 2026 [mango0114](https://github.com/mango0114)
