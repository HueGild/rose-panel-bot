// Configuration defaults and KV storage helpers for RosePanel Bot

export const LEVELS = [
  { level: 1, title: '初遇者', minXp: 0, badge: 'petal', color: '#E38AA6' },
  { level: 2, title: '漫游者', minXp: 100, badge: 'compass', color: '#D96B90' },
  { level: 3, title: '追光者', minXp: 300, badge: 'sparkle', color: '#C84E79' },
  { level: 4, title: '入戏者', minXp: 700, badge: 'bottle', color: '#B03460' },
  { level: 5, title: '知影人', minXp: 1300, badge: 'crystal', color: '#99244D' },
  { level: 6, title: '守夜人', minXp: 2400, badge: 'moon', color: '#7D1B3F' },
  { level: 7, title: '星辰主', minXp: 4200, badge: 'crown', color: '#611331' },
];

export const BADGE_CATALOG = [
  { id: 'first_checkin', name: '初见印记', desc: '完成首次每日签到', icon: '🌸' },
  { id: 'streak_3', name: '三日之约', desc: '连续签到达到 3 天', icon: '🔥' },
  { id: 'streak_7', name: '七日星火', desc: '连续签到达到 7 天', icon: '✨' },
  { id: 'streak_30', name: '满月守望', desc: '连续签到达到 30 天', icon: '🌙' },
  { id: 'points_500', name: '积微成著', desc: '累计积分达到 500 分', icon: '💎' },
  { id: 'points_2000', name: '玫瑰藏家', desc: '累计积分达到 2000 分', icon: '👑' },
  { id: 'early_bird', name: '晨光打卡', desc: '在早上 05:00-08:30 完成签到', icon: '🌅' },
  { id: 'loyal_10', name: '常驻旅人', desc: '累计签到满 10 天', icon: '🎫' },
];

export const DEFAULT_EMBLEM = {
  type: 'builtin', // builtin | tg_sticker | url
  variant: 'owner', // owner | bottle | crown
  fileId: '',
  format: 'webp', // webp | webm | tgs
  url: '',
  emoji: '',
  setName: '',
  savedStickers: [],
};

export const DEFAULT_CONFIG = {
  profile: {
    displayName: 'RosePanel',
    handle: '@your_bot',
    tagline: '欢迎来到我的个人面板，这里汇集了我的个人小站与节点探针。',
    statusText: '在线营业中',
    statusTone: 'online', // online | busy | away
    avatarUrl: '',
    ownerTag: '个人名片',
    badgeTitle: '站长 · Owner',
    joinedText: 'Cloudflare Edge',
    notice: '',
    tags: '',
    noteTitle: '来信礼仪',
    noteLines:
      '初次私聊请直接说明来意，不用只发「在吗」\n欢迎技术交流、友链与合作，谢绝广告推销\n看到消息后会尽快回复，请稍作等待 🌙',
    emblem: { ...DEFAULT_EMBLEM },
    socials: [
      { id: 'tg', label: 'Telegram 私聊', value: '直接发送消息即可联系我', url: '', icon: 'message' },
      { id: 'github', label: 'GitHub', value: 'github.com/mango0114', url: 'https://github.com/mango0114', icon: 'github' },
    ],
  },
  sites: [
    {
      id: 'site-blog',
      name: '个人博客',
      url: 'https://example.com',
      description: '记录技术笔记、折腾日志与生活随想',
      category: '博客',
      icon: '✍️',
      badge: '主站',
      visibility: 'public',
    },
    {
      id: 'site-nav',
      name: '个人导航站',
      url: 'https://nav.example.com',
      description: '常用服务、自托管应用与精选书签入口',
      category: '导航',
      icon: '🧭',
      badge: '直达',
      visibility: 'public',
    },
  ],
  probe: {
    provider: 'komari', // komari | link
    url: '',
    publicUrl: '',
    apiKey: '',
    title: 'Komari 节点探针',
    subtitle: '实时节点监控与负载一览',
    cacheTtlSeconds: 15,
    demoMode: false,
  },
  community: {
    enableCheckin: false, // 个人名片模式默认关闭；群社区部署时可一键开启
    timezoneOffsetHours: 8, // UTC+8 Asia/Shanghai
    dailyMinPoints: 10,
    dailyMaxPoints: 25,
    streakStepBonus: 2,
    streakMaxBonus: 20,
    milestone7Bonus: 30,
    milestone30Bonus: 120,
    currencyName: '积分',
    groupTitle: '群友票根',
  },
  pmBot: {
    enableVerification: true,
    verificationMode: 'emoji', // emoji | sticker_quiz | quiz | turnstile | off
    maxVerifyFailures: 2,
    cooldownMinutes: 10,
    enableCasCheck: true,
    smartEscalation: true,
    blockUnverifiedMedia: true,
    enableHoneypot: true,
    blockedKeywords: '',
    stickerChallenges: [],
    welcomeText: '你好呀 🌸 这里是我的私聊助手。直接发送消息即可联系我，也可以点击下方按钮打开我的个人面板查看小站与探针。',
    autoAckEnabled: true,
    verifiedDays: 30,
  },
};

