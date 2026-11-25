import { describe, expect, it, vi } from 'vitest';
import { assessIncomingRisk, checkCasBlacklist, normalizeAntiSpamText } from '../src/worker/antispam.js';
import { signMediaToken, verifyMediaToken, verifyTelegramInitData } from '../src/worker/auth.js';
import {
  generateInlineChallenge,
  generateStickerChallenge,
  handleTelegramUpdate,
  parseStickerQuizInput,
} from '../src/worker/bot.js';
import { getLeaderboard, getMemberTicket, performCheckin, resolveLevel } from '../src/worker/checkin.js';
import {
  DEFAULT_CONFIG,
  loadPanelConfig,
  resolveSupergroupId,
  savePanelConfig,
} from '../src/worker/config.js';
import worker from '../src/worker/index.js';
import { fetchKomariStatus, normalizeNodeMetrics } from '../src/worker/komari.js';
import { normalizeStickerObject, parseStickerPackName } from '../src/worker/telegram.js';
import { renderTurnstileVerifyPage } from '../src/worker/turnstile.js';
import {
  applyVisitorAction,
  clearVisitorHistory,
  extractLinksFromMessage,
  extractPhotoFromMessage,
  getVisitorDetail,
  getVisitorHistory,
  getVisitorOverview,
  listVisitors,
  recordVisitorExchange,
  upsertVisitorProfile,
} from '../src/worker/visitors.js';

// Minimal in-memory Cloudflare KV mock
function createMemoryKV() {
  const store = new Map();
  return {
    store,
    async get(key, opts) {
      if (!store.has(key)) return null;
      const raw = store.get(key);
      if (opts === 'json' || opts?.type === 'json') {
        return JSON.parse(raw);
      }
      return raw;
    },
    async put(key, value) {
      store.set(key, String(value));
    },
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix = '', limit = 1000 } = {}) {
      const keys = [];
      for (const name of store.keys()) {
        if (name.startsWith(prefix)) keys.push({ name });
        if (keys.length >= limit) break;
      }
      return { keys, list_complete: true };
    },
  };
}

// Helper to sign valid Telegram WebApp initData for tests
async function signInitData(fields, botToken) {
  const enc = new TextEncoder();
  const params = new URLSearchParams();
  Object.entries(fields).forEach(([k, v]) => params.set(k, v));

  const pairs = Array.from(params.entries()).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

  const key1 = await crypto.subtle.importKey(
    'raw',
    enc.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const secretKey = new Uint8Array(await crypto.subtle.sign('HMAC', key1, enc.encode(botToken)));

  const key2 = await crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const hashBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key2, enc.encode(dataCheckString)));
  const hashHex = Array.from(hashBytes, (b) => b.toString(16).padStart(2, '0')).join('');

  params.set('hash', hashHex);
  return params.toString();
}

describe('Telegram Mini App initData verification', () => {
  const token = '123456:TEST_BOT_TOKEN_SECRET';

  it('verifies legitimately signed initData and parses user + start_param', async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = await signInitData(
      {
        auth_date: String(now),
        query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
        start_param: 'visitor_998877',
        user: JSON.stringify({ id: 10001, first_name: 'Rose', username: 'rose_owner' }),
      },
      token
    );

    const res = await verifyTelegramInitData(initData, token);
    expect(res.ok).toBe(true);
    expect(res.user.id).toBe(10001);
    expect(res.startParam).toBe('visitor_998877');
  });

  it('rejects tampered initData signature', async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = await signInitData(
      {
        auth_date: String(now),
        user: JSON.stringify({ id: 10001, first_name: 'Rose' }),
      },
      token
    );
    const tampered = initData.replace('10001', '99999');
    const res = await verifyTelegramInitData(tampered, token);
    expect(res.ok).toBe(false);
  });

  it('rejects expired initData', async () => {
    const old = Math.floor(Date.now() / 1000) - 90000;
    const initData = await signInitData(
      {
        auth_date: String(old),
        user: JSON.stringify({ id: 10001, first_name: 'Rose' }),
      },
      token
    );
    const res = await verifyTelegramInitData(initData, token, 3600);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('expired');
  });
});

