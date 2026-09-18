/**
 * Where "Back" goes from a Manager final report or service-visit detail. Technician detail and
 * Services Done store a return route bound to the one visit they opened (`jobId`); Operations and
 * Customer Configuration clear it. A stored route applies only to that same visit, so a deep link,
 * browser history into a different visit, or a missing/invalid value keeps the existing
 * "Back to Operations" behaviour. Session-only and best-effort: any storage failure falls back to
 * Operations. Every Manager key here is removed on logout and on login (`clearManagerSession`).
 *
 * Owner stamp: `manager-session-owner:v1` records, per tab, the verified user id the Manager session
 * state belongs to. Every verified authentication (session restore, cross-tab revalidation, login)
 * calls `claimManagerSession(userId)` before the verified render; a missing, invalid or different
 * stamp clears all Manager keys first. The device identity in IndexedDB cannot detect a change of
 * user because another tab's sign-in overwrites it, so the owner lives in this tab's sessionStorage.
 * A reload by the same manager keeps the remembered state.
 */
export type ManagerReturnRoute = { hash: string; label: string; jobId: string };

const storageKey = "manager-report-return:v2";
const ownerKey = "manager-session-owner:v1";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Prefixes of every sessionStorage key a Manager screen writes. */
const managerSessionKeyPrefixes = ["manager-report-return:", "manager-services-done:", "manager-technician-tab:", "manager-session-owner:"];

function isManagerReturnRoute(value: unknown): value is ManagerReturnRoute {
  if (typeof value !== "object" || value === null) return false;
  const { hash, label, jobId } = value as Record<string, unknown>;
  return typeof hash === "string" && /^#\/manager-[a-z-]+(\/[A-Za-z0-9%_-]+)?$/.test(hash)
    && typeof label === "string" && label.length > 0 && label.length <= 60
    && typeof jobId === "string" && uuidPattern.test(jobId);
}

export function rememberManagerReturn(value: ManagerReturnRoute | null) {
  writeManagerSession(storageKey, value);
}

/** The stored return route, only when it was stored for this exact visit. */
export function readManagerReturn(jobId: string): ManagerReturnRoute | null {
  const stored = readManagerSession(storageKey, isManagerReturnRoute);
  return stored && stored.jobId === jobId ? stored : null;
}

/** Removes every Manager session key (return routes, Services Done selection, technician tabs, owner stamp). Never throws. */
export function clearManagerSession() {
  try {
    const keys: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key && managerSessionKeyPrefixes.some((prefix) => key.startsWith(prefix))) keys.push(key);
    }
    for (const key of keys) sessionStorage.removeItem(key);
  } catch { /* storage unavailable: nothing was remembered either */ }
}

/**
 * Binds this tab's Manager session state to the verified `userId`: clears every Manager key unless the
 * owner stamp already names this user, then stamps it. Call before the verified render. Never throws;
 * never touches technician keys, IndexedDB, the outbox or drafts.
 */
export function claimManagerSession(userId: number) {
  let owner: string | null = null;
  try {
    owner = sessionStorage.getItem(ownerKey);
  } catch { /* storage unavailable: nothing was remembered either */ }
  if (owner === null || !/^[1-9]\d*$/.test(owner) || Number(owner) !== userId) clearManagerSession();
  try {
    sessionStorage.setItem(ownerKey, String(userId));
  } catch { /* storage unavailable: state simply is not remembered */ }
}

/** Session-scoped JSON value for a Manager screen; never throws. */
export function readManagerSession<T>(key: string, validate: (value: unknown) => value is T): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeManagerSession(key: string, value: unknown | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable: state simply is not remembered */ }
}
