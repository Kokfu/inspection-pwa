// Identity changes must not retarget a suspended local save/open operation to
// another user's database. Drain local work before switching the live binding.
let active = 0;
const waiters: Array<() => void> = [];
export function beginWorkspaceActivity() {
  active += 1;
  return () => {
    active -= 1;
    if (active === 0) waiters.splice(0).forEach((resolve) => resolve());
  };
}
export function waitForWorkspaceIdle(): Promise<void> {
  return active ? new Promise((resolve) => waiters.push(resolve)) : Promise.resolve();
}
