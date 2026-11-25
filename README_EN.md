# 🌸 RosePanel Bot

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Telegram Mini App](https://img.shields.io/badge/Telegram-Mini%20App-26A5E4?logo=telegram&logoColor=white)](https://core.telegram.org/bots/webapps)
[![Release](https://img.shields.io/github/v/release/mango0114/rose-panel-bot?color=A32952&label=Release)](https://github.com/mango0114/rose-panel-bot/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-A32952.svg)](LICENSE)

[🇨🇳 简体中文](README.md) | 🇺🇸 **English** | [📋 Changelog](CHANGELOG.md)

An all-in-one **Telegram Mini App Personal Panel**, **Public/Private Site Directory**, **Komari Server Probe Monitor**, **Bidirectional Anti-Spam PM Bot with Photo/Link Archive**, and **Optional Group Check-in & Badges System** running on **Cloudflare Workers**.

---

## ✨ Key Features

- **🪪 Rose-Porcelain Personal Card & Dual Mode**
  - **Personal Card Mode (Default)**: Clean profile card with avatar, status badge, bio, social links, personal tags, customizable contact etiquette card, and optional notice banner — plus an **Admin-Only Overview** (blocked spam count, active visitors, recent contacts) visible exclusively to the owner.
  - **Group Community Mode (1-Click Toggle)**: Enables `/me`, `/panel`, `/checkin`, `/rank` in groups and Mini App with daily points, streak bonuses, 7-tier levels, 8 achievement badges, and leaderboard.
- **✨ Telegram Stickers & Custom Emojis as Main Emblem**
  - Supports static `.webp`, video `.webm`, animated `.tgs` (edge-decompressed 60fps Lottie JSON), and Telegram Premium Custom Emojis.
  - Send `/set` (alias `/setbadge`) to the bot with any sticker, custom emoji, or pack link, or browse `t.me/addstickers/...` / `t.me/addemoji/...` visually inside Settings.
- **🌐 Public Sites & Private Bookmarks (Server-Side Isolated)**
  - Categories, search, reordering, and 1-tap **`Public` vs `🔒 Private`** visibility toggle. Non-admin responses strictly omit private sites at the Worker layer.
- **📡 Komari Server Probe Monitor**
  - Native adapter for **Komari v2 (`/api/rpc2`)** and **v1 (`/api/nodes`)**, supporting public and private instances, 10-segment online meter, CPU/RAM/Disk/network metrics, and hardware details.
- **👤 Bidirectional PM Bot + Photo Gallery / Link Archive / Quick Clear (Admin Only)**
  - Dedicated Telegram Forum Topic per visitor, bidirectional message counter (`Visitor · Me`), auto-archived **Photo Gallery** (HMAC-signed private proxy + lightbox) & **Links List**, private notes, 1-tap Ban/Unban/Trust/Close, and two-tier **Clear Chat History** (archive-only or full topic wipe + <48h PM deletion).

---

## 🛡️ How Anti-Spam Verification Works

Switch freely between **3 verification modes** inside **⚙️ Settings → Community & Anti-Spam**:

| Mode | Experience & Mechanism | Anti-Abuse Protection |
| :--- | :--- | :--- |
| **🎯 Emoji Odd-One-Out / Pick (Default)** | 3×3 pure-icon inline grid alternating odd-one-out and semantic pick. **Zero latency, ~0.5s for humans** | 1st wrong tap reshuffles a new challenge; 2 consecutive failures trigger silent 10-min cooldown (configurable) |
| **🎭 Custom Sticker Quiz (Personal & Fun)** | Use `/add` (alias `/addverify`) or the in-panel sticker pack builder to turn your own collected animated/static TG stickers into custom visual multiple-choice quizzes — **unique per owner, impossible for text scripts** | Auto-switches stickers on retry, auto-deletes sticker after passing, plus honeypot & cooldown |
| **📝 Local Quiz** | 2×2 local commonsense buttons, zero external API calls | Same reshuffle-on-error + cooldown protection |
| **🛡️ CF Turnstile Strict Mode** | 1-tap escalation during heavy bot raids; runs Cloudflare Turnstile natively inside Telegram WebApp overlay | Server-side `siteverify` validation; auto-falls back to Emoji mode if Turnstile keys aren't configured |

- **4-Layer Intelligent Anti-Spam Shield (Millisecond Edge Latency)**:
  1. **CAS Global Blacklist**: Checks [Combot Anti-Spam (CAS)](https://cas.chat/) on first contact from unverified strangers (KV-cached 6h/24h, fail-open) to silently drop known userbot spammers with zero friction for real users.
  2. **Unsolicited Media/Flyer Block & Smart Escalation**: Unverified first-message photos/videos/stickers (e.g. USDT/casino/VPN ad flyers), channel forwards, external links, zero-width spoofing, or ad display names are never pre-queued and automatically escalate to CF Turnstile strict mode.
  3. **Honeypot Trap + Reshuffle Cooldown**: Decoy button silently bans blind callback scripts; wrong answers reshuffle and trigger silent cooldown.
  4. **De-Obfuscated Keyword Filter & Edit Guard**: Strips zero-width chars, full-width Unicode (NFKC), and Cyrillic homoglyphs; monitors `edited_message` to catch "send innocent text then edit into spam link" exploits.
- **30-Day Grace Period**: Verified users stay verified for 30 days; admins can also grant **⭐ Permanent Trust** or **🚫 Silent Ban** anytime.
- **End-to-End Security**: Official Telegram `initData` HMAC-SHA256 verification on APIs, server-side filtering for private sites, and 30-minute HMAC-signed proxy URLs for private chat photos (`BOT_TOKEN` never reaches clients).

---

## 💎 Why RosePanel?

1. **Zero Server Cost & Native HTTPS**: Runs on Cloudflare Workers' free tier with global edge speed and instant TLS.
2. **100% Visual Management Inside Telegram**: Edit bio, public/private sites, Komari URL, sticker badges, verification mode, and check-in rules right from your phone — no redeploy needed.
3. **Zero-Downtime Migration**: Directly compatible with `telegram_private_chatbot`'s `TOPIC_MAP` KV schema and root `POST /` webhooks.
4. **Privacy-Clean Repository**: Zero hardcoded tokens, group IDs, KV IDs, or private bookmarks in Git.
5. **Modular Lightweight Design & AI-Native Installer**: Deploy as an ultra-lightweight personal card with just `BOT_TOKEN`, or toggle any module on demand. Includes a standard [AGENTS.md](AGENTS.md) so AI coding agents automatically ask which modules you want before installing!

---

## 🧩 Modular Add-Ons & 🤖 AI-Guided Setup

Pick only what you need — unused modules stay cleanly out of the way:

| Module | Default | Activation | Notes |
| :--- | :---: | :--- | :--- |
| **🎫 Personal Ticket + 🌐 Public/Private Sites** | Core | `BOT_TOKEN` + `TOPIC_MAP` KV | Ultra-lightweight baseline with custom TG sticker emblems & private bookmarks |
| **📡 Komari Server Probe** | Optional | Set `KOMARI_URL` (env or in-app) | Automatically hides the `Probe` tab for visitors when unconfigured |
| **👤 Bidirectional PM Bot + 4-Layer Shield** | Optional | Set `SUPERGROUP_ID` | Forum Topics, photo/link archive, CAS blacklist, and flyer-ad blocking |
| **🛡️ CF Turnstile Strict Mode** | Optional | Set `TURNSTILE_SITE_KEY` & `SECRET` | Auto-escalates suspicious ads or toggleable manually in Settings |
| **🌸 Group Check-in, Points & Badges** | Optional | `ENABLE_CHECKIN="true"` or in-app switch | Off by default for clean personal cards; 1-click on for Telegram groups |
| **🔌 Extra Optional Extensions** | Opt-in | Ask your AI agent during setup | Need Nezha/Uptime Kuma probes or channel comment guard? Your AI agent follows [AGENTS.md](AGENTS.md) to add them only if requested |

> **🤖 AI-Guided Installation (Antigravity / Claude Code / Codex / Cursor)**:  
> Open this repo with your AI assistant and say:
> ```text
> Read AGENTS.md in this repo, ask me which modules I want (or if I prefer a lightweight install), and guide me through deploying RosePanel Bot.
> ```

---

## 🚀 Fast Deployment (4 Options)

> **Prerequisites**: Get a `BOT_TOKEN` from [@BotFather](https://t.me/BotFather). For PM forwarding, create a Telegram group with **Topics** enabled, add the bot as Administrator (**Manage Topics** & **Delete Messages**), and note its `-100...` `SUPERGROUP_ID`.

### Option 1: Cloudflare Dashboard Git Deploy (Easiest ★, Zero Local Setup)

1. Fork this repository to your GitHub account.
2. Open [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Workers** → **Import a repository** → choose `rose-panel-bot`:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
   - Click **Save and Deploy**.
3. In **Settings → Variables & Bindings**, confirm `TOPIC_MAP` KV is bound and add your variables below.

### Option 2: Windows (PowerShell)

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e

git clone https://github.com/mango0114/rose-panel-bot.git
cd rose-panel-bot
npm install
npx wrangler login
npm run deploy

npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
```

### Option 3: macOS (Terminal)

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

### Option 4: Linux VPS (All Major Distros & Docker)

#### 1. Install Git & Node.js 22
- **Debian / Ubuntu**:
  ```bash
  sudo apt update && sudo apt install -y curl git ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
  ```
- **CentOS Stream / Rocky Linux / AlmaLinux / RHEL**:
  ```bash
  sudo dnf install -y curl git
  curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash - && sudo dnf install -y nodejs
  ```
- **Arch Linux**: `sudo pacman -Syu --noconfirm git nodejs npm`
- **Alpine Linux**: `apk add --no-cache git nodejs npm`

#### 2. Headless Deploy to Cloudflare Workers via API Token
```bash
git clone https://github.com/mango0114/rose-panel-bot.git
cd rose-panel-bot && npm ci
export CLOUDFLARE_API_TOKEN="YOUR_CLOUDFLARE_API_TOKEN"
npm run deploy
echo "YOUR_BOT_TOKEN" | npx wrangler secret put BOT_TOKEN
echo "YOUR_RANDOM_SECRET" | npx wrangler secret put WEBHOOK_SECRET
```

#### 3. One-Line Docker Deploy (Any OS)
```bash
git clone https://github.com/mango0114/rose-panel-bot.git && cd rose-panel-bot
docker run --rm -it -v "$PWD":/app -w /app -e CLOUDFLARE_API_TOKEN="YOUR_API_TOKEN" node:22-alpine sh -c "npm ci && npm run deploy"
```

#### 4. Self-Host Persistently on Your Own VPS (with Caddy HTTPS)
```bash
npm ci && npm run build && cp .dev.vars.example .dev.vars
# Edit .dev.vars with real secrets (remove DEV_PREVIEW="true" in production!)
npx wrangler dev --ip 127.0.0.1 --port 8787 --persist-to ./.wrangler/state --show-interactive-dev-session=false
```
Reverse-proxy `127.0.0.1:8787` with Caddy (`reverse_proxy 127.0.0.1:8787`) for automatic HTTPS and run under `systemd`.

---

## ⚙️ Environment Variables & Final Activation

| Variable | Type | Required | Notes |
| :--- | :--- | :---: | :--- |
| `TOPIC_MAP` | KV Binding | ✅ | Stores config, sites, visitor archive, and check-ins |
| `BOT_TOKEN` | Secret | ✅ | Telegram Bot Token |
| `SUPERGROUP_ID` | Text | PM Bot | Admin Forum Group ID (`-100...`) |
| `ADMIN_IDS` | Text | Recommended | Comma-separated numeric UIDs (supergroup admins are also auto-detected) |
| `BOT_USERNAME` | Text | Recommended | Bot username without `@` |
| `APP_SHORT_NAME` | Text | Recommended | BotFather `/newapp` short name (e.g. `panel`) |
| `WEBHOOK_SECRET` | Secret | Recommended | Random secret protecting `/webhook` & `/setup` |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET` | Text / Secret | Optional | Required only for CF Turnstile strict mode |
| `KOMARI_URL` / `KOMARI_API_KEY` | Text / Secret | Optional | Komari endpoint & optional private auth (also editable in-app) |

**Final Activation (10s)**:
1. (Recommended) Attach a Custom Domain (e.g. `panel.yourdomain.com`) in Cloudflare Worker Settings.
2. Open `https://<your-domain>/setup?secret=<YOUR_WEBHOOK_SECRET>` once in your browser until you see `"ok": true`.
3. (For group pop-up launch) Run `/newapp` in `@BotFather` pointing to `https://<your-domain>/` with short name `panel`.

---

## 🤖 Commands

- **Everyone**: `/start`, `/panel`, `/me`, `/checkin` (community mode), `/rank` (community mode)
- **Admin Private Chat**: `/set` (set animated sticker/Custom Emoji emblem, alias `/setbadge`), `/add` (add custom sticker visual verification quiz, alias `/addverify`), `/resetbadge`, `/cancel`
- **Admin Forum Topics**: `/info`, `/ban`, `/unban`, `/trust`, `/reset`, `/close`, `/open`

---

## 🙏 Credits & Tech Stack

- Integrations & Compatibility: [Komari Monitor](https://github.com/komari-monitor/komari) · [Combot Anti-Spam (CAS)](https://cas.chat/) · [jikssha/telegram_private_chatbot](https://github.com/jikssha/telegram_private_chatbot)
- Built With: [Cloudflare Workers](https://workers.cloudflare.com/) · [Telegram Mini Apps](https://core.telegram.org/bots/webapps) · [React](https://react.dev/) · [Vite](https://vitejs.dev/) · [Lucide Icons](https://lucide.dev/) · [lottie-web](https://github.com/airbnb/lottie-web)

MIT License © 2026 [mango0114](https://github.com/mango0114)
