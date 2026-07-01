<script lang="ts">
  import type { TowerView, GuardView, BoatView, BoatStatus } from '@turmstatus/shared';
  import { BOAT_STATUSES } from '@turmstatus/shared';
  import {
    towers,
    guards,
    boats,
    summary,
    config,
    canManage,
    isBootsfuehrer,
    currentUser,
    showToast,
    refreshTowers,
    refreshBoats,
    refreshGuards
  } from '../lib/stores.js';
  import { apiPatch, apiDelete, ApiError } from '../lib/api.js';
  import { labelOf } from '../lib/util.js';
  import TowerModal from './TowerModal.svelte';
  import BoatModal from './BoatModal.svelte';
  import GuardModal from './GuardModal.svelte';
  import MinusOneModal from './MinusOneModal.svelte';

  let towerModal: TowerView | null | 'new' = null;
  let boatModal: BoatView | null | 'new' = null;
  let guardModal: GuardView | null | 'new' = null;
  let minusOneGuard: GuardView | null = null;

  const presentTimers = new Map<number, ReturnType<typeof setTimeout>>();

  // Optimistischer Stepper für die manuelle Ist-Besetzung (gebündelte PATCHes).
  function adjustPresent(t: TowerView, delta: number) {
    const next = Math.max(0, t.presentStaff + delta);
    towers.update((list) =>
      list.map((x) => {
        if (x.id !== t.id) return x;
        const currentStaff = x.guardStaff + next;
        const status =
          currentStaff >= x.effectiveRequiredStaff ? 'GREEN' : currentStaff >= x.effectiveRequiredStaff / 2 ? 'YELLOW' : 'RED';
        return { ...x, presentStaff: next, currentStaff, status };
      })
    );
    const existing = presentTimers.get(t.id);
    if (existing) clearTimeout(existing);
    presentTimers.set(
      t.id,
      setTimeout(async () => {
        try {
          await apiPatch(`/api/towers/${t.id}`, { presentStaff: next });
        } catch (err) {
          showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
          await refreshTowers();
        }
      }, 300)
    );
  }

  async function setBoatStatus(b: BoatView, status: BoatStatus) {
    boats.update((list) => list.map((x) => (x.id === b.id ? { ...x, status } : x)));
    try {
      await apiPatch(`/api/boats/${b.id}/status`, { status });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
      await refreshBoats();
    }
  }

  async function setBoatTower(b: BoatView, towerId: string) {
    const tid = towerId === '' ? null : Number(towerId);
    try {
      await apiPatch(`/api/boats/${b.id}`, { towerId: tid });
      await refreshBoats();
      await refreshTowers();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    }
  }

  async function delTower(t: TowerView) {
    if (!confirm(`Turm „${t.name}" löschen?`)) return;
    try {
      await apiDelete(`/api/towers/${t.id}`);
      await refreshTowers();
      showToast('Turm gelöscht', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    }
  }
  async function delBoat(b: BoatView) {
    if (!confirm(`Boot „${b.name}" löschen?`)) return;
    try {
      await apiDelete(`/api/boats/${b.id}`);
      await refreshBoats();
      showToast('Boot gelöscht', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    }
  }
  async function delGuard(g: GuardView) {
    if (!confirm(`Wachgänger „${g.name}" löschen?`)) return;
    try {
      await apiDelete(`/api/guards/${g.id}`);
      await refreshGuards();
      showToast('Wachgänger gelöscht', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    }
  }

  $: canRequestMinusOne = $canManage || $isBootsfuehrer || $currentUser?.role === 'WACHGAENGER';
</script>

<div class="panel">
  <h2>Lageübersicht</h2>
  {#if $summary}
    <div class="cards">
      <div class="card"><div class="big">{$summary.towers}</div><div class="lbl">Türme</div></div>
      <div class="card"><div class="big">{$summary.guardsOnDuty}</div><div class="lbl">Im Dienst</div></div>
      <div class="card"><div class="big">{$summary.guardsMinusOne}</div><div class="lbl">Aktive -1</div></div>
      <div class="card"><div class="big">{$summary.guardsDeployed}</div><div class="lbl">Im Einsatz</div></div>
      <div class="card"><div class="big">{$summary.boats}</div><div class="lbl">Boote ({$summary.boatsAway} weg)</div></div>
      <div class="card"><div class="big">{$summary.openRequests}</div><div class="lbl">Offene Anfragen</div></div>
    </div>
  {/if}
</div>

<div class="panel">
  <div class="spread">
    <h2>Türme</h2>
    {#if $canManage}<button class="primary small" on:click={() => (towerModal = 'new')}>+ Turm</button>{/if}
  </div>
  <table>
    <thead>
      <tr><th>Name</th><th>Funk</th><th>Besetzung</th><th>Status</th><th>Boot</th>{#if $canManage}<th></th>{/if}</tr>
    </thead>
    <tbody>
      {#each $towers as t (t.id)}
        <tr>
          <td>{t.name}</td>
          <td class="muted">{t.callSign ?? '–'}</td>
          <td>
            {#if $canManage}
              <span class="stepper">
                <button on:click={() => adjustPresent(t, -1)}>−</button>
                {t.currentStaff}/{t.effectiveRequiredStaff}
                <button on:click={() => adjustPresent(t, 1)}>+</button>
              </span>
            {:else}{t.currentStaff}/{t.effectiveRequiredStaff}{/if}
          </td>
          <td><span class="pill {t.status}">{labelOf($config, 'towerStatus', t.status)}</span></td>
          <td>
            {#if t.hasBoat}
              {t.boatsAtTower}⚓ {#if t.boatWarning}<span class="boat-warn">⚠ Boot weg</span>{/if}
            {:else}<span class="muted">–</span>{/if}
          </td>
          {#if $canManage}
            <td class="row">
              <button class="ghost small" on:click={() => (towerModal = t)}>Bearbeiten</button>
              <button class="danger small" on:click={() => delTower(t)}>Löschen</button>
            </td>
          {/if}
        </tr>
      {/each}
      {#if $towers.length === 0}<tr><td colspan="6" class="muted">Keine Türme.</td></tr>{/if}
    </tbody>
  </table>
</div>

<div class="panel">
  <div class="spread">
    <h2>Wachgänger</h2>
    {#if $canManage}<button class="primary small" on:click={() => (guardModal = 'new')}>+ Wachgänger</button>{/if}
  </div>
  <table>
    <thead><tr><th>Name</th><th>Turm</th><th>Status</th><th></th></tr></thead>
    <tbody>
      {#each $guards as g (g.id)}
        <tr>
          <td>{g.name}</td>
          <td class="muted">{g.towerName ?? '–'}</td>
          <td><span class="pill {g.status === 'IN_AREA' ? 'GREEN' : g.status === 'MINUS_ONE' ? 'RED' : 'muted'}">{labelOf($config, 'guardStatus', g.status)}</span></td>
          <td class="row">
            {#if canRequestMinusOne && g.status === 'IN_AREA'}
              <button class="ghost small" on:click={() => (minusOneGuard = g)}>-1 beantragen</button>
            {/if}
            {#if $canManage}
              <button class="ghost small" on:click={() => (guardModal = g)}>Bearbeiten</button>
              <button class="danger small" on:click={() => delGuard(g)}>Löschen</button>
            {/if}
          </td>
        </tr>
      {/each}
      {#if $guards.length === 0}<tr><td colspan="4" class="muted">Keine Wachgänger.</td></tr>{/if}
    </tbody>
  </table>
</div>

<div class="panel">
  <div class="spread">
    <h2>Boote</h2>
    {#if $canManage}<button class="primary small" on:click={() => (boatModal = 'new')}>+ Boot</button>{/if}
  </div>
  <table>
    <thead><tr><th>Name</th><th>Funk</th><th>Turm</th><th>Status</th>{#if $canManage}<th></th>{/if}</tr></thead>
    <tbody>
      {#each $boats as b (b.id)}
        <tr>
          <td>{b.name}</td>
          <td class="muted">{b.callSign ?? '–'}</td>
          <td>
            {#if $canManage}
              <select value={b.towerId ?? ''} on:change={(e) => setBoatTower(b, (e.currentTarget as HTMLSelectElement).value)}>
                <option value="">– kein –</option>
                {#each $towers as t}<option value={t.id}>{t.name}</option>{/each}
              </select>
            {:else}{b.towerName ?? '–'}{/if}
          </td>
          <td>
            {#if $canManage || $isBootsfuehrer}
              <select value={b.status} on:change={(e) => setBoatStatus(b, (e.currentTarget as HTMLSelectElement).value as BoatStatus)}>
                {#each BOAT_STATUSES as s}<option value={s}>{labelOf($config, 'boatStatus', s)}</option>{/each}
              </select>
            {:else}{labelOf($config, 'boatStatus', b.status)}{/if}
          </td>
          {#if $canManage}
            <td class="row">
              <button class="ghost small" on:click={() => (boatModal = b)}>Bearbeiten</button>
              <button class="danger small" on:click={() => delBoat(b)}>Löschen</button>
            </td>
          {/if}
        </tr>
      {/each}
      {#if $boats.length === 0}<tr><td colspan="5" class="muted">Keine Boote.</td></tr>{/if}
    </tbody>
  </table>
</div>

{#if towerModal !== null}
  <TowerModal tower={towerModal === 'new' ? null : towerModal} onClose={() => (towerModal = null)} />
{/if}
{#if boatModal !== null}
  <BoatModal boat={boatModal === 'new' ? null : boatModal} towerList={$towers} onClose={() => (boatModal = null)} />
{/if}
{#if guardModal !== null}
  <GuardModal guard={guardModal === 'new' ? null : guardModal} towerList={$towers} onClose={() => (guardModal = null)} />
{/if}
{#if minusOneGuard}
  <MinusOneModal guard={minusOneGuard} onClose={() => (minusOneGuard = null)} />
{/if}
