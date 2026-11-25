// Visitor profile storage, bidirectional message/photo/link archive & moderation service.
// 100% compatible with mango0114/telegram_private_chatbot KV schema:
//   user:<uid>     -> JSON { thread_id, closed, ...profileFields }
//   thread:<tid>   -> "<uid>"
//   banned:<uid>   -> "1"
//   verified:<uid> -> "trusted" | "turnstile:v1" | "quiz:v1"
//   history:<uid>  -> JSON { photos: [], links: [], pmMessageIds: [] }

import { resolveSupergroupId, safeGetJSON, safePutJSON } from './config.js';

const VISITOR_INDEX_KEY = 'visitors:index';
const VISITOR_MIGRATED_KEY = 'visitors:migrated';
const VISITOR_SUMMARY_CACHE_KEY = 'cache:visitor_summary';
const VISITOR_SUMMARY_TTL_MS = 10 * 60 * 1000;
const MAX_PHOTOS = 150;
const MAX_LINKS = 200;
const MAX_PM_IDS = 200;

export async function invalidateVisitorSummaryCache(env) {
  if (!env?.TOPIC_MAP) return;
  try {
    await env.TOPIC_MAP.delete(VISITOR_SUMMARY_CACHE_KEY);
  } catch {
    // Ignore cache invalidation errors
  }
}

export function formatDisplayName(rec = {}) {
  const full = [rec.first_name, rec.last_name].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (rec.username) return `@${rec.username}`;
  return `用户 ${rec.userId || ''}`.trim();
}

/**
 * Extracts unique URLs from Telegram message text/caption & entities (`url`, `text_link`).
 */
export function extractLinksFromMessage(msg = {}) {
  const text = String(msg.text || msg.caption || '');
  const entities = [...(msg.entities || []), ...(msg.caption_entities || [])];
  const found = new Set();

  for (const ent of entities) {
    if (ent.type === 'text_link' && ent.url) {
      found.add(normalizeFoundUrl(ent.url));
    } else if (ent.type === 'url' && typeof ent.offset === 'number' && typeof ent.length === 'number') {
      const slice = text.slice(ent.offset, ent.offset + ent.length);
      if (slice) found.add(normalizeFoundUrl(slice));
    }
  }

  // Regex fallback to catch plain URLs and t.me links
  const regex = /(?:https?:\/\/|t\.me\/)[^\s<>"'`\u4e00-\u9fa5]+/gi;
  const matches = text.match(regex) || [];
  for (const m of matches) {
    const cleaned = m.replace(/[),.;!?，。！？；：】）]+$/, '');
    if (cleaned) found.add(normalizeFoundUrl(cleaned));
  }

  return Array.from(found).filter(Boolean);
}

function normalizeFoundUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^t\.me\//i.test(trimmed)) return `https://${trimmed}`;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(trimmed)) return `https://${trimmed}`;
  return '';
}

/**
 * Extracts photo metadata from standard Telegram photo messages or image documents.
 */
export function extractPhotoFromMessage(msg = {}) {
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    const medium = msg.photo[Math.min(1, msg.photo.length - 1)] || largest;
    if (largest?.file_id) {
      return {
        fileId: largest.file_id,
        thumbFileId: medium?.file_id || largest.file_id,
        caption: String(msg.caption || '').slice(0, 140),
      };
    }
  }

  if (msg.document?.file_id && String(msg.document.mime_type || '').startsWith('image/')) {
    return {
      fileId: msg.document.file_id,
      thumbFileId: msg.document.thumbnail?.file_id || msg.document.thumb?.file_id || msg.document.file_id,
      caption: String(msg.caption || msg.document.file_name || '').slice(0, 140),
    };
  }

  return null;
}

