<script lang="ts">
  import type { Role } from '@turmstatus/shared';
  import { ROLES } from '@turmstatus/shared';
  import { currentUser, config, showToast, refreshAll } from '../lib/stores.js';
  import { apiPost } from '../lib/api.js';
  import { labelOf } from '../lib/util.js';
  import { stopRealtime } from '../lib/ws.js';
  import { isDemoMode, switchDemoRole, resetDemo } from '../lib/demo.js';
  import PasswordModal from './PasswordModal.svelte';

  let showPw = false;
  const demo = isDemoMode();

  async function logout() {
    stopRealtime();
    try {
      await apiPost('/api/auth/logout');
    } catch {
      /* ignore */
    }
    currentUser.set(null);
  }

  // Demo: Ansicht (Rolle) dieses Tabs wechseln – zweiter Tab kann eine andere
  // Rolle zeigen und sieht die Aktionen hier live (simulierter Realtime-Kanal).
  async function onRoleChange(ev: Event) {
    const role = (ev.currentTarget as HTMLSelectElement).value as Role;
    currentUser.set(switchDemoRole(role));
    await refreshAll();
    showToast(`Ansicht: ${labelOf($config, 'roleLabels', role)}`, 'info');
  }

  async function onResetDemo() {
    if (!confirm('Demo-Daten auf den Ausgangszustand zurücksetzen?')) return;
    currentUser.set(resetDemo());
    await refreshAll();
    showToast('Demo zurückgesetzt', 'success');
  }
</script>

<header class="app">
  <h1>🛟 Turmstatus</h1>
  {#if demo}<span class="chip">DEMO</span>{/if}
  <div class="spacer"></div>
  {#if $currentUser}
    {#if demo}
      <label class="small" for="demo-role">Ansicht:</label>
      <select id="demo-role" value={$currentUser.role} on:change={onRoleChange}>
        {#each ROLES as r}
          <option value={r}>{labelOf($config, 'roleLabels', r)}{r === 'HAUPTWACHE' ? ' (Admin)' : ''}</option>
        {/each}
      </select>
      {#if $currentUser.isAdmin}
        <button class="ghost small" on:click={() => window.open('/admin/', '_blank')} title="Interne Admin-SPA (in der Demo unter /admin/)">
          Admin-Panel
        </button>
      {/if}
      <span class="small">{$currentUser.fullName || $currentUser.username}</span>
      <button class="ghost small" on:click={onResetDemo}>Demo zurücksetzen</button>
    {:else}
      <span class="chip">{labelOf($config, 'roleLabels', $currentUser.role)}</span>
      <span class="small">{$currentUser.fullName || $currentUser.username}</span>
      <button class="ghost small" on:click={() => (showPw = true)}>Passwort</button>
      <button class="ghost small" on:click={logout}>Abmelden</button>
    {/if}
  {/if}
</header>

{#if showPw}
  <PasswordModal onClose={() => (showPw = false)} />
{/if}
