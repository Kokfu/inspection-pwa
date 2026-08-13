import type { ClientAuthState } from "../auth/authStateTypes";
import type { InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type { AutomaticSprinklerInspectionRecord } from "../automaticSprinkler/automaticSprinklerTypes";
import type { DryWetRiserInspectionRecord } from "../dryWetRiser/dryWetRiserTypes";
import type { FireAlarmInspectionRecord } from "../fireAlarm/fireAlarmTypes";
import type { HydrantInspectionRecord } from "../hydrant/hydrantTypes";
import type { PortableRecord } from "../portableFireExtinguisher/portableFireExtinguisher";
import type { InspectionRecord } from "../db/localDatabase";
import type { MasterSystemInspectionRecord } from "../hoseReel/hoseReelTypes";
import type {
  MasterSystemFormInstanceRecord,
  MasterSystemInspectionGroupRecord
} from "../co2/co2Types";
import {
  deriveAutomaticSprinklerProgress,
  deriveAutomaticSprinklerServerProgress,
  deriveFireAlarmProgress,
  deriveMasterSystemProgress,
  deriveNoLocalSystemProgress,
  deriveSystemProgress
} from "./jobProgress";
import type { InspectionJob, JobSystemSnapshot } from "./jobTypes";
import { SystemNavigator } from "./SystemNavigator";
import type {
  ServerMasterSystemInspectionSummary
} from "../hoseReel/serverMasterSystemInspectionApi";

export function deriveWetChemicalAuthorityProgress(
  group: MasterSystemInspectionGroupRecord,
  instances: MasterSystemFormInstanceRecord[],
  serverSummaries: ServerMasterSystemInspectionSummary[]
) {
  const states = group.expectedInstances.map((expected) => {
    const accepted = serverSummaries.some((summary) => summary.jobId === group.jobId
      && summary.systemKey === group.systemKey
      && summary.locationId === expected.location.id
      && summary.instanceKey === expected.instanceKey
      && summary.zoneId === (expected.zone?.id ?? null)
      && summary.displaySequence === expected.displaySequence);
    if (accepted) return { syncStatus: "Synced" as const, startedAt: "server" };
    const local = instances.find((record) => record.groupKey === group.groupKey
      && record.instanceKey === expected.instanceKey
      && record.configuredLocationId === expected.location.id
      && record.configuredZoneId === (expected.zone?.id ?? null)
      && record.displaySequence === expected.displaySequence);
    return local ? { syncStatus: local.syncStatus, startedAt: local.startedAt } : undefined;
  });
  if (states.some((state) => state?.syncStatus === "Failed" || state?.syncStatus === "Conflict")) return "Needs Attention";
  if (states.some((state) => state?.syncStatus === "Syncing")) return "Syncing";
  if (states.some((state) => state?.syncStatus === "Pending")) return "Pending Sync";
  if (states.length > 0 && states.every((state) => state?.syncStatus === "Synced")) return "Completed";
  if (states.some((state) => state?.startedAt !== null && state?.startedAt !== undefined || state?.syncStatus === "Synced")) return "In Progress";
  return "Not Started";
}

type TechnicianHomeProps = {
  authState: ClientAuthState;
  jobs: InspectionJob[];
  inspections: InspectionRecord[];
  masterSystemInspections: Array<MasterSystemInspectionRecord | AutomaticSprinklerInspectionRecord | DryWetRiserInspectionRecord | FireAlarmInspectionRecord | HydrantInspectionRecord | PortableRecord>;
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
  onCloseJob: (job: InspectionJob) => Promise<void>;
  onSelectJob: (job: InspectionJob) => void;
  onSelectSystem: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onBackToJobs: () => void;
  onBackToSystems: (job: InspectionJob) => void;
  onOpenHoseReel: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenCo2: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenAutomaticSprinkler: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenDryWetRiser: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenFireAlarm: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenHydrant: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenPortableFireExtinguisher: (job: InspectionJob, system: JobSystemSnapshot) => void;
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
  onCloseJob,
  onSelectJob,
  onSelectSystem,
  onBackToJobs,
  onBackToSystems,
  onOpenHoseReel,
  onOpenCo2,
  onOpenAutomaticSprinkler, onOpenDryWetRiser, onOpenFireAlarm, onOpenHydrant, onOpenPortableFireExtinguisher
}: TechnicianHomeProps) {
  const selectedJob = jobs.find((job) => job.id === selectedJobId);
  const systems = selectedJob?.configurationSnapshot.enabledSystems
    .filter((system) => system.definitionStatus === "confirmed")
    .sort((left, right) => left.sortOrder - right.sortOrder) ?? [];
  const selectedSystem = systems.find((system) => system.systemKey === selectedSystemKey);
  const canUseServer = authState.status === "verified";
  const progressAuthStatus = authState.status === "verified" || authState.status === "offline-unverified"
    ? authState.status
    : "logged-out";
  const serverAccepted = (jobId: string, systemKey: string) =>
    serverMasterSystemInspections.some((record) =>
      record.jobId === jobId && record.systemKey === systemKey
    );
  const completionSystem = (jobId: string, systemKey: string) => jobs
    .find((job) => job.id === jobId)?.completion?.systems
    .find((system) => system.systemKey === systemKey);
  const serverSuppressionCompleted = (jobId: string, systemKey: "co2_fire_extinguisher" | "wet_chemical") => {
    const expected = jobs.find((job) => job.id === jobId)?.configurationSnapshot.enabledSystems
      .find((system) => system.systemKey === systemKey)?.locations ?? [];
    const acceptedLocations = new Set(serverMasterSystemInspections
      .filter((record) => record.jobId === jobId && record.systemKey === systemKey)
      .map((record) => record.locationId));
    return expected.length > 0 && expected.every((location) => acceptedLocations.has(location.id));
  };
  const noLocalProgress = (jobId: string, systemKey: string) => {
    return deriveNoLocalSystemProgress(
      serverAccepted(jobId, systemKey),
      progressAuthStatus,
      serverMasterSystemProgressState
    );
  };
  const progressFor = (jobId: string, systemKey: string) => {
    if (completionSystem(jobId, systemKey)?.status === "accepted") return "Completed";
    if (systemKey === "hose_reel") {
      if (serverMasterSystemProgressState === "loaded" && serverAccepted(jobId, systemKey)) return "Completed";
      const record = masterSystemInspections.find((candidate) =>
        candidate.jobSystemKey === `${jobId}:${systemKey}` && candidate.systemKey === "hose_reel"
      ) as MasterSystemInspectionRecord | undefined;
      return record
        ? deriveMasterSystemProgress(record)
        : noLocalProgress(jobId, systemKey);
    }
    if (systemKey === "automatic_sprinkler") {
      const record = masterSystemInspections.find((candidate) =>
        candidate.jobSystemKey === `${jobId}:${systemKey}`
        && candidate.systemKey === "automatic_sprinkler"
      ) as AutomaticSprinklerInspectionRecord | undefined;
      if (record) return deriveAutomaticSprinklerProgress(record, inspectionAttachments);
      const summary = serverMasterSystemInspections.find((candidate) =>
        candidate.jobId === jobId && candidate.systemKey === "automatic_sprinkler"
      );
      if (!summary || summary.systemKey !== "automatic_sprinkler") {
        return noLocalProgress(jobId, systemKey);
      }
      return deriveAutomaticSprinklerServerProgress(
        summary,
        progressAuthStatus,
        serverMasterSystemProgressState
      );
    }
    if (systemKey === "dry_wet_riser") { const record = masterSystemInspections.find((x) => x.jobSystemKey === `${jobId}:${systemKey}`); return record ? deriveMasterSystemProgress(record as MasterSystemInspectionRecord) : noLocalProgress(jobId, systemKey); }
    if (systemKey === "fire_alarm_detector") {
      const record=masterSystemInspections.find(x=>x.jobSystemKey===`${jobId}:${systemKey}`&&x.systemKey==="fire_alarm_detector");
      const summary = serverMasterSystemProgressState === "loaded"
        ? { kind: "current-complete" as const, accepted: serverAccepted(jobId,systemKey) }
        : { kind: "unavailable" as const };
      return deriveFireAlarmProgress(record as MasterSystemInspectionRecord|undefined,summary);
    }
    if (systemKey === "hydrant") {
      if (serverMasterSystemProgressState === "loaded" && serverAccepted(jobId, systemKey)) return "Completed";
      const record=masterSystemInspections.find(x=>x.jobSystemKey===`${jobId}:hydrant`&&x.systemKey==="hydrant");
      return record?deriveMasterSystemProgress(record as MasterSystemInspectionRecord):noLocalProgress(jobId,systemKey);
    }
    if (systemKey === "portable_fire_extinguisher") {
      if (serverMasterSystemProgressState === "loaded" && serverAccepted(jobId, systemKey)) return "Completed";
      const record=masterSystemInspections.find(x=>x.jobSystemKey===`${jobId}:${systemKey}`&&x.systemKey===systemKey);
      return record?deriveMasterSystemProgress(record as MasterSystemInspectionRecord):noLocalProgress(jobId,systemKey);
    }
    if (systemKey === "co2_fire_extinguisher" || systemKey === "wet_chemical") {
      const group = masterSystemInspectionGroups.find((record) => record.groupKey === `${jobId}:${systemKey}`);
      if (group) {
        return deriveWetChemicalAuthorityProgress(
          group,
          masterSystemFormInstances.filter((record) => record.groupKey === group.groupKey),
          serverMasterSystemInspections
        );
      }
      return deriveNoLocalSystemProgress(
        serverSuppressionCompleted(jobId, systemKey),
        progressAuthStatus,
        serverMasterSystemProgressState
      );
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
        onOpenSuppressionLocations={selectedSystem.systemKey === "co2_fire_extinguisher" || selectedSystem.systemKey === "wet_chemical" ? () => onOpenCo2(selectedJob, selectedSystem) : undefined}
        onOpenPortableFireExtinguisher={selectedSystem.systemKey === "portable_fire_extinguisher" ? () => onOpenPortableFireExtinguisher(selectedJob, selectedSystem) : undefined}
      />
    ) : selectedJob ? (
      <section aria-labelledby="applicable-systems-title">
        <button type="button" className="secondary-command" onClick={onBackToJobs}>Back to Jobs</button>
        <div className="job-context">
          <p className="eyebrow">{selectedJob.reference}</p>
          <h3>{selectedJob.title}</h3>
          <p>{selectedJob.configurationSnapshot.customer.displayName}</p>
          <p className="secondary-metadata">Configuration revision {selectedJob.configurationSnapshot.configuration.revisionNumber}</p>
          {selectedJob.status === "closed" ? (
            <>
              <p className="status-label">Completed</p>
              <p className="secondary-metadata">
                {selectedJob.completion?.completedAt
                  ? `Completed ${new Date(selectedJob.completion.completedAt).toLocaleString()}`
                  : "Completion time unavailable"}
                {selectedJob.completion?.completedBy
                  ? ` by ${selectedJob.completion.completedBy.username}`
                  : ""}
              </p>
              <p className="form-message">Accepted inspections remain viewable. New local inspection entry is disabled for this completed job.</p>
            </>
          ) : null}
        </div>
        {selectedJob.status === "open" ? (
          <section className="job-completion" aria-labelledby="job-completion-title">
            <div className="workspace-heading">
              <div>
                <p className="eyebrow">Server Verification</p>
                <h3 id="job-completion-title">Job Completion</h3>
              </div>
              <span>{selectedJob.completion
                ? `${selectedJob.completion.acceptedUnitCount}/${selectedJob.completion.requiredUnitCount} accepted`
                : "Verification unavailable"}</span>
            </div>
            {selectedJob.completion?.eligible ? (
              <p>All required authority units are Accepted by the server.</p>
            ) : selectedJob.completion ? (
              <ul className="record-list">
                {selectedJob.completion.systems.flatMap((system) => system.units
                  .filter((unit) => unit.status === "incomplete")
                  .map((unit) => <li key={`${system.systemKey}:${unit.authorityKey}`}>
                    <strong>{system.systemLabel}</strong>
                    <span>{unit.label}</span>
                    <small>{unit.reason === "EVIDENCE_PENDING" ? "Required evidence is pending"
                      : unit.reason === "EVIDENCE_INVALID" ? "Required evidence is invalid"
                      : unit.reason === "SYSTEM_NOT_SUPPORTED" ? "Configured system is not supported"
                      : unit.reason === "CONFIGURATION_INVALID" ? "Authoritative job configuration is invalid"
                      : "Accepted inspection is missing"}</small>
                  </li>))}
              </ul>
            ) : <p>Reconnect and refresh to verify completion with the server.</p>}
            <button
              type="button"
              disabled={!canUseServer || !selectedJob.completion?.eligible || loading}
              onClick={() => void onCloseJob(selectedJob)}
            >Complete Job</button>
            {!canUseServer ? <p className="offline-notice">Completion requires server verification and cannot be performed offline.</p> : null}
          </section>
        ) : null}
        <h3 id="applicable-systems-title">Applicable Systems</h3>
        <ul className="navigation-list">
          {systems.map((system) => {
            const progress = progressFor(selectedJob.id, system.systemKey);
            return <li key={system.enabledSystemId}>
              <button
                type="button"
                onClick={() => system.systemKey === "hose_reel"
                  ? onOpenHoseReel(selectedJob, system)
                  : system.systemKey === "co2_fire_extinguisher" || system.systemKey === "wet_chemical"
                    ? onOpenCo2(selectedJob, system)
                    : system.systemKey === "automatic_sprinkler"
                      ? onOpenAutomaticSprinkler(selectedJob, system)
                    : system.systemKey === "dry_wet_riser" ? onOpenDryWetRiser(selectedJob, system)
                    : system.systemKey === "fire_alarm_detector" ? onOpenFireAlarm(selectedJob, system)
                    : system.systemKey === "hydrant" ? onOpenHydrant(selectedJob, system)
                    : system.systemKey === "portable_fire_extinguisher" ? onOpenPortableFireExtinguisher(selectedJob, system)
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
                <span>{job.status === "closed" ? "Completed" : `${job.configurationSnapshot.enabledSystems.length} systems`}</span>
              </button>
            </li>)}
          </ul>
        )}
      </section>
    ) : null}
  </section>;
}
