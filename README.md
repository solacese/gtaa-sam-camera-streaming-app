# GTAA Terminal Camera Network

A Svelte 5 + Vite web app that streams a live terminal camera feed over **Solace PubSub+** and routes it to **one airline at a time** — Air Canada, WestJet, or Porter. Each airline has its own viewing room that subscribes only to its own topic, and the operations control panel doubles as a terminal-capacity analysis console.

Modelled on the architecture of [`solacese/sam-medical-image-analysis/webcam-streaming-app`](https://github.com/solacese/sam-medical-image-analysis/tree/main/webcam-streaming-app) (same stack: Svelte 5 runes, Vite, Tailwind, `solclientjs`, `qrcode`, `uuid`, `markdown-it`), re-themed for the Greater Toronto Airports Authority and extended from a single feed to a switched multi-airline feed.

## How it works

```
                          ┌──────────────────────────────────────┐
                          │      Operations Control Panel        │
                          │  camera ──► ONE airline topic only   │
                          └───────┬──────────────────────────────┘
                                  │ publish frames + status
                                  ▼
        ┌──────────────────── Solace PubSub+ ────────────────────┐
        │  …/camera/aircanada/feed/<sessionId>   (+ /status/…)   │
        │  …/camera/westjet/feed/<sessionId>     (+ /status/…)   │
        │  …/camera/porter/feed/<sessionId>      (+ /status/…)   │
        │  …/camera/control/active/<sessionId>   routing announce│
        │  gtaa/pearson/terminal/capacity/v1/analyze  ──► agent  │
        │  gtaa/pearson/terminal/capacity/v1/result   ◄── agent  │
        └───┬──────────────────┬──────────────────┬──────────────┘
            ▼                  ▼                  ▼
      Air Canada           WestJet             Porter
      Viewing Room       Viewing Room       Viewing Room
            ▲                  ▲                  ▲
            └──── the control panel's 3 preview tiles subscribe here too
```

### Components

| File | Role |
| --- | --- |
| [ControlPanel.svelte](src/lib/ControlPanel.svelte) | Captures the camera, publishes JPEG frames to **only the routed airline's** topic, and holds the routing selector, preview wall, capture controls and viewing-room QR codes. |
| [AirlineFeedPreview.svelte](src/lib/AirlineFeedPreview.svelte) | One preview tile per airline. Each subscribes to its own feed topic **through the broker**, so the wall shows exactly what that airline's room sees — live for the routed carrier, `NO FEED ROUTED` for the others. |
| [AirlineViewingRoom.svelte](src/lib/AirlineViewingRoom.svelte) | An airline's dedicated room. Subscribes to that airline's feed + status topics and to the control topic, so it can say *"camera routed elsewhere"* by name instead of just going blank. |
| [TerminalCapacityAnalysis.svelte](src/lib/TerminalCapacityAnalysis.svelte) | Sample concourse frames at five capacity levels. Clicking one publishes a request on the analyze topic and renders the markdown verdict that arrives on the result topic. |
| [common/solace.ts](src/lib/common/solace.ts) | `SolaceCameraClient` — wrapper over `solclientjs`. Frame callbacks are keyed **per topic** so one session can render three feeds at once. Includes a demo mode with frame loopback and a synthetic concourse animation. |
| [common/session.ts](src/lib/common/session.ts) | Mints the camera-station session id at startup (or rejoins one from `?sessionId=`) and pins it into the URL. |
| [common/airlines.ts](src/lib/common/airlines.ts) | Airline registry (codes, terminals, gates, brand colours), topic builders, and the terminal sample-image catalogue. |

### Switching the active feed

Only one airline receives frames at any moment. When the route changes, the control panel:

1. publishes `{ type: 'inactive' }` on the topic it is leaving, so that room drops to standby immediately rather than sitting on a frozen frame;
2. announces `{ activeAirlineId, streaming, changedAt, sessionId }` on the control topic;
3. begins publishing frames and status to the new airline's topics.

Rooms also run a 2 s staleness timer, so they fall back to standby even if an `inactive` message is missed.

### Frame format

Frames are JPEG binary attachments with a small text header, unchanged from the reference app:

```
frameId|timestamp|frameSize|<binary JPEG bytes>
```

### Capacity analysis

Requests published on `VITE_ANALYSIS_TOPIC`:

```json
{
  "requestId": "…", "file": "terminal-capacity-busy.svg",
  "imageUrl": "http://…/images/terminal-capacity-busy.svg",
  "terminal": "Terminal 3", "zone": "Departures Check-in — Zone C",
  "reportedTier": "busy", "reportedOccupancyPct": 79,
  "activeAirlineId": "westjet", "capturedAt": "…",
  "source": "gtaa-control-panel"
}
```

Whatever markdown arrives on `VITE_ANALYSIS_RESULT_TOPIC` is rendered in the result area. With `VITE_DEMO_MODE=true` a simulated assessment is generated locally instead.

The five sample images are **generated placeholders**, not real Pearson stills:

```bash
npm run gen:images   # regenerates static/images/terminal-capacity-*.svg
```

Drop real camera captures in `static/images/` under the same filenames to replace them, or edit `TERMINAL_SAMPLES` in [common/airlines.ts](src/lib/common/airlines.ts).

## Getting started

```bash
npm install
cp .env.example .env      # then edit with your Solace broker details
npm run dev
```

Open the printed URL to land on the station menu. Every card there — the control panel and all three airline rooms — **opens in a new window** carrying the current session, so the menu stays put and each role gets its own window. Cards are real anchors, so cmd/middle-click behave normally.

You can also open any view directly:

- `/?view=control-panel`
- `/?view=viewing-room&airline=aircanada`
- `/?view=viewing-room&airline=westjet`
- `/?view=viewing-room&airline=porter`

Routes are query params on the root path (not subpaths) so QR-scanned deep links resolve on static hosts without SPA rewrite rules.

With session scoping on (the default), open rooms via the landing page's cards or QR codes so they carry the same `sessionId` as the publishing station — a hand-typed room URL without one lands on a different topic.

To see the switching behaviour, open the control panel and one or more rooms from the landing page (each lands in its own window), then change the routed airline.

### Demo mode (no broker required)

The committed `.env` ships with `VITE_DEMO_MODE=true` so the app runs immediately:

- published frames loop back within the same tab, so the control panel's preview wall works;
- viewing rooms opened on their own render a synthetic concourse animation;
- capacity analysis returns a locally generated verdict.

Demo mode is per-tab — cross-tab routing needs a real broker. Set `VITE_DEMO_MODE=false` and fill in the connection details to run for real.

### Session IDs & QR codes

Session scoping is **on by default**. A UUID is minted once at startup by [common/session.ts](src/lib/common/session.ts) and appended to every camera topic — feed, status, and the routing-control topic:

```
gtaa/pearson/camera/westjet/feed/8f0c1a2e-…
gtaa/pearson/camera/westjet/status/8f0c1a2e-…
gtaa/pearson/camera/control/active/8f0c1a2e-…
```

This keeps two camera stations on one broker from colliding — and stops a second station from telling your rooms they've been "routed elsewhere".

The **landing page renders a QR code per airline**, each deep-linking that airline's room into the current session (`/?view=viewing-room&airline=<id>&sessionId=<uuid>`). The control panel carries the same three codes. Scan one and that device joins this station's session; frames appear as soon as the camera is routed to that airline.

A few details worth knowing:

- The session id is **pinned into the address bar** via `replaceState` at startup, so a reload rejoins the same session rather than minting a new one and stranding already-scanned devices. Copying the URL shares the session.
- A `?sessionId=` on the URL always wins over minting a new one. Values are validated against `^[A-Za-z0-9_-]{1,64}$` and rejected otherwise — an unvalidated id containing `/`, `*`, or `>` would silently reshape every topic subscription.
- Opening the **landing page** fresh on a second device mints that device's *own* session, so its "Enter room" links will be dead. Scan the QR (or use the shared link) instead — that is what carries the station's session.
- Analysis topics are deliberately **not** session-scoped, so a single analysis service can serve every station.

Set `VITE_SESSION_ID_ENABLED=false` for flat, shared topics with no session segment.

## Configuration (`.env`)

| Variable | Description | Default |
| --- | --- | --- |
| `VITE_SOLACE_URL` | Broker WebSocket URL | `ws://localhost:8008` |
| `VITE_SOLACE_VPN` | Message VPN | `default` |
| `VITE_SOLACE_USERNAME` | Client username | `default` |
| `VITE_SOLACE_PASSWORD` | Client password | `default` |
| `VITE_FEED_TOPIC_ROOT` | Root of the camera topic space; `<root>/<airlineId>/feed/<sessionId>` and `/status/<sessionId>` are derived from it | `gtaa/pearson/camera` |
| `VITE_CONTROL_TOPIC` | Active-airline announcements; `<topic>/<sessionId>` when session scoping is on | `gtaa/pearson/camera/control/active` |
| `VITE_ANALYSIS_TOPIC` | Capacity-analysis requests | `gtaa/pearson/terminal/capacity/v1/analyze` |
| `VITE_ANALYSIS_RESULT_TOPIC` | Capacity-analysis results (markdown) | `gtaa/pearson/terminal/capacity/v1/result` |
| `VITE_DEMO_MODE` | Run without a broker | `false` |
| `VITE_SESSION_ID_ENABLED` | Append a startup-minted UUID to camera topics + bind QR codes to it | `true` |

## Stack

- Svelte 5 (runes) + Vite
- Tailwind CSS (GTAA / Toronto Pearson wayfinding-blue theme)
- `solclientjs` for Solace PubSub+
- `markdown-it`, `qrcode`, `uuid`

## Note on branding

The Toronto Pearson logo in [GTAALogo.svelte](src/lib/GTAALogo.svelte) and the airline colours in [common/airlines.ts](src/lib/common/airlines.ts) are **stylized recreations** for demonstration purposes, not official trademarked artwork. Replace them with licensed brand assets before any internal or public deployment.