describe('Group check-in, streaks, levels and badges', () => {
  it('handles daily check-in idempotency, streaks, early bird badge, and leaderboard', async () => {
    const env = { TOPIC_MAP: createMemoryKV() };
    const cfg = { ...DEFAULT_CONFIG.community, enableCheckin: true, dailyMinPoints: 20, dailyMaxPoints: 20, streakStepBonus: 5 };
    const user = { id: 55501, first_name: 'Alice', username: 'alice_tg' };

    // Day 1 at 06:30 UTC+8 (22:30 UTC previous day) -> unlocks first_checkin + early_bird
    const day1 = new Date('2026-11-20T22:30:00Z');
    const r1 = await performCheckin(env, user, cfg, day1);
    expect(r1.alreadyCheckedIn).toBe(false);
    expect(r1.gained).toBe(20);
    expect(r1.ticket.streak).toBe(1);
    expect(r1.newlyUnlocked.map((b) => b.id)).toContain('first_checkin');
    expect(r1.newlyUnlocked.map((b) => b.id)).toContain('early_bird');

    // Same day repeat -> idempotent
    const r1Repeat = await performCheckin(env, user, cfg, new Date('2026-11-21T04:00:00Z'));
    expect(r1Repeat.alreadyCheckedIn).toBe(true);
    expect(r1Repeat.gained).toBe(0);

    // Day 2 -> streak 2, +5 bonus => 25 pts
    const r2 = await performCheckin(env, user, cfg, new Date('2026-11-22T02:00:00Z'));
    expect(r2.ticket.streak).toBe(2);
    expect(r2.gained).toBe(25);

    // Day 3 -> streak 3, unlocks streak_3 badge
    const r3 = await performCheckin(env, user, cfg, new Date('2026-11-23T02:00:00Z'));
    expect(r3.ticket.streak).toBe(3);
    expect(r3.newlyUnlocked.map((b) => b.id)).toContain('streak_3');

    // Skip a day (Day 5) -> streak resets to 1, bestStreak stays 3
    const r5 = await performCheckin(env, user, cfg, new Date('2026-11-25T02:00:00Z'));
    expect(r5.ticket.streak).toBe(1);
    expect(r5.ticket.bestStreak).toBe(3);

    const board = await getLeaderboard(env, 10);
    expect(board.items).toHaveLength(1);
    expect(board.items[0].userId).toBe('55501');

    const lvl = resolveLevel(1350);
    expect(lvl.current.level).toBe(5);
    expect(lvl.current.title).toBe('知影人');
  });
});

describe('Visitor profiles & moderation (telegram_private_chatbot KV compatibility)', () => {
  it('reads legacy KV keys, supports ban/unban/trust/close/note and filtering', async () => {
    const kv = createMemoryKV();
    const env = { TOPIC_MAP: kv, SUPERGROUP_ID: '-1001234567890' };

    // Simulate a legacy user key created by telegram_private_chatbot v5.3
    await kv.put('user:77701', JSON.stringify({ thread_id: 42, closed: false }));
    await kv.put('verified:77701', 'turnstile:v1');

    // Plus a new enriched visitor
    await upsertVisitorProfile(
      env,
      { id: 88802, first_name: 'Bob', username: 'bob_dev', language_code: 'zh-hans' },
      { threadId: 99, incrementMsg: true, lastPreview: '你好，咨询合作' }
    );

    const listed = await listVisitors(env);
    expect(listed.stats.total).toBe(2);
    expect(listed.items.some((v) => v.userId === '77701')).toBe(true);
    expect(listed.items.some((v) => v.userId === '88802')).toBe(true);

    // Ban Bob -> writes exact `banned:88802 = "1"` key
    const bannedBob = await applyVisitorAction(env, '88802', 'ban');
    expect(bannedBob.isBanned).toBe(true);
    expect(await kv.get('banned:88802')).toBe('1');

    // Add note & filter
    await applyVisitorAction(env, '88802', 'note', { note: '广告推销号' });
    const bannedOnly = await listVisitors(env, { filter: 'banned', search: '广告' });
    expect(bannedOnly.items).toHaveLength(1);
    expect(bannedOnly.items[0].userId).toBe('88802');

    // Unban & Trust
    await applyVisitorAction(env, '88802', 'trust');
    const trustedBob = await getVisitorDetail(env, '88802');
    expect(trustedBob.isBanned).toBe(false);
    expect(trustedBob.isTrusted).toBe(true);
    expect(await kv.get('verified:88802')).toBe('trusted');

    // Single-key visitor overview cache hit & auto-invalidation on mutation
    const listSpy = vi.spyOn(kv, 'list');
    const ov1 = await getVisitorOverview(env);
    expect(ov1.stats.total).toBe(2);
    expect(ov1.cached).toBe(false);
    // Migration flag prevents future KV.list calls
    expect(listSpy).toHaveBeenCalledTimes(0);

    const ov2 = await getVisitorOverview(env);
    expect(ov2.cached).toBe(true);
    expect(ov2.stats.total).toBe(2);

    await applyVisitorAction(env, '88802', 'ban');
    const ov3 = await getVisitorOverview(env);
    expect(ov3.cached).toBe(false);
    expect(ov3.stats.banned).toBe(1);
  });
});

