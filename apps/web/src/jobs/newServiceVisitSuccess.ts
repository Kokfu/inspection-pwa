import type { InspectionJob } from "./jobTypes";

export type NewServiceVisitSuccessDependencies = {
  cacheCanonicalJob: (job: InspectionJob) => Promise<void>;
  setJobs: (update: (current: InspectionJob[]) => InspectionJob[]) => void;
  navigateToJob: (jobId: string) => void;
  reconcileWorkspace: () => Promise<void>;
};

/**
 * The POST response is authoritative. Cache and render it before attempting a
 * best-effort reconciliation so a second request is never needed for routing.
 */
export async function acceptCanonicalNewServiceVisit(
  job: InspectionJob,
  dependencies: NewServiceVisitSuccessDependencies
) {
  await dependencies.cacheCanonicalJob(job);
  dependencies.setJobs((current) => [...current.filter((candidate) => candidate.id !== job.id), job]
    .sort((left, right) => left.reference.localeCompare(right.reference) || left.id.localeCompare(right.id)));
  dependencies.navigateToJob(job.id);
  void dependencies.reconcileWorkspace().catch(() => undefined);
}
