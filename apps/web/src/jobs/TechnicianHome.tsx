import type { ClientAuthState } from "../auth/authStateTypes";
import type { InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type { AutomaticSprinklerInspectionRecord } from "../automaticSprinkler/automaticSprinklerTypes";
import type { InspectionRecord } from "../db/localDatabase";
import type { MasterSystemInspectionRecord } from "../hoseReel/hoseReelTypes";
import type {
  MasterSystemFormInstanceRecord,
  MasterSystemInspectionGroupRecord
} from "../co2/co2Types";
import { deriveCo2ParentProgress } from "../co2/co2Progress";
import {
  deriveAutomaticSprinklerProgress,
  deriveMasterSystemProgress,
  deriveNoLocalSystemProgress,
  deriveSystemProgress
} from "./jobProgress";
import type { InspectionJob, JobSystemSnapshot } from "./jobTypes";
import { SystemNavigator } from "./SystemNavigator";
import type {
  ServerMasterSystemInspectionSummary
} from "../hoseReel/serverMasterSystemInspectionApi";

type TechnicianHomeProps = {
  authState: ClientAuthState;
  jobs: InspectionJob[];
  inspections: InspectionRecord[];
  masterSystemInspections: Array<MasterSystemInspectionRecord | AutomaticSprinklerInspectionRecord>;
  masterSystemInspectionGroups: MasterSystemInspectionGroupRecord[];
  masterSystemFormInstances: MasterSystemFormInstanceRecord[];
  inspectionAttachments: InspectionAttachmentRecord[];
  serverMasterSystemInspections: ServerMasterSystemInspectionSummary[];
  serverMasterSystemProgressState: "idle" | "loading" | "loaded" | "failed";
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
  onOpenCo2: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenAutomaticSprinkler: (job: InspectionJob, system: JobSystemSnapshot) => void;
};

export function TechnicianHome({
  authState,
  jobs,
  inspections,
  masterSystemInspections,
  masterSystemInspectionGroups,
  masterSystemFormInstances,
  inspectionAttachments,
  serverMasterSystemInspections,
  serverMasterSystemProgressState,
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
  onOpenHoseReel,
  onOpenCo2,
  onOpenAutomaticSprinkler
}: TechnicianHomeProps) {
  const selectedJob = jobs.find((job) => job.id === selectedJobId);
  const systems = selectedJob?.configurationSnapshot.enabledSystems
    .filter((system) => system.definitionStatus === "confirmed")
    .sort((left, right) => left.sortOrder - right.sortOrder) ?? [];
  const selectedSystem = systems.find((system) => system.systemKey === selectedSystemKey);
  const canUseServer = authState.status === "verified";
  const serverAccepted = (jobId: string, systemKey: string) =>
    serverMasterSystemInspections.some((record) =>
      record.jobId === jobId && record.systemKey === systemKey
    );
  const noLocalProgress = (jobId: string, systemKey: string) => {
    const status = authState.status === "restoring"
      ? "logged-out"
      : authState.status;
    return deriveNoLocalSystemProgress(
      serverAccepted(jobId, systemKey),
      status,
      serverMasterSystemProgressState
    );
  };
  const progressFor = (jobId: string, systemKey: string) => {
    if (systemKey === "hose_reel") {
      const record = masterSystemInspections.find((candidate) =>
        candidate.jobSystemKey === `${jobId}:${systemKey}`
      );
      return record
        ? deriveMasterSystemProgress(record)
        : noLocalProgress(jobId, systemKey);
    }
    if (systemKey === "automatic_sprinkler") {
      const record = masterSystemInspections.find((candidate) =>
        candidate.jobSystemKey === `${jobId}:${systemKey}`
        && candidate.systemKey === "automatic_sprinkler"
      ) as AutomaticSprinklerInspectionRecord | undefined;
      return record
        ? deriveAutomaticSprinklerProgress(record, inspectionAttachments)
        : noLocalProgress(jobId, systemKey);
    }
    if (systemKey === "co2_fire_extinguisher") {
      const group = masterSystemInspectionGroups.find((record) => record.groupKey === `${jobId}:${systemKey}`);
      return group
        ? deriveCo2ParentProgress(
          group,
          masterSystemFormInstances.filter((record) => record.groupKey === group.groupKey)
        )
        : noLocalProgress(jobId, systemKey);
    }
    const local = inspections.some((record) =>
      record.jobId === jobId && record.systemKey === systemKey
    );
    return local
      ? deriveSystemProgress(inspections, jobId, systemKey)
      : noLocalProgress(jobId, systemKey);
  };

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

    {authState.status === "restoring" ? <p>Preparing local workspace.</p> : null}
    {authState.status === "logged-out" ? <p>Sign in online to prepare technician jobs for offline use.</p> : null}
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
                  : system.systemKey === "co2_fire_extinguisher"
                    ? onOpenCo2(selectedJob, system)
                    : system.systemKey === "automatic_sprinkler"
                      ? onOpenAutomaticSprinkler(selectedJob, system)
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
