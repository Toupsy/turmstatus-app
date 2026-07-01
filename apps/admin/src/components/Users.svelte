<script lang="ts">
  import { onMount } from 'svelte';
  import type { UserDto, Role } from '@turmstatus/shared';
  import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '../lib/api.js';
  import { config, showToast } from '../lib/stores.js';
  import { labelOf, fmtTime } from '../lib/util.js';
  import Modal from './Modal.svelte';

  let users: UserDto[] = [];
  let editing: UserDto | 'new' | null = null;
  let username = '';
  let password = '';
  let fullName = '';
  let role: Role = 'WACHFUEHRER';
  let isAdmin = false;
  let isActive = true;
  let busy = false;

  async function load() {
    try {
      users = await apiGet<UserDto[]>('/api/admin/users');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler beim Laden', 'error');
    }
  }
  onMount(load);

  function openNew() {
    editing = 'new';
    username = '';
    password = '';
    fullName = '';
    role = 'WACHFUEHRER';
    isAdmin = false;
    isActive = true;
  }
  function openEdit(u: UserDto) {
    editing = u;
    username = u.username;
    fullName = u.fullName ?? '';
    role = u.role;
    isAdmin = u.isAdmin;
    isActive = u.isActive;
  }

  async function save() {
    busy = true;
    try {
      if (editing === 'new') {
        await apiPost('/api/admin/users', { username, password, fullName: fullName || undefined, role, isAdmin });
      } else if (editing) {
        await apiPatch(`/api/admin/users/${editing.id}`, { fullName: fullName || undefined, role, isAdmin, isActive });
      }
      await load();
      showToast('Gespeichert', 'success');
      editing = null;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    } finally {
      busy = false;
    }
  }

  async function resetPw(u: UserDto) {
    const pw = prompt(`Neues Passwort für ${u.username}:`);
    if (!pw) return;
    try {
      await apiPost(`/api/admin/users/${u.id}/reset-password`, { password: pw });
      showToast('Passwort zurückgesetzt', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    }
  }
  async function del(u: UserDto) {
    if (!confirm(`Benutzer „${u.username}" löschen?`)) return;
    try {
      await apiDelete(`/api/admin/users/${u.id}`);
      await load();
      showToast('Gelöscht', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    }
  }
</script>

<div class="panel">
  <div class="spread">
    <h2>Benutzer</h2>
    <button class="primary small" on:click={openNew}>+ Wachführer / Admin</button>
  </div>
  <table>
    <thead><tr><th>Benutzer</th><th>Name</th><th>Rolle</th><th>Admin</th><th>Aktiv</th><th>Letzter Login</th><th></th></tr></thead>
    <tbody>
      {#each users as u (u.id)}
        <tr>
          <td>{u.username}</td>
          <td class="muted">{u.fullName ?? '–'}</td>
          <td>{labelOf($config, 'roleLabels', u.role)}</td>
          <td>{u.isAdmin ? '✓' : '—'}</td>
          <td>{u.isActive ? '✓' : '—'}</td>
          <td class="muted small">{fmtTime(u.lastLogin)}</td>
          <td class="row">
            <button class="ghost small" on:click={() => openEdit(u)}>Bearbeiten</button>
            <button class="ghost small" on:click={() => resetPw(u)}>Passwort</button>
            <button class="danger small" on:click={() => del(u)}>Löschen</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

{#if editing}
  <Modal title={editing === 'new' ? 'Benutzer anlegen' : 'Benutzer bearbeiten'} onClose={() => (editing = null)}>
    <form on:submit|preventDefault={save}>
      <div class="field"><label for="un">Benutzername</label><input id="un" bind:value={username} disabled={editing !== 'new'} required /></div>
      {#if editing === 'new'}
        <div class="field"><label for="pw">Passwort</label><input id="pw" type="password" bind:value={password} required minlength="6" /></div>
      {/if}
      <div class="field"><label for="fn">Name</label><input id="fn" bind:value={fullName} /></div>
      <div class="grid2">
        <div class="field">
          <label for="rl">Rolle</label>
          <select id="rl" bind:value={role}>
            <option value="WACHFUEHRER">Wachführer</option>
            <option value="HAUPTWACHE">Hauptwache (Admin)</option>
          </select>
        </div>
        {#if editing !== 'new'}
          <div class="field"><label for="ia">Aktiv</label><select id="ia" bind:value={isActive}><option value={true}>Ja</option><option value={false}>Nein</option></select></div>
        {/if}
      </div>
      <label class="row small"><input type="checkbox" style="width:auto" bind:checked={isAdmin} /> Administrator-Rechte</label>
      <div class="row" style="justify-content:flex-end; margin-top:10px;">
        <button type="button" class="ghost" on:click={() => (editing = null)}>Abbrechen</button>
        <button class="primary" disabled={busy}>Speichern</button>
      </div>
    </form>
  </Modal>
{/if}
