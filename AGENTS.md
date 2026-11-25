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
| **3. Server Probe Module (`探针`)** | Optional (Lightweight OFF) | `PROBE_PROVIDER` + `PROBE_URL` (+ optional `PROBE_API_KEY`; legacy `KOMARI_URL` / `KOMARI_API_KEY` still work) or set in Mini App UI | **Ask the user which probe they use** (see Step 1b). Built-in providers: `komari` (v2 `/api/rpc2` + v1 `/api/nodes`), `nezha` (v1 public WS `/api/v1/ws/server` + v1 REST `/api/v1/server` + v0 `/api/v1/server/details`), `nodeget` (NodeSeek official probe WebSocket JSON-RPC 2.0), `json` (generic JSON node list for 极简探针 / CF Workers 探针 / ServerStatus). Hides the `探针` tab for non-admin visitors when unconfigured or set to `private`. |
| **4. Bidirectional PM Bot & 4-Layer Anti-Spam Shield (`访客`)** | Optional | Send `/bind` in your Forum Group (or set `SUPERGROUP_ID`) | Enables isolated Forum Topics, bidirectional message counter, Photo Gallery, Links Archive, Quick Clear, owner overview card, and 4-layer shield (`Emoji` / `Custom Sticker Quiz via /add` / `Quiz` / `CF Turnstile` + CAS blacklist + unverified media flyer block + honeypot + edit guard). |
| **5. Cloudflare Turnstile Strict Verification** | Optional | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` | Upgrades high-risk spam (forwarded ads, unsolicited first-message photos, links, zero-width tricks) or manual strict mode into in-Telegram Turnstile WebApp verification. |
| **6. Group Check-in, Points, Levels & Badges (`群社区模式`)** | Optional (`false`) | `ENABLE_CHECKIN="true"` (or 1-click toggle inside Mini App Settings) | Enables `/me`, `/panel`, `/checkin`, `/rank` in Telegram groups with daily streaks, 7-tier progression, 8 auto-unlocked badges, and leaderboard. |
| **7. Custom Optional Extensions (Not installed by default — keep core lightweight!)** | Opt-in on request | Code extension | Only implement if the user explicitly asks during setup: e.g., **extra probe adapters such as Uptime Kuma** (register in `PROBE_PROVIDERS` in `src/worker/komari.js`), **Channel Discussion Comment Guard** (add group message moderation in `src/worker/bot.js` reusing `src/worker/antispam.js`), or **AI Group Q&A** (OpenAI-compatible `/ask` command). |

### Step 1b: If the Probe module is enabled, ask which probe and which edition

1. **Which probe?** Komari / 哪吒探针 (Nezha v1/v0) / NodeGet (NodeSeek 官方探针) / 极简探针 / CF Workers 探针 / ServerStatus / other.
2. **Lightweight or full?**
   - **Lightweight (轻量版)**: set `PROBE_PROVIDER` to the single provider the user picked (`komari` / `nezha` / `nodeget` / `json`).
   - **Full (全量版)**: leave `PROBE_PROVIDER` unset (defaults to `komari`); the user can switch providers any time in Mini App **⚙️ Settings → 节点探针**.
3. **Map the choice to a provider**:
   - Komari → `komari`
   - 哪吒探针 (v1/v0) → `nezha` (public v1 panels work without token via `/api/v1/ws/server`; private v1/v0 panels use `PROBE_API_KEY`)
   - NodeGet (NodeSeek 官方探针) → `nodeget` (backend WebSocket URL `wss://...` + read-only `token` in `PROBE_API_KEY`)
   - 极简 / CF / ServerStatus / other → first try `json` with the probe's JSON API URL and press **测试探针连接**. If fields are not recognized, ask the user for the probe's GitHub repo or real JSON response before writing a dedicated `fetchViaXxx()` adapter in `PROBE_PROVIDERS` (`src/worker/komari.js`), `PROBE_PROVIDER_IDS` (`src/worker/config.js`), and `PROBE_PROVIDER_OPTIONS` (`web/src/components/SettingsDrawer.jsx`). **Never guess an API format without checking the real response.**

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
- `src/worker/komari.js` — Pluggable probe module: `PROBE_PROVIDERS` registry (`komari`, `nezha`, `nodeget`, `json`) + `normalizeNodeMetrics`. Add new probe providers here.
- `src/worker/updater.js` & `src/worker/version.js` — Admin-only GitHub latest release checker (6h KV cache) & optional Fork `merge-upstream` 1-click syncer.
- `web/src/` — React 19 + Vite Mini App frontend (`TicketTab`, `SitesTab`, `ProbeTab`, `VisitorsTab`, `LeaderboardTab`, `SettingsDrawer`).
- `tests/worker.test.js` — Vitest unit test suite (`npm test`). Always run `npm test && npm run build` after any modification.
