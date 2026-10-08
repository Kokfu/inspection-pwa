/**
 * Automatic sync triggers (I-03). The sync engine itself stays the only sender: it owns the single-flight guard,
 * identity assertion and exact-UUID confirmation. This module only decides WHEN to ask it to run.
 */
export type AutoSyncReason = "launch" | "online" | "visible" | "interval";

export const AUTO_SYNC_INTERVAL_MS = 60_000;
/** A Failed item is not re-sent by the timer more often than this; launch/reconnect always retry it. */
export const AUTO_SYNC_FAILED_BACKOFF_MS = 5 * 60_000;

type OutboxLike = { status: string; lastAttemptAt?: string };

export function outboxHasAutoSyncWork(
  items: ReadonlyArray<OutboxLike>,
  reason: AutoSyncReason,
  nowMs: number,
  failedBackoffMs = AUTO_SYNC_FAILED_BACKOFF_MS
) {
  return items.some((item) => {
    if (item.status === "Pending") return true;
    // A Syncing item in a freshly started app is a crashed run; in a live tab it belongs to the running sync.
    if (item.status === "Syncing") return reason === "launch";
    if (item.status !== "Failed") return false;
    if (reason !== "interval") return true;
    const last = item.lastAttemptAt ? Date.parse(item.lastAttemptAt) : Number.NaN;
    return Number.isNaN(last) || nowMs - last >= failedBackoffMs;
  });
}

export type AutoSyncDeps = {
  /** True only when sync is allowed right now (verified session, local database ready, not offline). */
  isEligible: (reason: AutoSyncReason) => boolean;
  hasWork: (reason: AutoSyncReason) => Promise<boolean>;
  run: () => Promise<void>;
};

export class AutoSyncCoordinator {
  private running = false;
  private rerunReason: AutoSyncReason | undefined;

  constructor(private readonly deps: AutoSyncDeps) {}

  /** Never throws. A trigger that arrives mid-run is replayed once afterwards so a reconnect is not lost. */
  async trigger(reason: AutoSyncReason): Promise<"ran" | "skipped"> {
    if (this.running) {
      if (reason !== "interval") this.rerunReason = reason;
      return "skipped";
    }
    this.running = true;
    let ran = false;
    try {
      let next: AutoSyncReason | undefined = reason;
      while (next) {
        const current: AutoSyncReason = next;
        next = undefined;
        this.rerunReason = undefined;
        try {
          if (this.deps.isEligible(current) && await this.deps.hasWork(current)) {
            await this.deps.run();
            ran = true;
          }
        } catch {
          // Failures are recorded on the outbox items by the engine; the next trigger retries.
        }
        next = this.rerunReason;
      }
    } finally {
      this.running = false;
    }
    return ran ? "ran" : "skipped";
  }
}
