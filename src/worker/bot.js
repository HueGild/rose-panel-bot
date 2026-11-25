// Telegram Webhook Handler:
// 1. Bidirectional Anti-Spam PM Bot with Forum Topics (compatible with telegram_private_chatbot)
// 2. 3-Mode Verification: Emoji Odd-One-Out/Pick (0-latency) | Local Quiz | Cloudflare Turnstile Strict Mode + Cooldown
// 3. Topic Visitor Info Card + Direct Mini App Profile, Photos/Links Archive & Moderation Buttons
// 4. Group & Private Personal Panel + Optional Check-in / Points / Leaderboard Commands
// 5. Admin /setbadge & /resetbadge for capturing Telegram Stickers / Custom Emojis as Ticket Emblem

import {
  assessIncomingRisk,
  checkCasBlacklist,
  recordBlockedSpam,
} from './antispam.js';
import { isUserAdmin, parseAdminIds } from './auth.js';
import { getLeaderboard, getMemberTicket, performCheckin } from './checkin.js';
import {
  clearBoundSupergroupId,
  loadPanelConfig,
  resolveSupergroupId,
  safeGetJSON,
  safePutJSON,
  saveBoundSupergroupId,
  savePanelConfig,
} from './config.js';
import {
  buildPanelButton,
  escapeHtml,
  normalizeStickerObject,
  parseStickerPackName,
  tgCall,
} from './telegram.js';
import {
  applyVisitorAction,
  formatDisplayName,
  getVisitorDetail,
  recordVisitorExchange,
  upsertVisitorProfile,
} from './visitors.js';

const LOCAL_QUESTIONS = [
  { q: '冰融化后会变成什么？', ok: '水', bad: ['石头', '木头', '火'] },
  { q: '正常人有几只眼睛？', ok: '2', bad: ['1', '3', '4'] },
  { q: '以下哪个属于水果？', ok: '香蕉', bad: ['白菜', '猪肉', '大米'] },
  { q: '1 加 2 等于几？', ok: '3', bad: ['2', '4', '5'] },
  { q: '5 减 2 等于几？', ok: '3', bad: ['1', '2', '4'] },
  { q: '2 乘以 3 等于几？', ok: '6', bad: ['4', '5', '7'] },
  { q: '10 加 5 等于几？', ok: '15', bad: ['10', '12', '20'] },
  { q: '星期一的后面是星期几？', ok: '星期二', bad: ['星期日', '星期五', '星期三'] },
  { q: '鱼通常生活在哪里？', ok: '水里', bad: ['树上', '土里', '火里'] },
  { q: '太阳从哪个方向升起？', ok: '东方', bad: ['西方', '南方', '北方'] },
  { q: '晴朗的天空通常是什么颜色？', ok: '蓝色', bad: ['绿色', '红色', '紫色'] },
  { q: '我们用什么器官听声音？', ok: '耳朵', bad: ['眼睛', '鼻子', '嘴巴'] },
];

const EMOJI_ITEMS = [
  { icon: '🍓', label: '草莓' },
  { icon: '🍉', label: '西瓜' },
  { icon: '🍊', label: '橘子' },
  { icon: '🍌', label: '香蕉' },
  { icon: '🍇', label: '葡萄' },
  { icon: '🌹', label: '玫瑰花' },
  { icon: '🌻', label: '向日葵' },
  { icon: '🐱', label: '小猫' },
  { icon: '🐶', label: '小狗' },
  { icon: '🐼', label: '熊猫' },
  { icon: '🚀', label: '火箭' },
  { icon: '✈️', label: '飞机' },
  { icon: '🌙', label: '月亮' },
  { icon: '⭐', label: '星星' },
  { icon: '☂️', label: '雨伞' },
  { icon: '🎁', label: '礼物盒' },
  { icon: '🎧', label: '耳机' },
  { icon: '🍰', label: '蛋糕' },
];

const ODD_ONE_PAIRS = [
  ['🌸', '🌵'],
  ['🌕', '🌙'],
  ['🍎', '🍌'],
  ['🐱', '🐼'],
  ['💙', '💗'],
  ['🍀', '🍁'],
  ['⭐', '☁️'],
  ['🍩', '🍉'],
  ['🚀', '☂️'],
];

function randomInt(max) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function randomId(len = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join('');
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Generates an inline-button anti-spam challenge for either `emoji` (odd-one-out / semantic pick, 3x3)
 * or `quiz` (local commonsense 2x2).
 */
export function generateInlineChallenge(mode = 'emoji', verifyId = 'test', enableHoneypot = true) {
  const withTrap = (rows) =>
    enableHoneypot
      ? [...rows, [{ text: '🤖 我是机器人（真人勿点）', callback_data: `v:${verifyId}:trap` }]]
      : rows;

  if (mode === 'quiz') {
    const q = LOCAL_QUESTIONS[randomInt(LOCAL_QUESTIONS.length)];
    const options = shuffle([q.ok, ...q.bad]);
    const correctIndex = options.indexOf(q.ok);
    const keyboard = withTrap([
      options.slice(0, 2).map((opt, idx) => ({ text: opt, callback_data: `v:${verifyId}:${idx}` })),
      options.slice(2, 4).map((opt, idx) => ({ text: opt, callback_data: `v:${verifyId}:${idx + 2}` })),
    ]);
    return {
      correctIndex,
      promptHtml: `🛡️ <b>首次联系需要简单人机验证</b>\n\n请问：<b>${escapeHtml(q.q)}</b>\n\n<i>验证通过后 30 天内免验证，消息将自动送达。</i>`,
      keyboard,
    };
  }

  // Default: `emoji` mode — randomly alternates between Odd-One-Out (3x3) and Semantic Emoji Pick (3x3)
  const useOddOneOut = randomInt(2) === 0;
  if (useOddOneOut) {
    const [common, odd] = ODD_ONE_PAIRS[randomInt(ODD_ONE_PAIRS.length)];
    const correctIndex = randomInt(9);
    const cells = Array.from({ length: 9 }, (_, i) => (i === correctIndex ? odd : common));
    const keyboard = withTrap(
      [0, 3, 6].map((rowStart) =>
        cells.slice(rowStart, rowStart + 3).map((icon, offset) => ({
          text: icon,
          callback_data: `v:${verifyId}:${rowStart + offset}`,
        }))
      )
    );
    return {
      correctIndex,
      promptHtml: `🎯 <b>极速人机验证（找不同）</b>\n\n请点击下方 <b>唯一不同</b> 的那个图标 👇\n\n<i>0 延迟秒过 · 通过后 30 天内免验证。</i>`,
      keyboard,
    };
  }

  const picked = shuffle(EMOJI_ITEMS).slice(0, 9);
  const correctIndex = randomInt(9);
  const target = picked[correctIndex];
  const keyboard = withTrap(
    [0, 3, 6].map((rowStart) =>
      picked.slice(rowStart, rowStart + 3).map((item, offset) => ({
        text: item.icon,
        callback_data: `v:${verifyId}:${rowStart + offset}`,
      }))
    )
  );
  return {
    correctIndex,
    promptHtml: `🎯 <b>极速人机验证（图标点选）</b>\n\n请点击下方表示「<b>${escapeHtml(target.label)}</b>」的图标 👇\n\n<i>0 延迟秒过 · 通过后 30 天内免验证。</i>`,
    keyboard,
  };
}

/**
 * Parses admin quiz line flexibly:
 * Supports `|` / `｜`, multi-line (`\n`), commas/slashes (`,`, `，`, `/`, `、`),
 * OR plain spaces (`题目 正确答案 错1 错2 错3`)!
 */
export function parseStickerQuizInput(raw = '') {
  const cleaned = String(raw || '').trim();
  if (!cleaned) return null;

  let parts = [];
  if (/[|｜]/.test(cleaned)) {
    parts = cleaned.split(/[|｜]+/);
  } else if (/\r?\n/.test(cleaned)) {
    parts = cleaned.split(/\r?\n+/);
  } else if (/[,，/、;；]/.test(cleaned)) {
    parts = cleaned.split(/[,，/、;；]+/);
  } else {
    parts = cleaned.split(/\s+/);
  }

  parts = parts.map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) return null;

  const [question, answer, ...wrong] = parts;
  const uniqueWrong = Array.from(new Set(wrong.filter((w) => w && w !== answer))).slice(0, 3);
  if (!question || !answer || uniqueWrong.length === 0) return null;
  return {
    question: question.slice(0, 120),
    answer: answer.slice(0, 40),
    wrong: uniqueWrong.map((w) => w.slice(0, 40)),
  };
}

/**
 * Generates a custom Telegram Sticker Quiz challenge using the admin's collected stickers.
 */
export function generateStickerChallenge(
  stickerChallenges = [],
  verifyId = 'test',
  enableHoneypot = true,
  excludeId = ''
) {
  const valid = (stickerChallenges || []).filter(
    (c) => c?.fileId && c?.question && c?.answer && Array.isArray(c.wrong) && c.wrong.length > 0
  );
  if (valid.length === 0) return null;

  const pool = valid.length > 1 && excludeId ? valid.filter((c) => c.id !== excludeId) : valid;
  const chosen = pool[randomInt(pool.length)] || valid[0];
  const options = shuffle([chosen.answer, ...chosen.wrong.slice(0, 3)]);
  const correctIndex = options.indexOf(chosen.answer);

  const rows = [];
  for (let i = 0; i < options.length; i += 2) {
    rows.push(
      options.slice(i, i + 2).map((opt, offset) => ({
        text: opt,
        callback_data: `v:${verifyId}:${i + offset}`,
      }))
    );
  }
  if (enableHoneypot) {
    rows.push([{ text: '🤖 我是机器人（真人勿点）', callback_data: `v:${verifyId}:trap` }]);
  }

  return {
    challengeId: chosen.id || chosen.fileId,
    fileId: chosen.fileId,
    correctIndex,
    promptHtml: `🎭 <b>趣味表情包人机验证</b>\n\n看上面的表情包，回答：<b>${escapeHtml(chosen.question)}</b>\n\n<i>通过后 30 天内免验证，消息将自动送达。</i>`,
    keyboard: rows,
  };
}

