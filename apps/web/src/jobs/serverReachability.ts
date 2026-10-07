/**
 * "The server could not be reached" as opposed to "the server answered and refused".
 *
 * A technician must keep working on their own local draft when the server is unreachable even if
 * the browser still reports a network connection (weak signal, captive portal, the on-premise
 * server restarting). Only an unreachable server may fall back to local data. A deliberate answer
 * from the server (401/403/404/5xx other than a gateway failure) or a failed integrity check
 * must still fail closed.
 */
export class ServerUnreachableError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ServerUnreachableError";
    this.status = status;
  }
}

/**
 * Reverse-proxy statuses that mean the API behind it did not answer: 502 (the upstream refused the connection,
 * for example while the API container restarts) and 504 (the upstream timed out). A 503 is deliberately NOT
 * included: it is the application answering "unavailable" and keeps failing closed, as the existing routing
 * harnesses (hydrant-reload-routing, hydrant-verified-revalidation) require.
 */
export function isGatewayUnreachableStatus(status: number) {
  return status === 502 || status === 504;
}

/** A failed `fetch()` rejects with a TypeError; a gateway failure or a timed-out check is a ServerUnreachableError. */
export function isServerUnreachable(error: unknown): boolean {
  return error instanceof TypeError || error instanceof ServerUnreachableError;
}

/** How long one inspection check may wait for the server before the server is treated as unreachable. */
export const SERVER_CHECK_TIMEOUT_MS = 3000;

/**
 * Opening one saved inspection asks the server twice in a row (when the system is tapped, then again when
 * the form route loads). When the first check has just found the server unreachable, the second must not
 * wait through the same failure again. The memory is short on purpose: it only spans that hand-off, and it
 * is cleared as soon as the browser reports the network coming back.
 */
export const UNREACHABLE_MEMORY_MS = 5_000;
let lastUnreachableAt: number | undefined;

export function noteServerUnreachable(now: number = Date.now()) {
  lastUnreachableAt = now;
}

export function noteServerReachable() {
  lastUnreachableAt = undefined;
}

export function serverRecentlyUnreachable(now: number = Date.now(), memoryMs: number = UNREACHABLE_MEMORY_MS) {
  return lastUnreachableAt !== undefined && now - lastUnreachableAt >= 0 && now - lastUnreachableAt < memoryMs;
}

if (typeof window !== "undefined") window.addEventListener("online", noteServerReachable);
