// In-app version checker (Scheme A) & optional GitHub Fork syncer (Scheme B).
// Strictly admin-only. Zero arbitrary URLs / zero SSRF: only talks to api.github.com.

import { APP_VERSION, UPSTREAM_REPO } from './version.js';

const RELEASE_CACHE_KEY = 'cache:latest_release';
const RELEASE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH_PATTERN = /^[A-Za-z0-9_.\-/]{1,64}$/;

/**
 * Compares two SemVer strings (e.g., "v1.4.0" vs "1.3.0").
 * Returns 1 if a > b, -1 if a < b, 0 if equal.
 */
export function compareSemver(a, b) {
  const parse = (v) =>
    String(v || '')
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .slice(0, 3)
      .map((n) => {
        const parsed = parseInt(n, 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      });
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff > 0) return 1;
    if (diff < 0) return -1;
  }
  return 0;
}

export function normalizeForkRepo(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  // Accept full GitHub URLs like https://github.com/user/rose-panel-bot(.git)
  s = s.replace(/^https?:\/\/(?:www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  return s;
}

export function validateForkRepo(raw) {
  const repo = normalizeForkRepo(raw);
  if (!repo) {
    return { ok: false, error: '请先填写你自己 Fork 的 GitHub 仓库（格式如 yourname/rose-panel-bot）' };
  }
  if (!REPO_PATTERN.test(repo) || repo.includes('..')) {
    return { ok: false, error: '仓库名格式不正确，请使用 owner/repo 格式（例如 yourname/rose-panel-bot）' };
  }
  if (repo.toLowerCase() === UPSTREAM_REPO.toLowerCase()) {
    return {
      ok: false,
      error: `你填写的是官方上游仓库（${UPSTREAM_REPO}），请改成你自己 Fork 的仓库名`,
    };
  }
  return { ok: true, repo };
}

export function validateBranchName(raw) {
  const branch = String(raw || 'main').trim() || 'main';
  if (!BRANCH_PATTERN.test(branch) || branch.includes('..') || branch.startsWith('/') || branch.endsWith('/')) {
    return { ok: false, error: '分支名格式不正确（默认请填 main）' };
  }
  return { ok: true, branch };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Scheme A: Read-only check against GitHub public latest release API (KV-cached 6h).
 */
export async function checkLatestRelease(env, options = {}) {
  const { forceRefresh = false } = options;

  if (!forceRefresh && env.TOPIC_MAP) {
    try {
      const cached = await env.TOPIC_MAP.get(RELEASE_CACHE_KEY, { type: 'json' });
      if (cached && cached.latestVersion && Date.now() - cached.cachedAt < RELEASE_CACHE_TTL_MS) {
        const hasUpdate = compareSemver(cached.latestVersion, APP_VERSION) > 0;
        return {
          ok: true,
          currentVersion: APP_VERSION,
          latestVersion: cached.latestVersion,
          hasUpdate,
          releaseName: cached.releaseName || cached.latestVersion,
          releaseUrl: cached.releaseUrl || `https://github.com/${UPSTREAM_REPO}/releases`,
          publishedAt: cached.publishedAt || null,
          notes: cached.notes || '',
          upstreamRepo: UPSTREAM_REPO,
          cached: true,
        };
      }
    } catch {
      // Ignore KV cache read error
    }
  }

  try {
    const res = await fetchWithTimeout(
      `https://api.github.com/repos/${UPSTREAM_REPO}/releases/latest`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'RosePanel-Bot-Updater',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      6000
    );

    if (!res.ok) {
      return {
        ok: false,
        currentVersion: APP_VERSION,
        latestVersion: null,
        hasUpdate: false,
        upstreamRepo: UPSTREAM_REPO,
        error:
          res.status === 403 || res.status === 429
            ? 'GitHub 公开接口请求较频繁，请稍后再试'
            : `检查更新失败 (HTTP ${res.status})`,
      };
    }

    const data = await res.json();
    const latestVersion = String(data?.tag_name || '').trim().replace(/^v/i, '');
    if (!latestVersion) {
      return {
        ok: false,
        currentVersion: APP_VERSION,
        latestVersion: null,
        hasUpdate: false,
        upstreamRepo: UPSTREAM_REPO,
        error: 'GitHub 未返回有效版本号',
      };
    }

    const releaseUrl = String(data?.html_url || `https://github.com/${UPSTREAM_REPO}/releases`);
    const releaseName = String(data?.name || `v${latestVersion}`);
    const publishedAt = data?.published_at || null;
    const notes = String(data?.body || '').trim().slice(0, 600);

    if (env.TOPIC_MAP) {
      try {
        await env.TOPIC_MAP.put(
          RELEASE_CACHE_KEY,
          JSON.stringify({
            latestVersion,
            releaseName,
            releaseUrl,
            publishedAt,
            notes,
            cachedAt: Date.now(),
          }),
          { expirationTtl: 21600 }
        );
      } catch {
        // Ignore KV cache write failures
      }
    }

    return {
      ok: true,
      currentVersion: APP_VERSION,
      latestVersion,
      hasUpdate: compareSemver(latestVersion, APP_VERSION) > 0,
      releaseName,
      releaseUrl,
      publishedAt,
      notes,
      upstreamRepo: UPSTREAM_REPO,
      cached: false,
    };
  } catch (err) {
    return {
      ok: false,
      currentVersion: APP_VERSION,
      latestVersion: null,
      hasUpdate: false,
      upstreamRepo: UPSTREAM_REPO,
      error: `无法连接 GitHub 检查更新 (${err?.message || 'network error'})`,
    };
  }
}

/**
 * Scheme B (Optional): Calls GitHub official `POST /repos/{owner}/{repo}/merge-upstream`
 * using the owner's single-repo Fine-grained Token so Cloudflare Git integration
 * automatically builds and deploys the new release.
 */
export async function syncForkWithUpstream(env, updaterConfig = {}) {
  const repoCheck = validateForkRepo(updaterConfig.forkRepo);
  if (!repoCheck.ok) {
    return { ok: false, status: 400, error: repoCheck.error };
  }

  const branchCheck = validateBranchName(updaterConfig.branch);
  if (!branchCheck.ok) {
    return { ok: false, status: 400, error: branchCheck.error };
  }

  const token = String(updaterConfig.githubToken || '').trim();
  if (!token) {
    return {
      ok: false,
      status: 400,
      error: '请先填入 GitHub Token（或直接点击上方「去 GitHub 手动同步」，无需 Token）',
    };
  }

  const [owner, repo] = repoCheck.repo.split('/');
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/merge-upstream`;

  try {
    const res = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'RosePanel-Bot-Updater',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ branch: branchCheck.branch }),
      },
      8000
    );

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      const mergeType = String(data?.merge_type || '');
      const alreadyLatest = mergeType === 'none';
      return {
        ok: true,
        status: 200,
        alreadyLatest,
        mergeType: mergeType || 'fast-forward',
        repo: repoCheck.repo,
        branch: branchCheck.branch,
        message: alreadyLatest
          ? `你的仓库 ${repoCheck.repo} (${branchCheck.branch}) 已经是最新代码，无需同步 ✅`
          : `🎉 已将 ${repoCheck.repo} (${branchCheck.branch}) 同步至最新上游代码！Cloudflare 通常会在 30~60 秒内自动完成构建上线。`,
      };
    }

    if (res.status === 409) {
      return {
        ok: false,
        status: 409,
        error: '检测到分支代码冲突，请前往 GitHub 网页端手动解决冲突后再同步',
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: res.status,
        error: 'GitHub Token 无效或权限不足（请确认 Fine-grained Token 已开启该仓库的 Contents: Read and write 权限）',
      };
    }
    if (res.status === 404 || res.status === 422) {
      return {
        ok: false,
        status: res.status,
        error: `未找到仓库 ${repoCheck.repo} 或该仓库不是从上游 Fork 的仓库（${data?.message || `HTTP ${res.status}`}）`,
      };
    }

    return {
      ok: false,
      status: res.status,
      error: `GitHub 同步失败 (HTTP ${res.status}${data?.message ? `: ${data.message}` : ''})`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: `无法连接 GitHub 同步接口 (${err?.message || 'network error'})`,
    };
  }
}
