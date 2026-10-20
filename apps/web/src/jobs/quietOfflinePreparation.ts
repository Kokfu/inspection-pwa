/**
 * Keeps "prepared for offline" fresh while the app stays open and online (OA-3).
 *
 * The server confirmation that lets a never-opened system start offline is only written when the job list is refreshed.
 * A technician who stays online for hours would otherwise go offline with an old confirmation. This re-reads the accepted
 * summaries quietly and rewrites ONLY the confirmation records: no React state, no spinner, so an open form is never disturbed.
 * A failed read changes nothing (a stale confirmation is never extended on failure).
 */
export const QUIET_PREPARATION_MIN_GAP_MS = 10 * 60 * 1000;

export type QuietPreparationResult = "ran" | "throttled" | "skipped" | "failed";

export function createQuietPreparer<Job extends { id: string }, Summary extends { jobId: string; systemKey: string }>(deps: {
  isEligible: () => boolean;
  getJobs: () => ReadonlyArray<Job>;
  load: (jobIds: string[]) => Promise<Summary[]>;
  record: (jobs: ReadonlyArray<Job>, summaries: ReadonlyArray<Summary>) => Promise<void>;
  now?: () => number;
  minGapMs?: number;
}) {
  const now = deps.now ?? Date.now; const minGap = deps.minGapMs ?? QUIET_PREPARATION_MIN_GAP_MS;
  let lastStartedAt = Number.NEGATIVE_INFINITY; let running = false;
  return async function trigger(): Promise<QuietPreparationResult> {
    if (running) return "throttled";
    const jobs = deps.getJobs();
    if (!deps.isEligible() || jobs.length === 0) return "skipped";
    if (now() - lastStartedAt < minGap) return "throttled";
    running = true; lastStartedAt = now();
    try {
      const summaries = await deps.load(jobs.map((job) => job.id));
      await deps.record(jobs, summaries);
      return "ran";
    } catch {
      lastStartedAt = Number.NEGATIVE_INFINITY; // failed: allow the next trigger to retry soon
      return "failed";
    } finally { running = false; }
  };
}
