<script lang="ts">
  import { onMount } from 'svelte';
  import type { AppConfig, CurrentUser } from '@turmstatus/shared';
  import { apiGet } from './lib/api.js';
  import { config, currentUser, canManage, isAdmin, refreshAll } from './lib/stores.js';
  import { startRealtime } from './lib/ws.js';
  import Login from './components/Login.svelte';
  import Header from './components/Header.svelte';
  import Toasts from './components/Toasts.svelte';
  import MapView from './components/MapView.svelte';
  import Dashboard from './components/Dashboard.svelte';
  import Requests from './components/Requests.svelte';
  import Team from './components/Team.svelte';

  let loading = true;
  let tab: 'map' | 'dashboard' | 'requests' | 'team' = 'map';
  let initialized = false;

  onMount(async () => {
    try {
      config.set(await apiGet<AppConfig>('/api/config'));
      const me = await apiGet<{ user: CurrentUser | null }>('/api/auth/me');
      currentUser.set(me.user);
    } catch {
      /* offline */
    } finally {
      loading = false;
    }
  });

  // Beim Wechsel von „nicht angemeldet" → „angemeldet" Daten laden + Live-Updates starten.
  $: if ($currentUser && !initialized) {
    initialized = true;
    void refreshAll();
    startRealtime();
  }
  $: if (!$currentUser) initialized = false;
  // Nach einem Demo-Rollenwechsel weg vom Personal-Tab, wenn die Rolle ihn nicht hat.
  $: if (!$canManage && tab === 'team') tab = 'map';
</script>

{#if loading}
  <div class="center-screen"><p class="muted">Lädt …</p></div>
{:else if !$currentUser}
  <Login />
{:else}
  <Header />
  <nav class="tabs">
    <button class:active={tab === 'map'} on:click={() => (tab = 'map')}>Karte</button>
    <button class:active={tab === 'dashboard'} on:click={() => (tab = 'dashboard')}>Dashboard</button>
    <button class:active={tab === 'requests'} on:click={() => (tab = 'requests')}>Anfragen</button>
    {#if $canManage}<button class:active={tab === 'team'} on:click={() => (tab = 'team')}>Personal</button>{/if}
  </nav>
  <main>
    {#if $isAdmin}
      <div class="panel small muted">
        Administrator-Ansicht (nur lesend). Benutzer-/Vorlagenverwaltung läuft im internen Admin-Panel.
      </div>
    {/if}
    {#if tab === 'map'}<MapView />
    {:else if tab === 'dashboard'}<Dashboard />
    {:else if tab === 'requests'}<Requests />
    {:else if tab === 'team' && $canManage}<Team />{/if}
  </main>
{/if}

<Toasts />
