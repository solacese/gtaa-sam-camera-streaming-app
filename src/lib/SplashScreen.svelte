<script>
  import { onMount } from 'svelte';
  import { DEMO_MODE } from './common/config';
  import { SESSION_ID, SESSION_LABEL, JOINED_EXISTING_SESSION } from './common/session';
  import { AIRLINES, viewingRoomUrl, controlPanelUrl } from './common/airlines';
  import GTAALogo from './GTAALogo.svelte';

  /**
   * Every card is a real anchor opened with `target="_blank"` rather than an
   * in-place view switch, so this page stays put as the station's menu while each
   * role runs in its own window. Real anchors (over `window.open`) keep
   * cmd/middle-click working and stay clear of popup blockers.
   */

  /** airlineId -> QR data URL for that airline's viewing room in this session. */
  let qrCodes = $state({});

  onMount(async () => {
    const QRCode = await import('qrcode').catch(() => null);
    if (!QRCode) return;

    const codes = {};
    for (const airline of AIRLINES) {
      codes[airline.id] = await QRCode.default.toDataURL(viewingRoomUrl(airline.id, SESSION_ID), {
        width: 240,
        margin: 1,
        color: { dark: '#002451', light: '#ffffff' }
      });
    }
    qrCodes = codes;
  });
</script>

