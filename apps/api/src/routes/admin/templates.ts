import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  towerTemplateSchema,
  towerTemplateUpdateSchema,
  boatTemplateSchema,
  boatTemplateUpdateSchema,
  parsePositiveInt,
  type TowerTemplateDto,
  type BoatTemplateDto,
  type BoatStatus
} from '@turmstatus/shared';
import { towerTemplates, boatTemplates } from '../../db/schema.js';
import { parseBody } from '../../lib/validate.js';
import { recordAudit } from '../../lib/audit.js';

function towerDto(t: typeof towerTemplates.$inferSelect): TowerTemplateDto {
  return {
    id: t.id,
    name: t.name,
    callSign: t.callSign,
    latitude: t.latitude,
    longitude: t.longitude,
    requiredStaff: t.requiredStaff,
    createdAt: t.createdAt
  };
}
function boatDto(b: typeof boatTemplates.$inferSelect): BoatTemplateDto {
  return {
    id: b.id,
    name: b.name,
    callSign: b.callSign,
    status: b.status as BoatStatus,
    latitude: b.latitude,
    longitude: b.longitude,
    createdAt: b.createdAt
  };
}

export async function adminTemplateRoutes(app: FastifyInstance): Promise<void> {
  // --- Turm-Vorlagen ---
  app.get('/api/admin/tower-templates', async () => app.db.select().from(towerTemplates).all().map(towerDto));

  app.post('/api/admin/tower-templates', async (req, reply) => {
    const body = parseBody(towerTemplateSchema, req.body, reply);
    if (!body) return;
    const row = app.db
      .insert(towerTemplates)
      .values({
        name: body.name,
        callSign: body.callSign ?? null,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        requiredStaff: body.requiredStaff ?? 2
      })
      .returning()
      .get();
    recordAudit(req, 'admin.tower-template.create', 'tower_template', row.id);
    return reply.code(201).send(towerDto(row));
  });

  app.patch('/api/admin/tower-templates/:id', async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const body = parseBody(towerTemplateUpdateSchema, req.body, reply);
    if (!body) return;
    const existing = app.db.select().from(towerTemplates).where(eq(towerTemplates.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Vorlage nicht gefunden' });
    app.db
      .update(towerTemplates)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.callSign !== undefined && { callSign: body.callSign }),
        ...(body.latitude !== undefined && { latitude: body.latitude }),
        ...(body.longitude !== undefined && { longitude: body.longitude }),
        ...(body.requiredStaff !== undefined && { requiredStaff: body.requiredStaff })
      })
      .where(eq(towerTemplates.id, id))
      .run();
    recordAudit(req, 'admin.tower-template.update', 'tower_template', id);
    return { ok: true };
  });

  app.delete('/api/admin/tower-templates/:id', async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    app.db.delete(towerTemplates).where(eq(towerTemplates.id, id)).run();
    recordAudit(req, 'admin.tower-template.delete', 'tower_template', id);
    return { ok: true };
  });

  // --- Boot-Vorlagen ---
  app.get('/api/admin/boat-templates', async () => app.db.select().from(boatTemplates).all().map(boatDto));

  app.post('/api/admin/boat-templates', async (req, reply) => {
    const body = parseBody(boatTemplateSchema, req.body, reply);
    if (!body) return;
    const row = app.db
      .insert(boatTemplates)
      .values({
        name: body.name,
        callSign: body.callSign ?? null,
        status: body.status ?? 'AT_TOWER',
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null
      })
      .returning()
      .get();
    recordAudit(req, 'admin.boat-template.create', 'boat_template', row.id);
    return reply.code(201).send(boatDto(row));
  });

  app.patch('/api/admin/boat-templates/:id', async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    const body = parseBody(boatTemplateUpdateSchema, req.body, reply);
    if (!body) return;
    const existing = app.db.select().from(boatTemplates).where(eq(boatTemplates.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'Vorlage nicht gefunden' });
    app.db
      .update(boatTemplates)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.callSign !== undefined && { callSign: body.callSign }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.latitude !== undefined && { latitude: body.latitude }),
        ...(body.longitude !== undefined && { longitude: body.longitude })
      })
      .where(eq(boatTemplates.id, id))
      .run();
    recordAudit(req, 'admin.boat-template.update', 'boat_template', id);
    return { ok: true };
  });

  app.delete('/api/admin/boat-templates/:id', async (req, reply) => {
    const id = parsePositiveInt((req.params as { id: string }).id);
    if (!id) return reply.code(400).send({ error: 'Ungültige ID' });
    app.db.delete(boatTemplates).where(eq(boatTemplates.id, id)).run();
    recordAudit(req, 'admin.boat-template.delete', 'boat_template', id);
    return { ok: true };
  });
}
