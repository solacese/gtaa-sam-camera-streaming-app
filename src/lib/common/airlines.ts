import type { Airline, TerminalSample } from './types';
import { APP_CONFIG } from './config';

/**
 * The three carriers the terminal camera can be switched between. Colours are
 * themed approximations of each carrier's public brand palette — they drive the
 * selector buttons, preview tiles and viewing-room chrome. Because Tailwind
 * cannot generate classes from runtime data, these are applied as inline styles.
 */
export const AIRLINES: Airline[] = [
  {
    id: 'aircanada',
    code: 'AC',
    name: 'Air Canada',
    shortName: 'Air Canada',
    terminal: 'Terminal 1',
    zone: 'Domestic Check-in — Zone A',
    gates: ['D28', 'D31', 'D35', 'F60', 'F63'],
    flightPrefix: 'AC',
    colors: {
      primary: '#D22630',
      dark: '#8E1319',
      accent: '#FF7A82',
      onPrimary: '#FFFFFF'
    }
  },
  {
    id: 'westjet',
    code: 'WS',
    name: 'WestJet',
    shortName: 'WestJet',
    terminal: 'Terminal 3',
    zone: 'Departures Check-in — Zone C',
    gates: ['B14', 'B18', 'B22', 'C34', 'C38'],
    flightPrefix: 'WS',
    colors: {
      primary: '#0B5CAB',
      dark: '#053A70',
      accent: '#3FC1DE',
      onPrimary: '#FFFFFF'
    }
  },
  {
    id: 'porter',
    code: 'PD',
    name: 'Porter Airlines',
    shortName: 'Porter',
    terminal: 'Terminal 3',
    zone: 'Departures Check-in — Zone E',
    gates: ['A5', 'A7', 'B11', 'B13', 'C30'],
    flightPrefix: 'PD',
    colors: {
      primary: '#012B49',
      dark: '#00182A',
      accent: '#8CC0D7',
      onPrimary: '#FFFFFF'
    }
  }
];

export const DEFAULT_AIRLINE_ID: Airline['id'] = 'aircanada';

export function getAirline(id: string | null | undefined): Airline | undefined {
  if (!id) return undefined;
  return AIRLINES.find((airline) => airline.id === id);
}

/** `<root>/<airlineId>/feed[/<sessionId>]` — JPEG frames. */
export function feedTopic(airlineId: string, sessionId: string | null = null): string {
  const base = `${APP_CONFIG.feedTopicRoot}/${airlineId}/feed`;
  return sessionId ? `${base}/${sessionId}` : base;
}

/** `<root>/<airlineId>/status[/<sessionId>]` — JSON gate/queue status. */
export function statusTopic(airlineId: string, sessionId: string | null = null): string {
  const base = `${APP_CONFIG.feedTopicRoot}/${airlineId}/status`;
  return sessionId ? `${base}/${sessionId}` : base;
}

/**
 * `<controlTopic>[/<sessionId>]` — active-airline announcements.
 *
 * Scoped to the session alongside the feeds: a room bound to one camera station
 * must not be told "routed elsewhere" by a different station on the same broker.
 */
export function controlTopic(sessionId: string | null = null): string {
  return sessionId ? `${APP_CONFIG.controlTopic}/${sessionId}` : APP_CONFIG.controlTopic;
}

/** Deep link to an airline's viewing room, carried as query params off the root path. */
export function viewingRoomUrl(airlineId: string, sessionId: string | null = null): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const session = sessionId ? `&sessionId=${sessionId}` : '';
  return `${origin}/?view=viewing-room&airline=${airlineId}${session}`;
}

/** Deep link to the operations control panel, bound to the same session. */
export function controlPanelUrl(sessionId: string | null = null): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const session = sessionId ? `&sessionId=${sessionId}` : '';
  return `${origin}/?view=control-panel${session}`;
}

/**
 * Sample concourse images submitted for capacity analysis. The files are
 * generated placeholders (see `scripts/generate-terminal-placeholders.mjs`) —
 * swap in real camera stills for an internal deployment.
 */
export const TERMINAL_SAMPLES: TerminalSample[] = [
  {
    id: 'quiet',
    filename: 'terminal-capacity-quiet.svg',
    label: 'Off-peak — Quiet',
    tier: 'quiet',
    occupancyPct: 12,
    terminal: 'Terminal 1',
    zone: 'Domestic Check-in — Zone A',
    description: 'Early-morning hall, counters open, no queue formation.'
  },
  {
    id: 'light',
    filename: 'terminal-capacity-light.svg',
    label: 'Light Traffic',
    tier: 'light',
    occupancyPct: 34,
    terminal: 'Terminal 1',
    zone: 'Domestic Check-in — Zone A',
    description: 'Steady arrivals into the hall, queues under two minutes.'
  },
  {
    id: 'moderate',
    filename: 'terminal-capacity-moderate.svg',
    label: 'Moderate Load',
    tier: 'moderate',
    occupancyPct: 58,
    terminal: 'Terminal 3',
    zone: 'Departures Check-in — Zone C',
    description: 'Bank of departures building; snake queue partially filled.'
  },
  {
    id: 'busy',
    filename: 'terminal-capacity-busy.svg',
    label: 'Busy — Approaching Limit',
    tier: 'busy',
    occupancyPct: 79,
    terminal: 'Terminal 3',
    zone: 'Departures Check-in — Zone C',
    description: 'Peak bank, queue spilling toward the circulation aisle.'
  },
  {
    id: 'critical',
    filename: 'terminal-capacity-critical.svg',
    label: 'At Capacity — Critical',
    tier: 'critical',
    occupancyPct: 96,
    terminal: 'Terminal 3',
    zone: 'Departures Check-in — Zone E',
    description: 'Hall saturated, queue blocking the walkway. Overflow required.'
  }
];

/** Wayfinding-style colour for a capacity tier. */
export function tierColor(tier: TerminalSample['tier']): string {
  switch (tier) {
    case 'quiet':
      return '#12A05C';
    case 'light':
      return '#4FA8E0';
    case 'moderate':
      return '#F2A900';
    case 'busy':
      return '#E4761B';
    case 'critical':
      return '#D22630';
    default:
      return '#0057B8';
  }
}
