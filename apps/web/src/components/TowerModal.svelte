<script lang="ts">
  import type { TowerView } from '@turmstatus/shared';
  import Modal from './Modal.svelte';
  import { apiPost, apiPatch, ApiError } from '../lib/api.js';
  import { showToast, refreshTowers } from '../lib/stores.js';

  export let tower: TowerView | null = null;
  export let lat: number | null = null;
  export let lng: number | null = null;
  export let onClose: () => void;

  let name = tower?.name ?? '';
  let callSign = tower?.callSign ?? '';
  let requiredStaff = tower?.requiredStaff ?? 2;
  let presentStaff = tower?.presentStaff ?? 0;
  let latitude = tower?.latitude ?? lat;
  let longitude = tower?.longitude ?? lng;
  let busy = false;

  async function submit() {
    busy = true;
    const payload = {
      name,
      callSign: callSign || undefined,
      requiredStaff: Number(requiredStaff),
      presentStaff: Number(presentStaff),
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined
    };
    try {
      if (tower) await apiPatch(`/api/towers/${tower.id}`, payload);
      else await apiPost('/api/towers', payload);
      await refreshTowers();
      showToast(tower ? 'Turm gespeichert' : 'Turm angelegt', 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={tower ? 'Turm bearbeiten' : 'Turm anlegen'} {onClose}>
  <form on:submit|preventDefault={submit}>
    <div class="field"><label for="tn">Name</label><input id="tn" bind:value={name} required /></div>
    <div class="field"><label for="tc">Funkrufname</label><input id="tc" bind:value={callSign} /></div>
    <div class="grid2">
      <div class="field"><label for="trs">Soll-Besetzung</label><input id="trs" type="number" min="1" max="99" bind:value={requiredStaff} /></div>
      <div class="field"><label for="tps">Aktuell anwesend</label><input id="tps" type="number" min="0" max="99" bind:value={presentStaff} /></div>
    </div>
    <div class="grid2">
      <div class="field"><label for="tla">Breite (lat)</label><input id="tla" type="number" step="any" bind:value={latitude} /></div>
      <div class="field"><label for="tlo">Länge (lng)</label><input id="tlo" type="number" step="any" bind:value={longitude} /></div>
    </div>
    <div class="row" style="justify-content:flex-end;">
      <button type="button" class="ghost" on:click={onClose}>Abbrechen</button>
      <button class="primary" disabled={busy}>Speichern</button>
    </div>
  </form>
</Modal>
