// ============================================================
// schemas.ts – zod-Schemas für alle Request-Bodies.
// Server validiert damit; die SPAs können dieselben Schemas für Formulare nutzen.
// ============================================================

import { z } from 'zod';
import { ROLES, GUARD_STATUSES, BOAT_STATUSES, REASONS } from './config.js';

const username = z
  .string()
  .trim()
  .min(3, 'Benutzername zu kurz')
  .max(64)
  .regex(/^[a-zA-Z0-9_.-]+$/, 'Nur Buchstaben, Zahlen, . _ -');
const password = z.string().min(6, 'Passwort zu kurz (min. 6)').max(200);
const fullName = z.string().trim().max(120).optional();
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
const staff = z.number().int().min(0).max(99);
const callSign = z.string().trim().max(40).optional();
const name = z.string().trim().min(1, 'Name erforderlich').max(120);

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
  rememberMe: z.boolean().optional()
});

export const initSchema = z.object({ username, password, fullName });

export const registerSchema = z.object({
  username,
  password,
  fullName,
  code: z.string().trim().max(120).optional()
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password
});

// --- Türme ---
export const towerCreateSchema = z.object({
  name,
  callSign,
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  requiredStaff: staff.optional(),
  presentStaff: staff.optional()
});
export const towerUpdateSchema = towerCreateSchema.partial();

// --- Wachgänger ---
export const guardCreateSchema = z.object({
  name,
  towerId: z.number().int().positive().nullable().optional(),
  userId: z.number().int().positive().nullable().optional(),
  status: z.enum(GUARD_STATUSES).optional(),
  latitude: latitude.optional(),
  longitude: longitude.optional()
});
export const guardUpdateSchema = z.object({
  name: name.optional(),
  towerId: z.number().int().positive().nullable().optional()
});
export const guardStatusSchema = z.object({ status: z.enum(GUARD_STATUSES) });
export const positionSchema = z.object({ latitude, longitude });

// --- Boote ---
export const boatCreateSchema = z.object({
  name,
  callSign,
  towerId: z.number().int().positive().nullable().optional(),
  status: z.enum(BOAT_STATUSES).optional(),
  latitude: latitude.optional(),
  longitude: longitude.optional()
});
export const boatUpdateSchema = boatCreateSchema.partial();

// --- -1/+1-Workflow ---
export const minusOneSchema = z.object({
  guardId: z.number().int().positive(),
  reason: z.enum(REASONS),
  note: z.string().trim().max(500).optional()
});
export const rejectSchema = z.object({ rejectionReason: z.string().trim().max(500).optional() });

// --- Team (Wachführer verwaltet eigenes Personal) ---
export const teamMemberCreateSchema = z.object({
  username,
  password,
  fullName,
  role: z.enum(['WACHGAENGER', 'BOOTSFUEHRER']),
  towerId: z.number().int().positive().nullable().optional()
});
export const teamMemberUpdateSchema = z.object({
  fullName,
  role: z.enum(['WACHGAENGER', 'BOOTSFUEHRER']).optional(),
  isActive: z.boolean().optional(),
  towerId: z.number().int().positive().nullable().optional()
});

// --- Admin: Benutzer ---
export const adminUserCreateSchema = z.object({
  username,
  password,
  fullName,
  role: z.enum(ROLES),
  towerId: z.number().int().positive().nullable().optional(),
  isAdmin: z.boolean().optional()
});
export const adminUserUpdateSchema = z.object({
  fullName,
  role: z.enum(ROLES).optional(),
  towerId: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
  isAdmin: z.boolean().optional()
});
export const resetPasswordSchema = z.object({ password });

// --- Admin: Vorlagen ---
export const towerTemplateSchema = z.object({
  name,
  callSign,
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  requiredStaff: staff.optional()
});
export const towerTemplateUpdateSchema = towerTemplateSchema.partial();
export const boatTemplateSchema = z.object({
  name,
  callSign,
  status: z.enum(BOAT_STATUSES).optional(),
  latitude: latitude.optional(),
  longitude: longitude.optional()
});
export const boatTemplateUpdateSchema = boatTemplateSchema.partial();

export type LoginInput = z.infer<typeof loginSchema>;
export type TowerCreateInput = z.infer<typeof towerCreateSchema>;
export type BoatCreateInput = z.infer<typeof boatCreateSchema>;
export type GuardCreateInput = z.infer<typeof guardCreateSchema>;
export type MinusOneInput = z.infer<typeof minusOneSchema>;
export type TeamMemberCreateInput = z.infer<typeof teamMemberCreateSchema>;
export type AdminUserCreateInput = z.infer<typeof adminUserCreateSchema>;
