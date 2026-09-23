/**
 * One in-memory "unsaved changes" guard for the Manager per-service editor.
 *
 * The editor registers the hash it lives on plus a confirm callback while it has
 * unsaved wording edits. App's `hashchange` handler asks `allowManagerHashChange`
 * before routing away (browser Back, a typed URL); a declined confirm puts the
 * guarded hash back. The editor's own Back button confirms first and clears the
 * guard before navigating, so the Manager is never asked twice. Nothing here is
 * persisted — it only protects edits that exist in this tab's memory.
 */
type ManagerLeaveGuard = { hash: string; confirmLeave: () => boolean };

let current: ManagerLeaveGuard | null = null;

export function setManagerLeaveGuard(guard: ManagerLeaveGuard | null) {
  current = guard;
}

/** Clears the guard only when it is still the one registered for `hash`. */
export function clearManagerLeaveGuard(hash: string) {
  if (current?.hash === hash) current = null;
}

/**
 * `true` when navigating to `nextHash` may proceed. When the Manager declines,
 * returns the guarded hash to restore; the guard stays registered.
 */
export function allowManagerHashChange(nextHash: string): { allow: true } | { allow: false; restoreHash: string } {
  if (!current || current.hash === nextHash) return { allow: true };
  if (current.confirmLeave()) { current = null; return { allow: true }; }
  return { allow: false, restoreHash: current.hash };
}