function extractCommand(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('/')) return null;
  const firstToken = trimmed.split(/\s+/)[0];
  const [cmdPart, mention] = firstToken.slice(1).split('@');
  const args = trimmed.slice(firstToken.length).trim();
  return { cmd: cmdPart.toLowerCase(), mention: (mention || '').toLowerCase(), args };
}

function previewTextOfMessage(msg) {
  if (msg.text) return msg.text.slice(0, 100);
  if (msg.caption) return msg.caption.slice(0, 100);
  if (msg.photo) return '[图片]';
  if (msg.video) return '[视频]';
  if (msg.voice) return '[语音]';
  if (msg.sticker) return `[贴纸 ${msg.sticker.emoji || ''}]`.trim();
  if (msg.document) return `[文件 ${msg.document.file_name || ''}]`.trim();
  return '[消息]';
}

function serializePendingMessage(msg) {
  return {
    chatId: msg.chat.id,
    messageId: msg.message_id,
    preview: previewTextOfMessage(msg),
    text: msg.text || '',
    caption: msg.caption || '',
    entities: msg.entities || [],
    caption_entities: msg.caption_entities || [],
    photo: msg.photo || null,
    document: msg.document || null,
  };
}

function buildVisitorCardText(detail) {
  const statusMap = {
    banned: '🚫 已拉黑',
    trusted: '⭐ 永久信任',
    verified: '✅ 已验证',
    closed: '🔒 已结单',
    pending: '⏳ 待验证',
  };
  const safeUid = /^\d+$/.test(String(detail.userId || '')) ? String(detail.userId) : '';
  const displayNameHtml = safeUid
    ? `<a href="tg://user?id=${safeUid}"><b>${escapeHtml(detail.displayName)}</b></a>`
    : `<b>${escapeHtml(detail.displayName)}</b>`;
  const lines = [
    `👤 <b>访客资料卡</b>`,
    `━━━━━━━━━━━━━━━━`,
    `• 昵称：${displayNameHtml}`,
    `• 用户名：${detail.username ? `@${escapeHtml(detail.username)}` : '<i>未设置</i>'}`,
    `• UID：<code>${escapeHtml(String(detail.userId))}</code>`,
    `• 状态：${statusMap[detail.status] || detail.status}`,
    `• 聊天统计：共 <b>${detail.msg_count || 0}</b> 条（对方 ${detail.visitor_msg_count || 0} · 我 ${detail.admin_msg_count || 0}）`,
    `• 归档媒体：🖼️ ${detail.photo_count || 0} 图 · 🔗 ${detail.link_count || 0} 链`,
  ];
  if (detail.note) {
    lines.push(`• 备注：${escapeHtml(detail.note)}`);
  }
  return lines.join('\n');
}

const TG_CAPTION_LIMIT = 1024;
const CARD_NOTE_CAPTION_MAX = 300;

// Telegram counts caption length on the parsed (visible) text, not the raw HTML.
function visibleTextLength(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot);/g, '_').length;
}

// Returns an HTML caption that fits Telegram's 1024-char limit, or null if it cannot fit.
export function buildVisitorCardCaption(detail) {
  const full = buildVisitorCardText(detail);
  if (visibleTextLength(full) <= TG_CAPTION_LIMIT) return full;

  const note = String(detail.note || '');
  if (note.length > CARD_NOTE_CAPTION_MAX) {
    const trimmed = buildVisitorCardText({ ...detail, note: `${note.slice(0, CARD_NOTE_CAPTION_MAX)}…` });
    if (visibleTextLength(trimmed) <= TG_CAPTION_LIMIT) return trimmed;
  }

  const withoutNote = buildVisitorCardText({ ...detail, note: '' });
  return visibleTextLength(withoutNote) <= TG_CAPTION_LIMIT ? withoutNote : null;
}

async function fetchVisitorAvatarFileId(env, userId) {
  const numericUid = Number(userId);
  if (!Number.isFinite(numericUid) || numericUid <= 0) return null;
  try {
    const photos = await tgCall(env, 'getUserProfilePhotos', {
      user_id: numericUid,
      limit: 1,
    });
    const sizes = photos?.result?.photos?.[0];
    if (!Array.isArray(sizes) || sizes.length === 0) return null;
    // Telegram returns photo sizes sorted from smallest to largest
    return sizes[sizes.length - 1]?.file_id || null;
  } catch {
    return null;
  }
}

async function sendVisitorCardMessage(env, chatId, threadId, requestOrigin, detail, config = null) {
  const text = buildVisitorCardText(detail);
  const replyMarkup = buildVisitorModerationKeyboard(env, requestOrigin, detail);
  const cfg = config || (await loadPanelConfig(env));
  const wantPhoto = Boolean(cfg?.pmBot?.showVisitorAvatarInCard);

  const caption = wantPhoto ? buildVisitorCardCaption(detail) : null;
  if (caption) {
    const fileId = await fetchVisitorAvatarFileId(env, detail.userId);
    if (fileId) {
      try {
        return await tgCall(env, 'sendPhoto', {
          chat_id: chatId,
          message_thread_id: threadId,
          photo: fileId,
          caption,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        });
      } catch {
        // Gracefully fall back to compact text card if sendPhoto fails
      }
    }
  }

  return tgCall(env, 'sendMessage', {
    chat_id: chatId,
    message_thread_id: threadId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  });
}

function buildVisitorModerationKeyboard(env, requestOrigin, detail) {
  const uid = detail.userId;
  const profileBtn = buildPanelButton(env, requestOrigin, '🎫 查看完整资料卡 / 管理面板', {
    isGroup: true,
    startParam: `visitor_${uid}`,
  });

  const row2 = [
    detail.isBanned
      ? { text: '✅ 解除拉黑', callback_data: `mod:unban:${uid}` }
      : { text: '🚫 拉黑', callback_data: `mod:ban:${uid}` },
    detail.isTrusted
      ? { text: '🔄 重置验证', callback_data: `mod:reset:${uid}` }
      : { text: '⭐ 永久信任', callback_data: `mod:trust:${uid}` },
    detail.isClosed
      ? { text: '🔓 恢复对话', callback_data: `mod:open:${uid}` }
      : { text: '🔒 结单', callback_data: `mod:close:${uid}` },
  ];

  return { inline_keyboard: [[profileBtn], row2] };
}

async function checkRateLimit(env, key, limit = 40, windowSec = 60) {
  if (!env.TOPIC_MAP) return true;
  const count = Number((await env.TOPIC_MAP.get(key)) || 0);
  if (count >= limit) return false;
  await env.TOPIC_MAP.put(key, String(count + 1), { expirationTtl: windowSec });
  return true;
}

async function extractStickersFromMessage(env, msg) {
  const sources = [msg, msg.reply_to_message].filter(Boolean);

  for (const src of sources) {
    if (src.sticker?.file_id) {
      const normalized = normalizeStickerObject(src.sticker);
      if (normalized) return { stickers: [normalized], sourceLabel: 'TG 贴纸' };
    }
  }

  for (const src of sources) {
    const entities = [...(src.entities || []), ...(src.caption_entities || [])];
    const customIds = entities
      .filter((e) => e.type === 'custom_emoji' && e.custom_emoji_id)
      .map((e) => e.custom_emoji_id);
    if (customIds.length > 0) {
      const res = await tgCall(env, 'getCustomEmojiStickers', {
        custom_emoji_ids: customIds.slice(0, 12),
      });
      const stickers = (res?.result || []).map(normalizeStickerObject).filter(Boolean);
      if (stickers.length > 0) {
        return { stickers, sourceLabel: 'TG 收藏自定义表情' };
      }
    }
  }

  const rawText = String(msg.text || msg.caption || '').trim();
  const parsedCmd = extractCommand(rawText);
  const candidate = parsedCmd ? parsedCmd.args : rawText;
  const packName = parseStickerPackName(candidate);
  if (packName) {
    const res = await tgCall(env, 'getStickerSet', { name: packName });
    const set = res?.result;
    const stickers = (set?.stickers || []).slice(0, 12).map(normalizeStickerObject).filter(Boolean);
    if (stickers.length > 0) {
      return { stickers, sourceLabel: `贴纸包「${set?.title || packName}」` };
    }
  }

  return null;
}

async function applyCapturedStickersAsBadge(env, requestOrigin, chatId, captured, config) {
  const primary = captured.stickers[0];
  const existingSaved = Array.isArray(config.profile?.emblem?.savedStickers)
    ? config.profile.emblem.savedStickers
    : [];

  const mergedSaved = [...captured.stickers, ...existingSaved].filter(
    (item, idx, arr) => item?.fileId && arr.findIndex((x) => x.fileId === item.fileId) === idx
  );

  await savePanelConfig(env, {
    profile: {
      emblem: {
        type: 'tg_sticker',
        fileId: primary.fileId,
        format: primary.format,
        emoji: primary.emoji || '',
        setName: primary.setName || '',
        savedStickers: mergedSaved.slice(0, 30),
      },
    },
  });

  const formatLabel =
    primary.format === 'tgs'
      ? '动态矢量 (.tgs)'
      : primary.format === 'webm'
        ? '动态视频 (.webm)'
        : '高清静态 (.webp)';

  const extraTip =
    captured.stickers.length > 1
      ? `\n同时已将本次捕获的 <b>${captured.stickers.length}</b> 枚徽章加入你的「收藏徽章库」，随时可在小程序设置里一键切换！`
      : '\n已自动加入你的「收藏徽章库」，可在小程序设置里随时切换。';

  await tgCall(env, 'sendMessage', {
    chat_id: chatId,
    text: `✨ <b>票根徽章已更新！</b>\n\n• 来源：${escapeHtml(captured.sourceLabel)}\n• 格式：${formatLabel}${extraTip}`,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[buildPanelButton(env, requestOrigin, '🎫 立即打开面板预览效果', { isGroup: false })]],
    },
  });
}

