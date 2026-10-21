import type { AuthProbeResult } from "./authApi";

/**
 * I-78: a cold start while the server is unreachable (Wi-Fi up) settles in "offline-unverified", and no browser "online"
 * event ever fires because the browser was never offline. While in that state the app asks the server again on this
 * interval and when the page comes back to the foreground.
 */
export const OFFLINE_REVERIFY_INTERVAL_MS = 15_000;

/**
 * A silent probe decides whether to run the full re-verification. Only a definite answer from the server does; a
 * transport failure or a 5xx keeps the technician exactly where they are (no flicker of the header or the open form).
 */
export function shouldReverifyAfterProbe(probe: AuthProbeResult | undefined): boolean {
  return probe?.status === "authenticated" || probe?.status === "unauthenticated";
}
