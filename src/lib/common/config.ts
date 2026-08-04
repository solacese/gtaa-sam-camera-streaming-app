import type { AppConfig } from './types';

export const APP_CONFIG: AppConfig = {
  feedTopicRoot: import.meta.env.VITE_FEED_TOPIC_ROOT || 'gtaa/pearson/camera',
  controlTopic: import.meta.env.VITE_CONTROL_TOPIC || 'gtaa/pearson/camera/control/active',
  analysisTopic: import.meta.env.VITE_ANALYSIS_TOPIC || 'gtaa/pearson/terminal/capacity/v1/analyze',
  resultTopic: import.meta.env.VITE_ANALYSIS_RESULT_TOPIC || 'gtaa/pearson/terminal/capacity/v1/result',
  solace: {
    url: import.meta.env.VITE_SOLACE_URL || 'ws://localhost:8008',
    vpnName: import.meta.env.VITE_SOLACE_VPN || 'default',
    username: import.meta.env.VITE_SOLACE_USERNAME || 'default',
    password: import.meta.env.VITE_SOLACE_PASSWORD || 'default'
  }
};

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

/**
 * Session scoping is on unless explicitly switched off — every camera topic gets
 * a per-station session id appended. Set `VITE_SESSION_ID_ENABLED=false` for flat,
 * shareable topics with no session segment.
 */
export const SESSION_ID_ENABLED =
  String(import.meta.env.VITE_SESSION_ID_ENABLED ?? 'true').toLowerCase() !== 'false';

// Log loaded config for debugging
if (typeof window !== 'undefined') {
  console.log('[CONFIG] Loaded:', {
    solaceUrl: APP_CONFIG.solace.url,
    vpn: APP_CONFIG.solace.vpnName,
    feedTopicRoot: APP_CONFIG.feedTopicRoot,
    controlTopic: APP_CONFIG.controlTopic,
    demoMode: DEMO_MODE,
    sessionIdEnabled: SESSION_ID_ENABLED
  });
}
