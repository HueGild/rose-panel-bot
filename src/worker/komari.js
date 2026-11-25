// Komari Monitor adapter: supports both Komari v2 JSON-RPC (/api/rpc2)
// and Komari v1 REST (/api/nodes + /api/recent/{uuid}), plus demo preview data.

const PROBE_CACHE_KEY = 'cache:komari_probe';

function normalizeBaseUrl(rawUrl) {
  if (!rawUrl) return '';
  let url = String(rawUrl).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

function buildAuthHeaders(apiKey) {
  const headers = { Accept: 'application/json' };
  const key = String(apiKey || '').trim();
  if (!key) return headers;
  if (key.toLowerCase().startsWith('cookie:')) {
    headers.Cookie = key.slice(7).trim();
  } else if (key.includes('=')) {
    headers.Cookie = key;
  } else {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let currentUrl = url;
    let currentOptions = { ...options };
    const visited = new Set([currentUrl]);

    for (let hop = 0; hop <= 3; hop += 1) {
      const res = await fetch(currentUrl, {
        ...currentOptions,
        redirect: 'manual',
        signal: controller.signal,
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers?.get?.('location');
        if (!location) {
          throw new Error(`HTTP ${res.status}`);
        }
        const nextUrl = new URL(location, currentUrl).toString();
        if (visited.has(nextUrl)) {
          const loopErr = new Error(
            '检测到重定向循环：若探针与面板在同一 Cloudflare 域名下，请为探针子域将 SSL/TLS 模式从 Flexible 改为 Full'
          );
          loopErr.isRedirectLoop = true;
          throw loopErr;
        }
        visited.add(nextUrl);
        currentUrl = nextUrl;
        if (res.status === 301 || res.status === 302 || res.status === 303) {
          const method = String(currentOptions.method || 'GET').toUpperCase();
          if (method !== 'GET' && method !== 'HEAD') {
            currentOptions = { ...currentOptions, method: 'GET', body: undefined };
          }
        }
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    }

    const tooManyErr = new Error('重定向次数过多（超过 3 次）');
    tooManyErr.isRedirectLoop = true;
    throw tooManyErr;
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeNodeMetrics(nodeMeta = {}, status = {}) {
  const uuid = String(nodeMeta.uuid || status.uuid || status.client || nodeMeta.id || '');
  const cpuRaw = status?.cpu;
  const cpuUsage = Number(
    typeof cpuRaw === 'number'
      ? cpuRaw
      : cpuRaw?.usage ?? status?.cpu_usage ?? status?.cpu_percent ?? 0
  );

  const ramRaw = status?.ram;
  const ramTotal = Number(
    (typeof ramRaw === 'object' ? ramRaw?.total : undefined) ??
      status?.ram_total ??
      status?.mem?.total ??
      status?.mem_total ??
      nodeMeta?.mem_total ??
      0
  );
  const ramUsed = Number(
    typeof ramRaw === 'number'
      ? ramRaw
      : ramRaw?.used ?? status?.mem?.used ?? status?.ram_used ?? 0
  );
  const ramUsage = Number(
    (typeof ramRaw === 'object' ? ramRaw?.usage : undefined) ??
      (ramTotal > 0 ? (ramUsed / ramTotal) * 100 : 0)
  );

  const diskRaw = status?.disk;
  const diskTotal = Number(
    (typeof diskRaw === 'object' ? diskRaw?.total : undefined) ??
      status?.disk_total ??
      nodeMeta?.disk_total ??
      0
  );
  const diskUsed = Number(
    typeof diskRaw === 'number'
      ? diskRaw
      : diskRaw?.used ?? status?.disk_used ?? 0
  );
  const diskUsage = Number(
    (typeof diskRaw === 'object' ? diskRaw?.usage : undefined) ??
      (diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0)
  );

  const net = status?.network || status?.net || {};
  const netUp = Number(net.up ?? net.tx_rate ?? status?.net_out ?? 0);
  const netDown = Number(net.down ?? net.rx_rate ?? status?.net_in ?? 0);
  const totalUp = Number(net.totalUp ?? net.tx_total ?? status?.net_total_up ?? 0);
  const totalDown = Number(net.totalDown ?? net.rx_total ?? status?.net_total_down ?? 0);

  const loadRaw = status?.load;
  const load1 = Number(
    typeof loadRaw === 'number'
      ? loadRaw
      : loadRaw?.load1 ?? status?.cpu?.load1 ?? status?.load1 ?? 0
  );
  const uptime = Number(status?.uptime ?? nodeMeta?.uptime ?? 0);

  const online =
    typeof status?.online === 'boolean'
      ? status.online
      : typeof nodeMeta?.online === 'boolean'
        ? nodeMeta.online
        : uptime > 0 || cpuUsage > 0 || ramUsed > 0;

  const rawTags = nodeMeta.tags || '';
  const tags = Array.isArray(rawTags)
    ? rawTags.filter(Boolean)
    : String(rawTags)
        .split(/[;,|]+/)
        .map((s) => s.trim())
        .filter(Boolean);

  return {
    uuid,
    name: nodeMeta.name || uuid || 'Unnamed Node',
    region: nodeMeta.region || '',
    group: nodeMeta.group || '',
    tags,
    online,
    os: nodeMeta.os || '',
    arch: nodeMeta.arch || '',
    virtualization: nodeMeta.virtualization || '',
    cpuName: nodeMeta.cpu_name || '',
    cpuCores: Number(nodeMeta.cpu_cores || 0),
    cpuUsage: roundPct(cpuUsage),
    ramTotal,
    ramUsed,
    ramUsage: roundPct(ramUsage),
    diskTotal,
    diskUsed,
    diskUsage: roundPct(diskUsage),
    netUp,
    netDown,
    totalUp,
    totalDown,
    load1: Number.isFinite(load1) ? Number(load1.toFixed(2)) : 0,
    uptime,
    updatedAt: status?.updated_at || status?.time || nodeMeta?.updated_at || null,
  };
}

function roundPct(n) {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, Number(n.toFixed(1)));
}

/**
 * Komari v2 JSON-RPC 2.0 adapter (/api/rpc2)
 */
async function fetchViaKomariRpc2(baseUrl, headers) {
  const rpcUrl = `${baseUrl}/api/rpc2`;
  const [nodesRes, statusRes] = await Promise.all([
    fetchJsonWithTimeout(rpcUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'common:getNodes', params: {}, id: 1 }),
    }),
    fetchJsonWithTimeout(rpcUrl, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'common:getNodesLatestStatus', params: {}, id: 2 }),
    }),
  ]);

  if (nodesRes?.error) {
    throw new Error(nodesRes.error.message || 'Komari RPC2 error');
  }

  const rawNodes = nodesRes?.result;
  const statusMap = statusRes?.result || {};
  const nodeList = Array.isArray(rawNodes)
    ? rawNodes
    : rawNodes && typeof rawNodes === 'object'
      ? Object.entries(rawNodes).map(([uuid, meta]) => ({ uuid, ...meta }))
      : [];

  return nodeList.map((node) => {
    const latest = statusMap?.[node.uuid] || {};
    return normalizeNodeMetrics(node, latest);
  });
}

