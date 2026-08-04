import { v4 as uuidv4 } from 'uuid';
import { SESSION_ID_ENABLED } from './config';

/**
 * Camera-station session identity.
 *
 * A session id is minted once at startup and appended to every camera topic, so
 * two stations pointed at the same broker never collide. It is fixed for the life
 * of the page: the landing page bakes it into its QR codes, the control panel
 * publishes under it, and viewing rooms subscribe under it.
 *
 * A `?sessionId=` already on the URL wins over minting a new one, which is what
 * lets a scanned QR code, a shared link, or a plain page reload rejoin the same
 * session instead of stranding subscribers on a dead topic.
 */

/** Session ids land inside topic strings, so reject anything that could reshape one. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function readSessionIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('sessionId');
  if (!value) return null;
  if (!SESSION_ID_PATTERN.test(value)) {
    // A wildcard or level separator here would silently widen every subscription.
    console.warn(`[SESSION] Ignoring malformed sessionId in URL: ${value}`);
    return null;
  }
  return value;
}

/** The session id carried in on the URL, if any. */
export const URL_SESSION_ID: string | null = readSessionIdFromUrl();

/** Whether this page joined an existing session rather than starting one. */
export const JOINED_EXISTING_SESSION = URL_SESSION_ID !== null;

/** This station's session id — `null` only when session scoping is disabled. */
export const SESSION_ID: string | null = SESSION_ID_ENABLED
  ? (URL_SESSION_ID ?? uuidv4())
  : null;

/**
 * Record the session id in the address bar without adding a history entry, so a
 * reload (or a copied URL) rejoins this session instead of minting a new one.
 */
export function rememberSessionInUrl(): void {
  if (typeof window === 'undefined') return;
  if (!SESSION_ID || URL_SESSION_ID === SESSION_ID) return;
  const url = new URL(window.location.href);
  url.searchParams.set('sessionId', SESSION_ID);
  window.history.replaceState(window.history.state, '', url);
}

/** Short form for display — full ids are too long for a status chip. */
export const SESSION_LABEL: string | null = SESSION_ID ? SESSION_ID.slice(0, 8) : null;

if (typeof window !== 'undefined') {
  console.log('[SESSION]', {
    sessionId: SESSION_ID,
    joinedExisting: JOINED_EXISTING_SESSION,
    enabled: SESSION_ID_ENABLED
  });
}
