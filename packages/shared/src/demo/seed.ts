// ============================================================
// demo/seed.ts – Beispieldatensatz für den Demo-Modus (Cloudflare-Preview).
// Zwei Mandanten (Wachführer Dahme + Kellenhusen) + App-Admin, damit die
// Mandanten-Isolation und die Admin-Gesamtsicht in der Demo sichtbar werden.
// ============================================================

import type { Role } from '../config.js';
import type { DemoDb, DemoUser } from './types.js';

export const DEMO_DB_VERSION = 1;

/** Feste Benutzer-IDs, auf die der Rollen-Umschalter der Demo zeigt. */
export const DEMO_ROLE_USER_IDS: Record<Role, number> = {
  HAUPTWACHE: 1,
  WACHFUEHRER: 2,
  WACHGAENGER: 3,
  BOOTSFUEHRER: 4
};

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

export function seedDemoDb(): DemoDb {
  const users: DemoUser[] = [
    { id: 1, username: 'admin', fullName: 'Hauptwache (App-Admin)', role: 'HAUPTWACHE', towerId: null, ownerId: null, isAdmin: true, isActive: true, lastLogin: minutesAgo(45), createdAt: minutesAgo(60 * 24 * 30) },
    { id: 2, username: 'wf.dahme', fullName: 'Frauke Petersen', role: 'WACHFUEHRER', towerId: null, ownerId: null, isAdmin: false, isActive: true, lastLogin: minutesAgo(20), createdAt: minutesAgo(60 * 24 * 30) },
    { id: 3, username: 'wg.jonas', fullName: 'Jonas Krüger', role: 'WACHGAENGER', towerId: 1, ownerId: 2, isAdmin: false, isActive: true, lastLogin: minutesAgo(90), createdAt: minutesAgo(60 * 24 * 20) },
    { id: 4, username: 'bf.mia', fullName: 'Mia Brandt', role: 'BOOTSFUEHRER', towerId: 1, ownerId: 2, isAdmin: false, isActive: true, lastLogin: minutesAgo(70), createdAt: minutesAgo(60 * 24 * 20) },
    { id: 5, username: 'wg.lena', fullName: 'Lena Voss', role: 'WACHGAENGER', towerId: 2, ownerId: 2, isAdmin: false, isActive: true, lastLogin: minutesAgo(200), createdAt: minutesAgo(60 * 24 * 18) },
    { id: 6, username: 'wg.tim', fullName: 'Tim Albers', role: 'WACHGAENGER', towerId: 2, ownerId: 2, isAdmin: false, isActive: true, lastLogin: minutesAgo(250), createdAt: minutesAgo(60 * 24 * 18) },
    { id: 7, username: 'wg.ole', fullName: 'Ole Petersen', role: 'WACHGAENGER', towerId: 3, ownerId: 2, isAdmin: false, isActive: true, lastLogin: null, createdAt: minutesAgo(60 * 24 * 10) },
    { id: 8, username: 'wf.kellenhusen', fullName: 'Sören Matthiesen', role: 'WACHFUEHRER', towerId: null, ownerId: null, isAdmin: false, isActive: true, lastLogin: minutesAgo(400), createdAt: minutesAgo(60 * 24 * 25) },
    { id: 9, username: 'wg.finn', fullName: 'Finn Lorenzen', role: 'WACHGAENGER', towerId: 4, ownerId: 8, isAdmin: false, isActive: true, lastLogin: null, createdAt: minutesAgo(60 * 24 * 9) }
  ];

  return {
    version: DEMO_DB_VERSION,
    nextId: 100, // Seed-IDs bleiben unter 100
    users,
    towers: [
      { id: 1, name: 'Turm 1 – Hauptstrand', callSign: 'Rettmar Dahme 1', latitude: 54.2168, longitude: 11.0928, requiredStaff: 2, presentStaff: 1, ownerId: 2, createdAt: minutesAgo(60 * 24 * 30) },
      { id: 2, name: 'Turm 2 – Südstrand', callSign: 'Rettmar Dahme 2', latitude: 54.2065, longitude: 11.0885, requiredStaff: 2, presentStaff: 0, ownerId: 2, createdAt: minutesAgo(60 * 24 * 30) },
      { id: 3, name: 'Turm 3 – Seebrücke', callSign: 'Rettmar Dahme 3', latitude: 54.2223, longitude: 11.0952, requiredStaff: 2, presentStaff: 0, ownerId: 2, createdAt: minutesAgo(60 * 24 * 30) },
      { id: 4, name: 'Turm 1 – Kellenhusen', callSign: 'Rettmar Kellenhusen 1', latitude: 54.1922, longitude: 11.0619, requiredStaff: 2, presentStaff: 0, ownerId: 8, createdAt: minutesAgo(60 * 24 * 25) }
    ],
    guards: [
      { id: 1, userId: 3, towerId: 1, name: 'Jonas Krüger', status: 'IN_AREA', latitude: 54.2166, longitude: 11.0931, ownerId: 2, updatedAt: minutesAgo(15) },
      { id: 2, userId: 4, towerId: 1, name: 'Mia Brandt', status: 'IN_AREA', latitude: 54.217, longitude: 11.0925, ownerId: 2, updatedAt: minutesAgo(30) },
      { id: 3, userId: 5, towerId: 2, name: 'Lena Voss', status: 'IN_AREA', latitude: 54.2066, longitude: 11.0888, ownerId: 2, updatedAt: minutesAgo(12) },
      { id: 4, userId: 6, towerId: 2, name: 'Tim Albers', status: 'MINUS_ONE', latitude: null, longitude: null, ownerId: 2, updatedAt: minutesAgo(8) },
      { id: 5, userId: 7, towerId: 3, name: 'Ole Petersen', status: 'IN_AREA', latitude: 54.2221, longitude: 11.0949, ownerId: 2, updatedAt: minutesAgo(40) },
      { id: 6, userId: 9, towerId: 4, name: 'Finn Lorenzen', status: 'DEPLOYED', latitude: 54.1925, longitude: 11.0625, ownerId: 8, updatedAt: minutesAgo(5) }
    ],
    boats: [
      { id: 1, name: 'Rescue Boot Dahme', callSign: 'Adler Dahme 1', towerId: 1, status: 'AT_TOWER', latitude: 54.2169, longitude: 11.0934, ownerId: 2, updatedAt: minutesAgo(60) },
      { id: 2, name: 'IRB Dahme', callSign: 'Adler Dahme 2', towerId: 3, status: 'PATROL', latitude: 54.2224, longitude: 11.0958, ownerId: 2, updatedAt: minutesAgo(10) },
      { id: 3, name: 'IRB Kellenhusen', callSign: 'Adler Kellenhusen 1', towerId: 4, status: 'AT_TOWER', latitude: 54.192, longitude: 11.0624, ownerId: 8, updatedAt: minutesAgo(120) }
    ],
    requests: [
      // Offene -1-Anfrage (Lena) → der Wachführer sieht sie sofort unter „Anfragen".
      { id: 1, guardId: 3, requestedBy: 5, kind: 'MINUS_ONE', reason: 'PAUSE', note: 'Kurze Pause nach der Übung', status: 'PENDING', rejectionReason: null, createdAt: minutesAgo(4), decidedAt: null, decidedBy: null, returnedAt: null },
      // Offene K-Fahrt-Anfrage (Mia, Bootsführerin).
      { id: 2, guardId: 2, requestedBy: 4, kind: 'K_FAHRT', reason: null, note: 'Kontrollfahrt Richtung Seebrücke', status: 'PENDING', rejectionReason: null, createdAt: minutesAgo(2), decidedAt: null, decidedBy: null, returnedAt: null },
      // Aktive (genehmigte) -1 → passt zu Tims Guard-Status MINUS_ONE.
      { id: 3, guardId: 4, requestedBy: 6, kind: 'MINUS_ONE', reason: 'CATERING', note: null, status: 'APPROVED', rejectionReason: null, createdAt: minutesAgo(9), decidedAt: minutesAgo(8), decidedBy: 2, returnedAt: null },
      // Verlauf: bereits zurückgemeldete -1.
      { id: 4, guardId: 1, requestedBy: 3, kind: 'MINUS_ONE', reason: 'TOILET', note: null, status: 'RETURNED', rejectionReason: null, createdAt: minutesAgo(95), decidedAt: minutesAgo(94), decidedBy: 2, returnedAt: minutesAgo(80) }
    ],
    towerTemplates: [
      { id: 1, name: 'Musterturm', callSign: 'Rettmar Muster 1', latitude: 54.21449, longitude: 11.08967, requiredStaff: 2, createdAt: minutesAgo(60 * 24 * 30) }
    ],
    boatTemplates: [
      { id: 1, name: 'Muster-IRB', callSign: 'Adler Muster 1', status: 'AT_TOWER', latitude: 54.21449, longitude: 11.08967, createdAt: minutesAgo(60 * 24 * 30) }
    ],
    audit: [
      { id: 1, userId: 2, action: 'request.approve', entityType: 'request', entityId: 3, details: null, timestamp: minutesAgo(8) },
      { id: 2, userId: 6, action: 'request.minus-one', entityType: 'request', entityId: 3, details: { guardId: 4, reason: 'CATERING' }, timestamp: minutesAgo(9) },
      { id: 3, userId: 1, action: 'auth.login', entityType: 'user', entityId: 1, details: null, timestamp: minutesAgo(45) }
    ]
  };
}
