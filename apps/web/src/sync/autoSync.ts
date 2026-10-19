/**
 * Automatic sync triggers (I-03). The sync engine itself stays the only sender: it owns the single-flight guard,
 * identity assertion and exact-UUID confirmation. This module only decides WHEN to ask it to run.
 */
export type AutoSyncReason = "launch" | "online" | "visible" | "interval";

export const AUTO_SYNC_INTERVAL_MS = 60_000;
/** A Failed item is not re-sent by the timer more often than this; launch/reconnect always retry it. */
export const AUTO_SYNC_FAILED_BACKOFF_MS = 5 * 60_000;

/**
 * I-67: a Failed repair visit operation used to wait the full 5 minutes before the timer retried it, so a fault that cleared
 * on its own (a dropped response, a brief outage with the connection still up) sat unretried. Repair visit operations
 * (outbox types rvVisit / rvPhoto) now retry sooner at first: 1 min, 2 min, then the usual 5 min. Other forms keep the 5 minute rule unchanged.
 * Idempotency is unaffected: a retry re-sends the same immutable UUIDs.
 */
export const REPAIR_FAILED_BACKOFF_MS = [60_000, 120_000, AUTO_SYNC_FAILED_BACKOFF_MS] as const;

type OutboxLike = { status: string; lastAttemptAt?: string; entityType?: string; attempts?: number };

export function failedBackoffFor(item: OutboxLike, fallbackMs: number): number {
  if (typeof item.entityType !== "string" || !/^rv(Visit|Photo)$/.test(item.entityType)) return fallbackMs;
  const attempts = Number.isFinite(item.attempts) ? Math.max(1, Math.floor(item.attempts as number)) : 1;
  return Math.min(REPAIR_FAILED_BACKOFF_MS[Math.min(attempts, REPAIR_FAILED_BACKOFF_MS.length) - 1], fallbackMs);
}

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
    return Number.isNaN(last) || nowMs - last >= failedBackoffFor(item, failedBackoffMs);
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
