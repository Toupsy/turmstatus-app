// ============================================================
// utils.js – Allgemeine Hilfsfunktionen (analog Wachplan-Generator)
// ============================================================

/** HTML-Sonderzeichen escapen (für sichere innerHTML-Nutzung). */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/** Kurze Toast-Benachrichtigung am unteren Bildschirmrand. */
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

/** Zeitstempel hübsch formatieren (lokale Zeit). */
function fmtTime(ts) {
  if (!ts) return '–';
  // SQLite liefert "YYYY-MM-DD HH:MM:SS" (UTC) → als UTC interpretieren
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (isNaN(d)) return ts;
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Label aus config-Map oder Fallback auf den Code. */
function labelOf(mapName, code) {
  return (appConfig && appConfig[mapName] && appConfig[mapName][code]) || code || '–';
}

/** Status-Pille rendern. */
function statusPill(mapName, code) {
  return `<span class="status-pill status-${escapeHtml(code)}">${escapeHtml(labelOf(mapName, code))}</span>`;
}

/** Modal anzeigen/verbergen. */
function openModal(id) { const m = document.getElementById(id); if (m) m.style.display = 'flex'; }
function closeModal(id) { const m = document.getElementById(id); if (m) m.style.display = 'none'; }
