// Mini App REST API router (/api/*)

import { authenticateRequest } from './auth.js';
import { getLeaderboard, getMemberTicket, performCheckin } from './checkin.js';
import {
  BADGE_CATALOG,
  LEVELS,
  loadPanelConfig,
  sanitizeAdminConfig,
  sanitizePublicConfig,
  savePanelConfig,
} from './config.js';
import { fetchKomariStatus } from './komari.js';
import { handleAvatarProxy, tgCall } from './telegram.js';
import { applyVisitorAction, getVisitorDetail, listVisitors } from './visitors.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function handleApiRequest(request, env, url) {
  const path = url.pathname;
  const method = request.method.toUpperCase();

  // Avatar proxy (safe public cache, never leaks BOT_TOKEN)
  const avatarMatch = path.match(/^\/api\/avatar\/(\d+)$/);
  if (avatarMatch && method === 'GET') {
    return handleAvatarProxy(env, avatarMatch[1]);
  }

  // Authenticate all other API endpoints via Telegram initData HMAC-SHA256
  const auth = await authenticateRequest(request, env, tgCall);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error || 'Unauthorized' }, auth.status || 401);
  }

  const config = await loadPanelConfig(env);

  // GET /api/bootstrap
  if (path === '/api/bootstrap' && method === 'GET') {
    let checkin = null;
    if (config.community.enableCheckin && auth.user) {
      checkin = await getMemberTicket(env, auth.user, config.community);
    }

    let visitorSummary = null;
    if (auth.isAdmin) {
      const listed = await listVisitors(env, { limit: 1 });
      visitorSummary = listed.stats;
    }

    return json({
      ok: true,
      user: auth.user,
      isAdmin: auth.isAdmin,
      isPreview: auth.isPreview,
      startParam: auth.startParam,
      config: sanitizePublicConfig(config, env),
      adminConfig: auth.isAdmin ? sanitizeAdminConfig(config) : null,
      checkin,
      levels: LEVELS,
      badges: BADGE_CATALOG,
      visitorSummary,
    });
  }

  // POST /api/checkin
  if (path === '/api/checkin' && method === 'POST') {
    if (!config.community.enableCheckin) {
      return json({ ok: false, error: '当前未开启群签到积分功能' }, 403);
    }
    if (!auth.user) {
      return json({ ok: false, error: '请在 Telegram 内打开小程序以进行签到' }, 401);
    }
    const result = await performCheckin(env, auth.user, config.community);
    return json({ ok: true, ...result });
  }

  // GET /api/checkin/leaderboard
  if (path === '/api/checkin/leaderboard' && method === 'GET') {
    if (!config.community.enableCheckin) {
      return json({ ok: false, error: '当前未开启群签到积分功能' }, 403);
    }
    const board = await getLeaderboard(env, 30);
    return json({ ok: true, ...board });
  }

  // GET /api/probe
  if (path === '/api/probe' && method === 'GET') {
    const force = url.searchParams.get('force') === '1' && auth.isAdmin;
    const probeData = await fetchKomariStatus(env, config.probe, { forceRefresh: force });
    return json({ ok: true, ...probeData });
  }

  // --- Admin-only endpoints ---
  if (path.startsWith('/api/admin/')) {
    if (!auth.isAdmin) {
      return json({ ok: false, error: '仅管理员有权访问此接口' }, 403);
    }

    // GET /api/admin/visitors
    if (path === '/api/admin/visitors' && method === 'GET') {
      const search = url.searchParams.get('q') || '';
      const filter = url.searchParams.get('filter') || 'all';
      const data = await listVisitors(env, { search, filter, limit: 80 });
      return json({ ok: true, ...data });
    }

    // GET /api/admin/visitors/:userId
    const visitorMatch = path.match(/^\/api\/admin\/visitors\/(\d+)$/);
    if (visitorMatch && method === 'GET') {
      const detail = await getVisitorDetail(env, visitorMatch[1]);
      if (!detail) return json({ ok: false, error: '未找到该访客记录' }, 404);
      return json({ ok: true, visitor: detail });
    }

    // POST /api/admin/visitors/:userId/action
    const actionMatch = path.match(/^\/api\/admin\/visitors\/(\d+)\/action$/);
    if (actionMatch && method === 'POST') {
      const body = await readJsonBody(request);
      if (!body?.action) return json({ ok: false, error: '缺少 action 参数' }, 400);
      try {
        const visitor = await applyVisitorAction(env, actionMatch[1], body.action, body);
        // Optional polite notice to user when closing/opening conversation
        if (body.notifyUser && env.BOT_TOKEN) {
          if (body.action === 'close') {
            await tgCall(env, 'sendMessage', {
              chat_id: Number(actionMatch[1]),
              text: '🔒 当前对话已由站长关闭，感谢您的联系。',
            }).catch(() => {});
          } else if (body.action === 'open') {
            await tgCall(env, 'sendMessage', {
              chat_id: Number(actionMatch[1]),
              text: '🔓 站长已重新开启对话，您可以继续发送消息。',
            }).catch(() => {});
          }
        }
        return json({ ok: true, visitor });
      } catch (err) {
        return json({ ok: false, error: err.message }, 400);
      }
    }

    // GET /api/admin/config
    if (path === '/api/admin/config' && method === 'GET') {
      return json({ ok: true, config: sanitizeAdminConfig(config) });
    }

    // PUT /api/admin/config
    if (path === '/api/admin/config' && method === 'PUT') {
      const body = await readJsonBody(request);
      if (!body || typeof body !== 'object') {
        return json({ ok: false, error: '无效的配置内容' }, 400);
      }
      const saved = await savePanelConfig(env, body);
      return json({
        ok: true,
        config: sanitizePublicConfig(saved, env),
        adminConfig: sanitizeAdminConfig(saved),
      });
    }

    // POST /api/admin/probe/test
    if (path === '/api/admin/probe/test' && method === 'POST') {
      const body = await readJsonBody(request);
      const testProbeConfig = {
        ...config.probe,
        ...(body || {}),
        apiKey: body?.apiKey === '********' ? config.probe.apiKey : body?.apiKey ?? config.probe.apiKey,
      };
      const result = await fetchKomariStatus(env, testProbeConfig, { forceRefresh: true });
      return json({ ok: !result.error, ...result });
    }
  }

  return json({ ok: false, error: 'Not Found' }, 404);
}