async function ensureVisitorTopic(env, requestOrigin, tgUser, preview = '') {
  const supergroupId = await resolveSupergroupId(env);
  if (!supergroupId) {
    throw new Error('No Forum Supergroup bound');
  }

  const uid = String(tgUser.id);
  const existing = await safeGetJSON(env.TOPIC_MAP, `user:${uid}`, null);

  if (existing?.thread_id) {
    await env.TOPIC_MAP.put(`thread:${existing.thread_id}`, uid);
    return { threadId: existing.thread_id, isNew: false };
  }

  const baseName = formatDisplayName({ ...tgUser, userId: uid }).slice(0, 32);
  const title = `${baseName} [${uid}]`.slice(0, 120);
  const created = await tgCall(env, 'createForumTopic', {
    chat_id: supergroupId,
    name: title,
    icon_color: 16478047, // 0xFB6F5F soft coral-rose topic icon color
  });

  const threadId = created.result.message_thread_id;
  await upsertVisitorProfile(env, tgUser, {
    threadId,
    closed: false,
    lastPreview: preview,
  });
  await env.TOPIC_MAP.put(`thread:${threadId}`, uid);

  const detail = await getVisitorDetail(env, uid, supergroupId);
  if (detail) {
    await sendVisitorCardMessage(env, supergroupId, threadId, requestOrigin, detail);
  }

  return { threadId, isNew: true };
}

export function matchKeywordReply(text, rules = []) {
  const raw = String(text || '').trim();
  if (!raw || !Array.isArray(rules) || rules.length === 0) return null;
  const rawLower = raw.toLowerCase();

  for (const rule of rules) {
    if (!rule || rule.enabled === false) continue;
    const reply = String(rule.reply || '').trim();
    if (!reply) continue;
    const tokens = String(rule.keywords || '')
      .split(/[,，\n|]/)
      .map((k) => k.trim())
      .filter(Boolean);
    if (tokens.length === 0) continue;

    const isExact = rule.matchMode === 'exact';
    const matchedKeyword = tokens.find((kw) => {
      const kwLower = kw.toLowerCase();
      return isExact ? rawLower === kwLower : rawLower.includes(kwLower);
    });
    if (matchedKeyword) {
      return { rule: { ...rule, reply }, matchedKeyword };
    }
  }
  return null;
}

async function forwardMessageToTopic(env, requestOrigin, msg) {
  const supergroupId = await resolveSupergroupId(env);
  if (!supergroupId) return null;

  const user = msg.from;
  const uid = String(user.id);
  const preview = previewTextOfMessage(msg);
  await upsertVisitorProfile(env, user, { incrementMsg: false, lastPreview: preview });

  let { threadId } = await ensureVisitorTopic(env, requestOrigin, user, preview);
  try {
    await tgCall(env, 'copyMessage', {
      chat_id: supergroupId,
      message_thread_id: threadId,
      from_chat_id: msg.chat.id,
      message_id: msg.message_id,
    });
  } catch (err) {
    if (/thread not found|topic_deleted|message thread not found/i.test(String(err.message))) {
      const rec = (await safeGetJSON(env.TOPIC_MAP, `user:${uid}`, {})) || {};
      delete rec.thread_id;
      await safePutJSON(env.TOPIC_MAP, `user:${uid}`, rec);
      await env.TOPIC_MAP.delete(`thread:${threadId}`);
      ({ threadId } = await ensureVisitorTopic(env, requestOrigin, user, preview));
      await tgCall(env, 'copyMessage', {
        chat_id: supergroupId,
        message_thread_id: threadId,
        from_chat_id: msg.chat.id,
        message_id: msg.message_id,
      });
    } else {
      throw err;
    }
  }

  await recordVisitorExchange(env, uid, msg, {
    sender: 'visitor',
    pmMessageId: msg.message_id,
    incrementCount: true,
    preview,
  }).catch(() => {});

  return { supergroupId, threadId };
}

async function processVisitorMessage(env, requestOrigin, msg, config = null) {
  if (msg.from?.is_bot) return;
  const cfg = config || (await loadPanelConfig(env));
  const pmBot = cfg.pmBot || {};
  // Replayed pending messages carry a placeholder preview (e.g. "[图片]") in `text`; match keywords
  // only against what the visitor actually typed.
  const msgText = String(msg.keywordText ?? (msg.text || msg.caption || '')).trim();
  const matched = msgText ? matchKeywordReply(msgText, pmBot.keywordReplies) : null;

  // 1. Keyword rule matched -> send tailored reply (and optionally forward to admin topic)
  if (matched) {
    let forwarded = null;
    if (matched.rule.forwardToAdmin !== false) {
      forwarded = await forwardMessageToTopic(env, requestOrigin, msg);
    }
    await tgCall(env, 'sendMessage', {
      chat_id: msg.chat.id,
      reply_to_message_id: msg.message_id,
      allow_sending_without_reply: true,
      text: matched.rule.reply,
    }).catch(() => {});

    if (forwarded?.supergroupId && forwarded?.threadId) {
      await tgCall(env, 'sendMessage', {
        chat_id: forwarded.supergroupId,
        message_thread_id: forwarded.threadId,
        text: `🤖 <i>已触发关键词自动回复（${escapeHtml(matched.matchedKeyword)}）</i>`,
        parse_mode: 'HTML',
        disable_notification: true,
      }).catch(() => {});
    }
    return;
  }

  // 2. Normal visitor message -> forward to admin topic
  await forwardMessageToTopic(env, requestOrigin, msg);

  // 3. Optional general auto-reply with per-visitor KV cooldown (prevents spamming repeated receipts)
  const autoText = String(pmBot.autoReplyText || '').trim();
  if (pmBot.autoReplyEnabled && autoText && msg.from?.id) {
    const uid = String(msg.from.id);
    const cdKey = `autoreply_cd:${uid}`;
    const inCooldown = env.TOPIC_MAP ? await env.TOPIC_MAP.get(cdKey) : null;
    if (!inCooldown) {
      const cdMinutes = Math.min(Math.max(Number(pmBot.autoReplyCooldownMinutes) || 30, 1), 1440);
      if (env.TOPIC_MAP) {
        await env.TOPIC_MAP.put(cdKey, '1', { expirationTtl: cdMinutes * 60 });
      }
      await tgCall(env, 'sendMessage', {
        chat_id: msg.chat.id,
        reply_to_message_id: msg.message_id,
        allow_sending_without_reply: true,
        text: autoText,
      }).catch(() => {});
    }
  }
}

async function flushPendingMessages(env, requestOrigin, state, config = null) {
  const pending = Array.isArray(state.pending) ? state.pending : [];
  const cfg = config || (await loadPanelConfig(env));
  for (const item of pending) {
    await processVisitorMessage(
      env,
      requestOrigin,
      {
        from: state.user,
        chat: { id: item.chatId },
        message_id: item.messageId,
        text: item.text || item.preview || '',
        keywordText: item.text || item.caption || '',
        caption: item.caption || '',
        entities: item.entities || [],
        caption_entities: item.caption_entities || [],
        photo: item.photo || null,
        document: item.document || null,
      },
      cfg
    ).catch(() => {});
  }
}

/**
 * Completes a Cloudflare Turnstile strict verification session from `/verify-submit`.
 */
export async function completeTurnstileVerification(env, requestOrigin, verifyId) {
  const state = await safeGetJSON(env.TOPIC_MAP, `chal:${verifyId}`, null);
  if (!state) {
    return { ok: false, error: '验证会话已过期，请重新发送消息' };
  }
  const config = await loadPanelConfig(env);
  const ttlDays = Math.max(1, Number(config.pmBot.verifiedDays || 30));

  await env.TOPIC_MAP.put(`verified:${state.userId}`, 'turnstile:v1', { expirationTtl: ttlDays * 86400 });
  await env.TOPIC_MAP.delete(`needs_verify:${state.userId}`);
  await env.TOPIC_MAP.delete(`chal:${verifyId}`);
  await env.TOPIC_MAP.delete(`user_challenge:${state.userId}`);
  await env.TOPIC_MAP.delete(`verify_cool:${state.userId}`);

  if (state.challengeChatId && state.challengeMessageId) {
    await tgCall(env, 'editMessageText', {
      chat_id: state.challengeChatId,
      message_id: state.challengeMessageId,
      text: '✅ <b>Cloudflare 人机验证已通过</b>，您的消息已自动送达，请耐心等待回复。',
      parse_mode: 'HTML',
    }).catch(() => {});
  } else if (state.user?.id) {
    await tgCall(env, 'sendMessage', {
      chat_id: Number(state.user.id),
      text: '✅ Cloudflare 人机验证已通过，您的消息已送达。',
    }).catch(() => {});
  }

  await flushPendingMessages(env, requestOrigin, state);
  return { ok: true };
}

