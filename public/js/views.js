// ============================================================
// views.js – Datenladen + Rendering aller Ansichten + Modal-Logik
// Re-Render via kompletten innerHTML-Replace (kein Framework); alle
// Nutzer-Eingaben über escapeHtml() (XSS-Schutz), analog Wachplan-Generator.
// ============================================================

// ── Daten laden + rendern ────────────────────────────────────
async function refreshTowers() {
  towers = (await apiGet('/api/towers')).towers;
  renderTowers();
  renderMap();
}
async function refreshGuards() {
  guards = (await apiGet('/api/guards')).guards;
  renderGuards();
  renderMap();
}
async function refreshBoats() {
  boats = (await apiGet('/api/boats')).boats;
  renderBoats();
  renderMap();
}
async function refreshRequests() {
  requests = (await apiGet('/api/requests')).requests;
  renderRequests();
}
async function refreshDashboard() {
  const s = await apiGet('/api/dashboard/summary');
  renderSummary(s);
}
async function refreshAdmin() {
  if (!canManage()) return;
  users = (await apiGet('/api/admin/users')).users;
  renderUsers();
  try {
    const a = await apiGet('/api/admin/audit-log?limit=200');
    renderAudit(a.entries);
  } catch (e) { /* ignore */ }
}

async function refreshAll() {
  await Promise.all([
    refreshTowers().catch(e => console.error(e)),
    refreshGuards().catch(e => console.error(e)),
    refreshBoats().catch(e => console.error(e)),
    refreshRequests().catch(e => console.error(e)),
    refreshDashboard().catch(e => console.error(e))
  ]);
  if (canManage()) await refreshAdmin().catch(e => console.error(e));
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
  if (!towers.length) { document.getElementById('tower-table').innerHTML = '<p class="muted">Keine Türme.</p>'; return; }
  const rows = towers.map(t => `
    <tr>
      <td>${escapeHtml(t.name)}</td>
      <td>${escapeHtml(t.callSign || '–')}</td>
      <td>${t.currentStaff}/${t.requiredStaff}</td>
      <td>${statusPill('towerStatus', t.status)}</td>
    </tr>`).join('');
  document.getElementById('tower-table').innerHTML =
    `<table><thead><tr><th>Turm</th><th>Funk</th><th>Besetzung</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ── Wachgänger ───────────────────────────────────────────────
function renderGuards() {
  if (!guards.length) { document.getElementById('guard-table').innerHTML = '<p class="muted">Keine Wachgänger.</p>'; return; }
  const rows = guards.map(g => {
    let action = '';
    if (g.status === 'IN_AREA') {
      action = `<button onclick="openMinusOne(${g.id})">-1 beantragen</button>`;
    } else if (g.status === 'MINUS_ONE') {
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
  if (!boats.length) { document.getElementById('boat-table').innerHTML = '<p class="muted">Keine Boote.</p>'; return; }
  const canEdit = isHauptwache() || isTurmfuehrer();
  const statusKeys = appConfig ? Object.keys(appConfig.boatStatus) : ['AT_TOWER', 'PATROL', 'DEPLOYED', 'OUT_OF_SERVICE'];
  const rows = boats.map(b => {
    const statusCell = canEdit
      ? `<select onchange="setBoatStatus(${b.id}, this.value)" style="width:auto">${statusKeys.map(k =>
          `<option value="${k}" ${b.status === k ? 'selected' : ''}>${escapeHtml(labelOf('boatStatus', k))}</option>`).join('')}</select>`
      : statusPill('boatStatus', b.status);
    return `
      <tr>
        <td>${escapeHtml(b.name)}</td>
        <td>${escapeHtml(b.callSign || '–')}</td>
        <td>${escapeHtml(b.towerName || '–')}</td>
        <td>${statusCell}</td>
      </tr>`;
  }).join('');
  document.getElementById('boat-table').innerHTML =
    `<table><thead><tr><th>Boot</th><th>Funk</th><th>Turm</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function setBoatStatus(id, status) {
  try { await apiPatch('/api/boats/' + id, { status }); showToast('Boot-Status aktualisiert'); }
  catch (err) { showToast(err.message); refreshBoats(); }
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
      if (isHauptwache()) {
        actions = `<button class="ok" onclick="approveRequest(${r.id})">Genehmigen</button>
                   <button class="danger" onclick="openReject(${r.id})">Ablehnen</button>`;
      } else {
        actions = '<span class="muted">wartet auf Hauptwache</span>';
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

// ── Verwaltung (Admin) ───────────────────────────────────────
function renderUsers() {
  if (!users.length) { document.getElementById('user-table').innerHTML = '<p class="muted">Keine Benutzer.</p>'; return; }
  const rows = users.map(u => `
    <tr>
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.fullName || '–')}</td>
      <td>${escapeHtml(labelOf('roleLabels', u.role))}</td>
      <td>${escapeHtml(u.towerName || '–')}</td>
      <td>${u.isActive ? '✓' : '✗'}</td>
      <td>${fmtTime(u.lastLogin)}</td>
      <td class="row-actions">
        <button onclick='openUserModal(${JSON.stringify(u)})'>Bearbeiten</button>
        <button class="danger" onclick="deleteUser(${u.id})">Löschen</button>
      </td>
    </tr>`).join('');
  document.getElementById('user-table').innerHTML =
    `<table><thead><tr><th>Benutzer</th><th>Name</th><th>Rolle</th><th>Turm</th><th>Aktiv</th><th>Letzter Login</th><th>Aktion</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function fillTowerSelect(selectedId) {
  const sel = document.getElementById('user-modal-tower');
  sel.innerHTML = '<option value="">– kein Turm –</option>' +
    towers.map(t => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
}

function openUserModal(user) {
  document.getElementById('user-modal-error').textContent = '';
  fillTowerSelect(user ? user.towerId : null);
  if (user && user.id) {
    document.getElementById('user-modal-title').textContent = 'Benutzer bearbeiten';
    document.getElementById('user-modal-id').value = user.id;
    document.getElementById('user-modal-username').value = user.username;
    document.getElementById('user-modal-username').disabled = true;
    document.getElementById('user-modal-fullname').value = user.fullName || '';
    document.getElementById('user-modal-role').value = user.role;
    document.getElementById('user-modal-pw-field').style.display = 'none';
  } else {
    document.getElementById('user-modal-title').textContent = 'Benutzer anlegen';
    document.getElementById('user-modal-id').value = '';
    document.getElementById('user-modal-username').value = '';
    document.getElementById('user-modal-username').disabled = false;
    document.getElementById('user-modal-fullname').value = '';
    document.getElementById('user-modal-role').value = 'WACHGAENGER';
    document.getElementById('user-modal-password').value = '';
    document.getElementById('user-modal-pw-field').style.display = 'block';
  }
  openModal('user-modal');
}

async function saveUser() {
  const id = document.getElementById('user-modal-id').value;
  const errEl = document.getElementById('user-modal-error');
  const towerVal = document.getElementById('user-modal-tower').value;
  const payload = {
    fullName: document.getElementById('user-modal-fullname').value,
    role: document.getElementById('user-modal-role').value,
    towerId: towerVal ? Number(towerVal) : null
  };
  try {
    if (id) {
      await apiPatch('/api/admin/users/' + id, payload);
    } else {
      payload.username = document.getElementById('user-modal-username').value;
      payload.password = document.getElementById('user-modal-password').value;
      await apiPost('/api/admin/users', payload);
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
  try { await apiDelete('/api/admin/users/' + id); showToast('Gelöscht'); refreshAdmin(); }
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
