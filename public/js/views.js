// ============================================================
// views.js – Datenladen + Rendering aller Ansichten + Modal-Logik
// Re-Render via kompletten innerHTML-Replace (kein Framework); alle
// Nutzer-Eingaben über escapeHtml() (XSS-Schutz), analog Wachplan-Generator.
// ============================================================

// ── Daten laden + rendern ────────────────────────────────────
async function refreshTowers() {
  towers = (await apiGet('/api/towers')).towers;
  renderTowers();
  scheduleRenderMap();
}
async function refreshGuards() {
  guards = (await apiGet('/api/guards')).guards;
  renderGuards();
  scheduleRenderMap();
}
async function refreshBoats() {
  boats = (await apiGet('/api/boats')).boats;
  renderBoats();
  scheduleRenderMap();
}
async function refreshRequests() {
  requests = (await apiGet('/api/requests')).requests;
  renderRequests();
}
async function refreshControlTrips() {
  controlTrips = (await apiGet('/api/control-trips')).controlTrips;
  renderControlTrips();
}
async function refreshDashboard() {
  const s = await apiGet('/api/dashboard/summary');
  renderSummary(s);
}
async function refreshAdmin() {
  // App-Admin: volle Benutzerliste + Audit-Log. Wachführer: nur eigenes Wachpersonal.
  if (canManage()) {
    users = (await apiGet('/api/admin/users')).users;
    renderUsers();
    try {
      towerTemplates = (await apiGet('/api/admin/tower-templates')).templates;
      boatTemplates = (await apiGet('/api/admin/boat-templates')).templates;
      renderTowerTemplates();
      renderBoatTemplates();
      renderTemplateMap();
    } catch (e) { /* ignore */ }
    try {
      const a = await apiGet('/api/admin/audit-log?limit=200');
      renderAudit(a.entries);
    } catch (e) { /* ignore */ }
  } else if (canManageTeam()) {
    users = (await apiGet('/api/team/members')).users;
    renderUsers();
    // Audit-Log ist dem App-Admin vorbehalten → Panel für Wachführer ausblenden.
    const auditPanel = document.getElementById('audit-table');
    if (auditPanel && auditPanel.closest('.panel')) auditPanel.closest('.panel').style.display = 'none';
  }
}

async function refreshAll() {
  const [towerResult, guardResult, boatResult, requestResult, controlTripResult, summaryResult] = await Promise.all([
    apiGet('/api/towers').catch(e => { console.error(e); return null; }),
    apiGet('/api/guards').catch(e => { console.error(e); return null; }),
    apiGet('/api/boats').catch(e => { console.error(e); return null; }),
    apiGet('/api/requests').catch(e => { console.error(e); return null; }),
    apiGet('/api/control-trips').catch(e => { console.error(e); return null; }),
    apiGet('/api/dashboard/summary').catch(e => { console.error(e); return null; })
  ]);

  if (towerResult) { towers = towerResult.towers; renderTowers(); }
  if (guardResult) { guards = guardResult.guards; renderGuards(); }
  if (boatResult) { boats = boatResult.boats; renderBoats(); }
  if (requestResult) { requests = requestResult.requests; renderRequests(); }
  if (controlTripResult) { controlTrips = controlTripResult.controlTrips; renderControlTrips(); }
  if (summaryResult) renderSummary(summaryResult);
  scheduleRenderMap();

  if (canManage() || canManageTeam()) await refreshAdmin().catch(e => console.error(e));
}

// ── Dashboard ────────────────────────────────────────────────
function renderSummary(s) {
  const cards = [
    ['Türme', s.towers],
    ['Im Dienst', s.guardsInArea],
    ['Aktive -1', s.guardsMinusOne],
    ['Im Einsatz', s.guardsDeployed],
    ['Boote', s.boatsTotal],
    ['Offene Anfragen', s.openRequests]
  ];
  document.getElementById('summary-cards').innerHTML = cards.map(([lbl, num]) =>
    `<div class="card"><div class="num">${num}</div><div class="lbl">${escapeHtml(lbl)}</div></div>`
  ).join('');
}

// ── Türme ────────────────────────────────────────────────────
function renderTowers() {
  // Türme verwaltet der Wachführer (anlegen/positionieren/löschen); Admin = Ansicht.
  const canEdit = isWachfuehrer();
  const addBtn = document.getElementById('btn-new-tower');
  if (addBtn) addBtn.style.display = canEdit ? '' : 'none';

  if (!towers.length) { document.getElementById('tower-table').innerHTML = '<p class="muted">Keine Türme.</p>'; return; }
  const rows = towers.map(t => {
    const pos = (t.latitude != null && t.longitude != null)
      ? `${t.latitude.toFixed(4)}, ${t.longitude.toFixed(4)}` : '<span class="muted">nicht gesetzt</span>';
    const actions = canEdit
      ? `<button onclick="openTowerById(${t.id})">Bearbeiten</button>
         <button class="danger" onclick="deleteTower(${t.id})">Löschen</button>` : '';
    // Wachführer kann die anwesenden Wachgänger direkt per +/- melden (ohne Accounts).
    const staffCell = canEdit
      ? `${t.currentStaff}/${t.requiredStaff}
         <span class="present-stepper" title="Anwesende Wachgänger melden">
           <button onclick="adjustTowerPresent(${t.id}, -1)" ${t.presentStaff <= 0 ? 'disabled' : ''}>−</button>
           <span>${t.presentStaff}</span>
           <button onclick="adjustTowerPresent(${t.id}, 1)">+</button>
         </span>`
      : `${t.currentStaff}/${t.requiredStaff}`;
    return `
    <tr>
      <td>${escapeHtml(t.name)}</td>
      <td>${escapeHtml(t.callSign || '–')}</td>
      <td>${staffCell}</td>
      <td>${statusPill('towerStatus', t.status)}</td>
      <td>${pos}</td>
      ${canEdit ? `<td class="row-actions">${actions}</td>` : ''}
    </tr>`; }).join('');
  document.getElementById('tower-table').innerHTML =
    `<table><thead><tr><th>Turm</th><th>Funk</th><th>Besetzung</th><th>Status</th><th>Position</th>${canEdit ? '<th>Aktion</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>`;
}