export async function upsertVisitorProfile(env, tgUser, extra = {}) {
  if (!env.TOPIC_MAP || !tgUser?.id) return null;
  const uid = String(tgUser.id);
  const key = `user:${uid}`;
  const existing = (await safeGetJSON(env.TOPIC_MAP, key, {})) || {};
  const now = new Date().toISOString();

  const existingTotal = Number(existing.msg_count) || 0;
  const existingVisitor =
    existing.visitor_msg_count !== undefined ? Number(existing.visitor_msg_count) || 0 : existingTotal;
  const existingAdmin = Number(existing.admin_msg_count) || 0;

  const incVisitor = extra.incrementMsg ? 1 : 0;
  const updated = {
    ...existing,
    userId: uid,
    first_name: tgUser.first_name ?? existing.first_name ?? '',
    last_name: tgUser.last_name ?? existing.last_name ?? '',
    username: tgUser.username ?? existing.username ?? '',
    language_code: tgUser.language_code ?? existing.language_code ?? '',
    first_seen_at: existing.first_seen_at || now,
    last_seen_at: extra.touchLastSeen === false ? existing.last_seen_at || now : now,
    msg_count: existingTotal + incVisitor,
    visitor_msg_count: existingVisitor + incVisitor,
    admin_msg_count: existingAdmin,
    photo_count: Number(existing.photo_count) || 0,
    link_count: Number(existing.link_count) || 0,
    last_preview: extra.lastPreview !== undefined ? String(extra.lastPreview).slice(0, 120) : existing.last_preview || '',
    note: existing.note || '',
    ...(extra.threadId !== undefined ? { thread_id: extra.threadId } : {}),
    ...(extra.closed !== undefined ? { closed: extra.closed } : {}),
  };

  await safePutJSON(env.TOPIC_MAP, key, updated);
  await addToVisitorIndex(env, uid);
  await invalidateVisitorSummaryCache(env);
  return updated;
}

/**
 * Archives bidirectional message counts, photos, links, and private-chat message IDs
 * for a visitor so admin can inspect all shared photos/links and clear history anytime.
 */
export async function recordVisitorExchange(env, userId, msg, options = {}) {
  const uid = String(userId || '');
  if (!env.TOPIC_MAP || !/^\d+$/.test(uid)) return null;

  const {
    sender = 'visitor', // 'visitor' | 'admin'
    pmMessageId = null,
    incrementCount = true,
    preview = '',
  } = options;

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const historyKey = `history:${uid}`;
  const history = (await safeGetJSON(env.TOPIC_MAP, historyKey, null)) || {
    photos: [],
    links: [],
    pmMessageIds: [],
  };

  const photo = extractPhotoFromMessage(msg);
  if (photo) {
    history.photos.unshift({
      id: `p_${nowMs}_${Math.floor(Math.random() * 10000)}`,
      fileId: photo.fileId,
      thumbFileId: photo.thumbFileId,
      caption: photo.caption,
      sender,
      at: nowIso,
    });
    history.photos = history.photos.slice(0, MAX_PHOTOS);
  }

  const urls = extractLinksFromMessage(msg);
  const snippet = String(msg.text || msg.caption || '').trim().slice(0, 90);
  if (urls.length > 0) {
    for (const url of urls) {
      history.links.unshift({
        id: `l_${nowMs}_${Math.floor(Math.random() * 10000)}`,
        url,
        snippet,
        sender,
        at: nowIso,
      });
    }
    history.links = history.links.slice(0, MAX_LINKS);
  }

  if (pmMessageId && Number.isFinite(Number(pmMessageId))) {
    history.pmMessageIds.unshift({ id: Number(pmMessageId), at: nowMs });
    history.pmMessageIds = history.pmMessageIds.slice(0, MAX_PM_IDS);
  }

  await safePutJSON(env.TOPIC_MAP, historyKey, history);

  // Sync summary counters onto user:<uid>
  const userKey = `user:${uid}`;
  const rec = (await safeGetJSON(env.TOPIC_MAP, userKey, { userId: uid })) || { userId: uid };
  const prevTotal = Number(rec.msg_count) || 0;
  const prevVisitor = rec.visitor_msg_count !== undefined ? Number(rec.visitor_msg_count) || 0 : prevTotal;
  const prevAdmin = Number(rec.admin_msg_count) || 0;

  if (incrementCount) {
    if (sender === 'admin') {
      rec.admin_msg_count = prevAdmin + 1;
      rec.visitor_msg_count = prevVisitor;
    } else {
      rec.visitor_msg_count = prevVisitor + 1;
      rec.admin_msg_count = prevAdmin;
    }
    rec.msg_count = rec.visitor_msg_count + rec.admin_msg_count;
  } else {
    rec.visitor_msg_count = prevVisitor;
    rec.admin_msg_count = prevAdmin;
    rec.msg_count = Math.max(prevTotal, prevVisitor + prevAdmin);
  }

  rec.photo_count = history.photos.length;
  rec.link_count = history.links.length;
  rec.last_seen_at = nowIso;
  if (preview) {
    rec.last_preview = sender === 'admin' ? `我：${preview}`.slice(0, 120) : preview.slice(0, 120);
  }

  await safePutJSON(env.TOPIC_MAP, userKey, rec);
  await addToVisitorIndex(env, uid);
  await invalidateVisitorSummaryCache(env);

  return {
    photoAdded: Boolean(photo),
    linksAdded: urls.length,
    photoCount: history.photos.length,
    linkCount: history.links.length,
    totalCount: rec.msg_count,
  };
}

