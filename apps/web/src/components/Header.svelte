<script lang="ts">
  import { currentUser, config } from '../lib/stores.js';
  import { apiPost } from '../lib/api.js';
  import { labelOf } from '../lib/util.js';
  import { stopRealtime } from '../lib/ws.js';
  import PasswordModal from './PasswordModal.svelte';

  let showPw = false;

  async function logout() {
    stopRealtime();
    try {
      await apiPost('/api/auth/logout');
    } catch {
      /* ignore */
    }
    currentUser.set(null);
  }
</script>

<header class="app">
  <h1>🛟 Turmstatus</h1>
  <div class="spacer"></div>
  {#if $currentUser}
    <span class="chip">{labelOf($config, 'roleLabels', $currentUser.role)}</span>
    <span class="small">{$currentUser.fullName || $currentUser.username}</span>
    <button class="ghost small" on:click={() => (showPw = true)}>Passwort</button>
    <button class="ghost small" on:click={logout}>Abmelden</button>
  {/if}
</header>

{#if showPw}
  <PasswordModal onClose={() => (showPw = false)} />
{/if}
