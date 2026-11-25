// Telegram Webhook Handler:
// 1. Bidirectional Anti-Spam PM Bot with Forum Topics (compatible with telegram_private_chatbot)
// 2. 3-Mode Verification: Emoji Odd-One-Out/Pick (0-latency) | Local Quiz | Cloudflare Turnstile Strict Mode + Cooldown
// 3. Topic Visitor Info Card + Direct Mini App Profile, Photos/Links Archive & Moderation Buttons
// 4. Group & Private Personal Panel + Optional Check-in / Points / Leaderboard Commands
// 5. Admin /setbadge & /resetbadge for capturing Telegram Stickers / Custom Emojis as Ticket Emblem

import { isUserAdmin } from './auth.js';
import { getLeaderboard, getMemberTicket, performCheckin } from './checkin.js';
import { loadPanelConfig, safeGetJSON, safePutJSON, savePanelConfig } from './config.js';
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
  ['🌸', '🌺'],
  ['🌕', '🌙'],
  ['🍎', '🍓'],
  ['🐱', '🦊'],
  ['💙', '💗'],
  ['🍀', '🍁'],
  ['⭐', '🌟'],
  ['🍩', '🍪'],
  ['🧁', '🍰'],
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
export function generateInlineChallenge(mode = 'emoji', verifyId = 'test') {
  if (mode === 'quiz') {
    const q = LOCAL_QUESTIONS[randomInt(LOCAL_QUESTIONS.length)];
    const options = shuffle([q.ok, ...q.bad]);
    const correctIndex = options.indexOf(q.ok);
    const keyboard = [
      options.slice(0, 2).map((opt, idx) => ({ text: opt, callback_data: `v:${verifyId}:${idx}` })),
      options.slice(2, 4).map((opt, idx) => ({ text: opt, callback_data: `v:${verifyId}:${idx + 2}` })),
    ];
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
    const keyboard = [0, 3, 6].map((rowStart) =>
      cells.slice(rowStart, rowStart + 3).map((icon, offset) => ({
        text: icon,
        callback_data: `v:${verifyId}:${rowStart + offset}`,
      }))
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
  const keyboard = [0, 3, 6].map((rowStart) =>
    picked.slice(rowStart, rowStart + 3).map((item, offset) => ({
      text: item.icon,
      callback_data: `v:${verifyId}:${rowStart + offset}`,
    }))
  );
  return {
    correctIndex,
    promptHtml: `🎯 <b>极速人机验证（图标点选）</b>\n\n请点击下方表示「<b>${escapeHtml(target.label)}</b>」的图标 👇\n\n<i>0 延迟秒过 · 通过后 30 天内免验证。</i>`,
    keyboard,
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
  const lines = [
    `👤 <b>访客资料卡</b>`,
    `━━━━━━━━━━━━━━━━`,
    `• 昵称：<b>${escapeHtml(detail.displayName)}</b>`,
    `• 用户名：${detail.username ? `@${escapeHtml(detail.username)}` : '<i>未设置</i>'}`,
    `• UID：<code>${detail.userId}</code>`,
    `• 状态：${statusMap[detail.status] || detail.status}`,
    `• 聊天统计：共 <b>${detail.msg_count || 0}</b> 条（对方 ${detail.visitor_msg_count || 0} · 我 ${detail.admin_msg_count || 0}）`,
    `• 归档媒体：🖼️ ${detail.photo_count || 0} 图 · 🔗 ${detail.link_count || 0} 链`,
  ];
  if (detail.note) {
    lines.push(`• 备注：${escapeHtml(detail.note)}`);
  }
  return lines.join('\n');
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
  const uid = String(tgUser.id);
  const existing = await safeGetJSON(env.TOPIC_MAP, `user:${uid}`, null);

  if (existing?.thread_id) {
    await env.TOPIC_MAP.put(`thread:${existing.thread_id}`, uid);
    return { threadId: existing.thread_id, isNew: false };
  }

  const baseName = formatDisplayName({ ...tgUser, userId: uid }).slice(0, 32);
  const title = `${baseName} [${uid}]`.slice(0, 120);
  const created = await tgCall(env, 'createForumTopic', {
    chat_id: env.SUPERGROUP_ID,
    name: title,
  });

  const threadId = created.result.message_thread_id;
  await upsertVisitorProfile(env, tgUser, {
    threadId,
    closed: false,
    lastPreview: preview,
  });
  await env.TOPIC_MAP.put(`thread:${threadId}`, uid);

  const detail = await getVisitorDetail(env, uid);
  if (detail) {
    await tgCall(env, 'sendMessage', {
      chat_id: env.SUPERGROUP_ID,
      message_thread_id: threadId,
      text: buildVisitorCardText(detail),
      parse_mode: 'HTML',
      reply_markup: buildVisitorModerationKeyboard(env, requestOrigin, detail),
    });
  }

  return { threadId, isNew: true };
}

async function forwardMessageToTopic(env, requestOrigin, msg) {
  const user = msg.from;
  const uid = String(user.id);
  const preview = previewTextOfMessage(msg);
  await upsertVisitorProfile(env, user, { incrementMsg: false, lastPreview: preview });

  let { threadId } = await ensureVisitorTopic(env, requestOrigin, user, preview);
  try {
    await tgCall(env, 'copyMessage', {
      chat_id: env.SUPERGROUP_ID,
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
        chat_id: env.SUPERGROUP_ID,
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
}

async function flushPendingMessages(env, requestOrigin, state) {
  const pending = Array.isArray(state.pending) ? state.pending : [];
  for (const item of pending) {
    await forwardMessageToTopic(env, requestOrigin, {
      from: state.user,
      chat: { id: item.chatId },
      message_id: item.messageId,
      text: item.text || item.preview || '',
      caption: item.caption || '',
      entities: item.entities || [],
      caption_entities: item.caption_entities || [],
      photo: item.photo || null,
      document: item.document || null,
    }).catch(() => {});
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

async function startVerificationChallenge(env, requestOrigin, msg, config) {
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
      const pending = Array.isArray(existingState.pending) ? existingState.pending : [];
      if (pending.length < 3) {
        pending.push(serializePendingMessage(msg));
        existingState.pending = pending;
        await safePutJSON(env.TOPIC_MAP, `chal:${existingChalId}`, existingState, { expirationTtl: 300 });
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
  const mode = desiredMode === 'turnstile' && !turnstileReady ? 'emoji' : desiredMode;
  const verifyId = randomId(12);

  const baseState = {
    mode,
    userId: uid,
    failures: 0,
    user: {
      id: msg.from.id,
      first_name: msg.from.first_name || '',
      last_name: msg.from.last_name || '',
      username: msg.from.username || '',
      language_code: msg.from.language_code || '',
    },
    pending: [serializePendingMessage(msg)],
  };

  // Strict Mode: Cloudflare Turnstile inside Telegram WebApp overlay
  if (mode === 'turnstile') {
    const verifyUrl = `${requestOrigin.replace(/\/$/, '')}/verify?vid=${encodeURIComponent(verifyId)}`;
    const sent = await tgCall(env, 'sendMessage', {
      chat_id: msg.chat.id,
      text: `🛡️ <b>安全验证（严格模式）</b>\n\n请点击下方按钮完成 Cloudflare 人机核验，验证通过后您的消息将自动送达（30 天内免重复验证）。`,
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

  // Zero-latency Inline Mode (`emoji` or `quiz`)
  const chal = generateInlineChallenge(mode, verifyId);
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

async function handlePrivatePanelCommand(env, requestOrigin, msg, config) {
  const isAdmin = await isUserAdmin(env, msg.from.id, tgCall);
  const welcome = config.pmBot.welcomeText || '欢迎使用个人面板！';
  const rows = [
    [buildPanelButton(env, requestOrigin, '✨ 打开个人面板小程序', { isGroup: false })],
  ];
  if (isAdmin) {
    rows.push([
      buildPanelButton(env, requestOrigin, '👤 访客管理与拉黑后台', {
        isGroup: false,
        query: 'tab=visitors',
      }),
    ]);
  }
  await tgCall(env, 'sendMessage', {
    chat_id: msg.chat.id,
    text: `🌸 <b>${escapeHtml(config.profile.displayName)}</b>\n\n${escapeHtml(welcome)}`,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: rows },
  });
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
        await tgCall(env, 'sendMessage', {
          chat_id: msg.chat.id,
          message_thread_id: threadId,
          text: buildVisitorCardText(detail),
          parse_mode: 'HTML',
          reply_markup: buildVisitorModerationKeyboard(env, requestOrigin, detail),
        });
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

    if (Number(idxStr) !== Number(state.correctIndex)) {
      const maxFails = Math.max(1, Number(config.pmBot.maxVerifyFailures || 2));
      const cooldownMins = Math.max(1, Number(config.pmBot.cooldownMinutes || 10));
      const nextFails = (Number(state.failures) || 0) + 1;

      if (nextFails >= maxFails) {
        await env.TOPIC_MAP.put(`verify_cool:${state.userId}`, '1', { expirationTtl: cooldownMins * 60 });
        await env.TOPIC_MAP.delete(`chal:${verifyId}`);
        await env.TOPIC_MAP.delete(`user_challenge:${state.userId}`);

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
      const refreshed = generateInlineChallenge(state.mode || 'emoji', verifyId);
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
      await tgCall(env, 'editMessageText', {
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        text: buildVisitorCardText(detail),
        parse_mode: 'HTML',
        reply_markup: buildVisitorModerationKeyboard(env, requestOrigin, detail),
      }).catch(() => {});
    }
  }
}

export async function handleTelegramUpdate(update, env, requestOrigin) {
  const config = await loadPanelConfig(env);

  if (update.callback_query) {
    await handleCallbackQuery(env, requestOrigin, update.callback_query, config);
    return;
  }

  const msg = update.message;
  if (!msg || !msg.from || msg.from.is_bot) return;

  const chatType = msg.chat?.type;
  const chatId = String(msg.chat?.id || '');
  const supergroupId = String(env.SUPERGROUP_ID || '');

  // A. Admin Supergroup Topics handling
  if (supergroupId && chatId === supergroupId) {
    await handleAdminSupergroupMessage(env, requestOrigin, msg, config);
    return;
  }

  // B. Other Groups / Supergroups (Community Panel & Check-in)
  if (chatType === 'group' || chatType === 'supergroup') {
    const parsed = extractCommand(msg.text || '');
    if (!parsed) return;
    const myBot = (env.BOT_USERNAME || '').replace(/^@/, '').toLowerCase();
    if (parsed.mention && myBot && parsed.mention !== myBot) return;

    if (parsed.cmd === 'panel' || parsed.cmd === 'me' || parsed.cmd === 'start') {
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

    // Admin badge capture commands (/setbadge & /resetbadge)
    if (isAdmin && parsed?.cmd === 'setbadge') {
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
          `✨ <b>已进入票根徽章设置模式（5 分钟内有效）</b>`,
          ``,
          `请直接发送以下任意一种内容给我：`,
          `1. 任意一张 <b>Telegram 贴纸</b>（支持静态/动态）`,
          `2. 包含你收藏的 <b>TG 自定义表情（Custom Emoji）</b> 的消息`,
          `3. 贴纸包或表情包链接（如 <code>https://t.me/addstickers/...</code> 或 <code>https://t.me/addemoji/...</code>）`,
          ``,
          `<i>发送 /resetbadge 可恢复默认玫瑰徽章。</i>`,
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

    if (isAdmin && !parsed) {
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
      if (parsed.cmd === 'start' || parsed.cmd === 'panel' || parsed.cmd === 'me') {
        await handlePrivatePanelCommand(env, requestOrigin, msg, config);
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
      await handlePrivatePanelCommand(env, requestOrigin, msg, config);
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

    if (!isAdmin && verifyMode !== 'off' && (!verified || needsVerify)) {
      await startVerificationChallenge(env, requestOrigin, msg, config);
      return;
    }

    await forwardMessageToTopic(env, requestOrigin, msg);
  }
}