// ── Turm-Verwaltung (Wachführer) ─────────────────────────────
// openTowerModal(null) = neu (optional mit lat/lng aus Karten-Klick); mit Objekt = bearbeiten.
function openTowerModal(tower, lat, lng) {
  document.getElementById('tower-modal-error').textContent = '';
  const posHint = document.getElementById('tower-modal-pos-hint');
  if (tower && tower.id) {
    document.getElementById('tower-modal-title').textContent = 'Turm bearbeiten';
    document.getElementById('tower-modal-id').value = tower.id;
    document.getElementById('tower-modal-name').value = tower.name || '';
    document.getElementById('tower-modal-callsign').value = tower.callSign || '';
    document.getElementById('tower-modal-staff').value = tower.requiredStaff || 2;
    document.getElementById('tower-modal-present').value = tower.presentStaff != null ? tower.presentStaff : 0;
    document.getElementById('tower-modal-lat').value = tower.latitude != null ? tower.latitude : '';
    document.getElementById('tower-modal-lng').value = tower.longitude != null ? tower.longitude : '';
    if (posHint) posHint.style.display = 'none';
  } else {
    document.getElementById('tower-modal-title').textContent = 'Turm anlegen';
    document.getElementById('tower-modal-id').value = '';
    document.getElementById('tower-modal-name').value = '';
    document.getElementById('tower-modal-callsign').value = '';
    document.getElementById('tower-modal-staff').value = 2;
    document.getElementById('tower-modal-present').value = 0;
    document.getElementById('tower-modal-lat').value = lat != null ? lat.toFixed(5) : '';
    document.getElementById('tower-modal-lng').value = lng != null ? lng.toFixed(5) : '';
    if (posHint) posHint.style.display = (lat != null) ? 'block' : 'none';
  }
  openModal('tower-modal');
}

function openTowerById(id) {
  const t = towers.find(x => x.id === id);
  if (t) openTowerModal(t);
}

async function saveTower() {
  const id = document.getElementById('tower-modal-id').value;
  const errEl = document.getElementById('tower-modal-error');
  const name = document.getElementById('tower-modal-name').value.trim();
  if (!name) { errEl.textContent = 'Bitte einen Namen angeben.'; return; }
  const latRaw = document.getElementById('tower-modal-lat').value;
  const lngRaw = document.getElementById('tower-modal-lng').value;
  const payload = {
    name,
    callSign: document.getElementById('tower-modal-callsign').value.trim() || null,
    requiredStaff: Number(document.getElementById('tower-modal-staff').value) || 2,
    presentStaff: Math.max(0, Number(document.getElementById('tower-modal-present').value) || 0),
    latitude: latRaw === '' ? null : Number(latRaw),
    longitude: lngRaw === '' ? null : Number(lngRaw)
  };
  try {
    if (id) await apiPatch('/api/towers/' + id, payload);
    else await apiPost('/api/towers', payload);
    closeModal('tower-modal');
    showToast('Turm gespeichert');
  } catch (err) { errEl.textContent = err.message; }
}

// Position nach Drag des Karten-Markers speichern.
async function moveTower(id, lat, lng) {
  try { await apiPatch('/api/towers/' + id, { latitude: lat, longitude: lng }); showToast('Turm verschoben'); }
  catch (err) { showToast(err.message); refreshTowers(); }
}

// Turmfarbe lokal ableiten (Spiegel von server/status.js) – für optimistische Updates,
// damit Zahl UND Status-Pille sofort reagieren, bevor der Server-Refresh sie bestätigt.
function deriveTowerStatusLocal(currentStaff, requiredStaff) {
  const req = requiredStaff || 1;
  if (currentStaff >= req) return 'GREEN';
  if (currentStaff >= req / 2) return 'YELLOW';
  return 'RED';
}

// Gebündelte (debounced) PATCH-Writes des Steppers, key = Turm-ID.
const _presentStaffTimers = new Map();

// Anwesende Wachgänger eines Turms um delta (±1) anpassen – Ist-Besetzung ohne Accounts.
// Optimistisch: lokaler Zustand + Tabelle/Karte aktualisieren sich SOFORT (kein Warten auf
// Server-Roundtrip). Mehrere schnelle Klicks werden zu EINEM PATCH mit dem Endwert gebündelt;
// der nachfolgende WS-Refresh gleicht den Zustand verbindlich ab. Fehler → revert via refresh.
function adjustTowerPresent(id, delta) {
  const t = towers.find(x => x.id === id);
  if (!t) return;
  const prev = t.presentStaff || 0;
  const next = Math.max(0, Math.min(99, prev + delta));
  if (next === prev) return;
  // Optimistisches Update von Ist-Besetzung, effektiver Stärke und abgeleiteter Farbe.
  t.presentStaff = next;
  if (typeof t.currentStaff === 'number') t.currentStaff += (next - prev);
  t.status = deriveTowerStatusLocal(t.currentStaff, t.requiredStaff);
  renderTowers();
  scheduleRenderMap();
  // PATCH bündeln: erst senden, wenn der Nutzer kurz nicht mehr klickt.
  if (_presentStaffTimers.has(id)) clearTimeout(_presentStaffTimers.get(id));
  _presentStaffTimers.set(id, setTimeout(() => {
    _presentStaffTimers.delete(id);
    const cur = towers.find(x => x.id === id);
    const value = cur ? cur.presentStaff : next;
    apiPatch('/api/towers/' + id, { presentStaff: value })
      .catch(err => { showToast(err.message); refreshTowers(); });
  }, 300));
}

