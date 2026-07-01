<script lang="ts">
  import Modal from './Modal.svelte';
  import { apiPost, ApiError } from '../lib/api.js';
  import { showToast } from '../lib/stores.js';

  export let onClose: () => void;
  let currentPassword = '';
  let newPassword = '';
  let busy = false;

  async function submit() {
    busy = true;
    try {
      await apiPost('/api/auth/password', { currentPassword, newPassword });
      showToast('Passwort geändert', 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    } finally {
      busy = false;
    }
  }
</script>

<Modal title="Passwort ändern" {onClose}>
  <form on:submit|preventDefault={submit}>
    <div class="field">
      <label for="cp">Aktuelles Passwort</label>
      <input id="cp" type="password" bind:value={currentPassword} required />
    </div>
    <div class="field">
      <label for="np">Neues Passwort</label>
      <input id="np" type="password" bind:value={newPassword} required minlength="6" />
    </div>
    <div class="row" style="justify-content:flex-end;">
      <button type="button" class="ghost" on:click={onClose}>Abbrechen</button>
      <button class="primary" disabled={busy}>Speichern</button>
    </div>
  </form>
</Modal>
