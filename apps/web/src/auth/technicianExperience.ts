/**
 * I-66: a reload (a service-worker update, or Chrome discarding and reloading a background tab on a
 * memory-starved phone) used to drop the Technician view back to the role chooser, because the choice
 * lived only in React state. This remembers, for THIS TAB ONLY, the id of the inspector who chose the
 * Technician view, so a reload by the same verified (or offline cached) inspector goes straight back.
 *
 * It is never read for another user, never survives sign-out or a credential login, and a new tab always
 * starts at the chooser (sessionStorage is per tab). Best-effort: any storage failure means "ask again".
 */
const key = "technician-experience:v1";

export function rememberTechnicianExperience(userId: number): void {
  try { if (Number.isSafeInteger(userId) && userId > 0) sessionStorage.setItem(key, String(userId)); } catch { /* ask again after a reload */ }
}

export function forgetTechnicianExperience(): void {
  try { sessionStorage.removeItem(key); } catch { /* nothing to forget */ }
}

/** True only when this tab remembers a Technician choice made by exactly this user id. */
export function isTechnicianExperienceRemembered(userId: number): boolean {
  try { return sessionStorage.getItem(key) === String(userId) && Number.isSafeInteger(userId) && userId > 0; } catch { return false; }
}
