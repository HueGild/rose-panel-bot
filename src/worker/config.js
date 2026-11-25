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

export const DEFAULT_CONFIG = {
  profile: {
    displayName: 'Rose',
    handle: '@Rose202_bot',
    tagline: '欢迎来到我的个人面板，这里汇集了我的个人小站与节点探针。',
    statusText: '在线营业中',
    statusTone: 'online', // online | busy | away
    avatarUrl: '',
    ownerTag: '个人名片',
    badgeTitle: '站长 · Owner',
    joinedText: 'Cloudflare Edge',
    notice: '',
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
    },
    {
      id: 'site-nav',
      name: '个人导航站',
      url: 'https://nav.example.com',
      description: '常用服务、自托管应用与精选书签入口',
      category: '导航',
      icon: '🧭',
      badge: '直达',
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

export function mergeConfig(base, override) {
  if (!override || typeof override !== 'object') return structuredClone(base);
  return {
    profile: {
      ...base.profile,
      ...(override.profile || {}),
      socials: Array.isArray(override.profile?.socials)
        ? override.profile.socials
        : structuredClone(base.profile.socials),
    },
    sites: Array.isArray(override.sites) ? override.sites : structuredClone(base.sites),
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

  await safePutJSON(env.TOPIC_MAP, CONFIG_KV_KEY, merged);
  return merged;
}

export function sanitizePublicConfig(config, env) {
  return {
    profile: config.profile,
    sites: config.sites,
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

export function sanitizeAdminConfig(config) {
  const cloned = structuredClone(config);
  if (cloned.probe.apiKey) {
    cloned.probe.apiKey = '********';
    cloned.probe.hasApiKey = true;
  } else {
    cloned.probe.hasApiKey = false;
  }
  return cloned;
}
