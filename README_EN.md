# 🌸 RosePanel Bot

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Telegram Mini App](https://img.shields.io/badge/Telegram-Mini%20App-26A5E4?logo=telegram&logoColor=white)](https://core.telegram.org/bots/webapps)
[![License: MIT](https://img.shields.io/badge/License-MIT-A32952.svg)](LICENSE)

[🇨🇳 简体中文](README.md) | 🇺🇸 **English**

A sleek, zero-cost **Telegram Mini App Personal Panel**, **Public/Private Bookmark Hub**, **Komari Server Probe Monitor**, **Bidirectional Anti-Spam PM Bot with Media Archive**, and **Optional Group Check-in / Points / Badges System** — running natively on **Cloudflare Workers** with built-in HTTPS.

Designed with a warm rose-porcelain "cinema ticket stub" aesthetic, floating frosted-glass bottom dock, and automatic light/dark mode support.

---

## 📑 Table of Contents

- [✨ Highlights](#-highlights)
- [📋 Prerequisites (All Platforms)](#-prerequisites-all-platforms)
- [🚀 Method 1: Cloudflare Dashboard Git Integration (Recommended ★)](#-method-1-cloudflare-dashboard-git-integration-recommended-)
- [🪟 Method 2: Deploy from Windows](#-method-2-deploy-from-windows)
- [🍎 Method 3: Deploy from macOS](#-method-3-deploy-from-macos)
- [🐧 Method 4: Deploy from Linux VPS (Debian / Ubuntu / CentOS / Rocky / Arch / Docker)](#-method-4-deploy-from-linux-vps-debian--ubuntu--centos--rocky--arch--docker)
- [⚙️ Environment Variables & KV Bindings](#️-environment-variables--kv-bindings)
- [🌐 Custom Domain & One-Click Bot Activation](#-custom-domain--one-click-bot-activation)
- [🤖 Bot Commands](#-bot-commands)
- [🔒 Privacy & Security](#-privacy--security)
- [❓ FAQ](#-faq)

---

## ✨ Highlights

1. **🎫 Cinema Ticket Stub Profile & Dual-Mode Switch**
   - **Minimal Personal Card Mode (Default)**: Clean owner ticket stub with avatar, live status pill, bio, social links, and optional notice banner — zero check-in clutter.
   - **Group Community Check-in Mode (1-Click Toggle in Settings)**: Supports `/me`, `/panel`, `/checkin`, `/rank` in Telegram groups and Mini App with daily check-in rewards, streak bonuses, 7-tier level progression, 8 auto-unlocked achievement badges, point ledger, and leaderboard.
2. **✨ Telegram Stickers & Custom Emojis as Ticket Emblem**
   - Supports **static stickers (`.webp`)**, **video stickers (`.webm`)**, **animated vector stickers (`.tgs` auto-decompressed at the edge to 60fps Lottie JSON)**, and **Telegram Premium Custom Emojis**.
   - Send `/setbadge` to your bot in private chat followed by any sticker, custom emoji, or sticker pack URL (`t.me/addstickers/...` / `t.me/addemoji/...`), or browse & pick visually inside the Mini App Settings!
3. **🌐 Personal Sites & Private Bookmarks (Server-Side Isolated)**
   - Category filter chips, instant search, drag/arrow reordering, and per-site **`Public` vs `🔒 Private (Owner Only)`** visibility with 1-tap Eye button toggle.
   - Private sites are strictly stripped on the Worker backend for non-admin visitors.
4. **📡 Komari Server Probe Integration**
   - Automatically supports **Komari v2 JSON-RPC (`/api/rpc2`)** and **Komari v1 REST (`/api/nodes` + `/api/recent/{uuid}`)**, both public and private token/cookie instances.
   - 10-segment rose health bar, live CPU / RAM / Disk / Network speeds, expandable hardware specs, and built-in demo mode.
5. **👤 Bidirectional Anti-Spam PM Bot + Photo Gallery / Link Archive / Quick Clear (Admin Only)**
   - 100% KV-compatible with `telegram_private_chatbot`; zero-latency local verification + isolated Telegram Forum Topics per visitor.
   - Bidirectional message counter (`Visitor · Me`), auto-archived **Photo Gallery** (HMAC-signed private proxy + fullscreen lightbox) and **Links Archive**, private admin notes, 1-tap Ban / Unban / Trust / Close, and two-tier **Clear Chat History** (archive-only or full topic wipe + <48h PM deletion).

---

## 📋 Prerequisites (All Platforms)

Before deploying, prepare 3 items in Telegram:

1. **Create a Telegram Bot & get `BOT_TOKEN`**
   - Chat with [@BotFather](https://t.me/BotFather) → send `/newbot` → save your `BOT_TOKEN` and username (without `@`).
   - Send `/mybots` → select your bot → **Bot Settings** → **Allow Groups** → Enable.
2. **Create an Admin Forum Group (for bidirectional PM forwarding)**
   - Create a Telegram group and enable **Topics** in Group Settings.
   - Add your bot as an **Administrator** (grant **Manage Topics** and **Delete Messages**).
   - Find the group's `SUPERGROUP_ID` (starts with `-100`, e.g. `-1001234567890`).
3. **Find your numeric Telegram UID**
   - Message `@userinfobot` to get your numeric ID for `ADMIN_IDS` (optional: administrators of `SUPERGROUP_ID` are also auto-detected).

---

## 🚀 Method 1: Cloudflare Dashboard Git Integration (Recommended ★)

> **100% free tier, zero local tooling required, automatic deploys on every Git push.**

1. Click **Fork** at the top right of this repository to copy it into your own GitHub account.
2. Open [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Workers** → **Import a repository**.
3. Authorize GitHub and select your forked `rose-panel-bot` repo:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
   - Click **Save and Deploy**.
4. Open your Worker's **Settings → Variables and Secrets & Bindings**:
   - Ensure KV Namespace binding `TOPIC_MAP` is attached (Wrangler v4 auto-provisions one, or bind your existing `TOPIC_MAP` KV to migrate seamlessly).
   - Add `BOT_TOKEN` (Secret), `SUPERGROUP_ID`, `ADMIN_IDS`, `BOT_USERNAME`, `APP_SHORT_NAME`, and `WEBHOOK_SECRET` (Secret).
5. Finish with [Custom Domain & One-Click Activation](#-custom-domain--one-click-bot-activation).

---

## 🪟 Method 2: Deploy from Windows

> Once deployed to Cloudflare Workers, you can turn off your PC — the bot stays online 24/7 at the edge.

### 1. Install Git & Node.js LTS (PowerShell)
```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
```
Restart PowerShell and verify Node.js >= 20:
```powershell
node -v
npm -v
```

### 2. Clone, Authenticate & Deploy
```powershell
git clone https://github.com/mango0114/rose-panel-bot.git
cd rose-panel-bot
npm install

# Opens browser to log in to Cloudflare
npx wrangler login

# Build frontend & deploy Worker + static assets
npm run deploy

# Add encrypted secrets
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
```
Add non-secret variables (`SUPERGROUP_ID`, `ADMIN_IDS`, `BOT_USERNAME`, `APP_SHORT_NAME`) in Cloudflare Dashboard → **Settings → Variables**.

---

## 🍎 Method 3: Deploy from macOS

### 1. Install Node.js & Git
```bash
brew install git node
node -v && npm -v
```

### 2. Clone, Test & Deploy
```bash
git clone https://github.com/mango0114/rose-panel-bot.git
cd rose-panel-bot
npm install
npm test

npx wrangler login
npm run deploy

npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
```

### 3. Local Browser Preview (Development)
```bash
cp .dev.vars.example .dev.vars
# DEV_PREVIEW="true" enables Admin/Guest role switcher at http://127.0.0.1:8787
npm run preview
```

---

## 🐧 Method 4: Deploy from Linux VPS (Debian / Ubuntu / CentOS / Rocky / Arch / Docker)

> 💡 You can either use your VPS as a **one-shot deployer** to Cloudflare Workers (Option A/B — bot stays online even if you shut down the VPS) OR **self-host persistently** on your own VPS behind Caddy/Nginx HTTPS (Option C).

### Step 1: Install Git & Node.js 22 for your Linux distro

#### Debian / Ubuntu (20.04 / 22.04 / 24.04)
```bash
sudo apt update && sudo apt install -y curl git ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

#### CentOS Stream / Rocky Linux / AlmaLinux / RHEL (8 / 9)
```bash
sudo dnf install -y curl git
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs
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

### Option A: Headless Deploy to Cloudflare Workers via API Token
Create an API Token using the **Edit Cloudflare Workers** template at [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens):

```bash
git clone https://github.com/mango0114/rose-panel-bot.git
cd rose-panel-bot
npm ci

export CLOUDFLARE_API_TOKEN="YOUR_CLOUDFLARE_API_TOKEN"
npm run deploy

echo "YOUR_BOT_TOKEN" | npx wrangler secret put BOT_TOKEN
echo "YOUR_RANDOM_SECRET" | npx wrangler secret put WEBHOOK_SECRET
```

---

### Option B: Zero-Footprint Docker Deploy (Any Linux Distro)
```bash
git clone https://github.com/mango0114/rose-panel-bot.git
cd rose-panel-bot

docker run --rm -it \
  -v "$PWD":/app -w /app \
  -e CLOUDFLARE_API_TOKEN="YOUR_CLOUDFLARE_API_TOKEN" \
  node:22-alpine sh -c "npm ci && npm run deploy"
```

---

### Option C: Self-Host Persistently on Your Own VPS (No Cloudflare Workers Required)

1. Build and configure `.dev.vars` (make sure `DEV_PREVIEW="false"` or removed in production!):
```bash
git clone https://github.com/mango0114/rose-panel-bot.git
cd rose-panel-bot
npm ci && npm run build
cp .dev.vars.example .dev.vars
nano .dev.vars
```
2. Run persistently with `systemd`:
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
3. Add automatic HTTPS via **Caddy** (Telegram Mini Apps require HTTPS):
```caddyfile
panel.yourdomain.com {
    reverse_proxy 127.0.0.1:8787
}
```

---

## ⚙️ Environment Variables & KV Bindings

| Name | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `TOPIC_MAP` | KV Binding | ✅ | Stores panel config, sites, visitor profiles, media/link archive, and check-ins |
| `BOT_TOKEN` | Secret | ✅ | Telegram Bot Token (never commit to Git) |
| `SUPERGROUP_ID` | Text | For PM Bot | Admin group ID with Forum Topics enabled (e.g. `-1001234567890`) |
| `ADMIN_IDS` | Text | Recommended | Comma-separated numeric admin UIDs (admins of `SUPERGROUP_ID` are also auto-detected) |
| `BOT_USERNAME` | Text | Recommended | Bot username without `@` (used for group Direct-Link Mini App buttons) |
| `APP_SHORT_NAME` | Text | Recommended | Mini App short name created via BotFather `/newapp` (e.g. `panel`) |
| `WEBHOOK_SECRET` | Secret | Recommended | Random alphanumeric token validating Telegram webhooks & `/setup` |
| `KOMARI_URL` | Text | Optional | Komari server URL (can also be edited live inside Mini App Settings) |
| `KOMARI_API_KEY` | Secret | Optional | Optional Bearer token or Cookie for private Komari instances |
| `ENABLE_CHECKIN` | Text | Optional | `"true"` enables group check-in & badges mode; default `"false"` |

---

## 🌐 Custom Domain & One-Click Bot Activation

1. **Attach a Custom Domain (recommended)** in Cloudflare Dashboard → Worker → **Settings → Domains & Routes → Custom Domain** (e.g. `panel.yourdomain.com`).
2. **Activate Webhook & Menu Button** by opening once in your browser:
   ```text
   https://<your-domain>/setup?secret=<YOUR_WEBHOOK_SECRET>
   ```
   When you see `"ok": true`, your bot's bottom-left menu button automatically launches the Mini App!
3. **Register Group Direct-Link Mini App** in [@BotFather](https://t.me/BotFather):
   Send `/newapp` → select your bot → set URL `https://<your-domain>/` → set short name `panel` (matching `APP_SHORT_NAME`).

---

## 🤖 Bot Commands

### Private & Group Chats
| Command | Action |
| :--- | :--- |
| `/start`, `/panel`, `/me` | Open the Mini App panel (or show member check-in ticket stub in community mode) |
| `/checkin` | Instant daily check-in (when community mode is enabled) |
| `/rank` | Top 10 points leaderboard (when community mode is enabled) |

### Admin Private Chat
| Command | Action |
| :--- | :--- |
| `/setbadge` | Capture any Telegram sticker, Custom Emoji, or sticker pack URL as your Ticket Emblem |
| `/resetbadge` | Restore default rose vector emblem |

### Admin Supergroup Topics (inside a visitor's topic)
| Command | Action |
| :--- | :--- |
| `/info` | Show visitor profile card with message/photo/link stats, Mini App link & quick moderation buttons |
| `/ban` / `/unban` | Silently ban / unban visitor |
| `/trust` / `/reset` | Permanently trust / reset anti-spam verification |
| `/close` / `/open` | Close / reopen conversation |

---

## 🔒 Privacy & Security

- **Zero Secrets in Git**: All tokens, KV IDs, group IDs, private bookmarks, and visitor logs live strictly in your private Cloudflare account — never in the repository.
- **Official Telegram `initData` Verification**: Every authenticated Mini App API call is validated via HMAC-SHA256 using `WebAppData` key derivation and expiration checks.
- **Strict Server-Side Isolation**:
  - Private sites (`visibility: "private"`) are stripped server-side before responding to non-admin users.
  - Private visitor chat photos are served exclusively via 30-minute HMAC-signed proxy URLs issued only to authenticated admins — `BOT_TOKEN` is never exposed to clients.

---

## ❓ FAQ

- **Can I migrate seamlessly from `telegram_private_chatbot`?**
  Yes! Bind the same `TOPIC_MAP` KV namespace to inherit all existing visitors, topics, and bans with zero downtime (`POST /` and `POST /webhook` are both supported).
- **Why don't old photos/links from before upgrading appear in the gallery?**
  Telegram's Bot API does not allow bots to fetch historical messages retroactively; all new messages, photos, and links sent after upgrading are archived automatically.
- **What does "Full Clear" delete?**
  It deletes the visitor's entire Forum Topic in your admin supergroup (no 48-hour limit!), clears all KV stats/photo/link archives, and attempts to delete recorded private-chat messages within Telegram's 48-hour deletion window.

---

## 📄 License

MIT License © 2026 [mango0114](https://github.com/mango0114)
