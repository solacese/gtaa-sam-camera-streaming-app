export interface SolaceConfig {
  url: string;
  vpnName: string;
  username: string;
  password: string;
}

export interface AppConfig {
  /** Root of the camera topic space, e.g. `gtaa/pearson/camera`. */
  feedTopicRoot: string;
  /** Topic the control panel announces the active airline on. */
  controlTopic: string;
  /** Topic capacity-analysis requests are published to. */
  analysisTopic: string;
  /** Topic markdown capacity-analysis results arrive on. */
  resultTopic: string;
  solace: SolaceConfig;
}

/** Brand colours used to theme an airline's controls, preview tile and viewing room. */
export interface AirlineColors {
  primary: string;
  dark: string;
  accent: string;
  /** Text colour that reads legibly on top of `primary`. */
  onPrimary: string;
}

export interface Airline {
  /** Stable slug used in topics and the `?airline=` route param. */
  id: 'aircanada' | 'westjet' | 'porter';
  /** IATA carrier code, shown in the HUD. */
  code: string;
  name: string;
  shortName: string;
  terminal: string;
  /** Check-in / gate zone the camera is notionally pointed at. */
  zone: string;
  /** Gates cycled through by the simulated status feed. */
  gates: string[];
  /** Flight-number prefix for the simulated status feed. */
  flightPrefix: string;
  colors: AirlineColors;
}

/** JSON published on `<root>/<airlineId>/status` once per second while streaming. */
export interface CameraStatus {
  airlineId: Airline['id'];
  cameraId: string;
  terminal: string;
  zone: string;
  gate: string;
  flight: string;
  /** Passengers queued at the counter, simulated. */
  queueDepth: number;
  fps: number;
  timestamp: string;
}

/** JSON published on the control topic whenever the active feed changes. */
export interface ActiveFeedAnnouncement {
  activeAirlineId: Airline['id'] | null;
  streaming: boolean;
  changedAt: string;
  sessionId: string | null;
}

/** Capacity tier of a sample terminal image. */
export type CapacityTier = 'quiet' | 'light' | 'moderate' | 'busy' | 'critical';

export interface TerminalSample {
  id: string;
  filename: string;
  label: string;
  tier: CapacityTier;
  /** Nominal occupancy of the hall in the placeholder image, 0-100. */
  occupancyPct: number;
  terminal: string;
  zone: string;
  description: string;
}

/** Payload published on the analysis topic when a sample image is submitted. */
export interface CapacityAnalysisRequest {
  requestId: string;
  file: string;
  imageUrl: string;
  terminal: string;
  zone: string;
  reportedTier: CapacityTier;
  reportedOccupancyPct: number;
  activeAirlineId: Airline['id'] | null;
  capturedAt: string;
  source: 'gtaa-control-panel';
}
