// Identity changes must not retarget a suspended local save/open operation to
// another user's database. Drain local work before switching the live binding.
let active = 0;
const waiters: Array<() => void> = [];
// I-79: when each in-flight local operation began, so a save that has stalled can be shown to the technician.
const startedAt = new Set<number>();
export function oldestWorkspaceActivityStartedAt(): number | undefined {
  let oldest: number | undefined;
  for (const value of startedAt) if (oldest === undefined || value < oldest) oldest = value;
  return oldest;
}
export function beginWorkspaceActivity() {
  active += 1;
  const started = Date.now() + Math.random() / 1000; // unique key; the fraction never changes the whole-millisecond age
  startedAt.add(started);
  return () => {
    startedAt.delete(started);
    active -= 1;
    if (active === 0) waiters.splice(0).forEach((resolve) => resolve());
  };
}
export function waitForWorkspaceIdle(): Promise<void> {
  return active ? new Promise((resolve) => waiters.push(resolve)) : Promise.resolve();
}