describe('Komari probe adapter', () => {
  it('normalizes Komari metrics accurately', () => {
    const node = normalizeNodeMetrics(
      {
        uuid: 'node-1',
        name: 'Tokyo Edge',
        region: '🇯🇵',
        tags: 'jp;bgp',
        mem_total: 2147483648,
        disk_total: 42949672960,
        os: 'Debian 12',
        arch: 'amd64',
      },
      {
        cpu: { usage: 18.44, load1: 0.35 },
        ram: { total: 2147483648, used: 1073741824 },
        disk: { total: 42949672960, used: 10737418240 },
        network: { up: 102400, down: 512000, totalUp: 1000000, totalDown: 2000000 },
        uptime: 86400,
      }
    );

    expect(node.online).toBe(true);
    expect(node.cpuUsage).toBe(18.4);
    expect(node.ramUsage).toBe(50);
    expect(node.diskUsage).toBe(25);
    expect(node.tags).toEqual(['jp', 'bgp']);
  });

  it('normalizes Komari v2 flat numeric RPC2 status fields (ram, disk, load, online)', () => {
    const node = normalizeNodeMetrics(
      {
        uuid: 'node-v2',
        name: 'Tokyo VPS',
        region: '🇯🇵',
        mem_total: 456126464,
        disk_total: 3227110400,
        os: 'Alpine Linux',
        arch: 'amd64',
      },
      {
        client: 'node-v2',
        cpu: 12.5,
        ram: 228063232,
        ram_total: 456126464,
        disk: 806777600,
        disk_total: 3227110400,
        load: 0.42,
        net_in: 436,
        net_out: 562,
        net_total_up: 5000,
        net_total_down: 6000,
        online: true,
        uptime: 4101474,
      }
    );

    expect(node.online).toBe(true);
    expect(node.cpuUsage).toBe(12.5);
    expect(node.ramUsed).toBe(228063232);
    expect(node.ramUsage).toBe(50);
    expect(node.diskUsed).toBe(806777600);
    expect(node.diskUsage).toBe(25);
    expect(node.load1).toBe(0.42);
    expect(node.netDown).toBe(436);
    expect(node.netUp).toBe(562);
  });

  it('detects redirect loops immediately without exhausting subrequests', async () => {
    const origFetch = globalThis.fetch;
    const mockFetch = vi.fn(async (url) => {
      return new Response(null, {
        status: 301,
        headers: { Location: url },
      });
    });
    globalThis.fetch = mockFetch;

    try {
      const env = { TOPIC_MAP: createMemoryKV() };
      const res = await fetchKomariStatus(env, {
        ...DEFAULT_CONFIG.probe,
        url: 'https://probe.example.com',
      });
      expect(res.protocol).toBe('error');
      expect(res.error).toContain('重定向循环');
      // Only 2 parallel RPC2 probes sent (no 20-hop loop, no wasted REST fallback)
      expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(2);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('returns demo nodes when demoMode is enabled without URL', async () => {
    const env = { TOPIC_MAP: createMemoryKV() };
    const status = await fetchKomariStatus(env, { ...DEFAULT_CONFIG.probe, demoMode: true, url: '' });
    expect(status.configured).toBe(true);
    expect(status.demo).toBe(true);
    expect(status.nodes.length).toBeGreaterThan(0);
    expect(status.summary.online).toBeGreaterThan(0);
  });

  it('fetches live Komari RPC2 nodes when endpoint responds', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.method === 'common:getNodes') {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: {
              'uuid-hk': { name: 'HK-01', region: '🇭🇰', mem_total: 1000, disk_total: 2000 },
            },
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          result: {
            'uuid-hk': {
              cpu: { usage: 22.5 },
              ram: { total: 1000, used: 400 },
              disk: { total: 2000, used: 500 },
              uptime: 3600,
            },
          },
        }),
        { status: 200 }
      );
    });

    try {
      const env = { TOPIC_MAP: createMemoryKV() };
      const res = await fetchKomariStatus(env, {
        ...DEFAULT_CONFIG.probe,
        url: 'https://probe.example.com',
      });
      expect(res.protocol).toBe('rpc2');
      expect(res.nodes).toHaveLength(1);
      expect(res.nodes[0].name).toBe('HK-01');
      expect(res.nodes[0].ramUsage).toBe(40);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('Worker API authorization & config masking', () => {
  const token = '987654:UNIT_TEST_BOT_TOKEN';

  it('blocks non-admin access to admin endpoints and allows admin config update with secret preservation', async () => {
    const env = {
      TOPIC_MAP: createMemoryKV(),
      BOT_TOKEN: token,
      ADMIN_IDS: '10001',
    };

    const now = Math.floor(Date.now() / 1000);
    const guestInit = await signInitData(
      { auth_date: String(now), user: JSON.stringify({ id: 20002, first_name: 'Guest' }) },
      token
    );
    const adminInit = await signInitData(
      { auth_date: String(now), user: JSON.stringify({ id: 10001, first_name: 'Rose' }) },
      token
    );

    // Health check
    const healthRes = await worker.fetch(new Request('https://example.workers.dev/health'), env);
    expect(healthRes.status).toBe(200);

    // Guest blocked from admin visitors
    const forbidden = await worker.fetch(
      new Request('https://example.workers.dev/api/admin/visitors', {
        headers: { 'X-Telegram-Init-Data': guestInit },
      }),
      env
    );
    expect(forbidden.status).toBe(403);

    // Admin saves config with secret Komari API key
    await savePanelConfig(env, { probe: { url: 'https://komari.test', apiKey: 'super-secret-key' } });

    // Admin reads masked config via bootstrap
    const bootRes = await worker.fetch(
      new Request('https://example.workers.dev/api/bootstrap', {
        headers: { 'X-Telegram-Init-Data': adminInit },
      }),
      env
    );
    const bootJson = await bootRes.json();
    expect(bootJson.ok).toBe(true);
    expect(bootJson.isAdmin).toBe(true);
    expect(bootJson.adminConfig.probe.apiKey).toBe('********');

    // Admin updates display name while sending masked apiKey back -> secret stays intact!
    await worker.fetch(
      new Request('https://example.workers.dev/api/admin/config', {
        method: 'PUT',
        headers: { 'X-Telegram-Init-Data': adminInit, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: { displayName: 'Rose Studio' },
          probe: { url: 'https://komari.test', apiKey: '********' },
        }),
      }),
      env
    );

    const persisted = await loadPanelConfig(env);
    expect(persisted.profile.displayName).toBe('Rose Studio');
    expect(persisted.probe.apiKey).toBe('super-secret-key');
  });

  it('strictly hides private sites from non-admin visitors while letting admin toggle visibility', async () => {
    const env = {
      TOPIC_MAP: createMemoryKV(),
      BOT_TOKEN: token,
      ADMIN_IDS: '10001',
    };

    await savePanelConfig(env, {
      sites: [
        { id: 'pub-1', name: '公开博客', url: 'https://blog.test', visibility: 'public' },
        { id: 'priv-1', name: '私密后台', url: 'https://secret.test', visibility: 'private' },
      ],
    });

    const now = Math.floor(Date.now() / 1000);
    const guestInit = await signInitData(
      { auth_date: String(now), user: JSON.stringify({ id: 20002, first_name: 'Guest' }) },
      token
    );
    const adminInit = await signInitData(
      { auth_date: String(now), user: JSON.stringify({ id: 10001, first_name: 'Rose' }) },
      token
    );

    // Guest bootstrap MUST NOT leak private sites or admin visitor data
    const guestBoot = await (
      await worker.fetch(
        new Request('https://example.workers.dev/api/bootstrap', {
          headers: { 'X-Telegram-Init-Data': guestInit },
        }),
        env
      )
    ).json();
    expect(guestBoot.config.sites.map((s) => s.id)).toEqual(['pub-1']);
    expect(guestBoot.visitorSummary).toBeNull();
    expect(guestBoot.recentVisitors).toEqual([]);
    expect(guestBoot.blockedSpamCount).toBe(0);

    // Admin bootstrap sees both public & private sites plus owner dashboard summary
    const adminBoot = await (
      await worker.fetch(
        new Request('https://example.workers.dev/api/bootstrap', {
          headers: { 'X-Telegram-Init-Data': adminInit },
        }),
        env
      )
    ).json();
    expect(adminBoot.config.sites.map((s) => s.id)).toEqual(['pub-1', 'priv-1']);
    expect(adminBoot.visitorSummary).toBeTruthy();
    expect(Array.isArray(adminBoot.recentVisitors)).toBe(true);
    expect(typeof adminBoot.blockedSpamCount).toBe('number');

    // Admin toggles pub-1 -> private via quick toggle endpoint
    const toggled = await (
      await worker.fetch(
        new Request('https://example.workers.dev/api/admin/sites/toggle', {
          method: 'POST',
          headers: { 'X-Telegram-Init-Data': adminInit, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: 'pub-1', visibility: 'private' }),
        }),
        env
      )
    ).json();
    expect(toggled.ok).toBe(true);
    expect(toggled.config.sites.find((s) => s.id === 'pub-1').visibility).toBe('private');

    // Now guest sees zero sites
    const guestBootAfter = await (
      await worker.fetch(
        new Request('https://example.workers.dev/api/bootstrap', {
          headers: { 'X-Telegram-Init-Data': guestInit },
        }),
        env
      )
    ).json();
    expect(guestBootAfter.config.sites).toHaveLength(0);

    // Private probe visibility hides probe from guest and blocks /api/probe with 403
    await savePanelConfig(env, {
      probe: { url: 'https://komari.internal', visibility: 'private' },
      profile: { splash: { style: 'emoji', emoji: '✨', text: '欢迎光临' } },
    });
    const guestPrivProbeBoot = await (
      await worker.fetch(
        new Request('https://example.workers.dev/api/bootstrap', {
          headers: { 'X-Telegram-Init-Data': guestInit },
        }),
        env
      )
    ).json();
    expect(guestPrivProbeBoot.config.probe.configured).toBe(false);
    expect(guestPrivProbeBoot.config.probe.publicUrl).toBe('');
    expect(guestPrivProbeBoot.config.profile.splash).toEqual({
      style: 'emoji',
      emoji: '✨',
      text: '欢迎光临',
    });

    const guestProbeDenied = await worker.fetch(
      new Request('https://example.workers.dev/api/probe', {
        headers: { 'X-Telegram-Init-Data': guestInit },
      }),
      env
    );
    expect(guestProbeDenied.status).toBe(403);

    // Worker injects safe __ROSE_SPLASH__ payload into HTML responses on /
    const envWithAssets = {
      ...env,
      ASSETS: {
        async fetch() {
          return new Response('<!doctype html><html><head><title>App</title></head><body></body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        },
      },
    };
    const htmlRes = await worker.fetch(new Request('https://example.workers.dev/'), envWithAssets);
    const htmlBody = await htmlRes.text();
    expect(htmlBody).toContain('window.__ROSE_SPLASH__=');
    expect(htmlBody).toContain('欢迎光临');
  });
});

describe('Telegram sticker pack parser & metadata normalizer', () => {
  it('parses addstickers, addemoji URLs and plain names', () => {
    expect(parseStickerPackName('https://t.me/addstickers/RoseBadges')).toBe('RoseBadges');
    expect(parseStickerPackName('https://t.me/addemoji/My_Emoji_Pack_2026')).toBe('My_Emoji_Pack_2026');
    expect(parseStickerPackName('CustomPack123')).toBe('CustomPack123');
    expect(parseStickerPackName('https://example.com/nope')).toBe('');
  });

  it('normalizes webp, webm, and animated tgs sticker formats', () => {
    expect(normalizeStickerObject({ file_id: 'f1', is_animated: true, emoji: '✨' }).format).toBe('tgs');
    expect(normalizeStickerObject({ file_id: 'f2', is_video: true, emoji: '🌸' }).format).toBe('webm');
    expect(normalizeStickerObject({ file_id: 'f3', emoji: '🎀' }).format).toBe('webp');
  });
});

describe('Visitor bidirectional archive, signed media proxy & clear history', () => {
  it('extracts photos & links from both directions, signs media tokens, and clears archive/full topic', async () => {
    const kv = createMemoryKV();
    const env = {
      TOPIC_MAP: kv,
      BOT_TOKEN: '111222:MEDIA_TEST_SECRET',
      SUPERGROUP_ID: '-100999888',
      ADMIN_IDS: '10001',
    };

    await upsertVisitorProfile(env, { id: 30003, first_name: 'Clara', username: 'clara_tg' }, { threadId: 77 });

    // Visitor sends a photo with caption link
    const visitorPhotoMsg = {
      message_id: 501,
      photo: [
        { file_id: 'thumb_file_id_1234567890' },
        { file_id: 'full_file_id_123456789012' },
      ],
      caption: '看一下这个 https://example.com/demo 和 t.me/Rose202_bot',
    };
    expect(extractPhotoFromMessage(visitorPhotoMsg).fileId).toBe('full_file_id_123456789012');
    expect(extractLinksFromMessage(visitorPhotoMsg)).toEqual([
      'https://example.com/demo',
      'https://t.me/Rose202_bot',
    ]);

    await recordVisitorExchange(env, '30003', visitorPhotoMsg, {
      sender: 'visitor',
      pmMessageId: 501,
      preview: '[图片]',
    });

    // Admin replies with a text_link entity
    const adminReplyMsg = {
      message_id: 902,
      text: '点这里查看文档',
      entities: [{ type: 'text_link', offset: 0, length: 3, url: 'https://docs.example.org/guide' }],
    };
    await recordVisitorExchange(env, '30003', adminReplyMsg, {
      sender: 'admin',
      pmMessageId: 502,
      preview: '点这里查看文档',
    });

    const detail = await getVisitorDetail(env, '30003');
    expect(detail.msg_count).toBe(2);
    expect(detail.visitor_msg_count).toBe(1);
    expect(detail.admin_msg_count).toBe(1);
    expect(detail.photo_count).toBe(1);
    expect(detail.link_count).toBe(3);

    // Media token signing & tampering rejection
    const signed = await signMediaToken('full_file_id_123456789012', env.BOT_TOKEN, 600);
    expect(await verifyMediaToken('full_file_id_123456789012', signed.exp, signed.sig, env.BOT_TOKEN)).toBe(true);
    expect(await verifyMediaToken('other_file_id_000000000000', signed.exp, signed.sig, env.BOT_TOKEN)).toBe(false);

    // Full clear calls deleteMessages & deleteForumTopic and wipes counters/history
    const calls = [];
    const mockTgCall = vi.fn(async (_env, method, payload) => {
      calls.push({ method, payload });
      return { ok: true, result: true };
    });

    const cleared = await clearVisitorHistory(env, '30003', 'full', mockTgCall);
    expect(cleared.deletedTopic).toBe(true);
    expect(cleared.deletedPmCount).toBe(2);
    expect(cleared.visitor.msg_count).toBe(0);
    expect(cleared.visitor.photo_count).toBe(0);
    expect(cleared.visitor.link_count).toBe(0);
    expect(cleared.visitor.thread_id).toBeNull();
    expect((await getVisitorHistory(env, '30003')).photos).toHaveLength(0);
    expect(calls.map((c) => c.method)).toContain('deleteForumTopic');
    expect(calls.map((c) => c.method)).toContain('deleteMessages');
  });
});

describe('3-Mode Anti-Spam Verification (Emoji / Quiz / CF Turnstile)', () => {
  it('generates valid 3x3 Emoji challenges (with optional honeypot) and 2x2 Quiz challenges', () => {
    const emojiChal = generateInlineChallenge('emoji', 'vid123', true);
    expect(emojiChal.keyboard).toHaveLength(4); // 3 rows + 1 honeypot trap row
    expect(emojiChal.keyboard[3][0].callback_data).toBe('v:vid123:trap');
    expect(emojiChal.correctIndex).toBeGreaterThanOrEqual(0);
    expect(emojiChal.correctIndex).toBeLessThan(9);
    expect(emojiChal.keyboard.slice(0, 3).flat()[emojiChal.correctIndex].callback_data).toBe(
      `v:vid123:${emojiChal.correctIndex}`
    );

    const quizChal = generateInlineChallenge('quiz', 'vid456', false);
    expect(quizChal.keyboard).toHaveLength(2);
    expect(quizChal.keyboard.flat()).toHaveLength(4);
    expect(quizChal.correctIndex).toBeGreaterThanOrEqual(0);
    expect(quizChal.correctIndex).toBeLessThan(4);

    // Custom TG Sticker Quiz parser & generator (supports |, spaces, commas, newlines)
    const parsed = parseStickerQuizInput('这个表情在干嘛？ | 两条腿在晃 | 两个胳膊在晃 | 在睡觉 | 在吃饭');
    expect(parsed.question).toBe('这个表情在干嘛？');
    expect(parsed.answer).toBe('两条腿在晃');
    expect(parsed.wrong).toEqual(['两个胳膊在晃', '在睡觉', '在吃饭']);

    const parsedSpaces = parseStickerQuizInput('这个表情是什么情绪？ 惊讶 开心 生气 困了');
    expect(parsedSpaces.question).toBe('这个表情是什么情绪？');
    expect(parsedSpaces.answer).toBe('惊讶');
    expect(parsedSpaces.wrong).toEqual(['开心', '生气', '困了']);

    const sq = generateStickerChallenge(
      [{ id: 'sq1', fileId: 'CAAC_TEST_STICKER_123456', ...parsed }],
      'vid999',
      true
    );
    expect(sq.fileId).toBe('CAAC_TEST_STICKER_123456');
    expect(sq.keyboard[sq.keyboard.length - 1][0].callback_data).toBe('v:vid999:trap');
    const answerRowBtns = sq.keyboard.slice(0, -1).flat();
    expect(answerRowBtns[sq.correctIndex].text).toBe('两条腿在晃');
  });

  it('renders Cloudflare Turnstile strict verification page cleanly', async () => {
    const res = renderTurnstileVerifyPage('0xTEST_SITE_KEY', 'vid789');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('challenges.cloudflare.com/turnstile/v0/api.js');
    expect(html).toContain('0xTEST_SITE_KEY');
    expect(html).toContain('vid789');
  });
});

describe('4-Layer Intelligent Anti-Spam Shield', () => {
  it('de-obfuscates zero-width, full-width, and Cyrillic homoglyphs and flags photo flyers & keywords', () => {
    const norm = normalizeAntiSpamText('Ｕ\u200bＳ\u200bＤ\u200bＴ 换汇 t.mе/sсаm');
    expect(norm.zeroWidthCount).toBe(3);
    expect(norm.normalized).toContain('usdt');
    expect(norm.normalized).toContain('t.me/scam');

    const kwRisk = assessIncomingRisk(
      { text: '高薪兼职 Ｕ\u200bＳ\u200bＤ\u200bＴ 日结', from: { first_name: 'Alice' } },
      { blockedKeywords: 'USDT, 赌场, 机场' }
    );
    expect(kwRisk.isBlockedKeyword).toBe(true);
    expect(kwRisk.matchedKeyword).toBe('usdt');

    const flyerRisk = assessIncomingRisk(
      { photo: [{ file_id: 'flyer_123' }], from: { first_name: 'Promo' } },
      { blockUnverifiedMedia: true }
    );
    expect(flyerRisk.isHighRisk).toBe(true);
    expect(flyerRisk.isMedia).toBe(true);
    expect(flyerRisk.reasons).toContain('unverified_media');

    const cleanHuman = assessIncomingRisk(
      { text: '你好呀，请问你的项目怎么配置？', from: { first_name: '小明' } },
      { blockedKeywords: 'USDT, 赌场, 机场', blockUnverifiedMedia: true }
    );
    expect(cleanHuman.isBlockedKeyword).toBe(false);
    expect(cleanHuman.isHighRisk).toBe(false);
  });

  it('checks CAS blacklist with KV caching and fails open on network errors', async () => {
    const kv = createMemoryKV();
    const env = { TOPIC_MAP: kv };

    const spamFetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, result: { offenses: 3 } }), { status: 200 })
    );
    const r1 = await checkCasBlacklist(env, '999001', spamFetch);
    expect(r1.isSpammer).toBe(true);
    expect(await kv.get('cas:999001')).toBe('1');

    // Second lookup hits KV cache without calling fetch
    const r2 = await checkCasBlacklist(env, '999001', spamFetch);
    expect(r2.isSpammer).toBe(true);
    expect(r2.cached).toBe(true);
    expect(spamFetch).toHaveBeenCalledTimes(1);

    // Network error fails open cleanly
    const brokenFetch = vi.fn(async () => {
      throw new Error('network down');
    });
    const r3 = await checkCasBlacklist(env, '999002', brokenFetch);
    expect(r3.isSpammer).toBe(false);
  });
});

