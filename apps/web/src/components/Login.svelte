<script lang="ts">
  import { onMount } from 'svelte';
  import type { CurrentUser } from '@turmstatus/shared';
  import { apiGet, apiPost, ApiError } from '../lib/api.js';
  import { currentUser, showToast } from '../lib/stores.js';

  let mode: 'login' | 'setup' | 'register' = 'login';
  let username = '';
  let password = '';
  let fullName = '';
  let code = '';
  let rememberMe = false;
  let busy = false;
  let regEnabled = false;
  let regRequiresCode = false;

  onMount(async () => {
    try {
      const setup = await apiGet<{ needsSetup: boolean }>('/api/auth/needs-setup');
      if (setup.needsSetup) mode = 'setup';
      const reg = await apiGet<{ enabled: boolean; requiresCode: boolean }>('/api/auth/registration-status');
      regEnabled = reg.enabled;
      regRequiresCode = reg.requiresCode;
    } catch {
      /* ignore */
    }
  });

  async function submit() {
    busy = true;
    try {
      let res: { user: CurrentUser };
      if (mode === 'login') {
        res = await apiPost('/api/auth/login', { username, password, rememberMe });
      } else if (mode === 'setup') {
        res = await apiPost('/api/auth/init', { username, password, fullName: fullName || undefined });
      } else {
        res = await apiPost('/api/auth/register', {
          username,
          password,
          fullName: fullName || undefined,
          code: code || undefined
        });
      }
      currentUser.set(res.user);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Anmeldung fehlgeschlagen', 'error');
    } finally {
      busy = false;
    }
  }
</script>

<div class="center-screen">
  <div class="modal" style="max-width: 380px;">
    <h3 style="color: var(--sea-bright);">Turmstatus</h3>
    <p class="muted small">
      {#if mode === 'login'}Wach- und Statussystem – bitte anmelden.
      {:else if mode === 'setup'}Erst-Einrichtung: Administrator (Hauptwache) anlegen.
      {:else}Neues Wachführer-Konto registrieren.{/if}
    </p>

    <form on:submit|preventDefault={submit}>
      <div class="field">
        <label for="u">Benutzername</label>
        <input id="u" bind:value={username} autocomplete="username" required />
      </div>
      <div class="field">
        <label for="p">Passwort</label>
        <input id="p" type="password" bind:value={password} autocomplete="current-password" required />
      </div>
      {#if mode !== 'login'}
        <div class="field">
          <label for="fn">Name (optional)</label>
          <input id="fn" bind:value={fullName} />
        </div>
      {/if}
      {#if mode === 'register' && regRequiresCode}
        <div class="field">
          <label for="code">Registrierungscode</label>
          <input id="code" bind:value={code} required />
        </div>
      {/if}
      {#if mode === 'login'}
        <label class="row small"><input type="checkbox" style="width:auto" bind:checked={rememberMe} /> Angemeldet bleiben</label>
      {/if}
      <button class="primary" style="width:100%; margin-top:10px;" disabled={busy}>
        {mode === 'login' ? 'Anmelden' : mode === 'setup' ? 'Einrichten' : 'Registrieren'}
      </button>
    </form>

    {#if mode !== 'setup' && regEnabled}
      <p class="small muted" style="margin-top:12px;">
        {#if mode === 'login'}
          Kein Konto? <button class="ghost small" on:click={() => (mode = 'register')}>Registrieren</button>
        {:else}
          <button class="ghost small" on:click={() => (mode = 'login')}>Zurück zur Anmeldung</button>
        {/if}
      </p>
    {/if}
  </div>
</div>
