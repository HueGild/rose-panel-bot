// Visitor profile storage & moderation service.
// 100% compatible with mango0114/telegram_private_chatbot KV schema:
//   user:<uid>     -> JSON { thread_id, closed, ...profileFields }
//   thread:<tid>   -> "<uid>"
//   banned:<uid>   -> "1"
//   verified:<uid> -> "trusted" | "turnstile:v1" | "quiz:v1"

import { safeGetJSON, safePutJSON } from './config.js';

const VISITOR_INDEX_KEY = 'visitors:index';

export function formatDisplayName(rec = {}) {
  const full = [rec.first_name, rec.last_name].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (rec.username) return `@${rec.username}`;
  return `用户 ${rec.userId || ''}`.trim();
}

export async function upsertVisitorProfile(env, tgUser, extra = {}) {
  if (!env.TOPIC_MAP || !tgUser?.id) return null;
  const uid = String(tgUser.id);
  const key = `user:${uid}`;
  const existing = (await safeGetJSON(env.TOPIC_MAP, key, {})) || {};
  const now = new Date().toISOString();

  const updated = {
    ...existing,
    userId: uid,
    first_name: tgUser.first_name ?? existing.first_name ?? '',
    last_name: tgUser.last_name ?? existing.last_name ?? '',
    username: tgUser.username ?? existing.username ?? '',
    language_code: tgUser.language_code ?? existing.language_code ?? '',
    first_seen_at: existing.first_seen_at || now,
    last_seen_at: extra.touchLastSeen === false ? existing.last_seen_at || now : now,
    msg_count: (Number(existing.msg_count) || 0) + (extra.incrementMsg ? 1 : 0),
    last_preview: extra.lastPreview !== undefined ? String(extra.lastPreview).slice(0, 120) : existing.last_preview || '',
    note: existing.note || '',
    ...(extra.threadId !== undefined ? { thread_id: extra.threadId } : {}),
    ...(extra.closed !== undefined ? { closed: extra.closed } : {}),
  };

  await safePutJSON(env.TOPIC_MAP, key, updated);
  await addToVisitorIndex(env, uid);
  return updated;
}

async function addToVisitorIndex(env, uid) {
  if (!env.TOPIC_MAP) return;
  const index = (await safeGetJSON(env.TOPIC_MAP, VISITOR_INDEX_KEY, [])) || [];
  const strId = String(uid);
  const filtered = index.filter((id) => String(id) !== strId);
  filtered.unshift(strId);
  await safePutJSON(env.TOPIC_MAP, VISITOR_INDEX_KEY, filtered.slice(0, 500));
}

export async function getVisitorDetail(env, userId) {
  const uid = String(userId);
  if (!env.TOPIC_MAP) return null;

  const [rec, bannedVal, verifiedVal] = await Promise.all([
    safeGetJSON(env.TOPIC_MAP, `user:${uid}`, null),
    env.TOPIC_MAP.get(`banned:${uid}`),
    env.TOPIC_MAP.get(`verified:${uid}`),
  ]);

  if (!rec && !bannedVal && !verifiedVal) {
    return null;
  }

  const base = rec || { userId: uid };
  const isBanned = bannedVal === '1';
  const isTrusted = verifiedVal === 'trusted';
  const isVerified = Boolean(verifiedVal);
  const isClosed = Boolean(base.closed);

  let status = 'pending';
  if (isBanned) status = 'banned';
  else if (isClosed) status = 'closed';
  else if (isTrusted) status = 'trusted';
  else if (isVerified) status = 'verified';

  const supergroupClean = String(env.SUPERGROUP_ID || '').replace(/^-100/, '');
  const topicLink =
    supergroupClean && base.thread_id
      ? `https://t.me/c/${supergroupClean}/${base.thread_id}`
      : '';

  return {
    userId: uid,
    displayName: formatDisplayName({ ...base, userId: uid }),
    first_name: base.first_name || '',
    last_name: base.last_name || '',
    username: base.username || '',
    language_code: base.language_code || '',
    thread_id: base.thread_id || null,
    topicLink,
    first_seen_at: base.first_seen_at || null,
    last_seen_at: base.last_seen_at || null,
    msg_count: Number(base.msg_count || 0),
    last_preview: base.last_preview || '',
    note: base.note || '',
    isBanned,
    isTrusted,
    isVerified,
    isClosed,
    status,
  };
}