async function deleteTower(id) {
  if (!confirm('Turm wirklich löschen?')) return;
  try { await apiDelete('/api/towers/' + id); showToast('Turm gelöscht'); }
  catch (err) { showToast(err.message); }
}

// ── Wachgänger ───────────────────────────────────────────────
function renderGuards() {
  if (!guards.length) { document.getElementById('guard-table').innerHTML = '<p class="muted">Keine Wachgänger.</p>'; return; }
  // Der App-Admin (HAUPTWACHE) hat reine Ansichtsrechte – keine operativen Aktionen.
  const canAct = !isHauptwache();
  const rows = guards.map(g => {
    let action = '';
    if (canAct && g.status === 'IN_AREA') {
      action = `<button onclick="openMinusOne(${g.id})">-1 beantragen</button>`;
    } else if (canAct && g.status === 'MINUS_ONE') {
      const reqId = approvedRequestForGuard(g.id);
      if (reqId) action = `<button class="ok" onclick="returnRequest(${reqId})">+1 Rückkehr</button>`;
    }
    return `
      <tr>
        <td>${escapeHtml(g.name)}</td>
        <td>${escapeHtml(g.towerName || '–')}</td>
        <td>${statusPill('guardStatus', g.status)}</td>
        <td class="row-actions">${action}</td>
      </tr>`;
  }).join('');
  document.getElementById('guard-table').innerHTML =
    `<table><thead><tr><th>Name</th><th>Turm</th><th>Status</th><th>Aktion</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function approvedRequestForGuard(guardId) {
  const r = requests.find(r => r.guardId === guardId && r.status === 'APPROVED');
  return r ? r.id : null;
}

// ── Boote ────────────────────────────────────────────────────
function renderBoats() {
  // Boote verwaltet der Wachführer (anlegen/Status/Turm-Zuordnung/löschen); Admin = Ansicht.
  const canEdit = isWachfuehrer();
  const addBtn = document.getElementById('btn-new-boat');
  if (addBtn) addBtn.style.display = canEdit ? '' : 'none';

  if (!boats.length) { document.getElementById('boat-table').innerHTML = '<p class="muted">Keine Boote.</p>'; return; }
  const statusKeys = appConfig ? Object.keys(appConfig.boatStatus) : ['AT_TOWER', 'PATROL', 'DEPLOYED', 'OUT_OF_SERVICE'];
  const rows = boats.map(b => {
    const towerCell = canEdit
      ? `<select onchange="setBoatTower(${b.id}, this.value)" style="width:auto">` +
        `<option value="">– kein Turm –</option>` +
        towers.map(t => `<option value="${t.id}" ${b.towerId === t.id ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('') +
        `</select>`
      : escapeHtml(b.towerName || '–');
    const statusCell = canEdit
      ? `<select onchange="setBoatStatus(${b.id}, this.value)" style="width:auto">${statusKeys.map(k =>
          `<option value="${k}" ${b.status === k ? 'selected' : ''}>${escapeHtml(labelOf('boatStatus', k))}</option>`).join('')}</select>`
      : statusPill('boatStatus', b.status);
    const actions = canEdit
      ? `<button onclick="openBoatById(${b.id})">Bearbeiten</button>
         <button class="danger" onclick="deleteBoat(${b.id})">Löschen</button>` : '';
    return `
      <tr>
        <td>${escapeHtml(b.name)}</td>
        <td>${escapeHtml(b.callSign || '–')}</td>
        <td>${towerCell}</td>
        <td>${statusCell}</td>
        ${canEdit ? `<td class="row-actions">${actions}</td>` : ''}
      </tr>`;
  }).join('');
  document.getElementById('boat-table').innerHTML =
    `<table><thead><tr><th>Boot</th><th>Funk</th><th>Turm</th><th>Status</th>${canEdit ? '<th>Aktion</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>`;
}

async function setBoatStatus(id, status) {
  const b = boats.find(x => x.id === id);
  // Optimistisch: lokalen Status + Karte sofort aktualisieren, dann persistieren.
  if (b) { b.status = status; scheduleRenderMap(); }
  try { await apiPatch('/api/boats/' + id, { status }); showToast('Boot-Status aktualisiert'); }
  catch (err) { showToast(err.message); refreshBoats(); }
}

// Boot einem Turm zuordnen (leerer Wert = kein Turm).
async function setBoatTower(id, towerVal) {
  const towerId = towerVal ? Number(towerVal) : null;
  const b = boats.find(x => x.id === id);
  // Optimistisch: Zuordnung lokal setzen (towerName aus bekannter Turmliste), dann persistieren.
  if (b) {
    b.towerId = towerId;
    const t = towerId ? towers.find(x => x.id === towerId) : null;
    b.towerName = t ? t.name : null;
    scheduleRenderMap();
  }
  try { await apiPatch('/api/boats/' + id, { towerId }); showToast('Turm-Zuordnung aktualisiert'); }
  catch (err) { showToast(err.message); refreshBoats(); }
}

