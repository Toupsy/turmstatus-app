// ============================================================
// seed.ts – Erststart-Seed: App-Admin (Hauptwache) anlegen, falls noch keiner existiert.
// Türme/Boote werden NICHT geseedet (ownerlos wären sie für keinen WF sichtbar);
// jeder Wachführer legt sein Eigenes an bzw. erbt die Admin-Vorlagen.
// ============================================================

import { eq } from 'drizzle-orm';
import type { Db } from './index.js';
import { users } from './schema.js';
import type { Env } from '../env.js';
import { hashPassword } from '../auth/password.js';
import { recordSystemAudit } from '../lib/audit.js';

export async function seedAdmin(db: Db, env: Env): Promise<void> {
  const existingAdmin = db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true)).get();
  if (existingAdmin) return;

  if (!env.adminPassword) {
    // Ohne Passwort kein Auto-Seed → der Erst-Setup-Flow (POST /api/auth/init) greift.
    return;
  }

  const existingName = db.select({ id: users.id }).from(users).where(eq(users.username, env.adminUsername)).get();
  if (existingName) return;

  const passwordHash = await hashPassword(env.adminPassword, env.bcryptRounds);
  const inserted = db
    .insert(users)
    .values({
      username: env.adminUsername,
      passwordHash,
      fullName: 'Hauptwache',
      role: 'HAUPTWACHE',
      isAdmin: true,
      isActive: true
    })
    .returning({ id: users.id })
    .get();

  recordSystemAudit(db, 'admin.seed', 'user', inserted.id, { username: env.adminUsername });
}