async function startVerificationChallenge(env, requestOrigin, msg, config, risk = null) {
  const uid = String(msg.from.id);

  // Check cooldown lock (after repeated failed attempts)
  const inCooldown = await env.TOPIC_MAP.get(`verify_cool:${uid}`);
  if (inCooldown) {
    return;
  }

  const existingChalId = await env.TOPIC_MAP.get(`user_challenge:${uid}`);
  if (existingChalId) {
    const existingState = await safeGetJSON(env.TOPIC_MAP, `chal:${existingChalId}`, null);
    if (existingState) {
      // Do not queue suspicious forwarded/link ad payloads before verification
      if (!risk?.isHighRisk) {
        const pending = Array.isArray(existingState.pending) ? existingState.pending : [];
        if (pending.length < 3) {
          pending.push(serializePendingMessage(msg));
          existingState.pending = pending;
          await safePutJSON(env.TOPIC_MAP, `chal:${existingChalId}`, existingState, { expirationTtl: 300 });
        }
      }
      await tgCall(env, 'sendMessage', {
        chat_id: msg.chat.id,
        text: '🛡️ 请先点击上方验证按钮完成人机核验，通过后会自动送达您的消息。',
      });
      return;
    }
  }

  const desiredMode = config.pmBot.verificationMode || 'emoji';
  const turnstileReady = Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET);
  const hasStickerBank =
    Array.isArray(config.pmBot.stickerChallenges) && config.pmBot.stickerChallenges.length > 0;
  const shouldEscalate = Boolean(config.pmBot.smartEscalation && risk?.isHighRisk && turnstileReady);
  let mode = shouldEscalate ? 'turnstile' : desiredMode;
  if (mode === 'turnstile' && !turnstileReady) mode = hasStickerBank ? 'sticker_quiz' : 'emoji';
  if (mode === 'sticker_quiz' && !hasStickerBank) mode = 'emoji';
  const verifyId = randomId(12);

  // Never pre-queue forwarded ad/link spam; require user to resend cleanly after passing strict verification
  const initialPending = risk?.isHighRisk ? [] : [serializePendingMessage(msg)];

  const baseState = {
    mode,
    userId: uid,
    failures: 0,
    escalated: shouldEscalate,
    user: {
      id: msg.from.id,
      first_name: msg.from.first_name || '',
      last_name: msg.from.last_name || '',
      username: msg.from.username || '',
      language_code: msg.from.language_code || '',
    },
    pending: initialPending,
  };

  // Strict Mode: Cloudflare Turnstile inside Telegram WebApp overlay
  if (mode === 'turnstile') {
    const verifyUrl = `${requestOrigin.replace(/\/$/, '')}/verify?vid=${encodeURIComponent(verifyId)}`;
    const notice = shouldEscalate
      ? risk?.isMedia
        ? '🛡️ <b>安全验证（拦截首条图片/媒体）</b>\n\n为防广告海报骚扰，首次联系请先完成 Cloudflare 人机核验，通过后再发送图片或消息。'
        : '🛡️ <b>安全验证（触发智能风控升级）</b>\n\n检测到消息含转发/外链或异常特征，请先完成 Cloudflare 人机核验，通过后重新发送正常消息即可联系站长。'
      : '🛡️ <b>安全验证（严格模式）</b>\n\n请点击下方按钮完成 Cloudflare 人机核验，验证通过后您的消息将自动送达（30 天内免重复验证）。';
    const sent = await tgCall(env, 'sendMessage', {
      chat_id: msg.chat.id,
      text: notice,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🛡️ 点击完成人机验证', web_app: { url: verifyUrl } }]],
      },
    });
    baseState.challengeChatId = msg.chat.id;
    baseState.challengeMessageId = sent?.result?.message_id || null;
    await safePutJSON(env.TOPIC_MAP, `chal:${verifyId}`, baseState, { expirationTtl: 300 });
    await env.TOPIC_MAP.put(`user_challenge:${uid}`, verifyId, { expirationTtl: 300 });
    return;
  }

  // Custom Telegram Sticker Quiz Mode (`sticker_quiz`)
  if (mode === 'sticker_quiz') {
    const chal = generateStickerChallenge(
      config.pmBot.stickerChallenges,
      verifyId,
      config.pmBot.enableHoneypot !== false
    );
    if (chal) {
      let stickerMsgId = null;
      try {
        const sentSticker = await tgCall(env, 'sendSticker', {
          chat_id: msg.chat.id,
          sticker: chal.fileId,
        });
        stickerMsgId = sentSticker?.result?.message_id || null;
      } catch {
        // If sticker send fails, seamlessly fall back to Emoji mode below
        stickerMsgId = null;
      }
      if (stickerMsgId) {
        baseState.correctIndex = chal.correctIndex;
        baseState.stickerChallengeId = chal.challengeId;
        baseState.stickerMessageId = stickerMsgId;
        await safePutJSON(env.TOPIC_MAP, `chal:${verifyId}`, baseState, { expirationTtl: 300 });
        await env.TOPIC_MAP.put(`user_challenge:${uid}`, verifyId, { expirationTtl: 300 });

        await tgCall(env, 'sendMessage', {
          chat_id: msg.chat.id,
          reply_to_message_id: stickerMsgId,
          text: chal.promptHtml,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: chal.keyboard },
        });
        return;
      }
    }
    baseState.mode = 'emoji';
  }

  // Zero-latency Inline Mode (`emoji` or `quiz`) with optional Honeypot trap button
  const chal = generateInlineChallenge(baseState.mode, verifyId, config.pmBot.enableHoneypot !== false);
  baseState.correctIndex = chal.correctIndex;

  await safePutJSON(env.TOPIC_MAP, `chal:${verifyId}`, baseState, { expirationTtl: 300 });
  await env.TOPIC_MAP.put(`user_challenge:${uid}`, verifyId, { expirationTtl: 300 });

  await tgCall(env, 'sendMessage', {
    chat_id: msg.chat.id,
    text: chal.promptHtml,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: chal.keyboard },
  });
}

async function handlePrivatePanelCommand(env, requestOrigin, msg, config, { isStart = false } = {}) {
  const isAdmin = await isUserAdmin(env, msg.from.id, tgCall);
  const rawWelcome = String(config.pmBot.welcomeText ?? '').trim();
  const welcome = rawWelcome || (isStart ? '' : '欢迎使用个人面板！');
  const includePanelBtn = !isStart || config.pmBot.showPanelButtonInWelcome !== false;

  const rows = [];
  if (includePanelBtn) {
    rows.push([buildPanelButton(env, requestOrigin, '✨ 打开个人面板小程序', { isGroup: false })]);
    if (isAdmin) {
      rows.push([
        buildPanelButton(env, requestOrigin, '👤 访客管理与拉黑后台', {
          isGroup: false,
          query: 'tab=visitors',
        }),
      ]);
    }
  }

  const header = `🌸 <b>${escapeHtml(config.profile.displayName)}</b>`;
  const text = welcome ? `${header}\n\n${escapeHtml(welcome)}` : header;
  const payload = {
    chat_id: msg.chat.id,
    text,
    parse_mode: 'HTML',
  };
  if (rows.length > 0) {
    payload.reply_markup = { inline_keyboard: rows };
  }
  await tgCall(env, 'sendMessage', payload);
}

async function handleGroupPanelCommand(env, requestOrigin, msg, config) {
  const isGroup = msg.chat.type !== 'private';
  if (config.community.enableCheckin) {
    const ticket = await getMemberTicket(env, msg.from, config.community);
    const nextHint = ticket.level.next
      ? `距 Lv.${ticket.level.next.level} ${ticket.level.next.title} 还差 ${ticket.level.remainingXp} ${config.community.currencyName}`
      : '已达到最高等级 👑';
    const text = [
      `🎫 <b>${escapeHtml(ticket.displayName)} 的${escapeHtml(config.community.groupTitle || '个人票根')}</b>`,
      `━━━━━━━━━━━━━━━━`,
      `• 等级：<b>Lv.${ticket.level.current.level} ${escapeHtml(ticket.level.current.title)}</b>`,
      `• ${escapeHtml(config.community.currencyName)}：<b>${ticket.points}</b>  |  连续签到：<b>${ticket.streak} 天</b>`,
      `• 徽章：${ticket.unlockedBadgeCount} / ${ticket.totalBadgeCount}  |  今日：${ticket.checkedInToday ? '✅ 已签' : '🌸 未签'}`,
      `• <i>${escapeHtml(nextHint)}</i>`,
    ].join('\n');

    const buttons = [
      [
        buildPanelButton(env, requestOrigin, '🎫 打开完整个人面板', {
          isGroup,
          startParam: 'profile',
        }),
      ],
    ];
    if (!ticket.checkedInToday) {
      buttons.push([{ text: '🌸 立即签到领积分', callback_data: 'grp:checkin' }]);
    }
    await tgCall(env, 'sendMessage', {
      chat_id: msg.chat.id,
      reply_to_message_id: msg.message_id,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    });
    return;
  }

  const text = [
    `🌸 <b>${escapeHtml(config.profile.displayName)}</b> · <i>${escapeHtml(config.profile.statusText)}</i>`,
    `${escapeHtml(config.profile.tagline)}`,
  ].join('\n\n');

  await tgCall(env, 'sendMessage', {
    chat_id: msg.chat.id,
    reply_to_message_id: msg.message_id,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [buildPanelButton(env, requestOrigin, '✨ 打开个人面板（小站 / 探针）', { isGroup })],
      ],
    },
  });
}

async function handleCheckinCommand(env, requestOrigin, msg, config) {
  if (!config.community.enableCheckin) {
    await tgCall(env, 'sendMessage', {
      chat_id: msg.chat.id,
      reply_to_message_id: msg.message_id,
      text: 'ℹ️ 当前站点处于「极简个人名片模式」，未开启群签到功能（管理员可在小程序设置中一键开启）。',
    });
    return;
  }

  const isGroup = msg.chat.type !== 'private';
  const res = await performCheckin(env, msg.from, config.community);
  const currency = escapeHtml(config.community.currencyName || '积分');

  let text;
  if (res.alreadyCheckedIn) {
    text = `✅ <b>${escapeHtml(res.ticket.displayName)}</b> 今日已经签过到啦！\n当前 <b>Lv.${res.ticket.level.current.level} ${escapeHtml(res.ticket.level.current.title)}</b> · ${currency} <b>${res.ticket.points}</b> · 连签 <b>${res.ticket.streak} 天</b>`;
  } else {
    const badgeLine =
      res.newlyUnlocked.length > 0
        ? `\n🏆 解锁新徽章：${res.newlyUnlocked.map((b) => `${b.icon} ${escapeHtml(b.name)}`).join('、')}`
        : '';
    text = `🌸 <b>${escapeHtml(res.ticket.displayName)}</b> 签到成功！<b>+${res.gained} ${currency}</b>\n连续签到 <b>${res.ticket.streak} 天</b> · 当前 <b>Lv.${res.ticket.level.current.level} ${escapeHtml(res.ticket.level.current.title)}</b>（共 ${res.ticket.points} ${currency}）${badgeLine}`;
  }

  await tgCall(env, 'sendMessage', {
    chat_id: msg.chat.id,
    reply_to_message_id: msg.message_id,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[buildPanelButton(env, requestOrigin, '🎫 查看我的票根与徽章墙', { isGroup })]],
    },
  });
}