<div class="fixed inset-0 bg-gradient-to-br from-gtaa-blue-deep via-gtaa-ink to-gtaa-slate z-50 overflow-y-auto flex flex-col">

  <!-- Ambient flight-path backdrop -->
  <div class="absolute inset-0 opacity-40 pointer-events-none overflow-hidden">
    <svg class="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 1200 800" aria-hidden="true">
      <g fill="none" stroke="#4FA8E0" stroke-opacity="0.25" stroke-width="1.5">
        <path d="M -50 700 Q 300 640 560 420 T 1250 120" />
        <path d="M -50 780 Q 400 720 700 520 T 1250 280" />
        <path d="M -50 600 Q 250 560 480 300 T 1250 20" />
      </g>
      <g fill="#4FA8E0" fill-opacity="0.18">
        <circle cx="560" cy="420" r="5" />
        <circle cx="700" cy="520" r="4" />
        <circle cx="480" cy="300" r="4" />
      </g>
    </svg>
  </div>

  <!-- Top brand -->
  <div class="relative z-10 pt-10 pb-2 text-center px-4">
    <div class="flex justify-center">
      <GTAALogo size={60} color="#4FA8E0" accent="#A8D4F2" textColor="#ffffff" />
    </div>
    <h1 class="mt-6 text-3xl md:text-5xl font-display font-bold text-white drop-shadow-2xl tracking-tight">
      Terminal Camera Network
    </h1>
    <p class="mt-2 text-sm text-gtaa-sky-light/80 font-medium tracking-[0.25em] uppercase">
      Airline apron &amp; check-in feeds over Solace PubSub+
    </p>
    <div class="mt-3 flex flex-wrap items-center justify-center gap-2">
      {#if DEMO_MODE}
        <span class="px-3 py-1 rounded-full bg-gtaa-blue/40 border border-gtaa-sky/50 text-gtaa-sky-light text-xs font-semibold tracking-widest">DEMO MODE</span>
      {/if}
      {#if SESSION_LABEL}
        <span class="px-3 py-1 rounded-full bg-white/5 border border-white/15 text-white/60 text-xs font-medium">
          {JOINED_EXISTING_SESSION ? 'Joined session' : 'Camera session'}
          <span class="font-mono text-gtaa-sky-light">{SESSION_LABEL}</span>
        </span>
      {/if}
    </div>
  </div>

  <!-- Cards -->
  <div class="relative z-10 flex justify-center px-4 pb-8 pt-8">
    <div class="w-full max-w-5xl space-y-5">

      <!-- Control Panel -->
      <a
        href={controlPanelUrl(SESSION_ID)}
        target="_blank"
        rel="noopener"
        class="group block w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 hover:border-gtaa-sky/60 backdrop-blur-sm rounded-2xl p-6 transition-all duration-300 hover:shadow-[0_0_40px_rgba(79,168,224,0.28)]"
      >
        <div class="flex flex-col sm:flex-row sm:items-center gap-5">
          <div class="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-gtaa-blue to-gtaa-blue-deep flex items-center justify-center">
            <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div class="min-w-0 flex-1">
            <h2 class="text-white font-display font-bold text-lg mb-1">Operations Control Panel</h2>
            <p class="text-white/60 text-sm leading-relaxed">
              Capture the terminal camera and route it to <span class="text-white/80">one</span> airline topic at a time.
              Preview all three feeds side by side and submit terminal capacity images for analysis.
            </p>
          </div>
          <span class="inline-flex items-center gap-1.5 text-gtaa-sky font-semibold text-sm group-hover:gap-2.5 transition-all shrink-0">
            Open panel
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            <span class="sr-only">(opens in a new window)</span>
          </span>
        </div>
      </a>

      <!-- Viewing rooms -->
      <div>
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2 px-1">
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-gtaa-sky-light/60">Airline viewing rooms</p>
          <p class="text-[10px] text-white/35">
            {#if SESSION_LABEL}
              Opens in a new window · scan a QR to open a room on another device, on this station's session
            {:else}
              Opens in a new window · QR codes open the shared topic for each airline
            {/if}
          </p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          {#each AIRLINES as airline (airline.id)}
            <a
              href={viewingRoomUrl(airline.id, SESSION_ID)}
              target="_blank"
              rel="noopener"
              class="group block text-left bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-sm rounded-2xl p-5 transition-all duration-300"
              style="--brand: {airline.colors.primary}; --brand-accent: {airline.colors.accent};"
              onmouseenter={(e) => (e.currentTarget.style.borderColor = airline.colors.accent)}
              onmouseleave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
            >
              <div class="flex items-center gap-3 mb-3">
                <!-- Inset ring keeps dark brand marks (Porter navy) legible on the dark card -->
                <div
                  class="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center font-display font-bold text-sm"
                  style="background: {airline.colors.primary}; color: {airline.colors.onPrimary}; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.35);"
                >
                  {airline.code}
                </div>
                <div class="min-w-0">
                  <h3 class="text-white font-display font-bold text-base leading-tight truncate">{airline.shortName}</h3>
                  <p class="text-white/50 text-xs">{airline.terminal}</p>
                </div>
              </div>
              <p class="text-white/55 text-xs leading-relaxed">
                Subscribe to the {airline.name} camera topic and watch the feed whenever operations routes the camera here.
              </p>

              <!-- Deep link into this airline's room, carrying the session id -->
              <div class="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                {#if qrCodes[airline.id]}
                  <img
                    src={qrCodes[airline.id]}
                    alt={`QR code opening the ${airline.name} viewing room`}
                    class="h-24 w-24 shrink-0 rounded-lg bg-white p-1"
                  />
                {:else}
                  <div class="h-24 w-24 shrink-0 animate-pulse rounded-lg bg-white/10"></div>
                {/if}
                <div class="min-w-0 text-[10px] leading-relaxed text-white/45">
                  <p class="font-semibold text-white/70">Scan to open</p>
                  <p>on a phone or second screen</p>
                  {#if SESSION_LABEL}
                    <p class="mt-1 font-mono text-white/35">session {SESSION_LABEL}</p>
                  {/if}
                </div>
              </div>

              <span
                class="inline-flex items-center gap-1.5 mt-4 font-semibold text-sm group-hover:gap-2.5 transition-all"
                style="color: {airline.colors.accent};"
              >
                Open room
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                <span class="sr-only">(opens in a new window)</span>
              </span>
            </a>
          {/each}
        </div>
      </div>

    </div>
  </div>

  <!-- Footer -->
  <div class="relative z-10 mt-auto pb-6 pt-4 text-center text-white/30 text-xs px-4">
    Powered by Solace PubSub+ · GTAA-themed demo · logo and brand colours are stylized recreations
  </div>
</div>
