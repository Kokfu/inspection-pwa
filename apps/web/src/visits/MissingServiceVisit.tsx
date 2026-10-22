import { useEffect, useRef, useState } from "react";
import { getCachedInspectionJobs } from "../referenceData/referenceDataCache";
import { resolveMissingServiceVisit, type MissingServiceVisitOutcome } from "./serviceVisitAccess";

// A remount (auth re-verification) while a check is in flight shares that check instead of asking the server twice.
const inFlight = new Map<string, Promise<MissingServiceVisitOutcome>>();
function checkOnce(jobId: string, userId: number, online: boolean) {
  const key = `${userId}:${jobId}:${online}`;
  let pending = inFlight.get(key);
  if (!pending) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    pending = resolveMissingServiceVisit({
      jobId, userId, online, signal: controller.signal,
      isLocal: async () => (await getCachedInspectionJobs(userId)).some((job) => job.id === jobId)
    }).finally(() => { clearTimeout(timer); inFlight.delete(key); });
    inFlight.set(key, pending);
  }
  return pending;
}

/** FR-18: a #/job/:id link whose job is not in this device's list. Replaces the old silent landing on Open Work. */
export function MissingServiceVisit({ jobId, userId, online, ready, onBack, onRefresh }: {
  jobId: string; userId: number; online: boolean;
  /** Local visit storage has been read, so "not local" is a real answer. */
  ready: boolean;
  onBack: () => void; onRefresh: () => Promise<void>;
}) {
  const [outcome, setOutcome] = useState<MissingServiceVisitOutcome>();
  const autoRefreshed = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!ready) return;
    let current = true;
    setOutcome(undefined);
    void checkOnce(jobId, userId, online).then((result) => { if (current) setOutcome(result); });
    return () => { current = false; };
  }, [jobId, userId, online, ready]);
  useEffect(() => {
    // The visit is the technician's own and exists on the server: download the list once instead of leaving a dead end.
    if (outcome?.kind !== "on-server" || autoRefreshed.current === jobId) return;
    autoRefreshed.current = jobId;
    void onRefresh().catch(() => undefined);
  }, [outcome, jobId, onRefresh]);
  const title = outcome?.kind === "not-authorised" ? "Not authorised" : outcome?.kind === "not-found" ? "Service visit not found"
    : outcome?.kind === "offline" ? "Service visit not on this device" : outcome ? "Service visit unavailable" : "Opening service visit…";
  return <section className="workspace page-stack missing-service-visit" aria-labelledby="missing-service-visit-title">
    <h2 id="missing-service-visit-title">{title}</h2>
    {!outcome || outcome.kind === "local" ? <p role="status">Checking this service visit.</p>
      : <p role="alert">{outcome.message}</p>}
    <div className="inline-actions">
      {outcome?.kind === "on-server" ? <button type="button" onClick={() => void onRefresh()}>Refresh</button> : null}
      <button type="button" className="secondary-command" onClick={onBack}>Back to My Jobs</button>
    </div>
  </section>;
}
