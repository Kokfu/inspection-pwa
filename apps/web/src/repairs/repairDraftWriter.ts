/** Start immediately; while a write is in flight retain only the newest snapshot.
 * All callers await the drain (including the latest commit), not their obsolete input.
 * A rejected write rejects the drain; the editor retains the visible text for retry.
 */
export function repairDraftWriter<T>(write: (value: T) => Promise<void>) {
  let pending: { value: T } | undefined;
  let draining: Promise<void> | undefined;
  let running = false;
  return (value: T): Promise<void> => {
    pending = { value };
    if (!running) {
      running = true;
      draining = Promise.resolve().then(async () => {
        try {
          while (pending) {
            const next = pending.value;
            pending = undefined;
            await write(next);
          }
        } finally {
          // Release synchronously with the drain, before other commit microtasks
          // can enqueue a new snapshot into a promise that already finished.
          running = false;
        }
      });
    }
    return draining!;
  };
}
