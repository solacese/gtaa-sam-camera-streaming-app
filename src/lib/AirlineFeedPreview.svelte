<script>
  import { onMount, onDestroy } from 'svelte';
  import { INACTIVE_FRAME } from './common/solace';
  import { feedTopic } from './common/airlines';

  /**
   * One preview tile on the control panel's feed wall. Each tile subscribes to
   * its own airline topic through the broker — the same path the airline's
   * viewing room takes — so the wall shows exactly what subscribers see. Only
   * the routed airline receives frames; the others stay dark.
   */
  let {
    solaceClient,
    airline,
    sessionId = null,
    isSelected = false,
    onSelect = null
  } = $props();

  /** A feed with no frame for this long is treated as offline. */
  const STALE_AFTER_MS = 1500;

  const topic = $derived(feedTopic(airline.id, sessionId));

  let imgElement = $state(null);
  let live = $state(false);
  let frameCount = $state(0);
  let lastFrameAt = 0;
  let staleTimer = null;

  function handleFrame(payload) {
    if (payload === INACTIVE_FRAME) {
      live = false;
      lastFrameAt = 0;
      return;
    }
    if (typeof payload !== 'string' || !payload.startsWith('data:image/')) return;
    if (imgElement) imgElement.src = payload;
    lastFrameAt = Date.now();
    live = true;
    frameCount += 1;
  }

  // Subscription follows the topic, so a changed airline/session prop re-points
  // the tile instead of leaving it bound to the topic it first mounted with.
  $effect(() => {
    const boundTopic = topic;
    live = false;
    frameCount = 0;
    lastFrameAt = 0;

    solaceClient.subscribeToFrames(boundTopic, handleFrame, {
      synthetic: false,
      label: airline.name,
      code: airline.code,
      primary: airline.colors.primary,
      accent: airline.colors.accent
    });

    return () => solaceClient.unsubscribeFromFrames(boundTopic, handleFrame);
  });

  onMount(() => {
    staleTimer = setInterval(() => {
      if (live && Date.now() - lastFrameAt > STALE_AFTER_MS) live = false;
    }, 500);
  });

  onDestroy(() => {
    if (staleTimer) clearInterval(staleTimer);
  });
</script>

<div
  class="relative overflow-hidden rounded-2xl border-2 transition-all duration-300 bg-gtaa-ink"
  style="border-color: {isSelected ? airline.colors.primary : 'rgba(31,42,68,0.15)'}; box-shadow: {isSelected ? `0 0 0 3px ${airline.colors.primary}22` : 'none'};"
>
  <!-- Tile header -->
  <div
    class="flex items-center gap-2 px-3 py-2"
    style="background: {airline.colors.primary}; color: {airline.colors.onPrimary};"
  >
    <span class="font-display font-bold text-xs tracking-wider">{airline.code}</span>
    <span class="text-[11px] font-semibold truncate opacity-90">{airline.shortName}</span>
    <span class="ml-auto flex items-center gap-1.5 text-[10px] font-bold tracking-wider shrink-0">
      {#if live}
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"></span> LIVE
      {:else}
        <span class="w-1.5 h-1.5 rounded-full bg-white/40"></span> OFFLINE
      {/if}
    </span>
  </div>

  <!-- Frame area -->
  <div class="relative aspect-video w-full bg-gtaa-ink">
    <img
      bind:this={imgElement}
      class="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
      style="opacity: {live ? 1 : 0};"
      alt="{airline.name} camera preview"
    />

    {#if !live}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center">
        <svg class="w-6 h-6" style="color: {airline.colors.accent}; opacity: 0.55;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0L21 21" />
        </svg>
        <p class="text-[10px] font-semibold uppercase tracking-widest text-white/45">No feed routed</p>
      </div>
    {/if}

    <!-- Scan-line chrome so the tile reads as a camera, not a photo -->
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute inset-x-0 top-0 h-px" style="background: linear-gradient(90deg, transparent, {airline.colors.accent}, transparent);"></div>
    </div>

    {#if isSelected}
      <span
        class="absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest"
        style="background: {airline.colors.primary}; color: {airline.colors.onPrimary};"
      >
        Routed
      </span>
    {/if}
  </div>

  <!-- Tile footer -->
  <div class="flex items-center justify-between gap-2 bg-white px-3 py-2">
    <span class="font-mono text-[9px] text-slate-400 truncate" title={topic}>{topic}</span>
    <span class="font-mono text-[10px] font-semibold shrink-0" style="color: {airline.colors.primary};">
      {frameCount.toLocaleString()} f
    </span>
  </div>

  {#if onSelect && !isSelected}
    <button
      type="button"
      onclick={() => onSelect(airline.id)}
      class="absolute inset-0 z-10 flex items-center justify-center bg-gtaa-ink/0 hover:bg-gtaa-ink/45 transition-colors group"
      aria-label={`Route the camera to ${airline.name}`}
    >
      <span
        class="opacity-0 group-hover:opacity-100 transition-opacity rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest shadow-lg"
        style="background: {airline.colors.primary}; color: {airline.colors.onPrimary};"
      >
        Route here
      </span>
    </button>
  {/if}
</div>
