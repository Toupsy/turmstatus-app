<script lang="ts">
  import type { RequestView } from '@turmstatus/shared';
  import { requests, config, canManage, showToast, refreshRequests } from '../lib/stores.js';
  import { apiPost, ApiError } from '../lib/api.js';
  import { labelOf, fmtTime } from '../lib/util.js';
  import Modal from './Modal.svelte';

  let rejecting: RequestView | null = null;
  let rejectReason = '';

  $: pending = $requests.filter((r) => r.status === 'PENDING');
  $: history = $requests.filter((r) => r.status !== 'PENDING');

  // Anzeige-Text pro Anfrage: Kontrollfahrt oder -1-Grund.
  function describe(r: RequestView): string {
    if (r.kind === 'K_FAHRT') return labelOf($config, 'requestKind', 'K_FAHRT');
    return r.reason ? labelOf($config, 'reasons', r.reason) : '–';
  }

  async function act(url: string, ok: string, body?: unknown) {
    try {
      await apiPost(url, body);
      await refreshRequests();
      showToast(ok, 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    }
  }
  async function submitReject() {
    if (!rejecting) return;
    await act(`/api/requests/${rejecting.id}/reject`, 'Abgelehnt', { rejectionReason: rejectReason || undefined });
    rejecting = null;
    rejectReason = '';
  }
</script>

<div class="panel">
  <h2>Offene Anfragen</h2>
  <table>
    <thead><tr><th>Wachgänger</th><th>Turm</th><th>Art / Grund</th><th>Notiz</th><th>Seit</th>{#if $canManage}<th></th>{/if}</tr></thead>
    <tbody>
      {#each pending as r (r.id)}
        <tr>
          <td>{r.guardName ?? '–'}</td>
          <td class="muted">{r.towerName ?? '–'}</td>
          <td>
            {#if r.kind === 'K_FAHRT'}<span class="pill YELLOW">{describe(r)}</span>{:else}{describe(r)}{/if}
          </td>
          <td class="muted">{r.note ?? '–'}</td>
          <td class="muted small">{fmtTime(r.createdAt)}</td>
          {#if $canManage}
            <td class="row">
              {#if r.kind === 'K_FAHRT'}
                <button class="primary small" on:click={() => act(`/api/requests/${r.id}/set-k-fahrt`, 'K-Fahrt gesetzt')}>K-Fahrt setzen</button>
              {:else}
                <button class="primary small" on:click={() => act(`/api/requests/${r.id}/approve`, 'Genehmigt')}>Genehmigen</button>
              {/if}
              <button class="danger small" on:click={() => (rejecting = r)}>Ablehnen</button>
            </td>
          {/if}
        </tr>
      {/each}
      {#if pending.length === 0}<tr><td colspan="6" class="muted">Keine offenen Anfragen.</td></tr>{/if}
    </tbody>
  </table>
</div>

<div class="panel">
  <h2>Verlauf</h2>
  <table>
    <thead><tr><th>Wachgänger</th><th>Grund</th><th>Status</th><th>Zeit</th><th></th></tr></thead>
    <tbody>
      {#each history as r (r.id)}
        <tr>
          <td>{r.guardName ?? '–'}</td>
          <td>{describe(r)}</td>
          <td>
            <span class="pill {r.status === 'APPROVED' ? 'YELLOW' : r.status === 'RETURNED' ? 'GREEN' : 'muted'}">
              {labelOf($config, 'requestStatus', r.status)}
            </span>
          </td>
          <td class="muted small">{fmtTime(r.decidedAt ?? r.createdAt)}</td>
          <td>
            {#if r.status === 'APPROVED'}
              {#if r.kind === 'K_FAHRT'}
                <button class="ghost small" on:click={() => act(`/api/requests/${r.id}/return`, 'K-Fahrt beendet')}>K-Fahrt beenden</button>
              {:else}
                <button class="ghost small" on:click={() => act(`/api/requests/${r.id}/return`, '+1 zurückgemeldet')}>+1 Rückkehr</button>
              {/if}
            {/if}
          </td>
        </tr>
      {/each}
      {#if history.length === 0}<tr><td colspan="5" class="muted">Noch kein Verlauf.</td></tr>{/if}
    </tbody>
  </table>
</div>

{#if rejecting}
  <Modal title="Anfrage ablehnen" onClose={() => (rejecting = null)}>
    <div class="field">
      <label for="rr">Begründung (optional)</label>
      <textarea id="rr" rows="3" bind:value={rejectReason}></textarea>
    </div>
    <div class="row" style="justify-content:flex-end;">
      <button class="ghost" on:click={() => (rejecting = null)}>Abbrechen</button>
      <button class="danger" on:click={submitReject}>Ablehnen</button>
    </div>
  </Modal>
{/if}