async function handleRankCommand(env, requestOrigin, msg, config) {
  if (!config.community.enableCheckin) return;
  const isGroup = msg.chat.type !== 'private';
  const board = await getLeaderboard(env, 10);
  const currency = escapeHtml(config.community.currencyName || '积分');
  const medals = ['🥇', '🥈', '🥉'];
  const lines =
    board.items.length === 0
      ? ['暂时还没有人签到，发送 /checkin 成为第一位打卡成员吧 🌸']
      : board.items.map((item, idx) => {
          const rankIcon = medals[idx] || `${idx + 1}.`;
          return `${rankIcon} <b>${escapeHtml(item.displayName)}</b> — Lv.${item.level} · <b>${item.points}</b> ${currency}（连签 ${item.streak} 天）`;
        });

  await tgCall(env, 'sendMessage', {
    chat_id: msg.chat.id,
    reply_to_message_id: msg.message_id,
    text: `🏆 <b>积分排行榜 TOP 10</b>\n━━━━━━━━━━━━━━━━\n${lines.join('\n')}`,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[buildPanelButton(env, requestOrigin, '✨ 打开面板查看完整榜单', { isGroup })]],
    },
  });
}

async function handleAdminSupergroupMessage(env, requestOrigin, msg, config) {
  const isAdmin = await isUserAdmin(env, msg.from.id, tgCall);
  if (!isAdmin) return;

  const threadId = msg.message_thread_id;
  const parsed = extractCommand(msg.text || '');

  if (parsed?.cmd === 'panel' || parsed?.cmd === 'me') {
    await handleGroupPanelCommand(env, requestOrigin, msg, config);
    return;
  }
  if (parsed?.cmd === 'unbind') {
    await clearBoundSupergroupId(env);
    const fallbackEnvId = String(env.SUPERGROUP_ID || '').trim();
    const extraNote = fallbackEnvId
      ? `\n\n<i>提示：检测到环境变量中仍配置了 SUPERGROUP_ID (<code>${escapeHtml(fallbackEnvId)}</code>)，如需彻底解绑请同步删除该环境变量。</i>`
      : '\n\n<i>如需重新绑定，在任意已开启「话题」的群里发送 <code>/bind</code> 即可。</i>';
    await tgCall(env, 'sendMessage', {
      chat_id: msg.chat.id,
      message_thread_id: threadId,
      text: `🔓 <b>已解除通知群动态绑定</b>${extraNote}`,
      parse_mode: 'HTML',
    });
    return;
  }
  if (parsed?.cmd === 'bind') {
    await tgCall(env, 'sendMessage', {
      chat_id: msg.chat.id,
      message_thread_id: threadId,
      text: `✅ 当前群已经是你的私聊通知群啦（群 ID：<code>${escapeHtml(String(msg.chat.id))}</code>），无需重复绑定。`,
      parse_mode: 'HTML',
    });
    return;
  }
  if (parsed?.cmd === 'cleanup') {
    await tgCall(env, 'sendMessage', {
      chat_id: msg.chat.id,
      message_thread_id: threadId,
      text: '✨ 提示：现在可以直接打开小程序「访客管理」Tab 直观查看并管理所有访客！',
      reply_markup: {
        inline_keyboard: [
          [buildPanelButton(env, requestOrigin, '👤 打开访客管理面板', { isGroup: true, startParam: 'visitors' })],
        ],
      },
    });
    return;
  }

  if (!threadId) return;
  const targetUid = await env.TOPIC_MAP.get(`thread:${threadId}`);
  if (!targetUid) return;

  if (parsed) {
    const cmd = parsed.cmd;
    if (cmd === 'info') {
      const detail = await getVisitorDetail(env, targetUid);
      if (detail) {
        await sendVisitorCardMessage(env, msg.chat.id, threadId, requestOrigin, detail, config);
      }
      return;
    }

    const actionMap = {
      ban: { action: 'ban', reply: '🚫 已拉黑该用户，其后续消息将被静默忽略。' },
      unban: { action: 'unban', reply: '✅ 已解除拉黑，恢复消息接收。' },
      trust: { action: 'trust', reply: '⭐ 已设为永久信任，免除人机验证。' },
      reset: { action: 'reset', reply: '🔄 已重置验证状态，用户下次发消息需重新验证。' },
      close: {
        action: 'close',
        reply: '🔒 已关闭本次对话。',
        notifyUser: '🔒 当前对话已由站长关闭，感谢您的联系。',
      },
      open: {
        action: 'open',
        reply: '🔓 已重新开启对话。',
        notifyUser: '🔓 站长已重新开启对话，您可以继续发送消息。',
      },
    };

    if (actionMap[cmd]) {
      const cfg = actionMap[cmd];
      const detail = await applyVisitorAction(env, targetUid, cfg.action);
      await tgCall(env, 'sendMessage', {
        chat_id: msg.chat.id,
        message_thread_id: threadId,
        text: cfg.reply,
        reply_markup: buildVisitorModerationKeyboard(env, requestOrigin, detail),
      });
      if (cfg.notifyUser) {
        await tgCall(env, 'sendMessage', { chat_id: Number(targetUid), text: cfg.notifyUser }).catch(() => {});
      }
      return;
    }
  }

  // Forward admin reply back to the visitor
  try {
    const copied = await tgCall(env, 'copyMessage', {
      chat_id: Number(targetUid),
      from_chat_id: msg.chat.id,
      message_id: msg.message_id,
    });
    await recordVisitorExchange(env, targetUid, msg, {
      sender: 'admin',
      pmMessageId: copied?.result?.message_id || null,
      incrementCount: true,
      preview: previewTextOfMessage(msg),
    }).catch(() => {});
  } catch (err) {
    await tgCall(env, 'sendMessage', {
      chat_id: msg.chat.id,
      message_thread_id: threadId,
      text: `⚠️ 回复发送失败（对方可能已停用机器人）：${err.message}`,
    });
  }
}

