// Telegram Bot API client & helpers

export async function tgCall(env, method, payload = {}) {
  if (!env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN is not configured');
  }
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      const err = new Error(data?.description || `Telegram API error (${res.status})`);
      err.code = data?.error_code || res.status;
      err.response = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export function buildMiniAppDirectLink(env, startParam = '') {
  const botUsername = (env.BOT_USERNAME || '').replace(/^@/, '');
  const shortName = (env.APP_SHORT_NAME || '').replace(/^\/+|\/+$/g, '');
  if (!botUsername) return '';
  if (shortName) {
    return startParam
      ? `https://t.me/${botUsername}/${shortName}?startapp=${encodeURIComponent(startParam)}`
      : `https://t.me/${botUsername}/${shortName}`;
  }
  return startParam
    ? `https://t.me/${botUsername}?startapp=${encodeURIComponent(startParam)}`
    : `https://t.me/${botUsername}`;
}

export function buildWebAppUrl(requestOrigin, query = '') {
  const base = requestOrigin.replace(/\/$/, '');
  return query ? `${base}/?${query}` : `${base}/`;
}

/**
 * In private chats Telegram supports `web_app` buttons directly.
 * In groups/supergroups Telegram ONLY allows direct-link `url` buttons for Mini Apps.
 */
export function buildPanelButton(env, requestOrigin, text, options = {}) {
  const { isGroup = false, startParam = '', query = '' } = options;
  if (isGroup) {
    const direct = buildMiniAppDirectLink(env, startParam);
    if (direct) {
      return { text, url: direct };
    }
    const botUsername = (env.BOT_USERNAME || '').replace(/^@/, '');
    if (botUsername) {
      return { text, url: `https://t.me/${botUsername}?start=panel` };
    }
    return { text, url: buildWebAppUrl(requestOrigin, query) };
  }
  return {
    text,
    web_app: { url: buildWebAppUrl(requestOrigin, query) },
  };
}

export function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Securely proxies a Telegram user's profile photo without exposing BOT_TOKEN.
 */
export async function handleAvatarProxy(env, userId) {
  if (!env.BOT_TOKEN || !/^\d+$/.test(String(userId))) {
    return new Response(null, { status: 404 });
  }
  try {
    const photos = await tgCall(env, 'getUserProfilePhotos', {
      user_id: Number(userId),
      limit: 1,
    });
    const sizes = photos?.result?.photos?.[0];
    if (!sizes || sizes.length === 0) {
      return new Response(null, { status: 404 });
    }
    // Prefer medium resolution (~320px) for fast Mini App loading
    const chosen = sizes[Math.min(1, sizes.length - 1)] || sizes[0];
    const fileInfo = await tgCall(env, 'getFile', { file_id: chosen.file_id });
    const filePath = fileInfo?.result?.file_path;
    if (!filePath) {
      return new Response(null, { status: 404 });
    }
    const imgRes = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`);
    if (!imgRes.ok) {
      return new Response(null, { status: 404 });
    }
    return new Response(imgRes.body, {
      status: 200,
      headers: {
        'Content-Type': imgRes.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
