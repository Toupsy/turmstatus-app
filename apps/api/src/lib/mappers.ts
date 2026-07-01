// ============================================================
// mappers.ts – DB-Zeilen → API-DTOs.
// ============================================================

import type { CurrentUser, UserDto, Role } from '@turmstatus/shared';
import type { UserRow } from '../db/schema.js';

export function toCurrentUser(row: UserRow): CurrentUser {
  return {
    userId: row.id,
    username: row.username,
    fullName: row.fullName,
    role: row.role as Role,
    towerId: row.towerId,
    ownerId: row.ownerId,
    isAdmin: row.isAdmin
  };
}

export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    role: row.role as Role,
    towerId: row.towerId,
    ownerId: row.ownerId,
    isAdmin: row.isAdmin,
    isActive: row.isActive,
    lastLogin: row.lastLogin,
    createdAt: row.createdAt
  };
}
