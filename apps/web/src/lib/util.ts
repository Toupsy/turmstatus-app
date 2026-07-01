import type { AppConfig } from '@turmstatus/shared';

/** Label aus der Config nachschlagen (Fallback = Schlüssel). */
export function labelOf(config: AppConfig | null, category: keyof AppConfig, key: string): string {
  if (!config) return key;
  const cat = config[category] as Record<string, string> | undefined;
  return cat?.[key] ?? key;
}

/** UTC-Zeitstempel aus SQLite lokal formatieren. */
export function fmtTime(ts: string | null): string {
  if (!ts) return '–';
  // SQLite CURRENT_TIMESTAMP: 'YYYY-MM-DD HH:MM:SS' (UTC)
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
