<script lang="ts">
  import type { UserDto, Role } from '@turmstatus/shared';
  import { teamMembers, config, showToast, refreshTeam } from '../lib/stores.js';
  import { apiPost, apiPatch, apiDelete, ApiError } from '../lib/api.js';
  import { labelOf, fmtTime } from '../lib/util.js';
  import Modal from './Modal.svelte';

  let editing: UserDto | 'new' | null = null;
  let username = '';
  let password = '';
  let fullName = '';
  let role: Role = 'WACHGAENGER';
  let isActive = true;
  let busy = false;

  function openNew() {
    editing = 'new';
    username = '';
    password = '';
    fullName = '';
    role = 'WACHGAENGER';
    isActive = true;
  }
  function openEdit(u: UserDto) {
    editing = u;
    username = u.username;
    fullName = u.fullName ?? '';
    role = u.role;
    isActive = u.isActive;
    password = '';
  }

  async function save() {
    busy = true;
    try {
      if (editing === 'new') {
        await apiPost('/api/team/members', { username, password, fullName: fullName || undefined, role });
      } else if (editing) {
        await apiPatch(`/api/team/members/${editing.id}`, { fullName: fullName || undefined, role, isActive });
      }
      await refreshTeam();
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
      await apiPost(`/api/team/members/${u.id}/reset-password`, { password: pw });
      showToast('Passwort zurückgesetzt', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    }
  }
  async function del(u: UserDto) {
    if (!confirm(`Mitglied „${u.username}" löschen?`)) return;
    try {
      await apiDelete(`/api/team/members/${u.id}`);
      await refreshTeam();
      showToast('Gelöscht', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Fehler', 'error');
    }
  }
</script>

<div class="panel">
  <div class="spread">
    <h2>Wachpersonal</h2>
    <button class="primary small" on:click={openNew}>+ Mitglied</button>
  </div>
  <table>
    <thead><tr><th>Benutzer</th><th>Name</th><th>Rolle</th><th>Aktiv</th><th>Letzter Login</th><th></th></tr></thead>
    <tbody>
      {#each $teamMembers as u (u.id)}
        <tr>
          <td>{u.username}</td>
          <td class="muted">{u.fullName ?? '–'}</td>
          <td>{labelOf($config, 'roleLabels', u.role)}</td>
          <td>{u.isActive ? '✓' : '—'}</td>
          <td class="muted small">{fmtTime(u.lastLogin)}</td>
          <td class="row">
            <button class="ghost small" on:click={() => openEdit(u)}>Bearbeiten</button>
            <button class="ghost small" on:click={() => resetPw(u)}>Passwort</button>
            <button class="danger small" on:click={() => del(u)}>Löschen</button>
          </td>
        </tr>
      {/each}
      {#if $teamMembers.length === 0}<tr><td colspan="6" class="muted">Noch kein Personal angelegt.</td></tr>{/if}
    </tbody>
  </table>
</div>

{#if editing}
  <Modal title={editing === 'new' ? 'Mitglied anlegen' : 'Mitglied bearbeiten'} onClose={() => (editing = null)}>
    <form on:submit|preventDefault={save}>
      <div class="field">
        <label for="un">Benutzername</label>
        <input id="un" bind:value={username} disabled={editing !== 'new'} required />
      </div>
      {#if editing === 'new'}
        <div class="field"><label for="pw">Passwort</label><input id="pw" type="password" bind:value={password} required minlength="6" /></div>
      {/if}
      <div class="field"><label for="fn">Name</label><input id="fn" bind:value={fullName} /></div>
      <div class="grid2">
        <div class="field">
          <label for="rl">Rolle</label>
          <select id="rl" bind:value={role}>
            <option value="WACHGAENGER">Wachgänger</option>
            <option value="BOOTSFUEHRER">Bootsführer</option>
          </select>
        </div>
        {#if editing !== 'new'}
          <div class="field"><label for="ia">Aktiv</label><select id="ia" bind:value={isActive}><option value={true}>Ja</option><option value={false}>Nein</option></select></div>
        {/if}
      </div>
      <div class="row" style="justify-content:flex-end;">
        <button type="button" class="ghost" on:click={() => (editing = null)}>Abbrechen</button>
        <button class="primary" disabled={busy}>Speichern</button>
      </div>
    </form>
  </Modal>
{/if}