export async function getVisitorHistory(env, userId) {
  const uid = String(userId || '');
  if (!env.TOPIC_MAP || !/^\d+$/.test(uid)) {
    return { photos: [], links: [], pmMessageIds: [] };
  }
  const history = (await safeGetJSON(env.TOPIC_MAP, `history:${uid}`, null)) || {
    photos: [],
    links: [],
    pmMessageIds: [],
  };
  return {
    photos: Array.isArray(history.photos) ? history.photos : [],
    links: Array.isArray(history.links) ? history.links : [],
    pmMessageIds: Array.isArray(history.pmMessageIds) ? history.pmMessageIds : [],
  };
}

/**
 * Clears visitor archived photos, links & message counts.
 * When mode === 'full', also deletes the visitor's Forum Topic in SUPERGROUP_ID
 * (wiping all topic history regardless of 48h limit) and attempts to delete recorded
 * private-chat messages within Telegram's 48-hour deletion window.
 */
export async function clearVisitorHistory(env, userId, mode = 'archive', tgCallFn = null) {
  const uid = String(userId || '');
  if (!env.TOPIC_MAP || !/^\d+$/.test(uid)) {
    throw new Error('Invalid userId');
  }

  const history = await getVisitorHistory(env, uid);
  const userKey = `user:${uid}`;
  const rec = (await safeGetJSON(env.TOPIC_MAP, userKey, { userId: uid })) || { userId: uid };

  let deletedTopic = false;
  let deletedPmCount = 0;

  if (mode === 'full' && tgCallFn && env.BOT_TOKEN) {
    // 1. Delete recorded private-chat messages within 48h window
    const cutoff = Date.now() - 47.5 * 3600 * 1000;
    const recentIds = history.pmMessageIds
      .filter((item) => item?.id && (!item.at || item.at >= cutoff))
      .map((item) => Number(item.id))
      .filter((id, idx, arr) => Number.isFinite(id) && arr.indexOf(id) === idx);

    for (let i = 0; i < recentIds.length; i += 100) {
      const batch = recentIds.slice(i, i + 100);
      try {
        await tgCallFn(env, 'deleteMessages', {
          chat_id: Number(uid),
          message_ids: batch,
        });
        deletedPmCount += batch.length;
      } catch {
        // Fallback: delete individually so one un-deletable message doesn't fail the batch
        for (const msgId of batch) {
          try {
            await tgCallFn(env, 'deleteMessage', { chat_id: Number(uid), message_id: msgId });
            deletedPmCount += 1;
          } catch {
            // Ignore Telegram 48h / already-deleted errors
          }
        }
      }
    }

    // 2. Delete the visitor's entire Forum Topic in admin supergroup (no 48h limit!)
    const supergroupId = await resolveSupergroupId(env);
    if (rec.thread_id && supergroupId) {
      const oldThreadId = rec.thread_id;
      try {
        await tgCallFn(env, 'deleteForumTopic', {
          chat_id: supergroupId,
          message_thread_id: Number(oldThreadId),
        });
        deletedTopic = true;
      } catch {
        // Topic may already be deleted
      }
      delete rec.thread_id;
      await env.TOPIC_MAP.delete(`thread:${oldThreadId}`);
    }
  }

  // Always clear KV history index & counters
  await env.TOPIC_MAP.delete(`history:${uid}`);
  rec.msg_count = 0;
  rec.visitor_msg_count = 0;
  rec.admin_msg_count = 0;
  rec.photo_count = 0;
  rec.link_count = 0;
  rec.last_preview = '';
  await safePutJSON(env.TOPIC_MAP, userKey, rec);
  await invalidateVisitorSummaryCache(env);

  const visitor = await getVisitorDetail(env, uid);
  return { visitor, deletedTopic, deletedPmCount };
}

async function addToVisitorIndex(env, uid) {
  if (!env.TOPIC_MAP) return;
  const index = (await safeGetJSON(env.TOPIC_MAP, VISITOR_INDEX_KEY, [])) || [];
  const strId = String(uid);
  const filtered = index.filter((id) => String(id) !== strId);
  filtered.unshift(strId);
  await safePutJSON(env.TOPIC_MAP, VISITOR_INDEX_KEY, filtered.slice(0, 500));
}