// ── Boot-Verwaltung (Wachführer) ─────────────────────────────
// openBoatModal(null) = neu (optional mit lat/lng aus Karten-Rechtsklick); mit Objekt = bearbeiten.
function openBoatModal(boat, lat, lng) {
  document.getElementById('boat-modal-error').textContent = '';
  const posHint = document.getElementById('boat-modal-pos-hint');
  // Turm-Auswahl füllen
  const towerSel = document.getElementById('boat-modal-tower');
  towerSel.innerHTML = '<option value="">– kein Turm –</option>' +
    towers.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  // Status-Auswahl füllen
  const statusKeys = appConfig ? Object.keys(appConfig.boatStatus) : ['AT_TOWER', 'PATROL', 'DEPLOYED', 'OUT_OF_SERVICE'];
  const statusSel = document.getElementById('boat-modal-status');
  statusSel.innerHTML = statusKeys.map(k => `<option value="${k}">${escapeHtml(labelOf('boatStatus', k))}</option>`).join('');

  if (boat && boat.id) {
    document.getElementById('boat-modal-title').textContent = 'Boot bearbeiten';
    document.getElementById('boat-modal-id').value = boat.id;
    document.getElementById('boat-modal-name').value = boat.name || '';
    document.getElementById('boat-modal-callsign').value = boat.callSign || '';
    towerSel.value = boat.towerId ? String(boat.towerId) : '';
    statusSel.value = boat.status || 'AT_TOWER';
    document.getElementById('boat-modal-lat').value = boat.latitude != null ? boat.latitude : '';
    document.getElementById('boat-modal-lng').value = boat.longitude != null ? boat.longitude : '';
    if (posHint) posHint.style.display = 'none';
  } else {
    document.getElementById('boat-modal-title').textContent = 'Boot anlegen';
    document.getElementById('boat-modal-id').value = '';
    document.getElementById('boat-modal-name').value = '';
    document.getElementById('boat-modal-callsign').value = '';
    towerSel.value = '';
    statusSel.value = 'AT_TOWER';
    document.getElementById('boat-modal-lat').value = lat != null ? lat.toFixed(5) : '';
    document.getElementById('boat-modal-lng').value = lng != null ? lng.toFixed(5) : '';
    if (posHint) posHint.style.display = (lat != null) ? 'block' : 'none';
  }
  openModal('boat-modal');
}

function openBoatById(id) {
  const b = boats.find(x => x.id === id);
  if (b) openBoatModal(b);
}

async function saveBoat() {
  const id = document.getElementById('boat-modal-id').value;
  const errEl = document.getElementById('boat-modal-error');
  const name = document.getElementById('boat-modal-name').value.trim();
  if (!name) { errEl.textContent = 'Bitte einen Namen angeben.'; return; }
  const towerVal = document.getElementById('boat-modal-tower').value;
  const latRaw = document.getElementById('boat-modal-lat').value;
  const lngRaw = document.getElementById('boat-modal-lng').value;
  const payload = {
    name,
    callSign: document.getElementById('boat-modal-callsign').value.trim() || null,
    towerId: towerVal ? Number(towerVal) : null,
    status: document.getElementById('boat-modal-status').value,
    latitude: latRaw === '' ? null : Number(latRaw),
    longitude: lngRaw === '' ? null : Number(lngRaw)
  };
  try {
    if (id) await apiPatch('/api/boats/' + id, payload);
    else await apiPost('/api/boats', payload);
    closeModal('boat-modal');
    showToast('Boot gespeichert');
  } catch (err) { errEl.textContent = err.message; }
}

async function deleteBoat(id) {
  if (!confirm('Boot wirklich löschen?')) return;
  try { await apiDelete('/api/boats/' + id); showToast('Boot gelöscht'); }
  catch (err) { showToast(err.message); }
}

// ── Anfragen ─────────────────────────────────────────────────
function renderRequests() {
  const pending = requests.filter(r => r.status === 'PENDING');
  const history = requests.filter(r => r.status !== 'PENDING').slice(0, 50);

  // Offene Anfragen
  if (!pending.length) {
    document.getElementById('pending-requests').innerHTML = '<p class="muted">Keine offenen Anfragen.</p>';
  } else {
    const rows = pending.map(r => {
      let actions = '';
      // Entscheiden darf nur der Wachführer, dem der Wachgänger gehört (Scope-Owner).
      if (isWachfuehrer() && currentUser.userId === r.ownerId) {
        actions = `<button class="ok" onclick="approveRequest(${r.id})">Genehmigen</button>
                   <button class="danger" onclick="openReject(${r.id})">Ablehnen</button>`;
      } else {
        actions = '<span class="muted">wartet auf Wachführer</span>';
      }
      return `<tr>
        <td>${escapeHtml(r.guardName)}</td>
        <td>${escapeHtml(r.towerName || '–')}</td>
        <td>${escapeHtml(labelOf('reasons', r.reason))}</td>
        <td>${escapeHtml(r.note || '–')}</td>
        <td>${fmtTime(r.createdAt)}</td>
        <td class="row-actions">${actions}</td>
      </tr>`;
    }).join('');
    document.getElementById('pending-requests').innerHTML =
      `<table><thead><tr><th>Wachgänger</th><th>Turm</th><th>Grund</th><th>Notiz</th><th>Seit</th><th>Aktion</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // Verlauf
  if (!history.length) {
    document.getElementById('request-history').innerHTML = '<p class="muted">Noch kein Verlauf.</p>';
  } else {
    const rows = history.map(r => {
      const action = r.status === 'APPROVED'
        ? `<button class="ok" onclick="returnRequest(${r.id})">+1 Rückkehr</button>` : '';
      return `<tr>
        <td>${escapeHtml(r.guardName)}</td>
        <td>${escapeHtml(labelOf('reasons', r.reason))}</td>
        <td>${statusPill('requestStatus', r.status)}</td>
        <td>${fmtTime(r.decidedAt || r.createdAt)}</td>
        <td class="row-actions">${action}</td>
      </tr>`;
    }).join('');
    document.getElementById('request-history').innerHTML =
      `<table><thead><tr><th>Wachgänger</th><th>Grund</th><th>Status</th><th>Zeit</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }
}

