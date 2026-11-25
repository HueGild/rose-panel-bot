# AGENTS.md — AI-Assisted Modular Setup & Extension Guide for RosePanel Bot

> **Instructions for AI Coding Agents (Antigravity, Claude Code, Codex, Cursor, Windsurf, Copilot, etc.):**
> When a user asks you to install, deploy, or customize **RosePanel Bot**, **DO NOT blindly enable every feature.**
> First present the modular menu below and **ask the user which modules they want to enable** so they can choose either an **ultra-lightweight personal card** or a **full-featured panel + anti-spam PM bot + group check-in system**.

---

## Step 1: Ask the User Which Modules to Enable

Before configuring environment variables or deploying, ask the user to choose:

| Module | Default | Required Env / Config | Notes |
| :--- | :---: | :--- | :--- |
| **1. Core Personal Card (`名片`)** | Always ON | `BOT_TOKEN`, `WEBHOOK_SECRET`, `ADMIN_IDS`, `TOPIC_MAP` KV | Rose-porcelain profile card, social links, personal tags, contact etiquette, customizable 0ms splash screen, custom TG Sticker/Emoji emblem via `/set`. |
| **2. Personal Sites & Private Bookmarks (`小站`)** | Always ON | Managed live in Mini App Settings | Supports Public sites + server-side isolated `🔒 Private` owner-only bookmarks. |
| **3. Komari Server Probe (`探针`)** | Optional (Lightweight OFF) | `KOMARI_URL` (+ optional `KOMARI_API_KEY`) or set in Mini App UI | Automatically hides the `探针` tab for non-admin visitors when unconfigured or set to `private`! Supports Komari v2 `/api/rpc2` and v1 `/api/nodes`. |
| **4. Bidirectional PM Bot & 4-Layer Anti-Spam Shield (`访客`)** | Optional | Send `/bind` in your Forum Group (or set `SUPERGROUP_ID`) | Enables isolated Forum Topics, bidirectional message counter, Photo Gallery, Links Archive, Quick Clear, owner overview card, and 4-layer shield (`Emoji` / `Custom Sticker Quiz via /add` / `Quiz` / `CF Turnstile` + CAS blacklist + unverified media flyer block + honeypot + edit guard). |
| **5. Cloudflare Turnstile Strict Verification** | Optional | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | Upgrades high-risk spam (forwarded ads, unsolicited first-message photos, links, zero-width tricks) or manual strict mode into in-Telegram Turnstile WebApp verification. |
| **6. Group Check-in, Points, Levels & Badges (`群社区模式`)** | Optional (`false`) | `ENABLE_CHECKIN="true"` (or 1-click toggle inside Mini App Settings) | Enables `/me`, `/panel`, `/checkin`, `/rank` in Telegram groups with daily streaks, 7-tier progression, 8 auto-unlocked badges, and leaderboard. |
| **7. Custom Optional Extensions (Not installed by default — keep core lightweight!)** | Opt-in on request | Code extension | Only implement if the user explicitly asks during setup: e.g., **Nezha / Uptime Kuma probe adapter** (extend `src/worker/komari.js`), **Channel Discussion Comment Guard** (add group message moderation in `src/worker/bot.js` reusing `src/worker/antispam.js`), or **AI Group Q&A** (OpenAI-compatible `/ask` command). |

---

## Step 2: Confirm Deployment Target

Ask the user which deployment path fits their environment (see `README.md` / `README_EN.md` for exact commands):
1. **Cloudflare Dashboard Git Integration (Recommended, free & zero local setup)** — Build: `npm run build`, Deploy: `npx wrangler deploy`.
2. **Local CLI Deploy (Windows PowerShell / macOS Terminal)** — `npm install && npx wrangler login && npm run deploy`.
3. **Linux VPS Headless Deploy (Debian / Ubuntu / CentOS / Rocky / Arch / Alpine / Docker)** — via `CLOUDFLARE_API_TOKEN` or self-hosted `wrangler dev` + Caddy HTTPS.

---

## Step 3: Post-Deployment Activation Checklist

After deploying, remind or assist the user with these 3 final steps:
1. **Bind `TOPIC_MAP` KV**, set secrets (`BOT_TOKEN`, `WEBHOOK_SECRET`, and optional `TURNSTILE_SECRET` / `KOMARI_API_KEY`) and the required text var `ADMIN_IDS` (owner numeric UID). **Never set `DEV_PREVIEW="true"` in production**, and **never commit real tokens, group IDs, or KV IDs to a public repository.**
2. **Run `/setup`** once in a browser: `https://<your-domain>/setup?secret=<YOUR_WEBHOOK_SECRET>` to register Telegram webhook (`message`, `edited_message`, `callback_query`), bot commands, and the bottom-left Mini App menu button.
3. **Register Direct-Link Mini App in `@BotFather`** (`/newapp` → URL `https://<your-domain>/` → short name matching `APP_SHORT_NAME`, e.g., `panel`) so the panel opens cleanly from groups and admin topic buttons.

---

## Architecture Quick Reference for Extensions

- `src/worker/index.js` — Cloudflare Worker entrypoint (`/health`, `/setup`, `/webhook`, `/verify`, `/verify-submit`, `/api/*`, `ASSETS`).
- `src/worker/config.js` — Defaults, KV persistence (`config:panel`), and strict server-side sanitization (`sanitizePublicConfig`).
- `src/worker/auth.js` — Telegram Mini App `initData` HMAC-SHA256 verification & signed private media tokens.
- `src/worker/antispam.js` — 4-layer shield: CAS blacklist (`api.cas.chat`), Unicode de-obfuscation, unverified media/link/forward risk scoring, spam counter.
- `src/worker/bot.js` — Webhook router for PM forwarding, 4-mode verification (Sticker Quiz / Emoji / Quiz / Turnstile), admin `/set` (alias `/setbadge`) & `/add` (alias `/addverify`), group `/checkin` & `/rank`.
- `src/worker/visitors.js` — KV-compatible visitor profiles, bidirectional photo/link archive, and two-mode history clear.
- `src/worker/komari.js` — Komari v2 RPC2 & v1 REST adapter (ideal extension point for additional probe providers).
- `web/src/` — React 19 + Vite Mini App frontend (`TicketTab`, `SitesTab`, `ProbeTab`, `VisitorsTab`, `LeaderboardTab`, `SettingsDrawer`).
- `tests/worker.test.js` — Vitest unit test suite (`npm test`). Always run `npm test && npm run build` after any modification.
