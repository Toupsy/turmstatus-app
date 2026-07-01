<script lang="ts">
  import { onMount } from 'svelte';
  import type { AppConfig, CurrentUser } from '@turmstatus/shared';
  import { apiGet, apiPost } from './lib/api.js';
  import { config, currentUser } from './lib/stores.js';
  import Login from './components/Login.svelte';
  import Users from './components/Users.svelte';
  import Templates from './components/Templates.svelte';
  import Audit from './components/Audit.svelte';
  import Toasts from './components/Toasts.svelte';

  let loading = true;
  let tab: 'users' | 'templates' | 'audit' = 'users';

  onMount(async () => {
    try {
      config.set(await apiGet<AppConfig>('/api/config'));
      const me = await apiGet<{ user: CurrentUser | null }>('/api/auth/me');
      if (me.user?.isAdmin) currentUser.set(me.user);
    } catch {
      /* offline */
    } finally {
      loading = false;
    }
  });

  async function logout() {
    try {
      await apiPost('/api/auth/logout');
    } catch {
      /* ignore */
    }
    currentUser.set(null);
  }
</script>

{#if loading}
  <div class="center-screen"><p class="muted">Lädt …</p></div>
{:else if !$currentUser}
  <Login />
{:else}
  <header class="app">
    <h1>🛟 Turmstatus · Admin</h1>
    <div class="spacer"></div>
    <span class="chip">intern</span>
    <span class="small">{$currentUser.fullName || $currentUser.username}</span>
    <button class="ghost small" on:click={logout}>Abmelden</button>
  </header>
  <nav class="tabs">
    <button class:active={tab === 'users'} on:click={() => (tab = 'users')}>Benutzer</button>
    <button class:active={tab === 'templates'} on:click={() => (tab = 'templates')}>Demo-Konfiguration</button>
    <button class:active={tab === 'audit'} on:click={() => (tab = 'audit')}>Audit-Log</button>
  </nav>
  <main>
    {#if tab === 'users'}<Users />
    {:else if tab === 'templates'}<Templates />
    {:else if tab === 'audit'}<Audit />{/if}
  </main>
{/if}

<Toasts />
