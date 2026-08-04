<script>
  import { onMount, onDestroy } from 'svelte';
  import SplashScreen from './lib/SplashScreen.svelte';
  import ControlPanel from './lib/ControlPanel.svelte';
  import AirlineViewingRoom from './lib/AirlineViewingRoom.svelte';
  import { SolaceCameraClient } from './lib/common/solace';
  import { APP_CONFIG } from './lib/common/config';
  import { getAirline, DEFAULT_AIRLINE_ID } from './lib/common/airlines';
  import { SESSION_ID, rememberSessionInUrl } from './lib/common/session';

  const urlParams = new URLSearchParams(window.location.search);

  // Routing lives in query params on the root path so QR-scanned deep links never
  // 404 on hosts without SPA rewrite rules. `/viewing-room` is honoured too for
  // anyone who hand-types a path.
  const requestedView = urlParams.get('view');
  const isViewingRoomRoute =
    requestedView === 'viewing-room' || window.location.pathname === '/viewing-room';
  const isControlPanelRoute = requestedView === 'control-panel';

  const routeAirline = getAirline(urlParams.get('airline'));

  let currentView = $state(
    isViewingRoomRoute ? 'viewingRoom' : isControlPanelRoute ? 'controlPanel' : 'splash'
  );
  // Falls back to the default carrier if `?airline=` is missing or unrecognized.
  // Fixed for the life of the window: the splash screen opens each room in a new
  // window rather than swapping the airline in place.
  const viewingAirline = routeAirline ?? getAirline(DEFAULT_AIRLINE_ID);
  let solaceReady = $state(false);

  const solaceClient = new SolaceCameraClient(APP_CONFIG.solace);

  onMount(async () => {
    // Pin the session into the URL so a reload rejoins it rather than minting a
    // new one and orphaning any rooms already scanned into this session.
    rememberSessionInUrl();

    try {
      await solaceClient.connect();
    } catch (error) {
      console.error('App: Failed to connect to Solace:', error);
    } finally {
      solaceReady = true; // unblock the UI even on error so viewers can show an error state
    }
  });

  onDestroy(() => solaceClient.disconnect());
</script>

{#snippet connecting()}
  <div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-gtaa-bg via-white to-gtaa-bg">
    <div class="space-y-4 text-center">
      <div class="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-gtaa-blue/30 border-t-gtaa-blue"></div>
      <p class="font-medium text-gtaa-slate">Connecting to Solace…</p>
    </div>
  </div>
{/snippet}

{#if currentView === 'splash'}
  <SplashScreen />
{:else if currentView === 'controlPanel'}
  {#if solaceReady}
    <ControlPanel {solaceClient} onBack={() => (currentView = 'splash')} />
  {:else}
    {@render connecting()}
  {/if}
{:else if currentView === 'viewingRoom'}
  {#if solaceReady}
    <AirlineViewingRoom
      {solaceClient}
      airline={viewingAirline}
      sessionId={SESSION_ID}
      onBack={() => (currentView = 'splash')}
    />
  {:else}
    {@render connecting()}
  {/if}
{/if}
