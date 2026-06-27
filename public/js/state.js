// ============================================================
// state.js – Globaler Zustand (Vanilla JS, kein Framework)
// Analog zum Wachplan-Generator: globale Variablen, von allen Modulen genutzt.
// ============================================================

let appConfig = null;        // /api/config
let currentUser = null;      // /api/auth/me → { userId, username, role, towerId, isAdmin }

let towers = [];             // [{ id, name, callSign, latitude, longitude, requiredStaff, currentStaff, status }]
let guards = [];             // [{ id, name, towerId, towerName, status, latitude, longitude, userId }]
let boats = [];              // [{ id, name, callSign, towerId, towerName, status, latitude, longitude }]
let requests = [];           // [{ id, guardId, guardName, reason, note, status, ... }]
let users = [];              // (Admin/Wachführer) [{ id, username, role, ... }]
let controlTrips = [];       // [{ id, boatId, boatName, status, ... }] Kontrollfahrt-Anfragen

let activeTab = 'map';       // aktueller Tab

// Leaflet-Map-Objekte (in map.js gesetzt)
let _map = null;
let _markerLayer = null;
let _addTowerMode = false;   // true: nächster Karten-Klick legt einen Turm an (Wachführer)

// Rollen-Helfer
const isHauptwache = () => currentUser && currentUser.role === 'HAUPTWACHE';
const isWachfuehrer = () => currentUser && currentUser.role === 'WACHFUEHRER';
const isBootsfuehrer = () => currentUser && currentUser.role === 'BOOTSFUEHRER';
const canManage = () => currentUser && currentUser.isAdmin;        // App-Admin: volle Benutzerverwaltung
const canManageTeam = () => isWachfuehrer();                       // Wachführer: nur eigene Wache
