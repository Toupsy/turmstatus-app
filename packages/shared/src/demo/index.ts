// ============================================================
// demo/index.ts – Demo-Modus-Kern (Cloudflare-Preview ohne Backend).
// Bewusst NICHT aus packages/shared/src/index.ts re-exportiert, damit der
// API-Bundle (tsup, noExternal) die Demo-Logik nicht mit einpackt.
// Import in den SPAs: `@turmstatus/shared/demo`.
// ============================================================

export * from './types.js';
export * from './seed.js';
export * from './views.js';
export * from './handler.js';
