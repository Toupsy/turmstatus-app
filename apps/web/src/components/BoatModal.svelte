<script lang="ts">
  import type { BoatView, TowerView, BoatStatus } from '@turmstatus/shared';
  import { BOAT_STATUSES } from '@turmstatus/shared';
  import Modal from './Modal.svelte';
  import { apiPost, apiPatch, ApiError } from '../lib/api.js';
  import { showToast, refreshBoats, config } from '../lib/stores.js';
  import { labelOf } from '../lib/util.js';

  export let boat: BoatView | null = null;
  export let towerList: TowerView[] = [];
  export let lat: number | null = null;
  export let lng: number | null = null;
  export let onClose: () => void;

  let name = boat?.name ?? '';
  let callSign = boat?.callSign ?? '';
  let towerId: number | '' = boat?.towerId ?? '';
  let status: BoatStatus = boat?.status ?? 'AT_TOWER';
  let latitude = boat?.latitude ?? lat;
  let longitude = boat?.longitude ?? lng;
  let busy = false;

  async function submit() {
    busy = true;
    const payload = {
      name,
      callSign: callSign || undefined,
      towerId: towerId === '' ? null : Number(towerId),
      status,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined
    };
    try {
      if (boat) await apiPatch(`/api/boats/${boat.id}`, payload);
      else await apiPost('/api/boats', payload);
      await refreshBoats();
      showToast(boat ? 'Boot gespeichert' : 'Boot angelegt', 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={boat ? 'Boot bearbeiten' : 'Boot anlegen'} {onClose}>
  <form on:submit|preventDefault={submit}>
    <div class="field"><label for="bn">Name</label><input id="bn" bind:value={name} required /></div>
    <div class="field"><label for="bc">Funkrufname</label><input id="bc" bind:value={callSign} /></div>
    <div class="grid2">
      <div class="field">
        <label for="bt">Turm</label>
        <select id="bt" bind:value={towerId}>
          <option value="">– kein Turm –</option>
          {#each towerList as t}<option value={t.id}>{t.name}</option>{/each}
        </select>
      </div>
      <div class="field">
        <label for="bs">Status</label>
        <select id="bs" bind:value={status}>
          {#each BOAT_STATUSES as s}<option value={s}>{labelOf($config, 'boatStatus', s)}</option>{/each}
        </select>
      </div>
    </div>
    <div class="grid2">
      <div class="field"><label for="bla">Breite (lat)</label><input id="bla" type="number" step="any" bind:value={latitude} /></div>
      <div class="field"><label for="blo">Länge (lng)</label><input id="blo" type="number" step="any" bind:value={longitude} /></div>
    </div>
    <div class="row" style="justify-content:flex-end;">
      <button type="button" class="ghost" on:click={onClose}>Abbrechen</button>
      <button class="primary" disabled={busy}>Speichern</button>
    </div>
  </form>
</Modal>
