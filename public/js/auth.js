// ============================================================
// auth.js – Login/Setup/Register-Modal + User-Header + Passwortwechsel
// (Ablauf analog Wachplan-Generator: login-modal.js + user-info.js)
// ============================================================

// initAuth() wird von init.js aufgerufen, sobald initAfterAuth definiert ist.
async function initAuth() {
  try {
    const me = await apiGet('/api/auth/me');
    currentUser = me;
    await onAuthenticated();
    return;
  } catch (e) { /* nicht angemeldet → weiter */ }

  // Erst-Einrichtung nötig?
  try {
    const setup = await apiGet('/api/auth/needs-setup');
    if (setup.needsSetup) { showSetupView(); return; }
  } catch (e) { /* ignore */ }

  // Registrierung erlaubt?
  try {
    const reg = await apiGet('/api/auth/registration-status');
    showLoginView(reg);
  } catch (e) {
    showLoginView({ enabled: false });
  }
}

function showLoginView(reg = { enabled: false }) {
  openModal('login-modal');
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('setup-view').style.display = 'none';
  document.getElementById('register-view').style.display = 'none';

  const link = document.getElementById('register-link-text');
  if (reg.enabled && link) {
    link.innerHTML = 'Noch kein Account? <a href="#" id="show-register-btn">Jetzt registrieren</a>';
    document.getElementById('show-register-btn').onclick = (e) => { e.preventDefault(); showRegisterView(reg); };
  } else if (link) {
    link.innerHTML = '';
  }
}

function showSetupView() {
  openModal('login-modal');
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('setup-view').style.display = 'block';
  document.getElementById('register-view').style.display = 'none';
}

function showRegisterView(reg) {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('register-view').style.display = 'block';
  document.getElementById('register-code-field').style.display = reg.requiresCode ? 'block' : 'none';
}

async function handleLogin(e) {
  e.preventDefault();
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';
  try {
    await apiPost('/api/auth/login', {
      username: document.getElementById('login-username').value,
      password: document.getElementById('login-password').value,
      rememberMe: document.getElementById('login-remember').checked
    });
    currentUser = await apiGet('/api/auth/me');
    closeModal('login-modal');
    await onAuthenticated();
  } catch (err) {
    errorEl.textContent = err.message || 'Login fehlgeschlagen';
  }
}

async function handleSetup(e) {
  e.preventDefault();
  const errorEl = document.getElementById('setup-error');
  errorEl.textContent = '';
  const u = document.getElementById('setup-username').value;
  const p = document.getElementById('setup-password').value;
  const p2 = document.getElementById('setup-password2').value;
  if (p !== p2) { errorEl.textContent = 'Passwörter stimmen nicht überein'; return; }
  if (p.length < 10) { errorEl.textContent = 'Passwort muss mindestens 10 Zeichen haben'; return; }
  try {
    await apiPost('/api/auth/init', { username: u, password: p });
    await apiPost('/api/auth/login', { username: u, password: p });
    currentUser = await apiGet('/api/auth/me');
    closeModal('login-modal');
    await onAuthenticated();
  } catch (err) {
    errorEl.textContent = err.message || 'Setup fehlgeschlagen';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const errorEl = document.getElementById('register-error');
  errorEl.textContent = '';
  const p = document.getElementById('register-password').value;
  const p2 = document.getElementById('register-password2').value;
  if (p !== p2) { errorEl.textContent = 'Passwörter stimmen nicht überein'; return; }
  if (p.length < 10) { errorEl.textContent = 'Passwort muss mindestens 10 Zeichen haben'; return; }
  if (!document.getElementById('register-privacy').checked) { errorEl.textContent = 'Datenschutzhinweis muss akzeptiert werden'; return; }
  try {
    const payload = {
      username: document.getElementById('register-username').value,
      password: p,
      acceptedPrivacy: true
    };
    const code = document.getElementById('register-code').value;
    if (code) payload.code = code;
    await apiPost('/api/auth/register', payload);
    currentUser = await apiGet('/api/auth/me');
    closeModal('login-modal');
    await onAuthenticated();
  } catch (err) {
    errorEl.textContent = err.message || 'Registrierung fehlgeschlagen';
  }
}

// ── User-Header ──────────────────────────────────────────────
function renderUserHeader() {
  if (!currentUser) return;
  document.getElementById('user-info-username').textContent = currentUser.fullName || currentUser.username;
  document.getElementById('user-info-role').textContent = labelOf('roleLabels', currentUser.role);
  document.getElementById('btn-admin-panel').style.display = currentUser.isAdmin ? '' : 'none';
  document.getElementById('tab-btn-admin').style.display = currentUser.isAdmin ? '' : 'none';
}

async function logout() {
  try { await apiPost('/api/auth/logout'); } catch (e) { /* ignore */ }
  window.location.reload();
}

function openAdminPanel() {
  const url = `${window.location.protocol}//${window.location.hostname}:3003`;
  window.open(url, '_blank');
}

// ── Passwort ändern ──────────────────────────────────────────
function openPwModal() {
  ['pw-current', 'pw-new', 'pw-new2'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('pw-modal-msg').textContent = '';
  openModal('pw-modal');
}
async function submitPasswordChange() {
  const cur = document.getElementById('pw-current').value;
  const next = document.getElementById('pw-new').value;
  const next2 = document.getElementById('pw-new2').value;
  const msg = document.getElementById('pw-modal-msg');
  if (!cur || !next) { msg.textContent = 'Bitte alle Felder ausfüllen.'; return; }
  if (next.length < 10) { msg.textContent = 'Neues Passwort: mindestens 10 Zeichen.'; return; }
  if (next !== next2) { msg.textContent = 'Die neuen Passwörter stimmen nicht überein.'; return; }
  try {
    await _req('PUT', '/api/auth/password', { currentPassword: cur, newPassword: next });
    showToast('✓ Passwort geändert');
    closeModal('pw-modal');
  } catch (err) {
    msg.textContent = err.message || 'Änderung fehlgeschlagen.';
  }
}