// -1 Modal
function openMinusOne(guardId) {
  const g = guards.find(x => x.id === guardId);
  document.getElementById('mo-guard-id').value = guardId;
  document.getElementById('mo-guard-name').textContent = g ? g.name : '';
  document.getElementById('mo-note').value = '';
  document.getElementById('mo-error').textContent = '';
  const sel = document.getElementById('mo-reason');
  const reasons = appConfig ? appConfig.reasons : { PAUSE: 'Pause', OTHER: 'Sonstiges' };
  sel.innerHTML = Object.entries(reasons).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join('');
  openModal('minus-one-modal');
}
async function submitMinusOne() {
  const guardId = Number(document.getElementById('mo-guard-id').value);
  const reason = document.getElementById('mo-reason').value;
  const note = document.getElementById('mo-note').value;
  try {
    await apiPost('/api/requests/minus-one', { guardId, reason, note });
    closeModal('minus-one-modal');
    showToast('-1 beantragt');
  } catch (err) {
    document.getElementById('mo-error').textContent = err.message;
  }
}

async function approveRequest(id) {
  try { await apiPost('/api/requests/' + id + '/approve'); showToast('Genehmigt'); }
  catch (err) { showToast(err.message); }
}
function openReject(id) {
  document.getElementById('reject-request-id').value = id;
  document.getElementById('reject-reason').value = '';
  openModal('reject-modal');
}
async function submitReject() {
  const id = document.getElementById('reject-request-id').value;
  try {
    await apiPost('/api/requests/' + id + '/reject', { rejectionReason: document.getElementById('reject-reason').value });
    closeModal('reject-modal');
    showToast('Abgelehnt');
  } catch (err) { showToast(err.message); }
}
async function returnRequest(id) {
  try { await apiPost('/api/requests/' + id + '/return'); showToast('+1 / Rückkehr gemeldet'); }
  catch (err) { showToast(err.message); }
}

// ── Kontrollfahrten (Bootsführer beantragen, Hauptwache/Wachführer entscheiden) ──
function renderControlTrips() {
  // „+ Kontrollfahrt"-Button nur für Bootsführer einblenden.
  const btn = document.getElementById('btn-new-control-trip');
  if (btn) btn.style.display = isBootsfuehrer() ? '' : 'none';

  const listEl = document.getElementById('control-trip-list');
  if (!listEl) return;
  if (!controlTrips.length) {
    listEl.innerHTML = '<p class="muted">Keine Kontrollfahrt-Anfragen.</p>';
    return;
  }
  const rows = controlTrips.map(c => {
    let actions = '';
    // Entscheiden darf nur der Wachführer, dem das Boot gehört (Scope-Owner).
    const canDecide = isWachfuehrer() && currentUser.userId === c.ownerId;
    if (c.status === 'PENDING' && canDecide) {
      actions = `<button class="ok" onclick="approveControlTrip(${c.id})">Genehmigen</button>
                 <button class="danger" onclick="openRejectControlTrip(${c.id})">Ablehnen</button>`;
    } else if (c.status === 'PENDING') {
      actions = '<span class="muted">wartet auf Wachführer</span>';
    }
    return `<tr>
      <td>${escapeHtml(c.boatName)}${c.boatCallSign ? ' (' + escapeHtml(c.boatCallSign) + ')' : ''}</td>
      <td>${escapeHtml(c.towerName || '–')}</td>
      <td>${escapeHtml(c.note || '–')}</td>
      <td>${statusPill('requestStatus', c.status)}</td>
      <td>${escapeHtml(c.requestedBy || '–')}</td>
      <td>${fmtTime(c.decidedAt || c.createdAt)}</td>
      <td class="row-actions">${actions}</td>
    </tr>`;
  }).join('');
  listEl.innerHTML =
    `<table><thead><tr><th>Boot</th><th>Turm</th><th>Notiz</th><th>Status</th><th>Beantragt von</th><th>Zeit</th><th>Aktion</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function openControlTrip() {
  const sel = document.getElementById('ct-boat-id');
  sel.innerHTML = boats.map(b =>
    `<option value="${b.id}">${escapeHtml(b.name)}${b.callSign ? ' (' + escapeHtml(b.callSign) + ')' : ''}</option>`).join('');
  document.getElementById('ct-note').value = '';
  document.getElementById('ct-error').textContent = '';
  openModal('control-trip-modal');
}
async function submitControlTrip() {
  const boatId = Number(document.getElementById('ct-boat-id').value);
  const note = document.getElementById('ct-note').value;
  if (!boatId) { document.getElementById('ct-error').textContent = 'Bitte ein Boot wählen.'; return; }
  try {
    await apiPost('/api/control-trips', { boatId, note });
    closeModal('control-trip-modal');
    showToast('Kontrollfahrt beantragt');
  } catch (err) {
    document.getElementById('ct-error').textContent = err.message;
  }
}
async function approveControlTrip(id) {
  try { await apiPost('/api/control-trips/' + id + '/approve'); showToast('Genehmigt'); }
  catch (err) { showToast(err.message); }
}
function openRejectControlTrip(id) {
  document.getElementById('ct-reject-id').value = id;
  document.getElementById('ct-reject-reason').value = '';
  openModal('ct-reject-modal');
}
async function submitRejectControlTrip() {
  const id = document.getElementById('ct-reject-id').value;
  try {
    await apiPost('/api/control-trips/' + id + '/reject', { rejectionReason: document.getElementById('ct-reject-reason').value });
    closeModal('ct-reject-modal');
    showToast('Abgelehnt');
  } catch (err) { showToast(err.message); }
}

// ── Verwaltung (Admin) ───────────────────────────────────────
function renderUsers() {
  if (!users.length) { document.getElementById('user-table').innerHTML = '<p class="muted">Keine Benutzer.</p>'; return; }
  const rows = users.map(u => {
    // Admin: read-only Einblick in den Scope eines Wachführers (alle seine Türme/Boote/Wachgänger).
    const profileBtn = (canManage() && u.role === 'WACHFUEHRER')
      ? `<button onclick='openWfProfile(${JSON.stringify(u)})'>Profil ansehen</button> ` : '';
    return `
    <tr>
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.fullName || '–')}</td>
      <td>${escapeHtml(labelOf('roleLabels', u.role))}</td>
      <td>${escapeHtml(u.towerName || '–')}</td>
      <td>${u.isActive ? '✓' : '✗'}</td>
      <td>${fmtTime(u.lastLogin)}</td>
      <td class="row-actions">
        ${profileBtn}<button onclick='openUserModal(${JSON.stringify(u)})'>Bearbeiten</button>
        <button class="danger" onclick="deleteUser(${u.id})">Löschen</button>
      </td>
    </tr>`; }).join('');
  document.getElementById('user-table').innerHTML =
    `<table><thead><tr><th>Benutzer</th><th>Name</th><th>Rolle</th><th>Turm</th><th>Aktiv</th><th>Letzter Login</th><th>Aktion</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// Read-only Wachführer-Profil: zeigt dem App-Admin den GESAMTEN Scope eines Wachführers