async function handleCallbackQuery(env, requestOrigin, cq, config) {
  const data = String(cq.data || '');

  // 1. Verification inline button (Emoji or Quiz): v:<verifyId>:<choiceIdx>
  if (data.startsWith('v:')) {
    const [, verifyId, idxStr] = data.split(':');
    const state = await safeGetJSON(env.TOPIC_MAP, `chal:${verifyId}`, null);
    if (!state) {
      await tgCall(env, 'answerCallbackQuery', {
        callback_query_id: cq.id,
        text: '验证已过期，请重新发送消息触发新验证。',
        show_alert: true,
      });
      return;
    }
    if (String(cq.from.id) !== String(state.userId)) {
      await tgCall(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: '仅限本人点击', show_alert: true });
      return;
    }

    // Layer 3: Honeypot trap button — blind spam scripts clicking the decoy get silently banned immediately!
    if (idxStr === 'trap') {
      await env.TOPIC_MAP.put(`banned:${state.userId}`, '1');
      await env.TOPIC_MAP.delete(`chal:${verifyId}`);
      await env.TOPIC_MAP.delete(`user_challenge:${state.userId}`);
      await upsertVisitorProfile(env, cq.from, {
        incrementMsg: false,
        lastPreview: '[触发蜜罐陷阱 · 已自动拉黑]',
      }).catch(() => {});
      await recordBlockedSpam(env);
      if (state.stickerMessageId && cq.message?.chat?.id) {
        await tgCall(env, 'deleteMessage', {
          chat_id: cq.message.chat.id,
          message_id: state.stickerMessageId,
        }).catch(() => {});
      }
      await tgCall(env, 'answerCallbackQuery', {
        callback_query_id: cq.id,
        text: '🛡️ 触发反垃圾蜜罐陷阱，已拒绝访问。',
        show_alert: true,
      }).catch(() => {});
      await tgCall(env, 'editMessageText', {
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        text: '🛡️ 验证未通过。',
      }).catch(() => {});
      return;
    }

    if (Number(idxStr) !== Number(state.correctIndex)) {
      const maxFails = Math.max(1, Number(config.pmBot.maxVerifyFailures || 2));
      const cooldownMins = Math.max(1, Number(config.pmBot.cooldownMinutes || 10));
      const nextFails = (Number(state.failures) || 0) + 1;

      if (nextFails >= maxFails) {
        await env.TOPIC_MAP.put(`verify_cool:${state.userId}`, '1', { expirationTtl: cooldownMins * 60 });
        await env.TOPIC_MAP.delete(`chal:${verifyId}`);
        await env.TOPIC_MAP.delete(`user_challenge:${state.userId}`);
        await recordBlockedSpam(env);
        if (state.stickerMessageId && cq.message?.chat?.id) {
          await tgCall(env, 'deleteMessage', {
            chat_id: cq.message.chat.id,
            message_id: state.stickerMessageId,
          }).catch(() => {});
        }

        await tgCall(env, 'answerCallbackQuery', {
          callback_query_id: cq.id,
          text: `❌ 连续答错 ${maxFails} 次，已进入 ${cooldownMins} 分钟冷却。`,
          show_alert: true,
        });
        await tgCall(env, 'editMessageText', {
          chat_id: cq.message.chat.id,
          message_id: cq.message.message_id,
          text: `⏳ <b>验证失败次数过多</b>，请于 ${cooldownMins} 分钟后再试。`,
          parse_mode: 'HTML',
        }).catch(() => {});
        return;
      }

      // 1st mistake -> reshuffle brand new challenge to defeat brute-force scripts!
      let refreshed;
      if (state.mode === 'sticker_quiz') {
        const nextStickerChal = generateStickerChallenge(
          config.pmBot.stickerChallenges,
          verifyId,
          config.pmBot.enableHoneypot !== false,
          state.stickerChallengeId || ''
        );
        if (nextStickerChal) {
          if (
            nextStickerChal.challengeId !== state.stickerChallengeId &&
            cq.message?.chat?.id
          ) {
            if (state.stickerMessageId) {
              await tgCall(env, 'deleteMessage', {
                chat_id: cq.message.chat.id,
                message_id: state.stickerMessageId,
              }).catch(() => {});
            }
            const sentNewSticker = await tgCall(env, 'sendSticker', {
              chat_id: cq.message.chat.id,
              sticker: nextStickerChal.fileId,
            }).catch(() => null);
            state.stickerMessageId = sentNewSticker?.result?.message_id || null;
            state.stickerChallengeId = nextStickerChal.challengeId;
          }
          refreshed = nextStickerChal;
        }
      }
      if (!refreshed) {
        refreshed = generateInlineChallenge(
          state.mode === 'quiz' ? 'quiz' : 'emoji',
          verifyId,
          config.pmBot.enableHoneypot !== false
        );
      }
      state.failures = nextFails;
      state.correctIndex = refreshed.correctIndex;
      await safePutJSON(env.TOPIC_MAP, `chal:${verifyId}`, state, { expirationTtl: 300 });

      const remaining = maxFails - nextFails;
      await tgCall(env, 'answerCallbackQuery', {
        callback_query_id: cq.id,
        text: `❌ 选错了，已换新题！还剩 ${remaining} 次机会`,
        show_alert: true,
      });
      await tgCall(env, 'editMessageText', {
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        text: `${refreshed.promptHtml}\n⚠️ <i>上次回答有误，还剩 ${remaining} 次机会。</i>`,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: refreshed.keyboard },
      }).catch(() => {});
      return;
    }

    const ttlDays = Math.max(1, Number(config.pmBot.verifiedDays || 30));
    await env.TOPIC_MAP.put(`verified:${state.userId}`, `${state.mode || 'emoji'}:v1`, {
      expirationTtl: ttlDays * 86400,
    });
    await env.TOPIC_MAP.delete(`needs_verify:${state.userId}`);
    await env.TOPIC_MAP.delete(`chal:${verifyId}`);
    await env.TOPIC_MAP.delete(`user_challenge:${state.userId}`);
    if (state.stickerMessageId && cq.message?.chat?.id) {
      await tgCall(env, 'deleteMessage', {
        chat_id: cq.message.chat.id,
        message_id: state.stickerMessageId,
      }).catch(() => {});
    }

    await tgCall(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: '✅ 验证通过！正在送达您的消息…' });
    await tgCall(env, 'editMessageText', {
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      text: '✅ <b>人机验证已通过</b>，您的消息已送达，请耐心等待回复。',
      parse_mode: 'HTML',
    }).catch(() => {});

    await flushPendingMessages(env, requestOrigin, state);
    return;
  }

  // 2. Group quick check-in button
  if (data === 'grp:checkin') {
    if (!config.community.enableCheckin) {
      await tgCall(env, 'answerCallbackQuery', {
        callback_query_id: cq.id,
        text: '当前未开启签到功能',
        show_alert: true,
      });
      return;
    }
    const res = await performCheckin(env, cq.from, config.community);
    const cur = config.community.currencyName || '积分';
    const alertText = res.alreadyCheckedIn
      ? `今日已签过啦！当前 ${res.ticket.points} ${cur}，连签 ${res.ticket.streak} 天`
      : `🌸 签到成功 +${res.gained} ${cur}！连签 ${res.ticket.streak} 天（Lv.${res.ticket.level.current.level} ${res.ticket.level.current.title}）`;
    await tgCall(env, 'answerCallbackQuery', {
      callback_query_id: cq.id,
      text: alertText,
      show_alert: true,
    });
    return;
  }

  // 3. Admin quick moderation buttons inside Supergroup Topic: mod:<action>:<uid>
  if (data.startsWith('mod:')) {
    const isAdmin = await isUserAdmin(env, cq.from.id, tgCall);
    if (!isAdmin) {
      await tgCall(env, 'answerCallbackQuery', {
        callback_query_id: cq.id,
        text: '仅管理员可执行此操作',
        show_alert: true,
      });
      return;
    }
    const [, action, uid] = data.split(':');
    const detail = await applyVisitorAction(env, uid, action);
    const toastLabels = {
      ban: '🚫 已拉黑该访客',
      unban: '✅ 已解除拉黑',
      trust: '⭐ 已设为永久信任',
      reset: '🔄 已重置人机验证',
      close: '🔒 已结单关闭对话',
      open: '🔓 已恢复对话',
    };
    await tgCall(env, 'answerCallbackQuery', {
      callback_query_id: cq.id,
      text: toastLabels[action] || '操作成功',
    });
    if (cq.message) {
      const replyMarkup = buildVisitorModerationKeyboard(env, requestOrigin, detail);
      const isMediaCard = Array.isArray(cq.message.photo) && cq.message.photo.length > 0;
      if (isMediaCard) {
        const caption = buildVisitorCardCaption(detail);
        const editedCaption = caption
          ? await tgCall(env, 'editMessageCaption', {
              chat_id: cq.message.chat.id,
              message_id: cq.message.message_id,
              caption,
              parse_mode: 'HTML',
              reply_markup: replyMarkup,
            }).then(
              () => true,
              () => false
            )
          : false;
        if (!editedCaption) {
          // Caption too long or edit rejected: at least refresh the moderation buttons
          await tgCall(env, 'editMessageReplyMarkup', {
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
            reply_markup: replyMarkup,
          }).catch(() => {});
        }
      } else {
        await tgCall(env, 'editMessageText', {
          chat_id: cq.message.chat.id,
          message_id: cq.message.message_id,
          text: buildVisitorCardText(detail),
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
        }).catch(() => {});
      }
    }
    return;
  }

  // 4. Admin quick-enable sticker quiz mode button: cfg:mode:sticker_quiz
  if (data === 'cfg:mode:sticker_quiz') {
    const isAdmin = await isUserAdmin(env, cq.from.id, tgCall);
    if (!isAdmin) {
      await tgCall(env, 'answerCallbackQuery', {
        callback_query_id: cq.id,
        text: '仅管理员可操作',
        show_alert: true,
      });
      return;
    }
    await savePanelConfig(env, {
      pmBot: { verificationMode: 'sticker_quiz', enableVerification: true },
    });
    await tgCall(env, 'answerCallbackQuery', {
      callback_query_id: cq.id,
      text: '🎭 已切换为「表情包看图猜题」验证模式！',
      show_alert: true,
    });
  }
}

/**
 * One-click Forum Supergroup binding (`/bind`) so new deployers never need to hunt for `-100...` group IDs.
 * Security:
 *  - If ADMIN_IDS is configured: strictly restricted to ADMIN_IDS.
 *  - Else if a supergroup is already bound: restricted to admins of the existing bound group (prevents hijacking).
 *  - Else (brand-new deploy): restricted to the group `creator` (群主).
 */
