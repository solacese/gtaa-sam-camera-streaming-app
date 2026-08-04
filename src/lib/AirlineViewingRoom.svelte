<script>
  import { onMount, onDestroy } from 'svelte';
  import { DEMO_MODE } from './common/config';
  import { INACTIVE_FRAME } from './common/solace';
  import { feedTopic, statusTopic, controlTopic, getAirline } from './common/airlines';
  import GTAALogo from './GTAALogo.svelte';

  /**
   * One airline's viewing room. Subscribes only to that airline's camera topic,
   * so it goes live exactly when operations routes the camera here and drops to
   * standby when the camera moves to another carrier.
   */
  let { solaceClient, airline, onBack, sessionId = null } = $props();

  /** No frame for this long means the feed has moved on. */
  const STALE_AFTER_MS = 2000;

  const FEED_TOPIC = $derived(feedTopic(airline.id, sessionId));
  const STATUS_TOPIC = $derived(statusTopic(airline.id, sessionId));
  const CONTROL_TOPIC = $derived(controlTopic(sessionId));

  let imgElement = $state(null);
  let subscribed = $state(false);
  let live = $state(false);
  let connectionError = $state('');
  let frameCount = $state(0);
  let cameraStatus = $state(null);
  /** Which airline the control panel says currently holds the camera. */
  let routedAirlineId = $state(null);

  let lastFrameAt = 0;
  let staleTimer = null;

  const isRouted = $derived(routedAirlineId === null ? null : routedAirlineId === airline.id);
  const routedAirlineName = $derived(getAirline(routedAirlineId)?.shortName ?? null);

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

  function handleStatus(payload) {
    if (payload && typeof payload === 'object') cameraStatus = payload;
  }

  function handleControl(payload) {
    if (payload && typeof payload === 'object' && 'activeAirlineId' in payload) {
      routedAirlineId = payload.activeAirlineId;
      if (payload.activeAirlineId !== airline.id) live = false;
    }
  }

  // Subscriptions follow the topics, so a changed airline prop re-points the room
  // rather than leaving it bound to whichever carrier it first mounted with.
  $effect(() => {
    const boundFeed = FEED_TOPIC;
    const boundStatus = STATUS_TOPIC;
    const boundControl = CONTROL_TOPIC;
    live = false;
    frameCount = 0;
    lastFrameAt = 0;

    try {
      solaceClient.subscribeToFrames(boundFeed, handleFrame, {
        // With no broker the room still has something to show.
        synthetic: DEMO_MODE,
        label: `${airline.name} · ${airline.terminal}`,
        code: airline.code,
        primary: airline.colors.primary,
        accent: airline.colors.accent
      });
      solaceClient.subscribeToTopic(boundStatus, handleStatus);
      solaceClient.subscribeToTopic(boundControl, handleControl);
      subscribed = true;
    } catch (error) {
      console.error('AirlineViewingRoom: Failed to subscribe:', error);
      connectionError = 'Failed to subscribe to the camera feed';
      subscribed = false;
    }

    return () => {
      try {
        solaceClient.unsubscribeFromFrames(boundFeed, handleFrame);
        solaceClient.unsubscribeFromTopic(boundStatus, handleStatus);
        solaceClient.unsubscribeFromTopic(boundControl, handleControl);
      } catch (error) {
        console.error('AirlineViewingRoom: Error during cleanup:', error);
      }
    };
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

<div class="flex min-h-screen flex-col bg-gradient-to-br from-gtaa-bg via-white to-gtaa-bg">
  <!-- Header -->
  <header class="border-b-4 bg-white shadow-md" style="border-color: {airline.colors.primary};">
    <div class="container mx-auto flex items-center gap-3 px-4 py-3">
      <GTAALogo size={40} />
      <span class="ml-1 hidden items-center gap-2 border-l border-gtaa-slate/15 pl-3 sm:flex">
        <span
          class="rounded-lg px-2 py-0.5 font-display text-xs font-bold"
          style="background: {airline.colors.primary}; color: {airline.colors.onPrimary};"
        >
          {airline.code}
        </span>
        <span class="text-sm font-semibold text-gtaa-slate/70">{airline.shortName} Viewing Room</span>
      </span>

      <div class="ml-auto flex items-center gap-2">
        {#if connectionError}
          <div class="h-3 w-3 rounded-full bg-red-400"></div>
          <span class="text-sm font-medium text-red-500">Error</span>
        {:else if live}
          <div class="h-3 w-3 animate-pulse rounded-full bg-green-400"></div>
          <span class="text-sm font-medium text-gray-600">Live</span>
        {:else if subscribed}
          <div class="h-3 w-3 rounded-full bg-yellow-400"></div>
          <span class="text-sm font-medium text-gray-600">Standby</span>
        {:else}
          <div class="h-3 w-3 animate-pulse rounded-full bg-yellow-400"></div>
          <span class="text-sm font-medium text-gray-600">Connecting</span>
        {/if}
        <button onclick={onBack} class="ml-3 text-sm font-medium text-gtaa-slate transition-colors hover:text-gtaa-blue">
          ← Back
        </button>
      </div>
    </div>
  </header>

  <main class="container mx-auto flex flex-1 flex-col justify-center gap-4 px-4 py-6">
    <div
      class="mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border-2 bg-white shadow-xl"
      style="border-color: {airline.colors.primary}44;"
    >
      <!-- Feed header -->
      <div
        class="flex items-center justify-between gap-3 px-6 py-3"
        style="background: linear-gradient(90deg, {airline.colors.primary}, {airline.colors.dark});"
      >
        <div class="flex min-w-0 items-center gap-3">
          <h2 class="shrink-0 font-display text-xl font-bold text-white">{airline.shortName} Camera</h2>
          <span class="truncate font-mono text-sm text-white/80">{FEED_TOPIC}</span>
        </div>
        <span class="flex shrink-0 items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          {#if connectionError}
            <span class="h-2 w-2 rounded-full bg-red-400"></span> Error
          {:else if live}
            <span class="h-2 w-2 animate-pulse rounded-full bg-green-400"></span> Active
          {:else if subscribed}
            <span class="h-2 w-2 rounded-full bg-yellow-400"></span> Standby
          {:else}
            <span class="h-2 w-2 animate-pulse rounded-full bg-yellow-400"></span> Connecting…
          {/if}
        </span>
      </div>

      <!-- Video area -->
      <div class="relative aspect-video overflow-hidden bg-gradient-to-br from-gtaa-ink via-[#0b1626] to-gtaa-ink">
        <img
          bind:this={imgElement}
          class="absolute inset-0 h-full w-full object-contain transition-opacity duration-300"
          style="opacity: {live ? 1 : 0};"
          alt="{airline.name} terminal camera feed"
        />

        {#if !live}
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="space-y-4 px-6 text-center">
              <div
                class="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-2 backdrop-blur-sm"
                style="background: {airline.colors.primary}22; border-color: {airline.colors.primary}88;"
              >
                <svg class="h-12 w-12" style="color: {airline.colors.accent};" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>

              {#if connectionError}
                <p class="text-lg font-medium text-red-400">{connectionError}</p>
                <p class="text-sm text-gray-400">Check the Solace connection settings</p>
              {:else if !subscribed}
                <p class="text-lg font-medium text-yellow-400">Connecting to Solace…</p>
                <p class="text-sm text-gray-400">Establishing broker connection</p>
              {:else if isRouted === false}
                <p class="text-lg font-medium" style="color: {airline.colors.accent};">Camera routed elsewhere</p>
                <p class="text-sm text-gray-400">
                  Operations currently has the terminal camera on
                  <span class="font-semibold text-white">{routedAirlineName ?? 'another carrier'}</span>.
                  This room goes live the moment it switches to {airline.shortName}.
                </p>
              {:else}
                <p class="text-lg font-medium" style="color: {airline.colors.accent};">Subscribed — waiting for frames</p>
                <p class="font-mono text-xs text-gray-400">{FEED_TOPIC}</p>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Camera chrome -->
        <div class="pointer-events-none absolute inset-0">
          <div
            class="absolute inset-x-0 top-0 h-1 animate-pulse"
            style="background: linear-gradient(90deg, transparent, {airline.colors.accent}, transparent);"
          ></div>
        </div>
        <div class="pointer-events-none absolute left-4 top-4 h-8 w-8 border-l-2 border-t-2" style="border-color: {airline.colors.accent}99;"></div>
        <div class="pointer-events-none absolute right-4 top-4 h-8 w-8 border-r-2 border-t-2" style="border-color: {airline.colors.accent}99;"></div>
        <div class="pointer-events-none absolute bottom-4 left-4 h-8 w-8 border-b-2 border-l-2" style="border-color: {airline.colors.accent}99;"></div>
        <div class="pointer-events-none absolute bottom-4 right-4 h-8 w-8 border-b-2 border-r-2" style="border-color: {airline.colors.accent}99;"></div>

        <!-- Status HUD -->
        {#if cameraStatus && live}
          <div class="pointer-events-none absolute right-6 top-6 space-y-0.5 text-right font-mono text-xs" style="color: {airline.colors.accent};">
            <div>{cameraStatus.terminal}</div>
            <div>GATE · {cameraStatus.gate ?? '—'}</div>
            <div>FLT · {cameraStatus.flight ?? '—'}</div>
            <div>{cameraStatus.fps ?? '—'} fps</div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Stats row -->
    <div class="mx-auto grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
      {#each [
        { label: 'Frames received', value: frameCount.toLocaleString() },
        { label: 'Gate', value: cameraStatus?.gate ?? '—' },
        { label: 'Flight', value: cameraStatus?.flight ?? '—' },
        { label: 'Queue depth', value: cameraStatus?.queueDepth ?? '—' }
      ] as stat (stat.label)}
        <div class="rounded-xl border bg-white p-3 text-center shadow-sm" style="border-color: {airline.colors.primary}33;">
          <div class="font-mono text-2xl font-bold" style="color: {airline.colors.primary};">{stat.value}</div>
          <div class="mt-1 text-[10px] uppercase tracking-widest text-gray-400">{stat.label}</div>
        </div>
      {/each}
    </div>

    <div class="mx-auto max-w-4xl space-y-1 text-center text-[11px] text-slate-400">
      <p>Subscribed to <span class="font-mono">{FEED_TOPIC}</span> · status on <span class="font-mono">{STATUS_TOPIC}</span></p>
      {#if sessionId}
        <p>
          Bound to camera session
          <span class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-500">{sessionId.slice(0, 8)}</span>
        </p>
      {:else}
        <p>Session scoping disabled — subscribed to the shared topic for this airline.</p>
      {/if}
    </div>
  </main>
</div>