// (alle seine Türme + Wachgänger + Boote, gefiltert nach ownerId === Wachführer-ID) –
// rein zur Ansicht, KEINE Bestätigungs-/Aktionsrechte. Der Admin sieht via /api/* (all)
// ohnehin alle Objekte; hier wird clientseitig auf den Scope dieses Wachführers gefiltert.
function openWfProfile(u) {
  const ownerId = u.id;
  const wTowers = towers.filter(t => t.ownerId === ownerId);
  const wTowerRows = wTowers.length
    ? wTowers.map(t => `<tr><td>${escapeHtml(t.name)}</td><td>${t.currentStaff}/${t.requiredStaff}</td><td>${statusPill('towerStatus', t.status)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="muted">Keine Türme angelegt.</td></tr>';
  const wGuards = guards.filter(g => g.ownerId === ownerId);
  const guardRows = wGuards.length
    ? wGuards.map(g => `<tr><td>${escapeHtml(g.name)}</td><td>${statusPill('guardStatus', g.status)}</td></tr>`).join('')
    : '<tr><td colspan="2" class="muted">Keine Wachgänger.</td></tr>';
  const wBoats = boats.filter(b => b.ownerId === ownerId);
  const boatRows = wBoats.length
    ? wBoats.map(b => `<tr><td>${escapeHtml(b.name)}</td><td>${statusPill('boatStatus', b.status)}</td></tr>`).join('')
    : '<tr><td colspan="2" class="muted">Keine Boote.</td></tr>';

  document.getElementById('wf-profile-title').textContent =
    `Scope von ${u.fullName || u.username}`;
  document.getElementById('wf-profile-body').innerHTML =
    `<p class="muted">Reine Ansicht – keine Bestätigungen möglich.</p>
     <h4>Türme</h4><table><thead><tr><th>Turm</th><th>Besetzung</th><th>Status</th></tr></thead><tbody>${wTowerRows}</tbody></table>
     <h4 style="margin-top:12px">Wachgänger</h4><table><thead><tr><th>Name</th><th>Status</th></tr></thead><tbody>${guardRows}</tbody></table>
     <h4 style="margin-top:12px">Boote</h4><table><thead><tr><th>Boot</th><th>Status</th></tr></thead><tbody>${boatRows}</tbody></table>`;
  openModal('wf-profile-modal');
}

// Basis-Endpunkt der Benutzerverwaltung je nach Rolle:
// App-Admin → /api/admin/users (alle), Wachführer → /api/team/members (eigene Wache).
function userApiBase() { return canManage() ? '/api/admin/users' : '/api/team/members'; }

// Rollen, die im Modal zur Auswahl stehen. Admin legt v. a. Wachführer an; ein
// Wachführer darf nur Wachgänger/Bootsführer seiner Wache anlegen.
function userModalRoles() {
  return canManage()
    ? ['WACHFUEHRER', 'WACHGAENGER', 'BOOTSFUEHRER', 'HAUPTWACHE']
    : ['WACHGAENGER', 'BOOTSFUEHRER'];
}

function fillRoleSelect(selectedRole) {
  const roles = userModalRoles();
  const sel = document.getElementById('user-modal-role');
  sel.innerHTML = roles.map(r =>
    `<option value="${r}" ${r === selectedRole ? 'selected' : ''}>${escapeHtml(labelOf('roleLabels', r))}</option>`).join('');
}

function fillTowerSelect(selectedId) {
  const sel = document.getElementById('user-modal-tower');
  sel.innerHTML = '<option value="">– kein Turm –</option>' +
    towers.map(t => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
}

function openUserModal(user) {
  document.getElementById('user-modal-error').textContent = '';
  // Turmwahl nur für den App-Admin; beim Wachführer ist die Wache fix (eigener Turm).
  const showTower = canManage();
  document.getElementById('user-modal-tower').style.display = showTower ? '' : 'none';
  const towerLabel = document.querySelector('label[for="user-modal-tower"]');
  if (towerLabel) towerLabel.style.display = showTower ? '' : 'none';
  fillTowerSelect(user ? user.towerId : null);

  if (user && user.id) {
    document.getElementById('user-modal-title').textContent = 'Benutzer bearbeiten';
    document.getElementById('user-modal-id').value = user.id;
    document.getElementById('user-modal-username').value = user.username;
    document.getElementById('user-modal-username').disabled = true;
    document.getElementById('user-modal-fullname').value = user.fullName || '';
    fillRoleSelect(user.role);
    document.getElementById('user-modal-pw-field').style.display = 'none';
  } else {
    document.getElementById('user-modal-title').textContent = 'Benutzer anlegen';
    document.getElementById('user-modal-id').value = '';
    document.getElementById('user-modal-username').value = '';
    document.getElementById('user-modal-username').disabled = false;
    document.getElementById('user-modal-fullname').value = '';
    fillRoleSelect(canManage() ? 'WACHFUEHRER' : 'WACHGAENGER');
    document.getElementById('user-modal-password').value = '';
    document.getElementById('user-modal-pw-field').style.display = 'block';
  }
  openModal('user-modal');
}

async function saveUser() {
  const id = document.getElementById('user-modal-id').value;
  const errEl = document.getElementById('user-modal-error');
  const payload = {
    fullName: document.getElementById('user-modal-fullname').value,
    role: document.getElementById('user-modal-role').value
  };
  // Turm nur der App-Admin setzen; beim Wachführer erzwingt der Server die eigene Wache.
  if (canManage()) {
    const towerVal = document.getElementById('user-modal-tower').value;
    payload.towerId = towerVal ? Number(towerVal) : null;
  }
  try {
    if (id) {
      await apiPatch(userApiBase() + '/' + id, payload);
    } else {
      payload.username = document.getElementById('user-modal-username').value;
      payload.password = document.getElementById('user-modal-password').value;
      await apiPost(userApiBase(), payload);
    }
    closeModal('user-modal');
    showToast('Gespeichert');
    refreshAdmin();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function deleteUser(id) {
  if (!confirm('Benutzer wirklich löschen?')) return;
  try { await apiDelete(userApiBase() + '/' + id); showToast('Gelöscht'); refreshAdmin(); }
  catch (err) { showToast(err.message); }
}

// ── Demo-Konfiguration · Vorlagen-Türme (Admin) ──────────────
function renderTowerTemplates() {
  const panel = document.getElementById('tower-template-panel');
  if (panel) panel.style.display = canManage() ? '' : 'none';
  if (!canManage()) return;
  const el = document.getElementById('template-table');
  if (!el) return;
  if (!towerTemplates.length) {
    el.innerHTML = '<p class="muted">Noch keine Vorlagen-Türme. Neue Wachführer starten dann ohne Türme.</p>';
    return;
  }
  const rows = towerTemplates.map(t => {
    const pos = (t.latitude != null && t.longitude != null)
      ? `${t.latitude.toFixed(4)}, ${t.longitude.toFixed(4)}` : '<span class="muted">nicht gesetzt</span>';
    return `
    <tr>
      <td>${escapeHtml(t.name)}</td>
      <td>${escapeHtml(t.callSign || '–')}</td>
      <td>${t.requiredStaff}</td>
      <td>${pos}</td>
      <td class="row-actions">
        <button onclick="openTemplateById(${t.id})">Bearbeiten</button>
        <button class="danger" onclick="deleteTemplate(${t.id})">Löschen</button>
      </td>
    </tr>`; }).join('');
  el.innerHTML =
    `<table><thead><tr><th>Turm</th><th>Funk</th><th>Soll</th><th>Position</th><th>Aktion</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function openTemplateModal(tpl, lat, lng) {
  document.getElementById('template-modal-error').textContent = '';
  if (tpl && tpl.id) {
    document.getElementById('template-modal-title').textContent = 'Vorlagen-Turm bearbeiten';
    document.getElementById('template-modal-id').value = tpl.id;
    document.getElementById('template-modal-name').value = tpl.name || '';
    document.getElementById('template-modal-callsign').value = tpl.callSign || '';
    document.getElementById('template-modal-staff').value = tpl.requiredStaff || 2;
    document.getElementById('template-modal-lat').value = tpl.latitude != null ? tpl.latitude : '';
    document.getElementById('template-modal-lng').value = tpl.longitude != null ? tpl.longitude : '';
  } else {
    document.getElementById('template-modal-title').textContent = 'Vorlagen-Turm anlegen';
    document.getElementById('template-modal-id').value = '';
    document.getElementById('template-modal-name').value = '';
    document.getElementById('template-modal-callsign').value = '';
    document.getElementById('template-modal-staff').value = 2;
    document.getElementById('template-modal-lat').value = lat != null ? lat : '';
    document.getElementById('template-modal-lng').value = lng != null ? lng : '';
  }
  openModal('template-modal');
}

function openTemplateById(id) {
  const t = towerTemplates.find(x => x.id === id);
  if (t) openTemplateModal(t);
}

async function saveTemplate() {
  const id = document.getElementById('template-modal-id').value;
  const errEl = document.getElementById('template-modal-error');
  const name = document.getElementById('template-modal-name').value.trim();
  if (!name) { errEl.textContent = 'Bitte einen Namen angeben.'; return; }
  const latRaw = document.getElementById('template-modal-lat').value;
  const lngRaw = document.getElementById('template-modal-lng').value;
  const payload = {
    name,
    callSign: document.getElementById('template-modal-callsign').value.trim() || null,
    requiredStaff: Number(document.getElementById('template-modal-staff').value) || 2,
    latitude: latRaw === '' ? null : Number(latRaw),
    longitude: lngRaw === '' ? null : Number(lngRaw)
  };
  try {
    if (id) await apiPatch('/api/admin/tower-templates/' + id, payload);
    else await apiPost('/api/admin/tower-templates', payload);
    closeModal('template-modal');
    showToast('Vorlage gespeichert');
    refreshAdmin();
  } catch (err) { errEl.textContent = err.message; }
}

async function deleteTemplate(id) {
  if (!confirm('Vorlagen-Turm wirklich löschen?')) return;
  try { await apiDelete('/api/admin/tower-templates/' + id); showToast('Vorlage gelöscht'); refreshAdmin(); }
  catch (err) { showToast(err.message); }
}

// ── Demo-Konfiguration · Vorlagen-Boote (Admin) ──────────────
function renderBoatTemplates() {
  const panel = document.getElementById('boat-template-panel');
  if (panel) panel.style.display = canManage() ? '' : 'none';
  if (!canManage()) return;
  const el = document.getElementById('boat-template-table');
  if (!el) return;
  if (!boatTemplates.length) {
    el.innerHTML = '<p class="muted">Noch keine Vorlagen-Boote. Neue Wachführer starten dann ohne Boote.</p>';
    return;
  }
  const rows = boatTemplates.map(b => {
    const pos = (b.latitude != null && b.longitude != null)
      ? `${b.latitude.toFixed(4)}, ${b.longitude.toFixed(4)}` : '<span class="muted">nicht gesetzt</span>';
    return `
    <tr>
      <td>${escapeHtml(b.name)}</td>
      <td>${escapeHtml(b.callSign || '–')}</td>
      <td>${escapeHtml(labelOf('boatStatus', b.status))}</td>
      <td>${pos}</td>
      <td class="row-actions">
        <button onclick="openBoatTemplateById(${b.id})">Bearbeiten</button>
        <button class="danger" onclick="deleteBoatTemplate(${b.id})">Löschen</button>
      </td>
    </tr>`; }).join('');
  el.innerHTML =
    `<table><thead><tr><th>Boot</th><th>Funk</th><th>Status</th><th>Position</th><th>Aktion</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function openBoatTemplateModal(tpl, lat, lng) {
  document.getElementById('boat-template-modal-error').textContent = '';
  // Status-Auswahl füllen
  const statusKeys = appConfig ? Object.keys(appConfig.boatStatus) : ['AT_TOWER', 'PATROL', 'DEPLOYED', 'OUT_OF_SERVICE'];
  const statusSel = document.getElementById('boat-template-modal-status');
  statusSel.innerHTML = statusKeys.map(k => `<option value="${k}">${escapeHtml(labelOf('boatStatus', k))}</option>`).join('');
  if (tpl && tpl.id) {
    document.getElementById('boat-template-modal-title').textContent = 'Vorlagen-Boot bearbeiten';
    document.getElementById('boat-template-modal-id').value = tpl.id;
    document.getElementById('boat-template-modal-name').value = tpl.name || '';
    document.getElementById('boat-template-modal-callsign').value = tpl.callSign || '';
    statusSel.value = tpl.status || 'AT_TOWER';
    document.getElementById('boat-template-modal-lat').value = tpl.latitude != null ? tpl.latitude : '';
    document.getElementById('boat-template-modal-lng').value = tpl.longitude != null ? tpl.longitude : '';
  } else {
    document.getElementById('boat-template-modal-title').textContent = 'Vorlagen-Boot anlegen';
    document.getElementById('boat-template-modal-id').value = '';
    document.getElementById('boat-template-modal-name').value = '';
    document.getElementById('boat-template-modal-callsign').value = '';
    statusSel.value = 'AT_TOWER';
    document.getElementById('boat-template-modal-lat').value = lat != null ? lat : '';
    document.getElementById('boat-template-modal-lng').value = lng != null ? lng : '';
  }
  openModal('boat-template-modal');
}

function openBoatTemplateById(id) {
  const b = boatTemplates.find(x => x.id === id);
  if (b) openBoatTemplateModal(b);
}

async function saveBoatTemplate() {
  const id = document.getElementById('boat-template-modal-id').value;
  const errEl = document.getElementById('boat-template-modal-error');
  const name = document.getElementById('boat-template-modal-name').value.trim();
  if (!name) { errEl.textContent = 'Bitte einen Namen angeben.'; return; }
  const latRaw = document.getElementById('boat-template-modal-lat').value;
  const lngRaw = document.getElementById('boat-template-modal-lng').value;
  const payload = {
    name,
    callSign: document.getElementById('boat-template-modal-callsign').value.trim() || null,
    status: document.getElementById('boat-template-modal-status').value,
    latitude: latRaw === '' ? null : Number(latRaw),
    longitude: lngRaw === '' ? null : Number(lngRaw)
  };
  try {
    if (id) await apiPatch('/api/admin/boat-templates/' + id, payload);
    else await apiPost('/api/admin/boat-templates', payload);
    closeModal('boat-template-modal');
    showToast('Vorlage gespeichert');
    refreshAdmin();
  } catch (err) { errEl.textContent = err.message; }
}

async function deleteBoatTemplate(id) {
  if (!confirm('Vorlagen-Boot wirklich löschen?')) return;
  try { await apiDelete('/api/admin/boat-templates/' + id); showToast('Vorlage gelöscht'); refreshAdmin(); }
  catch (err) { showToast(err.message); }
}

// Karten-Drag (Admin) verschiebt eine Vorlage → PATCH der Position.
async function moveTowerTemplate(id, lat, lng) {
  try { await apiPatch('/api/admin/tower-templates/' + id, { latitude: lat, longitude: lng }); showToast('Position gespeichert'); refreshAdmin(); }
  catch (err) { showToast(err.message); }
}
async function moveBoatTemplate(id, lat, lng) {
  try { await apiPatch('/api/admin/boat-templates/' + id, { latitude: lat, longitude: lng }); showToast('Position gespeichert'); refreshAdmin(); }
  catch (err) { showToast(err.message); }
}

function renderAudit(entries) {
  if (!entries || !entries.length) { document.getElementById('audit-table').innerHTML = '<p class="muted">Kein Protokoll.</p>'; return; }
  const rows = entries.map(e => `
    <tr>
      <td>${fmtTime(e.timestamp)}</td>
      <td>${escapeHtml(e.actor || 'System')}</td>
      <td>${escapeHtml(e.action)}</td>
      <td>${escapeHtml(e.entityType || '–')} ${e.entityId || ''}</td>
    </tr>`).join('');
  document.getElementById('audit-table').innerHTML =
    `<table><thead><tr><th>Zeit</th><th>Akteur</th><th>Aktion</th><th>Objekt</th></tr></thead><tbody>${rows}</tbody></table>`;
}
