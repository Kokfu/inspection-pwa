/**
 * Where "Back" goes from a Manager final report or service-visit detail. Set when a screen other
 * than Operations opens one, cleared when Operations does, so a deep link or Operations keeps
 * its existing "Back to Operations" behaviour. Session-only and best-effort: any storage failure
 * falls back to Operations.
 */
export type ManagerReturnRoute = { hash: string; label: string };

const storageKey = "manager-report-return:v1";

function isManagerReturnRoute(value: unknown): value is ManagerReturnRoute {
  if (typeof value !== "object" || value === null) return false;
  const { hash, label } = value as Record<string, unknown>;
  return typeof hash === "string" && /^#\/manager-[a-z-]+(\/[A-Za-z0-9%_-]+)?$/.test(hash)
    && typeof label === "string" && label.length > 0 && label.length <= 60;
}

export function rememberManagerReturn(value: ManagerReturnRoute | null) {
  writeManagerSession(storageKey, value);
}

export function readManagerReturn(): ManagerReturnRoute | null {
  return readManagerSession(storageKey, isManagerReturnRoute);
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
