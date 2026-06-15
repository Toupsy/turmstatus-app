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
let users = [];              // (Admin) [{ id, username, role, ... }]

let activeTab = 'map';       // aktueller Tab

// Leaflet-Map-Objekte (in map.js gesetzt)
let _map = null;
let _markerLayer = null;

// Rollen-Helfer
const isHauptwache = () => currentUser && currentUser.role === 'HAUPTWACHE';
const isTurmfuehrer = () => currentUser && currentUser.role === 'TURMFUEHRER';
const canManage = () => currentUser && currentUser.isAdmin;