async function handleBindInboxCommand(env, requestOrigin, msg) {
  const uid = String(msg.from.id);
  const chatId = String(msg.chat.id);
  const configuredAdmins = parseAdminIds(env);
  const existingBound = await resolveSupergroupId(env);

  let authorized = false;
  if (configuredAdmins.size > 0) {
    authorized = configuredAdmins.has(uid);
  } else if (existingBound && existingBound !== chatId) {
    authorized = await isUserAdmin(env, msg.from.id, tgCall);
  } else {
    try {
      const memberRes = await tgCall(env, 'getChatMember', {
        chat_id: msg.chat.id,
        user_id: msg.from.id,
      });
      authorized = memberRes?.result?.status === 'creator';
    } catch {
      authorized = false;
    }
  }

  if (!authorized) {
    return;
  }

  if (msg.chat.type !== 'supergroup') {
    await tgCall(env, 'sendMessage', {
      chat_id: msg.chat.id,
      reply_to_message_id: msg.message_id,
      text: [
        `⚠️ <b>还差一步：请先开启群「话题 (Topics)」功能</b>`,
        ``,
        `1. 点击本群名称 → <b>编辑</b> → 打开 <b>话题 (Topics)</b>（开启后会自动升级为超级群）；`,
        `2. 将机器人设为管理员，勾选 <b>管理话题</b> 与 <b>删除消息</b>；`,
        `3. 回到群里再发一次 <code>/bind</code> 即可秒绑定！`,
      ].join('\n'),
      parse_mode: 'HTML',
    });
    return;
  }

  let chatInfo = null;
  try {
    chatInfo = (await tgCall(env, 'getChat', { chat_id: msg.chat.id }))?.result;
  } catch {
    chatInfo = null;
  }

  if (!chatInfo?.is_forum) {
    await tgCall(env, 'sendMessage', {
      chat_id: msg.chat.id,
      reply_to_message_id: msg.message_id,
      text: `⚠️ 当前群尚未开启 <b>「话题 (Topics)」</b>。\n请先在群设置中打开「话题」，然后重新发送 <code>/bind</code>！`,
      parse_mode: 'HTML',
    });
    return;
  }

  // Verify the bot itself is admin with can_manage_topics
  try {
    const me = (await tgCall(env, 'getMe', {}))?.result;
    if (me?.id) {
      const botMember = (
        await tgCall(env, 'getChatMember', {
          chat_id: msg.chat.id,
          user_id: me.id,
        })
      )?.result;
      const isBotAdmin = botMember?.status === 'administrator' || botMember?.status === 'creator';
      if (!isBotAdmin || botMember?.can_manage_topics === false) {
        await tgCall(env, 'sendMessage', {
          chat_id: msg.chat.id,
          reply_to_message_id: msg.message_id,
          text: `⚠️ 请先把机器人设为本群 <b>管理员</b>，并勾选 <b>「管理话题」</b>（建议同时勾选「删除消息」），再发一次 <code>/bind</code>！`,
          parse_mode: 'HTML',
        });
        return;
      }
    }
  } catch {
    // Proceed gracefully if bot info check fails transiently
  }

  await saveBoundSupergroupId(env, chatId);

  // Automatically register topic moderation commands in this group & admin commands in binder's private chat
  await Promise.all([
    tgCall(env, 'setMyCommands', {
      commands: [
        { command: 'info', description: '查看当前话题访客资料与媒体统计' },
        { command: 'ban', description: '拉黑当前话题访客' },
        { command: 'unban', description: '解除拉黑' },
        { command: 'trust', description: '设为永久信任（免验证）' },
        { command: 'reset', description: '重置访客验证状态' },
        { command: 'close', description: '结束当前对话' },
        { command: 'open', description: '重新开启对话' },
        { command: 'unbind', description: '解绑当前通知群' },
        { command: 'panel', description: '打开个人面板小程序' },
      ],
      scope: { type: 'chat_administrators', chat_id: Number(chatId) },
    }).catch(() => {}),
    tgCall(env, 'setMyCommands', {
      commands: [
        { command: 'start', description: '打开个人面板与欢迎页' },
        { command: 'panel', description: '打开个人面板小程序' },
        { command: 'set', description: '设动态贴纸徽章（跟贴纸链接或直接发贴纸）' },
        { command: 'add', description: '添加表情包看图验证题（发贴纸再贴题目）' },
        { command: 'resetbadge', description: '恢复默认玫瑰徽章' },
        { command: 'cancel', description: '取消当前录入' },
      ],
      scope: { type: 'chat', chat_id: Number(uid) },
    }).catch(() => {}),
  ]);

  await tgCall(env, 'sendMessage', {
    chat_id: msg.chat.id,
    message_thread_id: msg.message_thread_id,
    text: [
      `🎉 <b>私聊通知群绑定成功！</b>`,
      ``,
      `• 群名称：<b>${escapeHtml(chatInfo?.title || msg.chat.title || '通知群')}</b>`,
      `• 群 ID：<code>${escapeHtml(chatId)}</code>（已自动保存到云端，无需手动填环境变量）`,
      ``,
      `现在别人给机器人发私信，通过人机验证后就会自动在本群为 TA 创建独立话题，你在对应话题里直接回复即可双向沟通 🌸`,
    ].join('\n'),
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[buildPanelButton(env, requestOrigin, '✨ 打开个人面板', { isGroup: true })]],
    },
  });
}

