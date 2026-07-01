<script lang="ts">
  import type { GuardView } from '@turmstatus/shared';
  import Modal from './Modal.svelte';
  import { apiPost, ApiError } from '../lib/api.js';
  import { showToast, refreshRequests } from '../lib/stores.js';

  export let guard: GuardView;
  export let onClose: () => void;

  let note = '';
  let busy = false;

  async function submit() {
    busy = true;
    try {
      await apiPost('/api/requests/k-fahrt', { guardId: guard.id, note: note || undefined });
      await refreshRequests();
      showToast('K-Fahrt beantragt', 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={`K-Fahrt beantragen · ${guard.name}`} {onClose}>
  <form on:submit|preventDefault={submit}>
    <p class="muted small">
      Der Wachführer setzt die Kontrollfahrt anschließend. Sobald sie gesetzt ist, wird der Turm um 2 WG reduziert.
    </p>
    <div class="field">
      <label for="kfnote">Notiz (optional)</label>
      <textarea id="kfnote" rows="3" bind:value={note}></textarea>
    </div>
    <div class="row" style="justify-content:flex-end;">
      <button type="button" class="ghost" on:click={onClose}>Abbrechen</button>
      <button class="primary" disabled={busy}>Beantragen</button>
    </div>
  </form>
</Modal>
