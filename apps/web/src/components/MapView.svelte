<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import L from 'leaflet';
  import type { TowerView, BoatView } from '@turmstatus/shared';
  import { towers, guards, boats, config, canManage, showToast, refreshTowers } from '../lib/stores.js';
  import { apiPatch, ApiError } from '../lib/api.js';
  import TowerModal from './TowerModal.svelte';
  import BoatModal from './BoatModal.svelte';

  let mapEl: HTMLDivElement;
  let map: L.Map | null = null;
  let towerLayer: L.LayerGroup;
  let guardLayer: L.LayerGroup;
  let boatLayer: L.LayerGroup;
  let ready = false;

  let addTowerMode = false;
  let ctx: { x: number; y: number; lat: number; lng: number } | null = null;
  let towerModal: { tower: TowerView | null; lat: number | null; lng: number | null } | null = null;
  let boatModal: { boat: BoatView | null; lat: number | null; lng: number | null } | null = null;

  const COLOR: Record<string, string> = { GREEN: '#3ec98a', YELLOW: '#ffb347', RED: '#ff5a4d' };

  function icon(html: string): L.DivIcon {
    return L.divIcon({ html, className: '', iconSize: [26, 26], iconAnchor: [13, 13] });
  }

  function offset(lat: number, lng: number, meters: number, bearingDeg: number): [number, number] {
    const dLat = (meters * Math.cos((bearingDeg * Math.PI) / 180)) / 111320;
    const dLng = (meters * Math.sin((bearingDeg * Math.PI) / 180)) / (111320 * Math.cos((lat * Math.PI) / 180));
    return [lat + dLat, lng + dLng];
  }

  function drawTowers(list: TowerView[]) {
    if (!ready) return;
    towerLayer.clearLayers();
    for (const t of list) {
      if (t.latitude == null || t.longitude == null) continue;
      const color = COLOR[t.status] ?? '#888';
      const badge = t.hasBoat ? '<span style="font-size:12px">⛵</span>' : '';
      const marker = L.marker([t.latitude, t.longitude], {
        draggable: $canManage,
        icon: icon(`<div class="map-marker" style="color:${color}">🛟${badge}</div>`)
      });
      marker.bindTooltip(`${t.name}${t.callSign ? ' · ' + t.callSign : ''}`, {
        permanent: true,
        direction: 'top',
        className: 'tower-label',
        offset: [0, -14]
      });
      const warn = t.boatWarning ? '<br><span style="color:#ffb347">⚠ Boot nicht am Turm</span>' : '';
      marker.bindPopup(
        `<b>${t.name}</b><br>Besetzung ${t.currentStaff}/${t.effectiveRequiredStaff}<br>Status: ${t.status}${warn}`
      );
      if ($canManage) {
        marker.on('dragend', async () => {
          const p = marker.getLatLng();
          try {
            await apiPatch(`/api/towers/${t.id}`, { latitude: p.lat, longitude: p.lng });
            await refreshTowers();
          } catch (err) {
            showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
            await refreshTowers();
          }
        });
        marker.on('dblclick', () => (towerModal = { tower: t, lat: null, lng: null }));
      }
      marker.addTo(towerLayer);
    }
  }

  function drawGuards() {
    if (!ready) return;
    guardLayer.clearLayers();
    for (const g of $guards) {
      if (g.latitude == null || g.longitude == null) continue;
      L.marker([g.latitude, g.longitude], { icon: icon('<div class="map-marker">🚩</div>') })
        .bindPopup(`<b>${g.name}</b><br>${g.status}`)
        .addTo(guardLayer);
    }
  }

  function drawBoats(list: BoatView[]) {
    if (!ready) return;
    boatLayer.clearLayers();
    const bearing = $config?.map.seaBearing ?? 90;
    const off = $config?.map.patrolOffsetMeters ?? 150;
    for (const b of list) {
      if (b.latitude == null || b.longitude == null) continue;
      let pos: [number, number] = [b.latitude, b.longitude];
      if (b.status === 'PATROL' || b.status === 'DEPLOYED') pos = offset(b.latitude, b.longitude, off, bearing);
      const color = b.status === 'OUT_OF_SERVICE' ? '#ff5a4d' : b.status === 'AT_TOWER' ? '#3ec98a' : '#4fd0ef';
      L.marker(pos, { icon: icon(`<div class="map-marker" style="color:${color}">⛵</div>`) })
        .bindPopup(`<b>${b.name}</b><br>${b.status}`)
        .addTo(boatLayer);
    }
  }

  onMount(() => {
    const c = $config?.map;
    map = L.map(mapEl).setView(c?.center ?? [54.21449, 11.08967], c?.zoom ?? 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);
    towerLayer = L.layerGroup().addTo(map);
    guardLayer = L.layerGroup().addTo(map);
    boatLayer = L.layerGroup().addTo(map);
    ready = true;

    map.on('click', (e: L.LeafletMouseEvent) => {
      ctx = null;
      if (addTowerMode) {
        towerModal = { tower: null, lat: e.latlng.lat, lng: e.latlng.lng };
        addTowerMode = false;
      }
    });
    map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      if (!$canManage) return;
      ctx = { x: e.containerPoint.x, y: e.containerPoint.y, lat: e.latlng.lat, lng: e.latlng.lng };
    });
    map.on('movestart', () => (ctx = null));

    drawTowers($towers);
    drawGuards();
    drawBoats($boats);
    setTimeout(() => map?.invalidateSize(), 100);
  });

  onDestroy(() => map?.remove());

  $: drawTowers($towers);
  $: if ($guards) drawGuards();
  $: drawBoats($boats);
</script>

<div class="panel">
  <div class="spread">
    <h2>Einsatzkarte</h2>
    {#if $canManage}
      <div class="row">
        <button class="small" class:primary={addTowerMode} on:click={() => (addTowerMode = !addTowerMode)}>
          📍 {addTowerMode ? 'Klicke auf die Karte …' : 'Turm auf Karte setzen'}
        </button>
      </div>
    {/if}
  </div>

  <div style="position:relative;">
    <div id="map" bind:this={mapEl}></div>
    {#if ctx}
      <div class="map-context" style="left:{ctx.x}px; top:{ctx.y}px;">
        <button on:click={() => { towerModal = { tower: null, lat: ctx!.lat, lng: ctx!.lng }; ctx = null; }}>📍 Turm hier anlegen</button>
        <button on:click={() => { boatModal = { boat: null, lat: ctx!.lat, lng: ctx!.lng }; ctx = null; }}>⛵ Boot hier anlegen</button>
      </div>
    {/if}
  </div>

  <div class="legend">
    <span><span class="dot" style="background:#3ec98a"></span>Besetzt</span>
    <span><span class="dot" style="background:#ffb347"></span>Reduziert</span>
    <span><span class="dot" style="background:#ff5a4d"></span>Kritisch</span>
    <span>🛟 Turm · 🚩 Wachgänger · ⛵ Boot</span>
  </div>
</div>

{#if towerModal}
  <TowerModal tower={towerModal.tower} lat={towerModal.lat} lng={towerModal.lng} onClose={() => (towerModal = null)} />
{/if}
{#if boatModal}
  <BoatModal boat={boatModal.boat} towerList={$towers} lat={boatModal.lat} lng={boatModal.lng} onClose={() => (boatModal = null)} />
{/if}
