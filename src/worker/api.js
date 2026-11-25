// Mini App REST API router (/api/*)

import { getBlockedSpamCount } from './antispam.js';
import { authenticateRequest, signMediaToken, verifyMediaToken } from './auth.js';
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
import {
  handleAvatarProxy,
  handleSignedMediaProxy,
  handleStickerProxy,
  normalizeStickerObject,
  parseStickerPackName,
  tgCall,
} from './telegram.js';
import {
  applyVisitorAction,
  clearVisitorHistory,
  getVisitorDetail,
  getVisitorHistory,
  listVisitors,
} from './visitors.js';

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

  // Telegram Sticker / Custom Emoji proxy (supports .webp, .webm, and auto-decompressed .tgs Lottie JSON)
  const stickerMatch = path.match(/^\/api\/sticker\/([^/]+)$/);
  if (stickerMatch && method === 'GET') {
    return handleStickerProxy(env, stickerMatch[1]);
  }

  // HMAC-signed private media proxy for visitor chat photos (admin-issued short-lived token)
  const mediaMatch = path.match(/^\/api\/media\/([^/]+)$/);
  if (mediaMatch && method === 'GET') {
    const fileId = decodeURIComponent(mediaMatch[1]);
    const exp = url.searchParams.get('exp');
    const sig = url.searchParams.get('sig');
    const valid = await verifyMediaToken(fileId, exp, sig, env.BOT_TOKEN);
    if (!valid) {
      return json({ ok: false, error: 'Invalid or expired media signature' }, 403);
    }
    return handleSignedMediaProxy(env, fileId);
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
    let recentVisitors = [];
    let blockedSpamCount = 0;
    if (auth.isAdmin) {
      const [listed, spamCount] = await Promise.all([
        listVisitors(env, { limit: 5 }),
        getBlockedSpamCount(env),
      ]);
      visitorSummary = listed.stats;
      recentVisitors = (listed.items || []).slice(0, 5);
      blockedSpamCount = spamCount;
    }

    return json({
      ok: true,
      user: auth.user,
      isAdmin: auth.isAdmin,
      isPreview: auth.isPreview,
      startParam: auth.startParam,
      config: sanitizePublicConfig(config, env, auth.isAdmin),
      adminConfig: auth.isAdmin ? sanitizeAdminConfig(config, env) : null,
      checkin,
      levels: LEVELS,
      badges: BADGE_CATALOG,
      visitorSummary,
      recentVisitors,
      blockedSpamCount,
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
      const [data, blockedSpamCount] = await Promise.all([
        listVisitors(env, { search, filter, limit: 80 }),
        getBlockedSpamCount(env),
      ]);
      return json({ ok: true, ...data, blockedSpamCount });
    }

    // GET /api/admin/visitors/:userId
    const visitorMatch = path.match(/^\/api\/admin\/visitors\/(\d+)$/);
    if (visitorMatch && method === 'GET') {
      const detail = await getVisitorDetail(env, visitorMatch[1]);
      if (!detail) return json({ ok: false, error: '未找到该访客记录' }, 404);
      return json({ ok: true, visitor: detail });
    }

    // GET /api/admin/visitors/:userId/history — archived photos (with signed URLs) & links
    const historyMatch = path.match(/^\/api\/admin\/visitors\/(\d+)\/history$/);
    if (historyMatch && method === 'GET') {
      const uid = historyMatch[1];
      const [detail, history] = await Promise.all([
        getVisitorDetail(env, uid),
        getVisitorHistory(env, uid),
      ]);
      if (!detail) return json({ ok: false, error: '未找到该访客记录' }, 404);

      const signedPhotos = await Promise.all(
        history.photos.map(async (p) => {
          const fullToken = await signMediaToken(p.fileId, env.BOT_TOKEN, 1800);
          const thumbId = p.thumbFileId || p.fileId;
          const thumbToken =
            thumbId === p.fileId ? fullToken : await signMediaToken(thumbId, env.BOT_TOKEN, 1800);
          return {
            id: p.id,
            caption: p.caption || '',
            sender: p.sender || 'visitor',
            at: p.at,
            url: `/api/media/${encodeURIComponent(p.fileId)}?exp=${fullToken.exp}&sig=${fullToken.sig}`,
            thumbUrl: `/api/media/${encodeURIComponent(thumbId)}?exp=${thumbToken.exp}&sig=${thumbToken.sig}`,
          };
        })
      );

      return json({
        ok: true,
        visitor: detail,
        photos: signedPhotos,
        links: history.links,
      });
    }

    // POST /api/admin/visitors/:userId/clear — clear archive or full topic + <48h PM history
    const clearMatch = path.match(/^\/api\/admin\/visitors\/(\d+)\/clear$/);
    if (clearMatch && method === 'POST') {
      const body = await readJsonBody(request);
      const mode = body?.mode === 'full' ? 'full' : 'archive';
      try {
        const result = await clearVisitorHistory(env, clearMatch[1], mode, tgCall);
        return json({ ok: true, mode, ...result });
      } catch (err) {
        return json({ ok: false, error: err.message }, 400);
      }
    }

    // POST /api/admin/visitors/:userId/action
    const actionMatch = path.match(/^\/api\/admin\/visitors\/(\d+)\/action$/);
    if (actionMatch && method === 'POST') {
      const body = await readJsonBody(request);
      if (!body?.action) return json({ ok: false, error: '缺少 action 参数' }, 400);
      try {
        const visitor = await applyVisitorAction(env, actionMatch[1], body.action, body);
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

    // POST /api/admin/sites/toggle — instant public/private toggle for a single site
    if (path === '/api/admin/sites/toggle' && method === 'POST') {
      const body = await readJsonBody(request);
      const siteId = String(body?.id || '');
      if (!siteId) return json({ ok: false, error: '缺少站点 ID' }, 400);

      let found = false;
      const nextSites = config.sites.map((s) => {
        if (String(s.id) !== siteId) return s;
        found = true;
        const nextVis =
          body.visibility === 'private' || body.visibility === 'public'
            ? body.visibility
            : s.visibility === 'private'
              ? 'public'
              : 'private';
        return { ...s, visibility: nextVis };
      });
      if (!found) return json({ ok: false, error: '未找到该站点' }, 404);

      const saved = await savePanelConfig(env, { sites: nextSites });
      return json({
        ok: true,
        config: sanitizePublicConfig(saved, env, true),
        adminConfig: sanitizeAdminConfig(saved, env),
      });
    }

    // POST /api/admin/stickers/pack — fetch a Telegram Sticker or Custom Emoji pack by URL or name
    if (path === '/api/admin/stickers/pack' && method === 'POST') {
      const body = await readJsonBody(request);
      const packName = parseStickerPackName(body?.input || body?.name || '');
      if (!packName) {
        return json(
          { ok: false, error: '请输入有效的 Telegram 贴纸包/表情包链接（如 https://t.me/addstickers/... 或 https://t.me/addemoji/...）' },
          400
        );
      }
      try {
        const res = await tgCall(env, 'getStickerSet', { name: packName });
        const set = res?.result;
        const stickers = (set?.stickers || [])
          .slice(0, 60)
          .map(normalizeStickerObject)
          .filter(Boolean);
        return json({
          ok: true,
          name: set?.name || packName,
          title: set?.title || packName,
          stickerType: set?.sticker_type || 'regular',
          total: set?.stickers?.length || stickers.length,
          stickers,
        });
      } catch (err) {
        return json({ ok: false, error: `拉取贴纸包失败：${err.message}` }, 400);
      }
    }

    // GET /api/admin/config
    if (path === '/api/admin/config' && method === 'GET') {
      return json({ ok: true, config: sanitizeAdminConfig(config, env) });
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
        config: sanitizePublicConfig(saved, env, true),
        adminConfig: sanitizeAdminConfig(saved, env),
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
