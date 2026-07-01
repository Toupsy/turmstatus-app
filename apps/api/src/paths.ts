import { fileURLToPath } from 'node:url';

// Liegt bewusst auf src/-Ebene: sowohl in dev (src/paths.ts) als auch im
// tsup-Bundle (dist/server.js) zeigt `../migrations` auf apps/api/migrations.
export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
