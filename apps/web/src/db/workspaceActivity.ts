// Identity changes must not retarget a suspended local save/open operation to
// another user's database. Drain local work before switching the live binding.
let active = 0;
const waiters: Array<() => void> = [];
// I-79: when each in-flight local operation began, so a save that has stalled can be shown to the technician.
// FR-17: keyed by a monotonic sequence so "oldest" is the first-started even within one millisecond.
// Map iteration is insertion order and sequences only grow, so the first entry is the oldest.
let sequence = 0;
const startedAt = new Map<number, number>();
export function oldestWorkspaceActivityStartedAt(): number | undefined {
  for (const value of startedAt.values()) return value;
  return undefined;
}
export function beginWorkspaceActivity() {
  active += 1;
  const id = sequence++;
  startedAt.set(id, Date.now());
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    startedAt.delete(id);
    active -= 1;
    if (active === 0) waiters.splice(0).forEach((resolve) => resolve());
  };
}
export function waitForWorkspaceIdle(): Promise<void> {
  return active ? new Promise((resolve) => waiters.push(resolve)) : Promise.resolve();
}
