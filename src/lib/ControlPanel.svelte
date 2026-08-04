<script>
  import { onMount, onDestroy } from 'svelte';
  import { APP_CONFIG, DEMO_MODE } from './common/config';
  import { SESSION_ID, SESSION_LABEL, JOINED_EXISTING_SESSION } from './common/session';
  import {
    AIRLINES,
    DEFAULT_AIRLINE_ID,
    getAirline,
    feedTopic,
    statusTopic,
    controlTopic,
    viewingRoomUrl
  } from './common/airlines';
  import GTAALogo from './GTAALogo.svelte';
  import AirlineFeedPreview from './AirlineFeedPreview.svelte';
  import TerminalCapacityAnalysis from './TerminalCapacityAnalysis.svelte';

  /**
   * Operations control panel. One physical camera, three airline topics: frames
   * are published to exactly one airline's topic at a time and the routing is
   * chosen here. Switching routes publishes an `inactive` marker on the topic
   * being left so its viewing room drops to standby immediately rather than
   * waiting for its own staleness timeout.
   */
  let { solaceClient, onBack } = $props();

  // Minted once at app startup, shared with the landing page's QR codes.
  const sessionId = SESSION_ID;
  const CONTROL_TOPIC = controlTopic(sessionId);

  let activeAirlineId = $state(DEFAULT_AIRLINE_ID);
  let status = $state('loading');
  let errorMessage = $state(null);
  let videoEl = $state(null);
  let stream = $state(null);

  let jpegQuality = $state(0.6);
  let targetFps = $state(10);
  let publishedCount = $state(0);
  let routeFrameCount = $state(0);
  let switchCount = $state(0);
  let lastSwitchAt = $state(null);

  let gate = $state('—');
  let flight = $state('—');
  let queueDepth = $state(0);

  let qrCodes = $state({});

  let captureIntervalId = null;
  let statusIntervalId = null;
  let framePublishInFlight = false;
  let statusTick = 0;

  const activeAirline = $derived(getAirline(activeAirlineId) ?? AIRLINES[0]);
  const activeFeedTopic = $derived(feedTopic(activeAirlineId, sessionId));
  const activeStatusTopic = $derived(statusTopic(activeAirlineId, sessionId));

  // ── Routing ───────────────────────────────────────────────────────────────

  function announceActiveFeed(streaming) {
    solaceClient.publishControl(CONTROL_TOPIC, {
      activeAirlineId,
      streaming,
      changedAt: new Date().toISOString(),
      sessionId
    });
  }

  function setActiveAirline(nextId) {
    if (nextId === activeAirlineId) return;
    const previousId = activeAirlineId;

    activeAirlineId = nextId;
    routeFrameCount = 0;
    switchCount += 1;
    lastSwitchAt = new Date();
    gate = '—';
    flight = '—';
    queueDepth = 0;
    statusTick = 0;

    // Park the feed we just left so its subscribers stop showing a frozen frame.
    solaceClient.publishFeedInactive(feedTopic(previousId, sessionId));
    announceActiveFeed(status === 'active');
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  async function startCamera() {
    errorMessage = null;
    status = 'loading';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      videoEl.srcObject = stream;
      await videoEl.play();
      status = 'active';
      startCaptureLoop();
      startStatusLoop();
      announceActiveFeed(true);
    } catch (err) {
      console.error('Camera access error:', err);
      errorMessage =
        err.name === 'NotAllowedError'
          ? 'Camera access denied. Allow camera permissions to start the terminal feed.'
          : 'Could not access camera: ' + err.message;
      status = 'error';
    }
  }

  function stopCamera() {
    if (captureIntervalId) { clearInterval(captureIntervalId); captureIntervalId = null; }
    if (statusIntervalId) { clearInterval(statusIntervalId); statusIntervalId = null; }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (videoEl) videoEl.srcObject = null;
    status = 'ready';
  }

  function stopStreaming() {
    const parkedTopic = activeFeedTopic;
    stopCamera();
    solaceClient.publishFeedInactive(parkedTopic);
    announceActiveFeed(false);
  }

  function startCaptureLoop() {
    if (captureIntervalId) clearInterval(captureIntervalId);
    captureIntervalId = setInterval(captureAndPublish, Math.round(1000 / targetFps));
  }

  // Re-arm the capture loop when the target frame rate changes mid-stream.
  $effect(() => {
    if (status === 'active') {
      startCaptureLoop();
    }
  });

  function startStatusLoop() {
    if (statusIntervalId) clearInterval(statusIntervalId);
    statusIntervalId = setInterval(() => {
      const airline = activeAirline;
      statusTick += 1;

      // Simulated gate/flight/queue telemetry alongside the video feed.
      if (statusTick % 12 === 1) {
        gate = airline.gates[Math.floor(Math.random() * airline.gates.length)];
        flight = `${airline.flightPrefix}${100 + Math.floor(Math.random() * 899)}`;
      }
      queueDepth = Math.max(0, Math.min(180, queueDepth + Math.round((Math.random() - 0.45) * 14)));

      solaceClient.publishControl(activeStatusTopic, {
        airlineId: airline.id,
        cameraId: sessionId ?? 'cam-yyz-01',
        terminal: airline.terminal,
        zone: airline.zone,
        gate,
        flight,
        queueDepth,
        fps: targetFps,
        timestamp: new Date().toISOString()
      });
    }, 1000);
  }

  function captureAndPublish() {
    if (status !== 'active' || !videoEl || videoEl.readyState < 2) return;
    if (framePublishInFlight) return;
    framePublishInFlight = true;

    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0);

    canvas.toBlob(
      async (blob) => {
        if (!blob) { framePublishInFlight = false; return; }
        const arrayBuffer = await blob.arrayBuffer();
        solaceClient.publishVideoFrame(activeFeedTopic, arrayBuffer);
        publishedCount += 1;
        routeFrameCount += 1;
        framePublishInFlight = false;
      },
      'image/jpeg',
      jpegQuality
    );
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onMount(async () => {
    const QRCode = await import('qrcode').catch(() => null);
    if (QRCode) {
      const codes = {};
      for (const airline of AIRLINES) {
        codes[airline.id] = await QRCode.default.toDataURL(viewingRoomUrl(airline.id, sessionId), {
          width: 240,
          margin: 1,
          color: { dark: '#002451', light: '#ffffff' }
        });
      }
      qrCodes = codes;
    }

    await startCamera();
  });

  onDestroy(() => {
    const parkedTopic = feedTopic(activeAirlineId, sessionId);
    stopCamera();
    solaceClient.publishFeedInactive(parkedTopic);
    announceActiveFeed(false);
  });