/**
 * Komari v1 REST adapter (/api/nodes + /api/recent/{uuid})
 */
async function fetchViaKomariRest(baseUrl, headers) {
  const nodesJson = await fetchJsonWithTimeout(`${baseUrl}/api/nodes`, {
    method: 'GET',
    headers,
  });

  const rawNodes = Array.isArray(nodesJson) ? nodesJson : nodesJson?.data || [];
  if (!Array.isArray(rawNodes)) {
    throw new Error('Unexpected /api/nodes response');
  }

  // Fetch recent metrics for up to 24 nodes concurrently to stay well within Worker subrequest limits
  const cappedNodes = rawNodes.slice(0, 24);
  const enriched = await Promise.all(
    cappedNodes.map(async (node) => {
      if (!node.uuid) return normalizeNodeMetrics(node, {});
      try {
        const recentJson = await fetchJsonWithTimeout(
          `${baseUrl}/api/recent/${encodeURIComponent(node.uuid)}`,
          { method: 'GET', headers },
          4000
        );
        const rawData = recentJson?.data ?? recentJson;
        const latest = Array.isArray(rawData) ? rawData[rawData.length - 1] || {} : rawData || {};
        return normalizeNodeMetrics(node, latest);
      } catch {
        return normalizeNodeMetrics(node, {});
      }
    })
  );

  return enriched;
}