const CONFIG_KV_KEY = 'config:panel';

export async function safeGetJSON(kv, key, fallback = null) {
  if (!kv) return fallback;
  try {
    const val = await kv.get(key, { type: 'json' });
    return val === null || val === undefined ? fallback : val;
  } catch {
    return fallback;
  }
}

export async function safePutJSON(kv, key, value, options = undefined) {
  if (!kv) return;
  await kv.put(key, JSON.stringify(value), options);
}

export function normalizeSite(site = {}, idx = 0) {
  return {
    id: String(site.id || `site-${Date.now()}-${idx}`),
    name: String(site.name || '未命名站点'),
    url: String(site.url || ''),
    description: String(site.description || ''),
    category: String(site.category || '常用'),
    icon: String(site.icon || '🌐'),
    badge: String(site.badge || ''),
    visibility: site.visibility === 'private' ? 'private' : 'public',
  };
}

export function normalizeEmblem(baseEmblem = DEFAULT_EMBLEM, override = null) {
  const merged = {
    ...DEFAULT_EMBLEM,
    ...(baseEmblem || {}),
    ...(override || {}),
  };
  if (!['builtin', 'tg_sticker', 'url'].includes(merged.type)) {
    merged.type = 'builtin';
  }
  if (!['webp', 'webm', 'tgs'].includes(merged.format)) {
    merged.format = 'webp';
  }
  merged.savedStickers = Array.isArray(merged.savedStickers) ? merged.savedStickers.slice(0, 30) : [];
  return merged;
}

export function mergeConfig(base, override) {
  if (!override || typeof override !== 'object') {
    const cloned = structuredClone(base);
    cloned.sites = cloned.sites.map(normalizeSite);
    cloned.profile.emblem = normalizeEmblem(cloned.profile.emblem);
    return cloned;
  }
  const rawSites = Array.isArray(override.sites) ? override.sites : base.sites;
  return {
    profile: {
      ...base.profile,
      ...(override.profile || {}),
      emblem: normalizeEmblem(base.profile?.emblem, override.profile?.emblem),
      socials: Array.isArray(override.profile?.socials)
        ? override.profile.socials
        : structuredClone(base.profile.socials),
    },
    sites: rawSites.map(normalizeSite),
    probe: {
      ...base.probe,
      ...(override.probe || {}),
    },
    community: {
      ...base.community,
      ...(override.community || {}),
    },
    pmBot: {
      ...base.pmBot,
      ...(override.pmBot || {}),
    },
  };
}

export async function loadPanelConfig(env) {
  const saved = await safeGetJSON(env.TOPIC_MAP, CONFIG_KV_KEY, null);
  const merged = mergeConfig(DEFAULT_CONFIG, saved);

  // Environment variable fallbacks when KV fields are unset
  if (!saved?.profile?.handle && env.BOT_USERNAME) {
    merged.profile.handle = `@${env.BOT_USERNAME.replace(/^@/, '')}`;
  }
  if (!merged.probe.url && env.KOMARI_URL) {
    merged.probe.url = env.KOMARI_URL;
  }
  if (!merged.probe.publicUrl && (merged.probe.url || env.KOMARI_URL)) {
    merged.probe.publicUrl = merged.probe.url || env.KOMARI_URL;
  }
  if (!merged.probe.apiKey && env.KOMARI_API_KEY) {
    merged.probe.apiKey = env.KOMARI_API_KEY;
  }
  if (saved?.community?.enableCheckin === undefined && env.ENABLE_CHECKIN !== undefined) {
    merged.community.enableCheckin = String(env.ENABLE_CHECKIN).toLowerCase() === 'true';
  }
  return merged;
}

