<script lang="ts">
  import { onMount } from 'svelte';
  import type { AuditEntryDto } from '@turmstatus/shared';
  import { apiGet, ApiError } from '../lib/api.js';
  import { showToast } from '../lib/stores.js';
  import { fmtTime } from '../lib/util.js';

  let entries: AuditEntryDto[] = [];

  onMount(async () => {
    try {
      entries = await apiGet<AuditEntryDto[]>('/api/admin/audit-log?limit=200');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    }
  });
</script>

<div class="panel">
  <h2>Audit-Log</h2>
  <table>
    <thead><tr><th>Zeit</th><th>Akteur</th><th>Aktion</th><th>Objekt</th></tr></thead>
    <tbody>
      {#each entries as e (e.id)}
        <tr>
          <td class="muted small">{fmtTime(e.timestamp)}</td>
          <td>{e.actorName ?? 'System'}</td>
          <td>{e.action}</td>
          <td class="muted small">{e.entityType ?? ''}{e.entityId ? ' #' + e.entityId : ''}</td>
        </tr>
      {/each}
      {#if entries.length === 0}<tr><td colspan="4" class="muted">Keine Einträge.</td></tr>{/if}
    </tbody>
  </table>
</div>
