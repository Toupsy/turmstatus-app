import { defineConfig } from 'drizzle-kit';
export default defineConfig({
    dialect: 'sqlite',
    schema: './src/db/schema.ts',
    out: './migrations'
});
//# sourceMappingURL=drizzle.config.js.map