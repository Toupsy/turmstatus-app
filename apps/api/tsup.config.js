import { defineConfig } from 'tsup';
export default defineConfig({
    entry: ['src/server.ts'],
    format: ['esm'],
    target: 'node20',
    outDir: 'dist',
    clean: true,
    sourcemap: true,
    // shared ist ein Workspace-Paket ohne eigenen JS-Build → in das Bundle ziehen.
    // fastify / better-sqlite3 / drizzle bleiben extern (liegen in node_modules).
    noExternal: [/@turmstatus\/shared/]
});
//# sourceMappingURL=tsup.config.js.map