export async function handleTelegramUpdate(update, env, requestOrigin) {
  const config = await loadPanelConfig(env);

  if (update.callback_query) {
    await handleCallbackQuery(env, requestOrigin, update.callback_query, config);
    return;
  }

  // Layer 4: Guard against "send clean text then edit into spam ad" bypass
  if (update.edited_message && update.edited_message.chat?.type === 'private' && update.edited_message.from && !update.edited_message.from.is_bot) {
    const edited = update.edited_message;
    const uid = String(edited.from.id);
    const isAdmin = await isUserAdmin(env, edited.from.id, tgCall);
    const verified = await env.TOPIC_MAP.get(`verified:${uid}`);
    const isBanned = (await env.TOPIC_MAP.get(`banned:${uid}`)) === '1';

    if (!isAdmin && !isBanned && verified !== 'trusted') {
      const risk = assessIncomingRisk(edited, config.pmBot);
      if (risk.isBlockedKeyword || risk.hasLink || risk.reasons.includes('zero_width_obfuscation')) {
        await recordBlockedSpam(env);
        const activeGroupId = await resolveSupergroupId(env);
        const detail = await getVisitorDetail(env, uid, activeGroupId);
        if (detail?.thread_id && activeGroupId) {
          await tgCall(env, 'sendMessage', {
            chat_id: activeGroupId,
            message_thread_id: detail.thread_id,
            text: `⚠️ <b>拦截到编辑偷改广告行为</b>\n访客编辑了历史消息并插入可疑内容（<code>${escapeHtml(risk.reasons.join(', '))}</code>），已自动拦截。`,
            parse_mode: 'HTML',
            reply_markup: buildVisitorModerationKeyboard(env, requestOrigin, detail),
          }).catch(() => {});
        }
      }
    }
    return;
  }

  const msg = update.message;
  if (!msg || !msg.from || msg.from.is_bot) return;

  const chatType = msg.chat?.type;
  const chatId = String(msg.chat?.id || '');
  const supergroupId = await resolveSupergroupId(env);

  // A. Admin Supergroup Topics handling
  if (supergroupId && chatId === supergroupId) {
    await handleAdminSupergroupMessage(env, requestOrigin, msg, config);
    return;
  }

  // B. Other Groups / Supergroups (One-click /bind + Community Panel & Check-in)
  if (chatType === 'group' || chatType === 'supergroup') {
    const parsed = extractCommand(msg.text || '');
    if (!parsed) return;
    const myBot = (env.BOT_USERNAME || '').replace(/^@/, '').toLowerCase();
    if (parsed.mention && myBot && parsed.mention !== myBot) return;

    if (parsed.cmd === 'bind') {
      await handleBindInboxCommand(env, requestOrigin, msg);
    } else if (parsed.cmd === 'panel' || parsed.cmd === 'me' || parsed.cmd === 'start') {
      await handleGroupPanelCommand(env, requestOrigin, msg, config);
    } else if (parsed.cmd === 'checkin' || parsed.cmd === 'sign') {
      await handleCheckinCommand(env, requestOrigin, msg, config);
    } else if (parsed.cmd === 'rank' || parsed.cmd === 'top') {
      await handleRankCommand(env, requestOrigin, msg, config);
    }
    return;
  }

  // C. Private Chat
  if (chatType === 'private') {
    const uid = String(msg.from.id);
    const parsed = extractCommand(msg.text || '');
    const isAdmin = await isUserAdmin(env, msg.from.id, tgCall);

    // Admin badge capture commands (/set or /setbadge, /resetbadge)
    if (isAdmin && (parsed?.cmd === 'set' || parsed?.cmd === 'setbadge')) {
      try {
        const captured = await extractStickersFromMessage(env, msg);
        if (captured) {
          await env.TOPIC_MAP.delete(`await_badge:${uid}`);
          await applyCapturedStickersAsBadge(env, requestOrigin, msg.chat.id, captured, config);
          return;
        }
      } catch (err) {
        await tgCall(env, 'sendMessage', {
          chat_id: msg.chat.id,
          text: `⚠️ 读取贴纸/表情失败：${err.message}`,
        });
        return;
      }

      await env.TOPIC_MAP.put(`await_badge:${uid}`, '1', { expirationTtl: 300 });
      await tgCall(env, 'sendMessage', {
        chat_id: msg.chat.id,
        text: [
          `✨ <b>设置票根动态贴纸徽章（5 分钟内有效）</b>`,
          ``,
          `请直接发送以下任意一种内容给我：`,
          `1. 贴纸包 / 表情包链接（如 <code>https://t.me/addstickers/...</code>）`,
          `2. 任意一张 <b>Telegram 贴纸</b>（静态/动态均可）`,
          `3. 你收藏的 <b>TG 自定义表情（Custom Emoji）</b>`,
          ``,
          `<i>也可以直接一步发：<code>/set https://t.me/addstickers/贴纸包名</code></i>`,
        ].join('\n'),
        parse_mode: 'HTML',
      });
      return;
    }

    if (isAdmin && parsed?.cmd === 'resetbadge') {
      await env.TOPIC_MAP.delete(`await_badge:${uid}`);
      await savePanelConfig(env, {
        profile: { emblem: { type: 'builtin', variant: 'owner' } },
      });
      await tgCall(env, 'sendMessage', {
        chat_id: msg.chat.id,
        text: '🌸 已恢复默认的玫瑰矢量徽章！',
        reply_markup: {
          inline_keyboard: [[buildPanelButton(env, requestOrigin, '🎫 打开个人面板查看', { isGroup: false })]],
        },
      });
      return;
    }

    if (isAdmin && parsed?.cmd === 'cancel') {
      await env.TOPIC_MAP.delete(`await_badge:${uid}`);
      await env.TOPIC_MAP.delete(`await_verify_quiz:${uid}`);
      await tgCall(env, 'sendMessage', { chat_id: msg.chat.id, text: '已取消当前录入流程。' });
      return;
    }

    // Admin 2-step custom sticker quiz builder (/add or /addverify)
    if (isAdmin && (parsed?.cmd === 'add' || parsed?.cmd === 'addverify')) {
      await env.TOPIC_MAP.delete(`await_badge:${uid}`);
      // 1-step shortcut: replying to a sticker with `/add 问题 | 正确 | 错1 | 错2 | 错3`
      let targetSticker = msg.reply_to_message?.sticker
        ? normalizeStickerObject(msg.reply_to_message.sticker)
        : null;
      let quizArgs = parsed.args || '';

      // Also support `/add https://t.me/addstickers/xxx 问题 | 正确 | 错1 | 错2 | 错3`
      if (!targetSticker && quizArgs) {
        const firstToken = quizArgs.split(/\s+/)[0];
        const packName = parseStickerPackName(firstToken);
        if (packName) {
          try {
            const setRes = await tgCall(env, 'getStickerSet', { name: packName });
            const firstSticker = setRes?.result?.stickers?.[0];
            if (firstSticker) {
              targetSticker = normalizeStickerObject(firstSticker);
              quizArgs = quizArgs.slice(firstToken.length).trim();
            }
          } catch {
            // Fall through to normal flow
          }
        }
      }

      const inlineQuiz = quizArgs ? parseStickerQuizInput(quizArgs) : null;

      if (targetSticker && inlineQuiz) {
        const list = Array.isArray(config.pmBot.stickerChallenges)
          ? [...config.pmBot.stickerChallenges]
          : [];
        list.unshift({
          id: `sq_${Date.now()}`,
          ...targetSticker,
          ...inlineQuiz,
        });
        await savePanelConfig(env, { pmBot: { stickerChallenges: list.slice(0, 40) } });
        await tgCall(env, 'sendMessage', {
          chat_id: msg.chat.id,
          text: `🎭 <b>表情包验证题已录入！</b>（当前题库共 ${list.length} 题）\n\n• 题目：${escapeHtml(inlineQuiz.question)}\n• 正确答案：✅ ${escapeHtml(inlineQuiz.answer)}\n• 干扰项：${inlineQuiz.wrong.map(escapeHtml).join(' / ')}`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎭 立即启用「表情包看图猜题」模式', callback_data: 'cfg:mode:sticker_quiz' }],
              [buildPanelButton(env, requestOrigin, '⚙️ 打开小程序管理题库', { isGroup: false, query: 'settings=modes' })],
            ],
          },
        });
        return;
      }

      if (targetSticker) {
        await safePutJSON(
          env.TOPIC_MAP,
          `await_verify_quiz:${uid}`,
          { step: 'question', sticker: targetSticker },
          { expirationTtl: 300 }
        );
        await tgCall(env, 'sendMessage', {
          chat_id: msg.chat.id,
          text: `✨ 已选中该贴纸！请直接发送题目和选项（用<b>空格</b>、换行、逗号或 <code>|</code> 隔开均可，<b>第 1 个选项为正确答案</b>）：\n\n<code>这个画面在干嘛？ 坐在木凳上晃腿 霸王龙写微积分 外星人修飞船 电饭煲考驾照</code>\n\n<i>发送 /cancel 可取消。</i>`,
          parse_mode: 'HTML',
        });
        return;
      }

      await safePutJSON(env.TOPIC_MAP, `await_verify_quiz:${uid}`, { step: 'sticker' }, { expirationTtl: 300 });
      await tgCall(env, 'sendMessage', {
        chat_id: msg.chat.id,
        text: `🎭 <b>添加表情包看图验证题（第 1/2 步）</b>\n\n请直接发送一张你收藏的 <b>Telegram 贴纸</b>（静态/动态均可）给我！\n\n<i>下一步直接用空格隔开发送「问题 正确答案 错1 错2 错3」即可；发 /cancel 取消。</i>`,
        parse_mode: 'HTML',
      });
      return;
    }

    if (isAdmin && !parsed) {
      // Handle 2-step /addverify capture flow
      const quizSession = await safeGetJSON(env.TOPIC_MAP, `await_verify_quiz:${uid}`, null);
      if (quizSession?.step === 'sticker') {
        const captured = msg.sticker ? normalizeStickerObject(msg.sticker) : null;
        if (!captured) {
          await tgCall(env, 'sendMessage', {
            chat_id: msg.chat.id,
            text: '请发送一张 Telegram 贴纸（或发送 /cancel 取消）。',
          });
          return;
        }
        await safePutJSON(
          env.TOPIC_MAP,
          `await_verify_quiz:${uid}`,
          { step: 'question', sticker: captured },
          { expirationTtl: 300 }
        );
        await tgCall(env, 'sendMessage', {
          chat_id: msg.chat.id,
          text: `✨ 收到表情包！<b>第 2/2 步</b>：请发给我题目和选项（用<b>空格</b>、换行、逗号或 <code>|</code> 隔开都行，<b>第 1 个选项是正确答案</b>）：\n\n<code>这个表情是什么情绪？ 惊讶 开心 生气 困了</code>\n\n<i>发 /cancel 可取消。</i>`,
          parse_mode: 'HTML',
        });
        return;
      }

      if (quizSession?.step === 'question' && quizSession.sticker) {
        const parsedQuiz = parseStickerQuizInput(msg.text || '');
        if (!parsedQuiz) {
          await tgCall(env, 'sendMessage', {
            chat_id: msg.chat.id,
            text: '格式还差一点哦，请用空格或换行分隔：<code>题目 正确答案 错误项1 错误项2 错误项3</code>（至少需要 1 个正确项和 1 个错误项）。',
            parse_mode: 'HTML',
          });
          return;
        }
        await env.TOPIC_MAP.delete(`await_verify_quiz:${uid}`);
        const list = Array.isArray(config.pmBot.stickerChallenges)
          ? [...config.pmBot.stickerChallenges]
          : [];
        list.unshift({
          id: `sq_${Date.now()}`,
          ...quizSession.sticker,
          ...parsedQuiz,
        });
        await savePanelConfig(env, { pmBot: { stickerChallenges: list.slice(0, 40) } });
        await tgCall(env, 'sendMessage', {
          chat_id: msg.chat.id,
          text: `🎉 <b>表情包验证题录入成功！</b>（当前题库共 <b>${list.length}</b> 题）\n\n• 题目：${escapeHtml(parsedQuiz.question)}\n• 正确答案：✅ ${escapeHtml(parsedQuiz.answer)}\n• 干扰项：${parsedQuiz.wrong.map(escapeHtml).join(' / ')}\n\n<i>想继续录下一题随时发 /add 即可！</i>`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎭 立即启用「表情包看图猜题」模式', callback_data: 'cfg:mode:sticker_quiz' }],
              [buildPanelButton(env, requestOrigin, '⚙️ 打开小程序管理题库', { isGroup: false, query: 'settings=modes' })],
            ],
          },
        });
        return;
      }

      const waitingBadge = await env.TOPIC_MAP.get(`await_badge:${uid}`);
      if (waitingBadge === '1') {
        try {
          const captured = await extractStickersFromMessage(env, msg);
          if (captured) {
            await env.TOPIC_MAP.delete(`await_badge:${uid}`);
            await applyCapturedStickersAsBadge(env, requestOrigin, msg.chat.id, captured, config);
            return;
          }
          await tgCall(env, 'sendMessage', {
            chat_id: msg.chat.id,
            text: '未识别到贴纸、TG 自定义表情或贴纸包链接，请重新发送（支持直接发贴纸、发收藏表情，或发 t.me/addstickers/... 链接）。',
          });
          return;
        } catch (err) {
          await env.TOPIC_MAP.delete(`await_badge:${uid}`);
          await tgCall(env, 'sendMessage', {
            chat_id: msg.chat.id,
            text: `⚠️ 获取贴纸失败：${err.message}`,
          });
          return;
        }
      }
    }

    if (parsed) {
      if (parsed.cmd === 'start') {
        if (config.pmBot.enableStartWelcome !== false) {
          await handlePrivatePanelCommand(env, requestOrigin, msg, config, { isStart: true });
        }
        return;
      }
      if (parsed.cmd === 'panel' || parsed.cmd === 'me') {
        await handlePrivatePanelCommand(env, requestOrigin, msg, config, { isStart: false });
        return;
      }
      if (parsed.cmd === 'checkin' || parsed.cmd === 'sign') {
        await handleCheckinCommand(env, requestOrigin, msg, config);
        return;
      }
      if (parsed.cmd === 'rank') {
        await handleRankCommand(env, requestOrigin, msg, config);
        return;
      }
      if (!isAdmin) return;
    }

    if (!supergroupId) {
      // No notification group bound yet: reply with the welcome card, honoring the /start toggles
      if (config.pmBot.enableStartWelcome !== false) {
        await handlePrivatePanelCommand(env, requestOrigin, msg, config, { isStart: true });
      }
      return;
    }

    const isBanned = (await env.TOPIC_MAP.get(`banned:${uid}`)) === '1';
    if (isBanned) return;

    const allowed = await checkRateLimit(env, `rl:msg:${uid}`, 40, 60);
    if (!allowed) return;

    const rec = await safeGetJSON(env.TOPIC_MAP, `user:${uid}`, null);
    if (rec?.closed) {
      await tgCall(env, 'sendMessage', {
        chat_id: msg.chat.id,
        text: '🔒 当前对话已结束，如需再次联系请等待站长重新开启。',
      });
      return;
    }

    const verified = await env.TOPIC_MAP.get(`verified:${uid}`);
    const needsVerify = await env.TOPIC_MAP.get(`needs_verify:${uid}`);
    const verifyMode = config.pmBot.verificationMode || (config.pmBot.enableVerification ? 'emoji' : 'off');
    const isTrusted = verified === 'trusted';

    // Layer 2 & 4: Evaluate de-obfuscated keyword blocklist & risk signals (<1ms local CPU)
    const risk = !isAdmin && !isTrusted ? assessIncomingRisk(msg, config.pmBot) : null;
    if (risk?.isBlockedKeyword) {
      await recordBlockedSpam(env);
      return;
    }

    if (!isAdmin && verifyMode !== 'off' && (!verified || needsVerify)) {
      // Layer 1: CAS global spammer blacklist check (only for unverified strangers, KV-cached 6h/24h)
      if (config.pmBot.enableCasCheck !== false) {
        const cas = await checkCasBlacklist(env, uid);
        if (cas.isSpammer) {
          await env.TOPIC_MAP.put(`banned:${uid}`, '1');
          await upsertVisitorProfile(env, msg.from, {
            incrementMsg: false,
            lastPreview: '[命中 CAS 黑名单 · 已自动拦截]',
          }).catch(() => {});
          await recordBlockedSpam(env);
          return;
        }
      }
      await startVerificationChallenge(env, requestOrigin, msg, config, risk);
      return;
    }

    await processVisitorMessage(env, requestOrigin, msg, config);
  }
}
