// ============================================================
// env.ts – Laufzeit-Konfiguration aus Umgebungsvariablen (validiert).
// ============================================================

export interface Env {
  nodeEnv: string;
  isProd: boolean;
  isTest: boolean;
  host: string;
  port: number;
  adminPort: number;
  adminBind: string;
  databasePath: string;
  sessionSecret: string;
  cookieSecure: boolean;
  trustProxy: boolean | number;
  bcryptRounds: number;
  registrationMode: 'disabled' | 'open' | 'code';
  registrationCode: string | null;
  adminUsername: string;
  adminPassword: string | null;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseTrustProxy(value: string | undefined): boolean | number {
  if (value === undefined || value === '') return 1;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const n = Number(value);
  return Number.isFinite(n) ? n : 1;
}

export function loadEnv(): Env {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProd = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  const sessionSecret =
    process.env.SESSION_SECRET ?? (isTest ? 'test-session-secret-please-change-01234567' : '');
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET fehlt oder ist zu kurz (min. 32 Zeichen).');
  }

  // COOKIE_SECURE hat immer Vorrang; nur wenn nicht gesetzt gilt production als Default.
  const cookieSecureRaw = process.env.COOKIE_SECURE;
  const cookieSecure = cookieSecureRaw === undefined ? isProd : cookieSecureRaw === 'true';

  const registrationMode = (process.env.REGISTRATION_MODE ?? 'disabled') as Env['registrationMode'];

  return {
    nodeEnv,
    isProd,
    isTest,
    host: process.env.HOST ?? '0.0.0.0',
    port: num(process.env.PORT, 3002),
    adminPort: num(process.env.ADMIN_PORT, 3003),
    adminBind: process.env.ADMIN_BIND ?? '127.0.0.1',
    databasePath: process.env.DATABASE_PATH ?? './data/turmstatus.db',
    sessionSecret,
    cookieSecure,
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    bcryptRounds: num(process.env.BCRYPT_ROUNDS, isTest ? 4 : 10),
    registrationMode: ['disabled', 'open', 'code'].includes(registrationMode) ? registrationMode : 'disabled',
    registrationCode: process.env.REGISTRATION_CODE ?? null,
    adminUsername: process.env.ADMIN_USERNAME ?? 'hauptwache',
    adminPassword: process.env.ADMIN_PASSWORD ?? null
  };
}
