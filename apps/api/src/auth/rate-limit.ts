// ============================================================
// rate-limit.ts – einfacher In-Memory-Brute-Force-Schutz fürs Login.
// Max. N Fehlversuche pro Schlüssel (IP bzw. Benutzername) im Zeitfenster.
// ============================================================

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function isBlocked(key: string): boolean {
  const b = buckets.get(key);
  if (!b) return false;
  if (Date.now() > b.resetAt) {
    buckets.delete(key);
    return false;
  }
  return b.count >= MAX_ATTEMPTS;
}

export function registerFailure(key: string): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    b.count += 1;
  }
}

export function clearFailures(key: string): void {
  buckets.delete(key);
}