export async function savePanelConfig(env, nextConfig) {
  const current = await loadPanelConfig(env);
  const merged = mergeConfig(current, nextConfig);

  // Preserve stored API key if admin sent masked placeholder
  if (nextConfig?.probe?.apiKey === '********') {
    merged.probe.apiKey = current.probe.apiKey;
  }

  // Clamp numeric settings
  merged.probe.cacheTtlSeconds = Math.min(Math.max(Number(merged.probe.cacheTtlSeconds) || 15, 5), 300);
  merged.community.dailyMinPoints = Math.min(Math.max(Number(merged.community.dailyMinPoints) || 10, 1), 1000);
  merged.community.dailyMaxPoints = Math.min(
    Math.max(Number(merged.community.dailyMaxPoints) || 25, merged.community.dailyMinPoints),
    2000
  );
  merged.community.streakStepBonus = Math.min(Math.max(Number(merged.community.streakStepBonus) || 0, 0), 100);
  merged.community.streakMaxBonus = Math.min(Math.max(Number(merged.community.streakMaxBonus) || 0, 0), 500);
  if (!['emoji', 'sticker_quiz', 'quiz', 'turnstile', 'off'].includes(merged.pmBot.verificationMode)) {
    merged.pmBot.verificationMode = merged.pmBot.enableVerification ? 'emoji' : 'off';
  }
  merged.pmBot.enableVerification = merged.pmBot.verificationMode !== 'off';
  merged.pmBot.maxVerifyFailures = Math.min(Math.max(Number(merged.pmBot.maxVerifyFailures) || 2, 1), 5);
  merged.pmBot.cooldownMinutes = Math.min(Math.max(Number(merged.pmBot.cooldownMinutes) || 10, 1), 1440);
  merged.pmBot.enableCasCheck = merged.pmBot.enableCasCheck !== false;
  merged.pmBot.smartEscalation = merged.pmBot.smartEscalation !== false;
  merged.pmBot.blockUnverifiedMedia = merged.pmBot.blockUnverifiedMedia !== false;
  merged.pmBot.enableHoneypot = merged.pmBot.enableHoneypot !== false;
  merged.pmBot.blockedKeywords = String(merged.pmBot.blockedKeywords || '').slice(0, 2000);
  merged.pmBot.stickerChallenges = Array.isArray(merged.pmBot.stickerChallenges)
    ? merged.pmBot.stickerChallenges.filter((item) => item?.fileId && item?.question && item?.answer).slice(0, 40)
    : [];

  await safePutJSON(env.TOPIC_MAP, CONFIG_KV_KEY, merged);
  return merged;
}

/**
 * Returns panel configuration tailored to caller privileges.
 * CRITICAL SECURITY: Private sites (`visibility === 'private'`) and saved sticker library
 * are strictly stripped server-side for non-admin visitors.
 */
export function sanitizePublicConfig(config, env, isAdmin = false) {
  const visibleSites = isAdmin
    ? config.sites
    : config.sites.filter((s) => (s.visibility || 'public') !== 'private');

  const activeEmblem = {
    type: config.profile.emblem?.type || 'builtin',
    variant: config.profile.emblem?.variant || 'owner',
    fileId: config.profile.emblem?.fileId || '',
    format: config.profile.emblem?.format || 'webp',
    url: config.profile.emblem?.url || '',
  };

  return {
    profile: {
      ...config.profile,
      emblem: activeEmblem,
    },
    sites: visibleSites,
    probe: {
      provider: config.probe.provider,
      configured: Boolean(config.probe.url || config.probe.demoMode),
      publicUrl: config.probe.publicUrl || config.probe.url || '',
      title: config.probe.title,
      subtitle: config.probe.subtitle,
      demoMode: Boolean(config.probe.demoMode),
    },
    community: {
      enableCheckin: Boolean(config.community.enableCheckin),
      currencyName: config.community.currencyName,
      groupTitle: config.community.groupTitle,
      dailyMinPoints: config.community.dailyMinPoints,
      dailyMaxPoints: config.community.dailyMaxPoints,
      streakStepBonus: config.community.streakStepBonus,
      streakMaxBonus: config.community.streakMaxBonus,
      milestone7Bonus: config.community.milestone7Bonus,
      milestone30Bonus: config.community.milestone30Bonus,
    },
    bot: {
      username: (env.BOT_USERNAME || '').replace(/^@/, ''),
      appShortName: env.APP_SHORT_NAME || '',
    },
  };
}

export function sanitizeAdminConfig(config, env = {}) {
  const cloned = structuredClone(config);
  if (cloned.probe.apiKey) {
    cloned.probe.apiKey = '********';
    cloned.probe.hasApiKey = true;
  } else {
    cloned.probe.hasApiKey = false;
  }
  cloned.pmBot.turnstileReady = Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET);
  return cloned;
}