describe('One-click /bind & /unbind Forum Inbox binding', () => {
  it('allows authorized admin to bind and unbind a Forum supergroup while blocking strangers', async () => {
    const kv = createMemoryKV();
    const env = {
      TOPIC_MAP: kv,
      BOT_TOKEN: '123456:BIND_TEST_TOKEN',
      ADMIN_IDS: '10001',
    };

    const tgCalls = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init) => {
      const method = String(url).split('/').pop();
      const body = init?.body ? JSON.parse(init.body) : {};
      tgCalls.push({ method, body });
      if (method === 'getChat') {
        return new Response(JSON.stringify({ ok: true, result: { id: body.chat_id, is_forum: true, title: '通知群' } }), {
          status: 200,
        });
      }
      if (method === 'getMe') {
        return new Response(JSON.stringify({ ok: true, result: { id: 999, is_bot: true } }), { status: 200 });
      }
      if (method === 'getChatMember') {
        return new Response(
          JSON.stringify({ ok: true, result: { status: 'administrator', can_manage_topics: true } }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
    });

    try {
      // 1. Stranger attempting /bind is silently ignored
      await handleTelegramUpdate(
        {
          message: {
            message_id: 1,
            from: { id: 88888, first_name: 'Stranger' },
            chat: { id: -1005555555, type: 'supergroup', title: 'Hijack' },
            text: '/bind',
          },
        },
        env,
        'https://panel.test'
      );
      expect(await resolveSupergroupId(env)).toBe('');

      // 2. Admin running /bind in a Forum supergroup binds it to KV
      await handleTelegramUpdate(
        {
          message: {
            message_id: 2,
            from: { id: 10001, first_name: 'Owner' },
            chat: { id: -1007777888, type: 'supergroup', title: '通知群' },
            text: '/bind',
          },
        },
        env,
        'https://panel.test'
      );
      expect(await resolveSupergroupId(env)).toBe('-1007777888');
      expect(tgCalls.some((c) => c.method === 'sendMessage' && c.body.text?.includes('绑定成功'))).toBe(true);

      // 3. Admin running /unbind inside the bound supergroup clears the KV binding
      await handleTelegramUpdate(
        {
          message: {
            message_id: 3,
            from: { id: 10001, first_name: 'Owner' },
            chat: { id: -1007777888, type: 'supergroup', title: '通知群' },
            text: '/unbind',
          },
        },
        env,
        'https://panel.test'
      );
      expect(await resolveSupergroupId(env)).toBe('');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('Security hardening: webhook secret, /setup guard & DEV_PREVIEW scope', () => {
  const baseEnv = () => ({
    TOPIC_MAP: createMemoryKV(),
    BOT_TOKEN: '987654:UNIT_TEST_BOT_TOKEN',
    ADMIN_IDS: '10001',
    WEBHOOK_SECRET: 'unit-test-secret',
  });
  const forgedUpdate = JSON.stringify({
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 10001, type: 'private' },
      from: { id: 10001, is_bot: false, first_name: 'Fake' },
      text: '/start',
    },
  });

  it('rejects forged updates without or with wrong secret header on BOTH /webhook and legacy root /', async () => {
    for (const path of ['/webhook', '/']) {
      const missingRes = await worker.fetch(
        new Request(`https://example.workers.dev${path}`, { method: 'POST', body: forgedUpdate }),
        baseEnv()
      );
      expect(missingRes.status).toBe(401);

      const wrongRes = await worker.fetch(
        new Request(`https://example.workers.dev${path}`, {
          method: 'POST',
          headers: { 'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret' },
          body: forgedUpdate,
        }),
        baseEnv()
      );
      expect(wrongRes.status).toBe(401);
    }
  });

  it('refuses /setup when WEBHOOK_SECRET is missing (500) or mismatched (403)', async () => {
    const missingEnv = baseEnv();
    delete missingEnv.WEBHOOK_SECRET;
    const missingRes = await worker.fetch(new Request('https://example.workers.dev/setup'), missingEnv);
    expect(missingRes.status).toBe(500);
    expect((await missingRes.json()).ok).toBe(false);

    const wrongRes = await worker.fetch(
      new Request('https://example.workers.dev/setup?secret=wrong'),
      baseEnv()
    );
    expect(wrongRes.status).toBe(403);
    expect((await wrongRes.json()).ok).toBe(false);
  });

  it('ignores DEV_PREVIEW on public hosts and defaults localhost preview role to guest', async () => {
    const env = { ...baseEnv(), DEV_PREVIEW: 'true' };
    const publicAdmin = await worker.fetch(
      new Request('https://panel.example.com/api/admin/visitors', { headers: { 'X-Dev-Role': 'admin' } }),
      env
    );
    expect(publicAdmin.status).toBe(403);

    const publicBoot = await worker.fetch(
      new Request('https://panel.example.com/api/bootstrap', { headers: { 'X-Dev-Role': 'admin' } }),
      env
    );
    expect((await publicBoot.json()).isAdmin).toBe(false);

    const localGuest = await worker.fetch(new Request('http://localhost:8787/api/bootstrap'), env);
    expect((await localGuest.json()).isAdmin).toBe(false);

    const localAdmin = await worker.fetch(
      new Request('http://localhost:8787/api/bootstrap', { headers: { 'X-Dev-Role': 'admin' } }),
      env
    );
    expect((await localAdmin.json()).isAdmin).toBe(true);
  });
});