</script>

<div class="flex min-h-screen flex-col bg-gradient-to-br from-gtaa-bg via-white to-gtaa-bg">
  <!-- Header -->
  <header class="sticky top-0 z-20 shrink-0 border-b-4 border-gtaa-blue bg-white shadow-md">
    <div class="container mx-auto flex items-center gap-3 px-4 py-3">
      <GTAALogo size={40} />
      <span class="ml-1 hidden border-l border-gtaa-slate/15 pl-3 text-sm font-semibold text-gtaa-slate/60 sm:inline">
        Operations Control Panel
      </span>
      <div class="ml-auto flex items-center gap-3">
        {#if SESSION_LABEL}
          <span
            class="hidden rounded-full bg-gtaa-bg px-3 py-1 text-[10px] font-medium text-gtaa-blue-deep ring-1 ring-gtaa-blue/15 md:inline"
            title={JOINED_EXISTING_SESSION
              ? 'Rejoined the session carried in on the URL'
              : 'Session minted when this page started'}
          >
            {JOINED_EXISTING_SESSION ? 'Joined session' : 'Session'}
            <span class="font-mono font-bold">{SESSION_LABEL}</span>
          </span>
        {/if}
        {#if DEMO_MODE}
          <span class="rounded-full bg-gtaa-amber/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-gtaa-amber">Demo mode</span>
        {:else if solaceClient.isReadyForPublish()}
          <span class="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <span class="h-2 w-2 rounded-full bg-emerald-500"></span> Broker connected
          </span>
        {:else}
          <span class="flex items-center gap-1.5 text-xs font-medium text-rose-500">
            <span class="h-2 w-2 rounded-full bg-rose-500"></span> Broker offline
          </span>
        {/if}
        <button onclick={onBack} class="text-sm font-medium text-gtaa-slate transition-colors hover:text-gtaa-blue">
          ← Back
        </button>
      </div>
    </div>
  </header>

  <main class="flex flex-1 flex-col gap-4 p-4">
    <!-- ── Feed routing ─────────────────────────────────────────────────── -->
    <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
        <div>
          <h2 class="font-display text-base font-bold text-gtaa-blue-deep">Camera Routing</h2>
          <p class="text-xs text-slate-500">
            One camera, one airline topic at a time — {switchCount} switch{switchCount === 1 ? '' : 'es'} this session
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class="rounded-full bg-white px-3 py-1 font-mono text-[10px] text-slate-500 ring-1 ring-slate-200">
            {APP_CONFIG.feedTopicRoot}/<span class="font-bold text-gtaa-blue">{activeAirlineId}</span>/feed
          </span>
          {#if lastSwitchAt}
            <span class="text-[10px] text-slate-400">switched {lastSwitchAt.toLocaleTimeString()}</span>
          {/if}
        </div>
      </div>

      <!-- Airline selector -->
      <div class="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        {#each AIRLINES as airline (airline.id)}
          {@const selected = airline.id === activeAirlineId}
          <button
            type="button"
            onclick={() => setActiveAirline(airline.id)}
            aria-pressed={selected}
            class="group flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all duration-200"
            style="
              border-color: {selected ? airline.colors.primary : '#E2E8F0'};
              background: {selected ? airline.colors.primary : '#FFFFFF'};
              color: {selected ? airline.colors.onPrimary : '#1F2A44'};
              box-shadow: {selected ? `0 8px 24px -8px ${airline.colors.primary}` : 'none'};
            "
          >
            <span
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold"
              style="
                background: {selected ? 'rgba(255,255,255,0.2)' : airline.colors.primary};
                color: {selected ? airline.colors.onPrimary : airline.colors.onPrimary};
              "
            >
              {airline.code}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-display text-sm font-bold">{airline.shortName}</span>
              <span class="block truncate text-[11px]" style="opacity: 0.75;">{airline.terminal} · {airline.zone.split('—')[1]?.trim() ?? airline.zone}</span>
            </span>
            <span class="shrink-0 text-[10px] font-bold uppercase tracking-widest">
              {#if selected}
                {status === 'active' ? 'On air' : 'Routed'}
              {:else}
                Route
              {/if}
            </span>
          </button>
        {/each}
      </div>

      <!-- Preview wall -->
      <div class="border-t border-slate-200 bg-slate-50 p-4">
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Airline feed previews</p>
          <p class="text-[10px] text-slate-400">Each tile subscribes to its own topic — same view the airline's room gets</p>
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {#each AIRLINES as airline (airline.id)}
            <AirlineFeedPreview
              {solaceClient}
              {airline}
              {sessionId}
              isSelected={airline.id === activeAirlineId}
              onSelect={setActiveAirline}
            />
          {/each}
        </div>
      </div>
    </section>

    <!-- ── Capture + analysis ───────────────────────────────────────────── -->
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">

      <!-- Live capture -->
      <section class="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div
          class="px-5 py-4 text-white"
          style="background: linear-gradient(90deg, {activeAirline.colors.primary}, {activeAirline.colors.dark});"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="min-w-0">
              <h2 class="font-display text-lg font-semibold">Live Terminal Camera</h2>
              <p class="truncate text-xs text-white/85">
                Publishing to {activeAirline.name} · {activeAirline.zone}
              </p>
            </div>
            <div class="flex flex-wrap gap-2 text-xs">
              <span class="rounded-full bg-white/15 px-3 py-1">FPS {targetFps}</span>
              <span class="rounded-full bg-white/15 px-3 py-1">Q{Math.round(jpegQuality * 100)}%</span>
              {#if status === 'active'}
                <span class="flex items-center gap-1.5 rounded-full bg-emerald-400/25 px-3 py-1 text-emerald-50">
                  <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300"></span> Streaming
                </span>
              {:else if status === 'error'}
                <span class="rounded-full bg-rose-400/25 px-3 py-1 text-rose-50">Error</span>
              {:else}
                <span class="rounded-full bg-white/15 px-3 py-1">Idle</span>
              {/if}
            </div>
          </div>
        </div>

        <!-- Camera surface -->
        <div class="relative aspect-video w-full overflow-hidden bg-slate-950">
          <video
            bind:this={videoEl}
            autoplay
            playsinline
            muted
            class="absolute inset-0 h-full w-full object-contain"
            style="opacity: {status === 'active' ? 1 : 0};"
          ></video>

          {#if status === 'active'}
            <!-- Route watermark so it is never ambiguous where frames are going -->
            <div class="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
              <span
                class="rounded-lg px-2 py-1 font-display text-xs font-bold shadow"
                style="background: {activeAirline.colors.primary}; color: {activeAirline.colors.onPrimary};"
              >
                {activeAirline.code} · {activeAirline.terminal}
              </span>
              <span class="rounded-lg bg-black/50 px-2 py-1 font-mono text-[10px] text-white/80">
                {gate === '—' ? 'GATE …' : `GATE ${gate}`} · {flight}
              </span>
            </div>
            <div class="pointer-events-none absolute bottom-3 left-3 font-mono text-[10px] text-white/60">
              {activeFeedTopic}
            </div>
          {/if}

          {#if status !== 'active'}
            <div class="absolute inset-0 flex items-center justify-center bg-slate-950/85 px-6 text-center">
              <div class="space-y-4">
                {#if status === 'loading'}
                  <div class="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-white/20 border-t-white"></div>
                  <p class="text-sm text-white">Initializing terminal camera…</p>
                {:else if status === 'error'}
                  <p class="text-sm font-semibold text-white">{errorMessage}</p>
                  <button onclick={startCamera} class="rounded-full bg-gtaa-blue px-5 py-2 text-sm font-semibold text-white transition hover:bg-gtaa-blue-dark">
                    Retry
                  </button>
                {:else}
                  <p class="text-sm text-white">Camera stopped. No frames are being published.</p>
                  <button onclick={startCamera} class="rounded-full bg-gtaa-blue px-5 py-2 text-sm font-semibold text-white transition hover:bg-gtaa-blue-dark">
                    Start Camera
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        </div>

        <!-- Capture controls -->
        <div class="space-y-4 border-t border-slate-200 bg-slate-50 p-4">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
                Frame rate <span class="font-mono text-gtaa-blue">{targetFps} fps</span>
              </span>
              <input type="range" min="1" max="24" step="1" bind:value={targetFps} class="w-full accent-gtaa-blue" />
            </label>
            <label class="block">
              <span class="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
                JPEG quality <span class="font-mono text-gtaa-blue">{Math.round(jpegQuality * 100)}%</span>
              </span>
              <input type="range" min="0.2" max="0.95" step="0.05" bind:value={jpegQuality} class="w-full accent-gtaa-blue" />
            </label>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            {#if status === 'active'}
              <button onclick={stopStreaming} class="rounded-full bg-gtaa-slate px-4 py-2 text-xs font-semibold text-white transition hover:bg-gtaa-ink">
                Stop streaming
              </button>
            {:else}
              <button onclick={startCamera} class="rounded-full bg-gtaa-blue px-4 py-2 text-xs font-semibold text-white transition hover:bg-gtaa-blue-dark">
                Start streaming
              </button>
            {/if}
            <span class="text-[11px] text-slate-500">
              Frames only reach <span class="font-semibold" style="color: {activeAirline.colors.primary};">{activeAirline.shortName}</span>
              while it is routed.
            </span>
          </div>

          <!-- Stats -->
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {#each [
              { label: 'Frames total', value: publishedCount.toLocaleString() },
              { label: 'This route', value: routeFrameCount.toLocaleString() },
              { label: 'Queue depth', value: queueDepth },
              { label: 'Gate', value: gate }
            ] as stat (stat.label)}
              <div class="rounded-2xl border border-slate-200 bg-white p-3 text-center">
                <div class="font-mono text-lg font-bold text-gtaa-blue-deep">{stat.value}</div>
                <div class="mt-0.5 text-[9px] uppercase tracking-widest text-slate-400">{stat.label}</div>
              </div>
            {/each}
          </div>

          <!-- Viewing room links / QR codes -->
          <div class="rounded-2xl border border-slate-200 bg-white p-4">
            <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Airline viewing rooms</p>
              {#if SESSION_LABEL}
                <span class="font-mono text-[10px] text-slate-400">session {SESSION_LABEL}</span>
              {/if}
            </div>
            <div class="grid grid-cols-3 gap-3">
              {#each AIRLINES as airline (airline.id)}
                <a
                  href={viewingRoomUrl(airline.id, sessionId)}
                  target="_blank"
                  rel="noopener"
                  class="flex flex-col items-center gap-1.5 rounded-xl border p-2 transition hover:shadow-md"
                  style="border-color: {airline.colors.primary}33;"
                >
                  {#if qrCodes[airline.id]}
                    <img src={qrCodes[airline.id]} alt={`QR code opening the ${airline.name} viewing room`} class="h-20 w-20 rounded-lg" />
                  {:else}
                    <div class="h-20 w-20 animate-pulse rounded-lg bg-slate-100"></div>
                  {/if}
                  <span class="text-[10px] font-bold" style="color: {airline.colors.primary};">{airline.code}</span>
                </a>
              {/each}
            </div>
            <p class="mt-3 text-[10px] leading-relaxed text-slate-400">
              Scan or open a room on another device. Rooms show live frames only while their airline is routed.
            </p>
          </div>
        </div>
      </section>

      <!-- Terminal capacity analysis -->
      <TerminalCapacityAnalysis {solaceClient} {activeAirlineId} />
    </div>
  </main>
</div>
