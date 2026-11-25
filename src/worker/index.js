// Main Cloudflare Worker Entrypoint for RosePanel Bot

import { handleApiRequest } from './api.js';
import { completeTurnstileVerification, handleTelegramUpdate } from './bot.js';
import { loadPanelConfig, safeGetJSON } from './config.js';
import { serveEmbeddedAsset } from './embedded-assets.js';
import { tgCall } from './telegram.js';
import { renderTurnstileVerifyPage, verifyTurnstileToken } from './turnstile.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function handleSetup(request, env, url) {
  if (env.WEBHOOK_SECRET) {
    const provided = url.searchParams.get('secret') || '';
    if (provided !== env.WEBHOOK_SECRET) {
      return jsonResponse({ ok: false, error: 'Invalid setup secret. Pass ?secret=YOUR_WEBHOOK_SECRET' }, 403);
    }
  }

  if (!env.BOT_TOKEN) {
    return jsonResponse({ ok: false, error: 'BOT_TOKEN secret is not configured' }, 500);
  }

  const origin = url.origin;
  const webhookUrl = `${origin}/webhook`;
  const config = await loadPanelConfig(env);

  const results = {};

  // 1. Register Webhook (with optional secret_token header validation)
  const webhookPayload = {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
  };
  if (env.WEBHOOK_SECRET) {
    webhookPayload.secret_token = env.WEBHOOK_SECRET;
  }
  results.setWebhook = await tgCall(env, 'setWebhook', webhookPayload);

  // 2. Register bot commands for private chats and groups
  const privateCommands = [
    { command: 'start', description: '打开个人面板与欢迎页' },
    { command: 'panel', description: '打开个人面板小程序' },
  ];
  const groupCommands = [
    { command: 'panel', description: '打开个人面板小程序' },
    { command: 'me', description: '查看我的个人票根' },
  ];
  if (config.community.enableCheckin) {
    privateCommands.push({ command: 'checkin', description: '每日签到领积分' });
    groupCommands.push(
      { command: 'checkin', description: '群内每日签到领积分' },
      { command: 'rank', description: '查看群积分排行榜' }
    );
  }

  results.privateCommands = await tgCall(env, 'setMyCommands', {
    commands: privateCommands,
    scope: { type: 'all_private_chats' },
  });
  results.groupCommands = await tgCall(env, 'setMyCommands', {
    commands: groupCommands,
    scope: { type: 'all_group_chats' },
  });

  // 3. Attach Mini App to the bottom-left chat menu button
  results.menuButton = await tgCall(env, 'setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: '个人面板',
      web_app: { url: `${origin}/` },
    },
  });

  return jsonResponse({
    ok: true,
    webhookUrl,
    miniAppUrl: `${origin}/`,
    results,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return jsonResponse({
        ok: true,
        service: 'rose-panel-bot',
        hasToken: Boolean(env.BOT_TOKEN),
        hasKv: Boolean(env.TOPIC_MAP),
        hasSupergroup: Boolean(env.SUPERGROUP_ID),
      });
    }

    // One-click Webhook & Menu Button setup
    if (url.pathname === '/setup') {
      try {
        return await handleSetup(request, env, url);
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    // Cloudflare Turnstile strict verification page (opens cleanly inside Telegram WebView)
    if (url.pathname === '/verify' && request.method === 'GET') {
      const vid = url.searchParams.get('vid') || '';
      if (!env.TURNSTILE_SITE_KEY || !vid) {
        return new Response('Turnstile verification is not configured or link expired.', { status: 400 });
      }
      const state = await safeGetJSON(env.TOPIC_MAP, `chal:${vid}`, null);
      if (!state) {
        return new Response('验证链接已过期，请回到私聊重新发送消息触发新验证。', {
          status: 410,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      return renderTurnstileVerifyPage(env.TURNSTILE_SITE_KEY, vid);
    }

    // Cloudflare Turnstile server-side token verification
    if (url.pathname === '/verify-submit' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ ok: false, error: '无效请求' }, 400);
      }
      const vid = String(body?.verifyId || '');
      const token = String(body?.token || '');
      if (!vid || !token || !env.TURNSTILE_SECRET) {
        return jsonResponse({ ok: false, error: '验证参数缺失' }, 400);
      }
      const remoteIp = request.headers.get('CF-Connecting-IP') || '';
      const check = await verifyTurnstileToken(env.TURNSTILE_SECRET, token, remoteIp);
      if (!check.success) {
        return jsonResponse({ ok: false, error: 'Cloudflare 人机核验未通过，请重试' }, 403);
      }
      const result = await completeTurnstileVerification(env, url.origin, vid);
      if (!result.ok) {
        return jsonResponse({ ok: false, error: result.error || '验证会话已过期' }, 410);
      }
      return jsonResponse({ ok: true });
    }

    // Telegram Bot Webhook: supports BOTH `/webhook` and legacy root `POST /`
    // for zero-downtime upgrade from telegram_private_chatbot.
    if ((url.pathname === '/webhook' || url.pathname === '/') && request.method === 'POST') {
      if (url.pathname === '/webhook' && env.WEBHOOK_SECRET) {
        const tokenHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
        if (tokenHeader !== env.WEBHOOK_SECRET) {
          return new Response('Unauthorized', { status: 401 });
        }
      }

      let update;
      try {
        update = await request.json();
      } catch {
        return new Response('Bad Request', { status: 400 });
      }

      if (!update || typeof update !== 'object') {
        return new Response('OK', { status: 200 });
      }

      const work = handleTelegramUpdate(update, env, url.origin).catch((err) => {
        console.error('Webhook handling error:', err);
      });
      if (ctx?.waitUntil) {
        ctx.waitUntil(work);
      } else {
        await work;
      }
      return new Response('OK', { status: 200 });
    }

    // Mini App API routes
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApiRequest(request, env, url);
      } catch (err) {
        console.error('API error:', err);
        return jsonResponse({ ok: false, error: err.message || 'Internal Server Error' }, 500);
      }
    }

    // Static Mini App frontend served via Cloudflare Workers Assets binding
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    // Fallback: embedded static assets (used for single-module Cloudflare API uploads)
    const embedded = serveEmbeddedAsset(url.pathname);
    if (embedded) return embedded;

    return new Response('Not Found', { status: 404 });
  },
};
