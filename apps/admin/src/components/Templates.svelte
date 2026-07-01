<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import L from 'leaflet';
  import type { TowerTemplateDto, BoatTemplateDto, BoatStatus } from '@turmstatus/shared';
  import { BOAT_STATUSES } from '@turmstatus/shared';
  import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '../lib/api.js';
  import { config, showToast } from '../lib/stores.js';
  import { labelOf } from '../lib/util.js';
  import Modal from './Modal.svelte';

  let towerTpls: TowerTemplateDto[] = [];
  let boatTpls: BoatTemplateDto[] = [];

  let mapEl: HTMLDivElement;
  let map: L.Map | null = null;
  let layer: L.LayerGroup;
  let ready = false;
  let ctx: { x: number; y: number; lat: number; lng: number } | null = null;

  let towerModal: { tpl: TowerTemplateDto | null; lat: number | null; lng: number | null } | null = null;
  let boatModal: { tpl: BoatTemplateDto | null; lat: number | null; lng: number | null } | null = null;

  // Modal-Felder
  let tName = '';
  let tCall = '';
  let tReq = 2;
  let tLat: number | null = null;
  let tLng: number | null = null;
  let bName = '';
  let bCall = '';
  let bStatus: BoatStatus = 'AT_TOWER';
  let bLat: number | null = null;
  let bLng: number | null = null;

  async function load() {
    try {
      towerTpls = await apiGet<TowerTemplateDto[]>('/api/admin/tower-templates');
      boatTpls = await apiGet<BoatTemplateDto[]>('/api/admin/boat-templates');
      draw();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    }
  }

  function icon(html: string) {
    return L.divIcon({ html, className: '', iconSize: [26, 26], iconAnchor: [13, 13] });
  }

  function draw() {
    if (!ready) return;
    layer.clearLayers();
    for (const t of towerTpls) {
      if (t.latitude == null || t.longitude == null) continue;
      const m = L.marker([t.latitude, t.longitude], { draggable: true, icon: icon('<div class="map-marker">📍</div>') })
        .bindTooltip(t.name, { permanent: true, direction: 'top', className: 'tower-label', offset: [0, -14] });
      m.on('dragend', async () => {
        const p = m.getLatLng();
        await apiPatch(`/api/admin/tower-templates/${t.id}`, { latitude: p.lat, longitude: p.lng });
        await load();
      });
      m.addTo(layer);
    }
    for (const b of boatTpls) {
      if (b.latitude == null || b.longitude == null) continue;
      const m = L.marker([b.latitude, b.longitude], { draggable: true, icon: icon('<div class="map-marker">⛵</div>') })
        .bindTooltip(b.name, { permanent: true, direction: 'top', className: 'tower-label', offset: [0, -14] });
      m.on('dragend', async () => {
        const p = m.getLatLng();
        await apiPatch(`/api/admin/boat-templates/${b.id}`, { latitude: p.lat, longitude: p.lng });
        await load();
      });
      m.addTo(layer);
    }
  }

  onMount(async () => {
    try {
      config.set(await apiGet('/api/config'));
    } catch {
      /* ignore */
    }
    const c = $config?.map;
    map = L.map(mapEl).setView(c?.center ?? [54.21449, 11.08967], c?.zoom ?? 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    layer = L.layerGroup().addTo(map);
    ready = true;
    map.on('click', () => (ctx = null));
    map.on('contextmenu', (e: L.LeafletMouseEvent) => (ctx = { x: e.containerPoint.x, y: e.containerPoint.y, lat: e.latlng.lat, lng: e.latlng.lng }));
    map.on('movestart', () => (ctx = null));
    await load();
    setTimeout(() => map?.invalidateSize(), 100);
  });
  onDestroy(() => map?.remove());

  function openTower(tpl: TowerTemplateDto | null, lat: number | null = null, lng: number | null = null) {
    towerModal = { tpl, lat, lng };
    tName = tpl?.name ?? '';
    tCall = tpl?.callSign ?? '';
    tReq = tpl?.requiredStaff ?? 2;
    tLat = tpl?.latitude ?? lat;
    tLng = tpl?.longitude ?? lng;
    ctx = null;
  }
  function openBoat(tpl: BoatTemplateDto | null, lat: number | null = null, lng: number | null = null) {
    boatModal = { tpl, lat, lng };
    bName = tpl?.name ?? '';
    bCall = tpl?.callSign ?? '';
    bStatus = tpl?.status ?? 'AT_TOWER';
    bLat = tpl?.latitude ?? lat;
    bLng = tpl?.longitude ?? lng;
    ctx = null;
  }

  async function saveTower() {
    const payload = { name: tName, callSign: tCall || undefined, requiredStaff: Number(tReq), latitude: tLat ?? undefined, longitude: tLng ?? undefined };
    try {
      if (towerModal?.tpl) await apiPatch(`/api/admin/tower-templates/${towerModal.tpl.id}`, payload);
      else await apiPost('/api/admin/tower-templates', payload);
      towerModal = null;
      await load();
      showToast('Vorlage gespeichert', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    }
  }
  async function saveBoat() {
    const payload = { name: bName, callSign: bCall || undefined, status: bStatus, latitude: bLat ?? undefined, longitude: bLng ?? undefined };
    try {
      if (boatModal?.tpl) await apiPatch(`/api/admin/boat-templates/${boatModal.tpl.id}`, payload);
      else await apiPost('/api/admin/boat-templates', payload);
      boatModal = null;
      await load();
      showToast('Vorlage gespeichert', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    }
  }
  async function delTower(t: TowerTemplateDto) {
    if (!confirm(`Vorlage „${t.name}" löschen?`)) return;
    await apiDelete(`/api/admin/tower-templates/${t.id}`);
    await load();
  }
  async function delBoat(b: BoatTemplateDto) {
    if (!confirm(`Vorlage „${b.name}" löschen?`)) return;
    await apiDelete(`/api/admin/boat-templates/${b.id}`);
    await load();
  }
</script>

<div class="panel">
  <h2>Demo-Konfiguration · Karte</h2>
  <p class="muted small">Vorlagen werden neuen Wachführern als Start-Türme/-Boote in ihren Bereich geklont. Marker ziehen = Position; Rechtsklick = anlegen.</p>
  <div style="position:relative;">
    <div id="map" bind:this={mapEl}></div>
    {#if ctx}
      <div class="map-context" style="left:{ctx.x}px; top:{ctx.y}px;">
        <button on:click={() => openTower(null, ctx!.lat, ctx!.lng)}>📍 Turm-Vorlage hier</button>
        <button on:click={() => openBoat(null, ctx!.lat, ctx!.lng)}>⛵ Boot-Vorlage hier</button>
      </div>
    {/if}
  </div>
</div>

<div class="panel">
  <div class="spread"><h2>Turm-Vorlagen</h2><button class="primary small" on:click={() => openTower(null)}>+ Turm-Vorlage</button></div>
  <table>
    <thead><tr><th>Name</th><th>Funk</th><th>Soll</th><th>Position</th><th></th></tr></thead>
    <tbody>
      {#each towerTpls as t (t.id)}
        <tr>
          <td>{t.name}</td><td class="muted">{t.callSign ?? '–'}</td><td>{t.requiredStaff}</td>
          <td class="muted small">{t.latitude != null ? `${t.latitude.toFixed(4)}, ${t.longitude?.toFixed(4)}` : '–'}</td>
          <td class="row"><button class="ghost small" on:click={() => openTower(t)}>Bearbeiten</button><button class="danger small" on:click={() => delTower(t)}>Löschen</button></td>
        </tr>
      {/each}
      {#if towerTpls.length === 0}<tr><td colspan="5" class="muted">Keine Vorlagen.</td></tr>{/if}
    </tbody>
  </table>
</div>

<div class="panel">
  <div class="spread"><h2>Boot-Vorlagen</h2><button class="primary small" on:click={() => openBoat(null)}>+ Boot-Vorlage</button></div>
  <table>
    <thead><tr><th>Name</th><th>Funk</th><th>Status</th><th>Position</th><th></th></tr></thead>
    <tbody>
      {#each boatTpls as b (b.id)}
        <tr>
          <td>{b.name}</td><td class="muted">{b.callSign ?? '–'}</td><td>{labelOf($config, 'boatStatus', b.status)}</td>
          <td class="muted small">{b.latitude != null ? `${b.latitude.toFixed(4)}, ${b.longitude?.toFixed(4)}` : '–'}</td>
          <td class="row"><button class="ghost small" on:click={() => openBoat(b)}>Bearbeiten</button><button class="danger small" on:click={() => delBoat(b)}>Löschen</button></td>
        </tr>
      {/each}
      {#if boatTpls.length === 0}<tr><td colspan="5" class="muted">Keine Vorlagen.</td></tr>{/if}
    </tbody>
  </table>
</div>

{#if towerModal}
  <Modal title={towerModal.tpl ? 'Turm-Vorlage bearbeiten' : 'Turm-Vorlage anlegen'} onClose={() => (towerModal = null)}>
    <form on:submit|preventDefault={saveTower}>
      <div class="field"><label for="tn">Name</label><input id="tn" bind:value={tName} required /></div>
      <div class="field"><label for="tc">Funkrufname</label><input id="tc" bind:value={tCall} /></div>
      <div class="field"><label for="tr">Soll-Besetzung</label><input id="tr" type="number" min="1" max="99" bind:value={tReq} /></div>
      <div class="grid2">
        <div class="field"><label for="tla">Breite</label><input id="tla" type="number" step="any" bind:value={tLat} /></div>
        <div class="field"><label for="tlo">Länge</label><input id="tlo" type="number" step="any" bind:value={tLng} /></div>
      </div>
      <div class="row" style="justify-content:flex-end;"><button type="button" class="ghost" on:click={() => (towerModal = null)}>Abbrechen</button><button class="primary">Speichern</button></div>
    </form>
  </Modal>
{/if}

{#if boatModal}
  <Modal title={boatModal.tpl ? 'Boot-Vorlage bearbeiten' : 'Boot-Vorlage anlegen'} onClose={() => (boatModal = null)}>
    <form on:submit|preventDefault={saveBoat}>
      <div class="field"><label for="bn">Name</label><input id="bn" bind:value={bName} required /></div>
      <div class="field"><label for="bc">Funkrufname</label><input id="bc" bind:value={bCall} /></div>
      <div class="field">
        <label for="bs">Status</label>
        <select id="bs" bind:value={bStatus}>{#each BOAT_STATUSES as s}<option value={s}>{labelOf($config, 'boatStatus', s)}</option>{/each}</select>
      </div>
      <div class="grid2">
        <div class="field"><label for="bla">Breite</label><input id="bla" type="number" step="any" bind:value={bLat} /></div>
        <div class="field"><label for="blo">Länge</label><input id="blo" type="number" step="any" bind:value={bLng} /></div>
      </div>
      <div class="row" style="justify-content:flex-end;"><button type="button" class="ghost" on:click={() => (boatModal = null)}>Abbrechen</button><button class="primary">Speichern</button></div>
    </form>
  </Modal>
{/if}