export async function getVisitorDetail(env, userId, knownSupergroupId = null) {
  const uid = String(userId);
  if (!env.TOPIC_MAP) return null;

  const [rec, bannedVal, verifiedVal, resolvedGroupId] = await Promise.all([
    safeGetJSON(env.TOPIC_MAP, `user:${uid}`, null),
    env.TOPIC_MAP.get(`banned:${uid}`),
    env.TOPIC_MAP.get(`verified:${uid}`),
    knownSupergroupId !== null ? Promise.resolve(knownSupergroupId) : resolveSupergroupId(env),
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

  const supergroupClean = String(resolvedGroupId || '').replace(/^-100/, '');
  const topicLink =
    supergroupClean && base.thread_id
      ? `https://t.me/c/${supergroupClean}/${base.thread_id}`
      : '';

  const totalMsgs = Number(base.msg_count || 0);
  const visitorMsgs =
    base.visitor_msg_count !== undefined ? Number(base.visitor_msg_count || 0) : totalMsgs;
  const adminMsgs = Number(base.admin_msg_count || 0);

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
    msg_count: Math.max(totalMsgs, visitorMsgs + adminMsgs),
    visitor_msg_count: visitorMsgs,
    admin_msg_count: adminMsgs,
    photo_count: Number(base.photo_count || 0),
    link_count: Number(base.link_count || 0),
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

  const [indexedRaw, migrated] = await Promise.all([
    safeGetJSON(env.TOPIC_MAP, VISITOR_INDEX_KEY, []),
    env.TOPIC_MAP.get(VISITOR_MIGRATED_KEY),
  ]);
  const indexed = Array.isArray(indexedRaw) ? indexedRaw : [];
  const idSet = new Set(indexed.map(String));

  // Run one-time legacy `user:*` discovery only until migrated, avoiding recurring KV.list quota burn
  if (!migrated && typeof env.TOPIC_MAP.list === 'function') {
    try {
      const listed = await env.TOPIC_MAP.list({ prefix: 'user:', limit: 200 });
      let discovered = 0;
      for (const k of listed.keys || []) {
        const uid = k.name.slice(5);
        if (/^\d+$/.test(uid) && !idSet.has(uid)) {
          idSet.add(uid);
          discovered += 1;
        }
      }
      if (discovered > 0) {
        await safePutJSON(env.TOPIC_MAP, VISITOR_INDEX_KEY, Array.from(idSet).slice(0, 500));
      }
      await env.TOPIC_MAP.put(VISITOR_MIGRATED_KEY, '1');
    } catch {
      // Ignore list failure
    }
  }

  const allIds = Array.from(idSet).slice(0, 120);
  const supergroupId = await resolveSupergroupId(env);
  const details = (await Promise.all(allIds.map((uid) => getVisitorDetail(env, uid, supergroupId)))).filter(Boolean);

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

  // Opportunistically refresh single-key summary cache whenever full listing runs
  if (!search && filter === 'all') {
    await safePutJSON(
      env.TOPIC_MAP,
      VISITOR_SUMMARY_CACHE_KEY,
      { stats, recent: details.slice(0, 5), cachedAt: Date.now() },
      { expirationTtl: 600 }
    ).catch(() => {});
  }

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

/**
 * Ultra-fast single-KV-read overview for Admin bootstrap (replaces 100+ per-open KV reads).
 * Automatically invalidated whenever a visitor chats or admin moderates a visitor.
 */
export async function getVisitorOverview(env) {
  if (!env.TOPIC_MAP) {
    return { stats: { total: 0, active: 0, trusted: 0, banned: 0, closed: 0 }, recent: [], cached: false };
  }
  const cached = await safeGetJSON(env.TOPIC_MAP, VISITOR_SUMMARY_CACHE_KEY, null);
  if (cached && cached.stats && Date.now() - Number(cached.cachedAt || 0) < VISITOR_SUMMARY_TTL_MS) {
    return {
      stats: cached.stats,
      recent: Array.isArray(cached.recent) ? cached.recent : [],
      cached: true,
    };
  }
  const listed = await listVisitors(env, { limit: 5 });
  return {
    stats: listed.stats,
    recent: listed.items,
    cached: false,
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
      await env.TOPIC_MAP.delete(`verify_cool:${uid}`);
      break;
    case 'trust':
      await env.TOPIC_MAP.delete(`banned:${uid}`);
      await env.TOPIC_MAP.delete(`verify_cool:${uid}`);
      await env.TOPIC_MAP.put(`verified:${uid}`, 'trusted');
      await env.TOPIC_MAP.delete(`needs_verify:${uid}`);
      break;
    case 'reset':
      await env.TOPIC_MAP.delete(`verified:${uid}`);
      await env.TOPIC_MAP.delete(`verify_cool:${uid}`);
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
  await invalidateVisitorSummaryCache(env);
  return await getVisitorDetail(env, uid);
}
