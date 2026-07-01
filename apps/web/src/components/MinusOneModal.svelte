<script lang="ts">
  import type { GuardView, Reason } from '@turmstatus/shared';
  import { REASONS } from '@turmstatus/shared';
  import Modal from './Modal.svelte';
  import { apiPost, ApiError } from '../lib/api.js';
  import { showToast, refreshRequests, config } from '../lib/stores.js';
  import { labelOf } from '../lib/util.js';

  export let guard: GuardView;
  export let onClose: () => void;

  let reason: Reason = 'PAUSE';
  let note = '';
  let busy = false;

  async function submit() {
    busy = true;
    try {
      await apiPost('/api/requests/minus-one', { guardId: guard.id, reason, note: note || undefined });
      await refreshRequests();
      showToast('-1 beantragt', 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={`-1 beantragen · ${guard.name}`} {onClose}>
  <form on:submit|preventDefault={submit}>
    <div class="field">
      <label for="rsn">Grund</label>
      <select id="rsn" bind:value={reason}>
        {#each REASONS as r}<option value={r}>{labelOf($config, 'reasons', r)}</option>{/each}
      </select>
    </div>
    <div class="field">
      <label for="note">Notiz (optional)</label>
      <textarea id="note" rows="3" bind:value={note}></textarea>
    </div>
    <div class="row" style="justify-content:flex-end;">
      <button type="button" class="ghost" on:click={onClose}>Abbrechen</button>
      <button class="primary" disabled={busy}>Beantragen</button>
    </div>
  </form>
</Modal>