export async function listVisitors(env, options = {}) {
  const { search = '', filter = 'all', limit = 60 } = options;
  if (!env.TOPIC_MAP) {
    return { stats: { total: 0, active: 0, trusted: 0, banned: 0, closed: 0 }, items: [] };
  }

  const indexed = (await safeGetJSON(env.TOPIC_MAP, VISITOR_INDEX_KEY, [])) || [];
  const idSet = new Set(indexed.map(String));

  // Merge legacy user:* keys from telegram_private_chatbot if index is incomplete
  if (idSet.size < 100 && typeof env.TOPIC_MAP.list === 'function') {
    try {
      const listed = await env.TOPIC_MAP.list({ prefix: 'user:', limit: 100 });
      for (const k of listed.keys || []) {
        const uid = k.name.slice(5);
        if (/^\d+$/.test(uid)) idSet.add(uid);
      }
    } catch {
      // Ignore list failure
    }
  }

  const allIds = Array.from(idSet).slice(0, 120);
  const details = (await Promise.all(allIds.map((uid) => getVisitorDetail(env, uid)))).filter(Boolean);

  details.sort((a, b) => {
    const ta = a.last_seen_at ? Date.parse(a.last_seen_at) : 0;
    const tb = b.last_seen_at ? Date.parse(b.last_seen_at) : 0;
    return tb - ta;
  });

  const stats = {
    total: details.length,
    active: details.filter((v) => !v.isBanned && !v.isClosed).length,
    trusted: details.filter((v) => v.isTrusted && !v.isBanned).length,
    banned: details.filter((v) => v.isBanned).length,
    closed: details.filter((v) => v.isClosed && !v.isBanned).length,
  };

  const q = String(search || '').trim().toLowerCase();
  const filtered = details.filter((v) => {
    if (filter === 'banned' && !v.isBanned) return false;
    if (filter === 'trusted' && (!v.isTrusted || v.isBanned)) return false;
    if (filter === 'closed' && (!v.isClosed || v.isBanned)) return false;
    if (filter === 'active' && (v.isBanned || v.isClosed)) return false;
    if (q) {
      const hay = `${v.displayName} ${v.username} ${v.userId} ${v.note} ${v.last_preview}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return {
    stats,
    items: filtered.slice(0, limit),
  };
}

export async function applyVisitorAction(env, userId, action, payload = {}) {
  const uid = String(userId);
  if (!env.TOPIC_MAP || !/^\d+$/.test(uid)) {
    throw new Error('Invalid userId');
  }

  const key = `user:${uid}`;
  const rec = (await safeGetJSON(env.TOPIC_MAP, key, { userId: uid })) || { userId: uid };

  switch (action) {
    case 'ban':
      await env.TOPIC_MAP.put(`banned:${uid}`, '1');
      break;
    case 'unban':
      await env.TOPIC_MAP.delete(`banned:${uid}`);
      break;
    case 'trust':
      await env.TOPIC_MAP.delete(`banned:${uid}`);
      await env.TOPIC_MAP.put(`verified:${uid}`, 'trusted');
      await env.TOPIC_MAP.delete(`needs_verify:${uid}`);
      break;
    case 'reset':
      await env.TOPIC_MAP.delete(`verified:${uid}`);
      await env.TOPIC_MAP.put(`needs_verify:${uid}`, '1', { expirationTtl: 600 });
      break;
    case 'close':
      rec.closed = true;
      await safePutJSON(env.TOPIC_MAP, key, rec);
      break;
    case 'open':
      rec.closed = false;
      await safePutJSON(env.TOPIC_MAP, key, rec);
      break;
    case 'note':
      rec.note = String(payload.note || '').slice(0, 300);
      await safePutJSON(env.TOPIC_MAP, key, rec);
      break;
    default:
      throw new Error(`Unsupported action: ${action}`);
  }

  await addToVisitorIndex(env, uid);
  return await getVisitorDetail(env, uid);
}
