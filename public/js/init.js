// ============================================================
// init.js – Bootstrap, Tab-Steuerung, Event-Listener
// Startsequenz: Config laden → Auth prüfen → bei Login App initialisieren.
// ============================================================

// Wird nach erfolgreicher Authentifizierung aufgerufen (von auth.js).
async function onAuthenticated() {
  document.getElementById('login-modal').style.display = 'none';
  document.getElementById('app').classList.remove('hidden');

  renderUserHeader();
  initMap();
  // Map braucht nach dem Einblenden ein invalidateSize, sonst grauer Bereich.
  setTimeout(() => { if (_map) _map.invalidateSize(); }, 100);

  await refreshAll();
  wsConnect();
  startPolling();
}

// ── Tab-Steuerung ────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('nav.tabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach(s =>
    s.classList.toggle('active', s.id === 'tab-' + tab));
  if (tab === 'map' && _map) setTimeout(() => _map.invalidateSize(), 50);
}

// ── Event-Listener verdrahten ────────────────────────────────
function wireEvents() {
  // Auth-Formulare
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('setup-form').addEventListener('submit', handleSetup);
  document.getElementById('register-form').addEventListener('submit', handleRegister);
  document.getElementById('back-to-login-btn').addEventListener('click', (e) => { e.preventDefault(); showLoginView({ enabled: true }); });

  // Header-Buttons
  document.getElementById('btn-logout').onclick = logout;
  document.getElementById('btn-change-password').onclick = openPwModal;
  document.getElementById('btn-admin-panel').onclick = openAdminPanel;

  // Tabs
  document.querySelectorAll('nav.tabs button').forEach(b => {
    b.onclick = () => switchTab(b.dataset.tab);
  });

  // -1 Modal
  document.getElementById('mo-cancel').onclick = () => closeModal('minus-one-modal');
  document.getElementById('mo-submit').onclick = submitMinusOne;

  // Reject Modal
  document.getElementById('reject-cancel').onclick = () => closeModal('reject-modal');
  document.getElementById('reject-submit').onclick = submitReject;

  // Wachführer-Profil (Admin, read-only)
  document.getElementById('wf-profile-close').onclick = () => closeModal('wf-profile-modal');

  // Kontrollfahrt Modals
  document.getElementById('btn-new-control-trip').onclick = openControlTrip;
  document.getElementById('ct-cancel').onclick = () => closeModal('control-trip-modal');
  document.getElementById('ct-submit').onclick = submitControlTrip;
  document.getElementById('ct-reject-cancel').onclick = () => closeModal('ct-reject-modal');
  document.getElementById('ct-reject-submit').onclick = submitRejectControlTrip;

  // Passwort Modal
  document.getElementById('pw-modal-close-btn').onclick = () => closeModal('pw-modal');
  document.getElementById('pw-modal-confirm').onclick = submitPasswordChange;

  // Benutzer Modal (Admin)
  document.getElementById('btn-new-user').onclick = () => openUserModal(null);
  document.getElementById('user-modal-cancel').onclick = () => closeModal('user-modal');
  document.getElementById('user-modal-save').onclick = saveUser;

  // Klick auf Modal-Hintergrund schließt
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', (e) => { if (e.target === m && m.id !== 'login-modal') m.style.display = 'none'; });
  });
}

// ── Startsequenz ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  wireEvents();
  try { appConfig = await apiGet('/api/config'); } catch (e) { console.warn('Config load failed', e); }
  await initAuth();
});
