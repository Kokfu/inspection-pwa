export const CONNECTIVITY_RECOVERY_RETRY_DELAYS_MS = [350, 1_000, 2_500] as const;

export type ConnectivityRecoveryAttempt = () => Promise<boolean>;
export type ConnectivityRecoveryScheduler = {
  setTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
};

const browserScheduler: ConnectivityRecoveryScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle)
};

/** Bounded retries for a browser-online-triggered authentication probe only. */
export class ConnectivityRecovery {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private active = false;

  constructor(
    private readonly onActiveChange: (active: boolean) => void,
    private readonly scheduler: ConnectivityRecoveryScheduler = browserScheduler,
    private readonly retryDelaysMs: readonly number[] = CONNECTIVITY_RECOVERY_RETRY_DELAYS_MS
  ) {}

  start(attempt: ConnectivityRecoveryAttempt) {
    this.cancel();
    const generation = ++this.generation;
    this.setActive(true);
    void this.runAttempt(generation, attempt, 0);
  }

  cancel() {
    this.generation += 1;
    if (this.timer !== undefined) {
      this.scheduler.clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.setActive(false);
  }

  private async runAttempt(generation: number, attempt: ConnectivityRecoveryAttempt, retryIndex: number) {
    const shouldRetry = await attempt();
    if (generation !== this.generation) return;

    const delayMs = this.retryDelaysMs[retryIndex];
    if (!shouldRetry || delayMs === undefined) {
      this.setActive(false);
      return;
    }

    this.timer = this.scheduler.setTimeout(() => {
      this.timer = undefined;
      void this.runAttempt(generation, attempt, retryIndex + 1);
    }, delayMs);
  }

  private setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    this.onActiveChange(active);
  }
}
