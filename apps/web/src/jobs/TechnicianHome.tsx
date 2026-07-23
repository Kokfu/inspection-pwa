import type { ClientAuthState } from "../auth/authStateTypes";
import type { InspectionRecord } from "../db/localDatabase";
import type { MasterSystemInspectionRecord } from "../hoseReel/hoseReelTypes";
import { deriveMasterSystemProgress, deriveSystemProgress } from "./jobProgress";
import type { InspectionJob, JobSystemSnapshot } from "./jobTypes";
import { SystemNavigator } from "./SystemNavigator";

type TechnicianHomeProps = {
  authState: ClientAuthState;
  jobs: InspectionJob[];
  inspections: InspectionRecord[];
  masterSystemInspections: MasterSystemInspectionRecord[];
  loading: boolean;
  message: string;
  selectedJobId?: string;
  selectedSystemKey?: string;
  syncMessage: string;
  onRefresh: () => Promise<void>;
  onSync: () => Promise<void>;
  onSelectJob: (job: InspectionJob) => void;
  onSelectSystem: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onBackToJobs: () => void;
  onBackToSystems: (job: InspectionJob) => void;
  onOpenHoseReel: (job: InspectionJob, system: JobSystemSnapshot) => void;
};

export function TechnicianHome({
  authState,
  jobs,
  inspections,
  masterSystemInspections,
  loading,
  message,
  selectedJobId,
  selectedSystemKey,
  syncMessage,
  onRefresh,
  onSync,
  onSelectJob,
  onSelectSystem,
  onBackToJobs,
  onBackToSystems,
  onOpenHoseReel
}: TechnicianHomeProps) {
  const selectedJob = jobs.find((job) => job.id === selectedJobId);
  const systems = selectedJob?.configurationSnapshot.enabledSystems
    .filter((system) => system.definitionStatus === "confirmed")
    .sort((left, right) => left.sortOrder - right.sortOrder) ?? [];
  const selectedSystem = systems.find((system) => system.systemKey === selectedSystemKey);
  const canUseServer = authState.status === "verified";
  const progressFor = (jobId: string, systemKey: string) => systemKey === "hose_reel"
    ? deriveMasterSystemProgress(masterSystemInspections.find((record) => record.jobSystemKey === `${jobId}:${systemKey}`))
    : deriveSystemProgress(inspections, jobId, systemKey);

  return <section className="technician-home" aria-labelledby="technician-home-title">
    <div className="workspace-heading">
      <div>
        <p className="eyebrow">Field Work</p>
        <h2 id="technician-home-title">Technician Home</h2>
      </div>
      <div className="inline-actions">
        <button type="button" className="secondary-command" disabled={!canUseServer || loading} onClick={() => void onRefresh()}>
          {loading ? "Refreshing" : "Refresh Jobs"}
        </button>
        <button type="button" disabled={!canUseServer} onClick={() => void onSync()}>
          Sync Pending
        </button>
      </div>
    </div>

    {authState.status === "checking" ? <p>Preparing local workspace.</p> : null}
    {authState.status === "unauthenticated" ? <p>Sign in online to prepare technician jobs for offline use.</p> : null}
    {authState.status === "offline-unverified" ? (
      <p className="offline-notice">Cached jobs are available. Server actions require session verification.</p>
    ) : null}
    {message ? <p className="form-message">{message}</p> : null}
    {syncMessage ? <p className="form-message">{syncMessage}</p> : null}

    {selectedJob && selectedSystem ? (
      <SystemNavigator
        system={selectedSystem}
        progress={progressFor(selectedJob.id, selectedSystem.systemKey)}
        onBack={() => onBackToSystems(selectedJob)}
        onOpenHoseReel={() => onOpenHoseReel(selectedJob, selectedSystem)}
      />
    ) : selectedJob ? (
      <section aria-labelledby="applicable-systems-title">
        <button type="button" className="secondary-command" onClick={onBackToJobs}>Back to Jobs</button>
        <div className="job-context">
          <p className="eyebrow">{selectedJob.reference}</p>
          <h3>{selectedJob.title}</h3>
          <p>{selectedJob.configurationSnapshot.customer.displayName}</p>
          <p className="secondary-metadata">Configuration revision {selectedJob.configurationSnapshot.configuration.revisionNumber}</p>
        </div>
        <h3 id="applicable-systems-title">Applicable Systems</h3>
        <ul className="navigation-list">
          {systems.map((system) => {
            const progress = progressFor(selectedJob.id, system.systemKey);
            return <li key={system.enabledSystemId}>
              <button
                type="button"
                onClick={() => system.systemKey === "hose_reel"
                  ? onOpenHoseReel(selectedJob, system)
                  : onSelectSystem(selectedJob, system)}
              >
                <span>{system.displayName}</span>
                <span className="status-label">{progress}</span>
              </button>
            </li>;
          })}
        </ul>
      </section>
    ) : authState.status === "verified" || authState.status === "offline-unverified" ? (
      <section aria-labelledby="available-jobs-title">
        <div className="list-heading">
          <h3 id="available-jobs-title">Available Jobs</h3>
          <span>{jobs.length} cached</span>
        </div>
        {jobs.length === 0 ? <p className="empty-state">No cached technician jobs are available.</p> : (
          <ul className="navigation-list">
            {jobs.map((job) => <li key={job.id}>
              <button type="button" onClick={() => onSelectJob(job)}>
                <span>
                  <strong>{job.title}</strong>
                  <small>{job.reference} - {job.configurationSnapshot.customer.displayName}</small>
                </span>
                <span>{job.configurationSnapshot.enabledSystems.length} systems</span>
              </button>
            </li>)}
          </ul>
        )}
      </section>
    ) : null}
  </section>;
}
