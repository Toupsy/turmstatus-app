import type { FastifyInstance } from 'fastify';
import { config } from '@turmstatus/shared';
import { APP_VERSION, RELEASE_REPO } from '../version.js';

interface VersionCache {
  latest: string | null;
  releaseUrl: string | null;
  fetchedAt: number;
}
let versionCache: VersionCache | null = null;
const SIX_HOURS = 6 * 60 * 60 * 1000;

async function fetchLatest(): Promise<VersionCache> {
  if (versionCache && Date.now() - versionCache.fetchedAt < SIX_HOURS) return versionCache;
  const fresh: VersionCache = { latest: null, releaseUrl: null, fetchedAt: Date.now() };
  try {
    const res = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'turmstatus' },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = (await res.json()) as { tag_name?: string; html_url?: string };
      fresh.latest = (data.tag_name ?? '').replace(/^v/, '') || null;
      fresh.releaseUrl = data.html_url ?? null;
    }
  } catch {
    /* Offline / Rate-Limit → einfach ohne latest zurück. */
  }
  versionCache = fresh;
  return fresh;
}

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/config', async () => config);

  app.get('/api/version', async () => {
    const { latest, releaseUrl } = await fetchLatest();
    const updateAvailable = latest !== null && latest !== APP_VERSION;
    return { version: APP_VERSION, latest, updateAvailable, releaseUrl };
  });
}
