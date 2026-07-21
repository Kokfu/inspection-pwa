import { useEffect, useState } from "react";
import type { ClientAuthState } from "../auth/authStateTypes";
import type { InspectionRecord } from "../db/localDatabase";
import { deriveSystemProgress } from "./jobProgress";
import type { InspectionJob, JobSystemSnapshot } from "./jobTypes";
import { SystemNavigator } from "./SystemNavigator";

type TechnicianHomeProps = {
  authState: ClientAuthState;
  jobs: InspectionJob[];
  inspections: InspectionRecord[];
  loading: boolean;
  message: string;
  onRefresh: () => Promise<void>;
};

export function TechnicianHome({
  authState,
  jobs,
  inspections,
  loading,
  message,
  onRefresh
}: TechnicianHomeProps) {
  const [selectedJobId, setSelectedJobId] = useState<string>();
  const [selectedSystemKey, setSelectedSystemKey] = useState<string>();
  const selectedJob = jobs.find((job) => job.id === selectedJobId);
  const systems = selectedJob?.configurationSnapshot.enabledSystems
    .filter((system) => system.definitionStatus === "confirmed")
    .sort((left, right) => left.sortOrder - right.sortOrder) ?? [];
  const selectedSystem = systems.find((system) => system.systemKey === selectedSystemKey);
  const canUseServer = authState.status === "verified";

  useEffect(() => {
    if (selectedJobId && !jobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(undefined);
      setSelectedSystemKey(undefined);
    }
  }, [jobs, selectedJobId]);

  function chooseJob(job: InspectionJob) {
    setSelectedJobId(job.id);
    setSelectedSystemKey(undefined);
  }

  function chooseSystem(system: JobSystemSnapshot) {
    setSelectedSystemKey(system.systemKey);
  }

  return <section className="technician-home" aria-labelledby="technician-home-title">
    <div className="workspace-heading">
      <div>
        <p className="eyebrow">Field Work</p>
        <h2 id="technician-home-title">Technician Home</h2>
      </div>
      <button type="button" disabled={!canUseServer || loading} onClick={() => void onRefresh()}>
        {loading ? "Refreshing" : "Refresh Jobs"}
      </button>
    </div>

    {authState.status === "checking" ? <p>Preparing local workspace.</p> : null}
    {authState.status === "unauthenticated" ? <p>Sign in online to prepare technician jobs for offline use.</p> : null}
    {authState.status === "offline-unverified" ? (
      <p className="offline-notice">Cached jobs are available. Server actions require session verification.</p>
    ) : null}
    {message ? <p className="form-message">{message}</p> : null}

    {selectedJob && selectedSystem ? (
      <SystemNavigator
        system={selectedSystem}
        progress={deriveSystemProgress(inspections, selectedJob.id, selectedSystem.systemKey)}
        onBack={() => setSelectedSystemKey(undefined)}
      />
    ) : selectedJob ? (
      <section aria-labelledby="applicable-systems-title">
        <button type="button" className="secondary-command" onClick={() => setSelectedJobId(undefined)}>Back to Jobs</button>
        <div className="job-context">
          <p className="eyebrow">{selectedJob.reference}</p>
          <h3>{selectedJob.title}</h3>
          <p>{selectedJob.configurationSnapshot.customer.displayName}</p>
          <p>Configuration revision {selectedJob.configurationSnapshot.configuration.revisionNumber}</p>
        </div>
        <h3 id="applicable-systems-title">Applicable Systems</h3>
        <ul className="navigation-list">
          {systems.map((system) => {
            const progress = deriveSystemProgress(inspections, selectedJob.id, system.systemKey);
            return <li key={system.enabledSystemId}>
              <button type="button" onClick={() => chooseSystem(system)}>
                <span>{system.displayName}</span>
                <span className="status-label">{progress}</span>
              </button>
            </li>;
          })}
        </ul>
      </section>
    ) : authState.status === "verified" || authState.status === "offline-unverified" ? (
      <section aria-labelledby="available-jobs-title">
        <h3 id="available-jobs-title">Available Jobs</h3>
        {jobs.length === 0 ? <p className="empty-state">No cached technician jobs are available.</p> : (
          <ul className="navigation-list">
            {jobs.map((job) => <li key={job.id}>
              <button type="button" onClick={() => chooseJob(job)}>
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
