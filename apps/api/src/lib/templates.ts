// ============================================================
// templates.ts – Beim Anlegen eines neuen Wachführers werden die vom Admin
// gepflegten Vorlagen (tower_templates/boat_templates) in dessen Scope geklont.
// Boote werden ohne Turm-Zuordnung übernommen (der WF ordnet sie selbst zu).
// ============================================================

import type { Db } from '../db/index.js';
import { towers, boats, towerTemplates, boatTemplates } from '../db/schema.js';

export function applyTemplates(db: Db, newOwnerId: number): void {
  const towerTpls = db.select().from(towerTemplates).all();
  for (const t of towerTpls) {
    db.insert(towers)
      .values({
        name: t.name,
        callSign: t.callSign,
        latitude: t.latitude,
        longitude: t.longitude,
        requiredStaff: t.requiredStaff,
        ownerId: newOwnerId
      })
      .run();
  }

  const boatTpls = db.select().from(boatTemplates).all();
  for (const b of boatTpls) {
    db.insert(boats)
      .values({
        name: b.name,
        callSign: b.callSign,
        status: b.status,
        latitude: b.latitude,
        longitude: b.longitude,
        towerId: null,
        ownerId: newOwnerId
      })
      .run();
  }
}
