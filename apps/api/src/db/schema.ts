// ============================================================
// schema.ts – Drizzle-Tabellen (SQLite). Zeitstempel sind UTC.
// ============================================================

import { sqliteTable, integer, text, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const now = sql`CURRENT_TIMESTAMP`;

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    fullName: text('full_name'),
    role: text('role').notNull().default('WACHGAENGER'),
    towerId: integer('tower_id'), // informative Stationierung
    ownerId: integer('owner_id'), // Mandant: Wachführer dieses Personals
    isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    lastLogin: text('last_login'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now)
  },
  (t) => [index('idx_users_owner').on(t.ownerId)]
);

export const towers = sqliteTable(
  'towers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    callSign: text('call_sign'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    requiredStaff: integer('required_staff').notNull().default(2),
    presentStaff: integer('present_staff').notNull().default(0),
    ownerId: integer('owner_id'),
    createdAt: text('created_at').notNull().default(now)
  },
  (t) => [index('idx_towers_owner').on(t.ownerId)]
);

export const guards = sqliteTable(
  'guards',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id'),
    towerId: integer('tower_id'),
    name: text('name').notNull(),
    status: text('status').notNull().default('IN_AREA'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    ownerId: integer('owner_id'),
    updatedAt: text('updated_at').notNull().default(now)
  },
  (t) => [index('idx_guards_owner').on(t.ownerId), index('idx_guards_tower').on(t.towerId)]
);

export const boats = sqliteTable(
  'boats',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    callSign: text('call_sign'),
    towerId: integer('tower_id'),
    status: text('status').notNull().default('AT_TOWER'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    ownerId: integer('owner_id'),
    updatedAt: text('updated_at').notNull().default(now)
  },
  (t) => [index('idx_boats_owner').on(t.ownerId), index('idx_boats_tower').on(t.towerId)]
);

export const minusOneRequests = sqliteTable(
  'minus_one_requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    guardId: integer('guard_id').notNull(),
    requestedBy: integer('requested_by').notNull(),
    reason: text('reason').notNull(),
    note: text('note'),
    status: text('status').notNull().default('PENDING'),
    rejectionReason: text('rejection_reason'),
    createdAt: text('created_at').notNull().default(now),
    decidedAt: text('decided_at'),
    decidedBy: integer('decided_by'),
    returnedAt: text('returned_at')
  },
  (t) => [index('idx_req_status').on(t.status), index('idx_req_guard').on(t.guardId)]
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: integer('entity_id'),
    details: text('details'),
    ipAddress: text('ip_address'),
    timestamp: text('timestamp').notNull().default(now)
  },
  (t) => [index('idx_audit_ts').on(t.timestamp)]
);

export const towerTemplates = sqliteTable('tower_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  callSign: text('call_sign'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  requiredStaff: integer('required_staff').notNull().default(2),
  createdAt: text('created_at').notNull().default(now)
});

export const boatTemplates = sqliteTable('boat_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  callSign: text('call_sign'),
  status: text('status').notNull().default('AT_TOWER'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  createdAt: text('created_at').notNull().default(now)
});

export const sessions = sqliteTable('sessions', {
  sid: text('sid').primaryKey(),
  sess: text('sess').notNull(),
  expire: integer('expire').notNull()
});

export type UserRow = typeof users.$inferSelect;
export type TowerRow = typeof towers.$inferSelect;
export type GuardRow = typeof guards.$inferSelect;
export type BoatRow = typeof boats.$inferSelect;
export type RequestRow = typeof minusOneRequests.$inferSelect;
