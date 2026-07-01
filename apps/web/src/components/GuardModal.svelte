<script lang="ts">
  import type { GuardView, TowerView } from '@turmstatus/shared';
  import Modal from './Modal.svelte';
  import { apiPost, apiPatch, ApiError } from '../lib/api.js';
  import { showToast, refreshGuards } from '../lib/stores.js';

  export let guard: GuardView | null = null;
  export let towerList: TowerView[] = [];
  export let onClose: () => void;

  let name = guard?.name ?? '';
  let towerId: number | '' = guard?.towerId ?? '';
  let busy = false;

  async function submit() {
    busy = true;
    const payload = { name, towerId: towerId === '' ? null : Number(towerId) };
    try {
      if (guard) await apiPatch(`/api/guards/${guard.id}`, payload);
      else await apiPost('/api/guards', payload);
      await refreshGuards();
      showToast(guard ? 'Wachgänger gespeichert' : 'Wachgänger angelegt', 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={guard ? 'Wachgänger bearbeiten' : 'Wachgänger anlegen'} {onClose}>
  <form on:submit|preventDefault={submit}>
    <div class="field"><label for="gn">Name</label><input id="gn" bind:value={name} required /></div>
    <div class="field">
      <label for="gt">Turm</label>
      <select id="gt" bind:value={towerId}>
        <option value="">– kein Turm –</option>
        {#each towerList as t}<option value={t.id}>{t.name}</option>{/each}
      </select>
    </div>
    <div class="row" style="justify-content:flex-end;">
      <button type="button" class="ghost" on:click={onClose}>Abbrechen</button>
      <button class="primary" disabled={busy}>Speichern</button>
    </div>
  </form>
</Modal>
