<script lang="ts">
  export let title = '';
  export let onClose: () => void = () => {};
</script>

<div class="overlay" on:click|self={onClose} role="presentation">
  <div class="modal">
    <div class="spread">
      <h3>{title}</h3>
      <button class="ghost" on:click={onClose} aria-label="Schließen">✕</button>
    </div>
    <slot />
  </div>
</div>
