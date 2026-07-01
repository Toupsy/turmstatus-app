<script lang="ts">
  import type { CurrentUser } from '@turmstatus/shared';
  import { apiPost, ApiError } from '../lib/api.js';
  import { currentUser, showToast } from '../lib/stores.js';

  let username = '';
  let password = '';
  let busy = false;

  async function submit() {
    busy = true;
    try {
      const res = await apiPost<{ user: CurrentUser }>('/api/auth/login', { username, password });
      if (!res.user.isAdmin) {
        showToast('Kein Administrator-Konto', 'error');
        currentUser.set(null);
        return;
      }
      currentUser.set(res.user);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Anmeldung fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }
</script>

<div class="center-screen">
  <div class="modal" style="max-width: 360px;">
    <h3 style="color: var(--sea-bright);">Turmstatus · Administration</h3>
    <p class="muted small">Interner Admin-Bereich (nur im lokalen Netz erreichbar).</p>
    <form on:submit|preventDefault={submit}>
      <div class="field"><label for="u">Benutzername</label><input id="u" bind:value={username} required /></div>
      <div class="field"><label for="p">Passwort</label><input id="p" type="password" bind:value={password} required /></div>
      <button class="primary" style="width:100%;" disabled={busy}>Anmelden</button>
    </form>
  </div>
</div>