export function getDemoKomariNodes() {
  return [
    {
      uuid: 'demo-jp-tyo',
      name: 'Tokyo · Rose Edge',
      region: '🇯🇵',
      group: '亚太节点',
      tags: ['JP', 'BGP'],
      online: true,
      os: 'Debian 12',
      arch: 'amd64',
      virtualization: 'KVM',
      cpuName: 'AMD EPYC 7763',
      cpuCores: 2,
      cpuUsage: 14.8,
      ramTotal: 2 * 1024 ** 3,
      ramUsed: 0.78 * 1024 ** 3,
      ramUsage: 39.0,
      diskTotal: 40 * 1024 ** 3,
      diskUsed: 12.4 * 1024 ** 3,
      diskUsage: 31.0,
      netUp: 420 * 1024,
      netDown: 1.85 * 1024 ** 2,
      totalUp: 486 * 1024 ** 3,
      totalDown: 612 * 1024 ** 3,
      load1: 0.24,
      uptime: 48 * 86400 + 11400,
      updatedAt: new Date().toISOString(),
    },
    {
      uuid: 'demo-hk-cmi',
      name: 'HongKong · Media',
      region: '🇭🇰',
      group: '亚太节点',
      tags: ['HK', 'CMI'],
      online: true,
      os: 'Ubuntu 24.04',
      arch: 'amd64',
      virtualization: 'KVM',
      cpuName: 'Intel Xeon Platinum',
      cpuCores: 4,
      cpuUsage: 32.4,
      ramTotal: 4 * 1024 ** 3,
      ramUsed: 2.31 * 1024 ** 3,
      ramUsage: 57.8,
      diskTotal: 80 * 1024 ** 3,
      diskUsed: 41.2 * 1024 ** 3,
      diskUsage: 51.5,
      netUp: 2.6 * 1024 ** 2,
      netDown: 1.1 * 1024 ** 2,
      totalUp: 1.42 * 1024 ** 4,
      totalDown: 980 * 1024 ** 3,
      load1: 0.68,
      uptime: 21 * 86400 + 3600,
      updatedAt: new Date().toISOString(),
    },
    {
      uuid: 'demo-us-lax',
      name: 'Los Angeles · Vault',
      region: '🇺🇸',
      group: '欧美节点',
      tags: ['US', 'Storage'],
      online: true,
      os: 'Debian 12',
      arch: 'amd64',
      virtualization: 'KVM',
      cpuName: 'AMD Ryzen 9',
      cpuCores: 2,
      cpuUsage: 7.2,
      ramTotal: 2 * 1024 ** 3,
      ramUsed: 0.62 * 1024 ** 3,
      ramUsage: 31.0,
      diskTotal: 120 * 1024 ** 3,
      diskUsed: 54.0 * 1024 ** 3,
      diskUsage: 45.0,
      netUp: 128 * 1024,
      netDown: 310 * 1024,
      totalUp: 220 * 1024 ** 3,
      totalDown: 340 * 1024 ** 3,
      load1: 0.11,
      uptime: 92 * 86400,
      updatedAt: new Date().toISOString(),
    },
    {
      uuid: 'demo-de-fra',
      name: 'Frankfurt · Backup',
      region: '🇩🇪',
      group: '欧美节点',
      tags: ['DE', 'Backup'],
      online: false,
      os: 'Alpine Linux',
      arch: 'arm64',
      virtualization: 'KVM',
      cpuName: 'Ampere Altra',
      cpuCores: 2,
      cpuUsage: 0,
      ramTotal: 4 * 1024 ** 3,
      ramUsed: 0,
      ramUsage: 0,
      diskTotal: 60 * 1024 ** 3,
      diskUsed: 18 * 1024 ** 3,
      diskUsage: 30.0,
      netUp: 0,
      netDown: 0,
      totalUp: 88 * 1024 ** 3,
      totalDown: 105 * 1024 ** 3,
      load1: 0,
      uptime: 0,
      updatedAt: null,
    },
  ];
}

function summarizeNodes(nodes) {
  const total = nodes.length;
  const online = nodes.filter((n) => n.online).length;
  const activeNodes = nodes.filter((n) => n.online);
  const avgCpu =
    activeNodes.length > 0
      ? Number((activeNodes.reduce((s, n) => s + n.cpuUsage, 0) / activeNodes.length).toFixed(1))
      : 0;
  const totalRam = nodes.reduce((s, n) => s + n.ramTotal, 0);
  const usedRam = activeNodes.reduce((s, n) => s + n.ramUsed, 0);
  const totalNetUp = activeNodes.reduce((s, n) => s + n.netUp, 0);
  const totalNetDown = activeNodes.reduce((s, n) => s + n.netDown, 0);

  return {
    total,
    online,
    offline: total - online,
    avgCpu,
    totalRam,
    usedRam,
    ramUsage: totalRam > 0 ? roundPct((usedRam / totalRam) * 100) : 0,
    totalNetUp,
    totalNetDown,
  };
}

export async function fetchKomariStatus(env, probeConfig, options = {}) {
  const { forceRefresh = false } = options;

  if (probeConfig.demoMode && !probeConfig.url) {
    const nodes = getDemoKomariNodes();
    return {
      configured: true,
      demo: true,
      protocol: 'demo',
      fetchedAt: new Date().toISOString(),
      publicUrl: probeConfig.publicUrl || '',
      summary: summarizeNodes(nodes),
      nodes,
    };
  }

  const baseUrl = normalizeBaseUrl(probeConfig.url);
  if (!baseUrl) {
    return {
      configured: false,
      demo: false,
      protocol: 'none',
      fetchedAt: new Date().toISOString(),
      publicUrl: probeConfig.publicUrl || '',
      summary: summarizeNodes([]),
      nodes: [],
    };
  }

  // Short KV cache to avoid hammering the user's Komari instance
  if (!forceRefresh && env.TOPIC_MAP) {
    try {
      const cached = await env.TOPIC_MAP.get(PROBE_CACHE_KEY, { type: 'json' });
      if (cached && cached.sourceUrl === baseUrl && Date.now() - cached.cachedAt < (probeConfig.cacheTtlSeconds || 15) * 1000) {
        return { ...cached.payload, cached: true };
      }
    } catch {
      // Ignore cache read failures
    }
  }

  const headers = buildAuthHeaders(probeConfig.apiKey);
  let nodes = null;
  let protocol = 'rpc2';
  let lastError = null;

  try {
    nodes = await fetchViaKomariRpc2(baseUrl, headers);
  } catch (err) {
    lastError = err;
    if (err?.isRedirectLoop) {
      return {
        configured: true,
        demo: false,
        protocol: 'error',
        error: `无法连接 Komari 探针 (${err.message})`,
        fetchedAt: new Date().toISOString(),
        publicUrl: probeConfig.publicUrl || baseUrl,
        summary: summarizeNodes([]),
        nodes: [],
      };
    }
    protocol = 'rest';
    try {
      nodes = await fetchViaKomariRest(baseUrl, headers);
    } catch (restErr) {
      return {
        configured: true,
        demo: false,
        protocol: 'error',
        error: `无法连接 Komari 探针 (${lastError?.message || ''} / ${restErr?.message || ''})`,
        fetchedAt: new Date().toISOString(),
        publicUrl: probeConfig.publicUrl || baseUrl,
        summary: summarizeNodes([]),
        nodes: [],
      };
    }
  }

  // Sort online nodes first, then alphabetically
  nodes.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));

  const payload = {
    configured: true,
    demo: false,
    protocol,
    fetchedAt: new Date().toISOString(),
    publicUrl: probeConfig.publicUrl || baseUrl,
    summary: summarizeNodes(nodes),
    nodes,
  };

  if (env.TOPIC_MAP) {
    try {
      await env.TOPIC_MAP.put(
        PROBE_CACHE_KEY,
        JSON.stringify({ sourceUrl: baseUrl, cachedAt: Date.now(), payload }),
        { expirationTtl: Math.max(60, probeConfig.cacheTtlSeconds || 15) }
      );
    } catch {
      // KV write quota or read-only preview fallback
    }
  }

  return payload;
}
