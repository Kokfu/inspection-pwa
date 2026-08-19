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
import {
  inspectionStatusLabel,
  inspectionStatusTone,
  inspectionActionLabel,
  formatClientDate,
  formatClientDateTime,
  isRoutineJobCountMessage,
  jobStatusLabel,
  technicianOperationalMessage
} from "../uiPresentation";

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
  onRefresh: () => Promise<void>;
  onSync: () => Promise<void>;
  onCloseJob: (job: InspectionJob) => Promise<void>;
  onViewFinalReport: (job: InspectionJob) => void;
  onNewServiceVisit: () => void;
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
  onRefresh,
  onSync,
  onCloseJob, onViewFinalReport, onNewServiceVisit,
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

  const jobProgress = (job: InspectionJob) => {
    const applicable = job.configurationSnapshot.enabledSystems
      .filter((system) => system.definitionStatus === "confirmed");
    const complete = applicable.filter((system) => progressFor(job.id, system.systemKey) === "Completed").length;
    return { complete, total: applicable.length };
  };
  const selectedJobProgress = selectedJob ? jobProgress(selectedJob) : undefined;
  const operationalMessage = message && !isRoutineJobCountMessage(message, jobs.length)
    ? technicianOperationalMessage(message)
    : undefined;

  return <section className="technician-home" aria-labelledby="technician-home-title">
    {!selectedJob ? <div className="home-toolbar">
      <div>
        <h2 id="technician-home-title">My Service Jobs</h2>
        <p>{jobs.length} {jobs.length === 1 ? "job" : "jobs"} available on this device</p>
      </div>
      <div className="home-utility-actions">
        <button type="button" onClick={onNewServiceVisit} disabled={!canUseServer || loading}>+ New Service Visit</button>
        <button type="button" className="secondary-command" disabled={!canUseServer || loading} onClick={() => void onRefresh()}>
          {loading ? "Refreshing\u2026" : "Refresh"}
        </button>
        <button type="button" className="secondary-command" disabled={!canUseServer} onClick={() => void onSync()}>
          Sync Now
        </button>
      </div>
    </div> : null}

    {authState.status === "restoring" ? <p>Preparing local workspace.</p> : null}
    {authState.status === "logged-out" ? <p>Sign in online to prepare technician jobs for offline use.</p> : null}
    {authState.status === "offline-unverified" ? (
      <p className="offline-notice">Offline — changes are saved on this device. Reconnect for refresh and sync.</p>
    ) : null}
    {operationalMessage ? <p className={`operational-message operational-message--${operationalMessage.tone}`}>
      {operationalMessage.text}
    </p> : null}

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
        <button type="button" className="secondary-command back-command" onClick={onBackToJobs}>Back to My Jobs</button>
        <div className="job-context job-context-card">
          <div className="job-context-title">
            <div>
              <p className="eyebrow">Customer</p>
              <h3>{selectedJob.configurationSnapshot.customer.displayName}</h3>
            </div>
            <span className={`status-badge status-badge--${selectedJob.status === "closed" ? "complete" : "draft"}`}>
              {jobStatusLabel(selectedJob.status)}
            </span>
          </div>
          <dl className="job-facts">
            <div><dt>Site / Service</dt><dd>{selectedJob.site?.displayName ?? selectedJob.title}</dd></div>
            <div><dt>Service Date</dt><dd>{selectedJob.serviceDate ? formatClientDate(selectedJob.serviceDate) : "Not provided"}</dd></div>
            <div><dt>Job Reference</dt><dd>{selectedJob.reference}</dd></div>
          </dl>
          <div className="job-detail-progress">
            <div>
              <span>Inspection progress</span>
              <strong>{selectedJobProgress?.complete}/{selectedJobProgress?.total} complete</strong>
            </div>
            <div className="progress-track" aria-label={`${selectedJobProgress?.complete} of ${selectedJobProgress?.total} inspections complete`}>
              <span style={{ width: selectedJobProgress?.total ? `${(selectedJobProgress.complete / selectedJobProgress.total) * 100}%` : "0%" }} />
            </div>
          </div>
          {selectedJob.status === "closed" ? (
            <div className="read-only-banner">
              <strong>Service Completed</strong>
              <dl className="completion-metadata">
                <div><dt>Completed on</dt><dd>{selectedJob.completion?.completedAt
                  ? <time dateTime={selectedJob.completion.completedAt}>{formatClientDateTime(selectedJob.completion.completedAt)}</time>
                  : "Unavailable"}</dd></div>
                <div><dt>Completed by</dt><dd>{selectedJob.completion?.completedBy?.username ?? "Unavailable"}</dd></div>
              </dl>
              <p>This service visit is complete and read-only.</p>
              <div className="inline-actions"><button type="button" onClick={() => onViewFinalReport(selectedJob)}>View Final Report</button></div>
            </div>
          ) : null}
        </div>
        {selectedJob.status === "open" && selectedJob.completion?.eligible ? (
          <section className="job-completion job-completion--ready" aria-labelledby="job-completion-title">
            <div className="workspace-heading">
              <div>
                <p className="eyebrow">Service visit</p>
                <h3 id="job-completion-title">Ready to Complete</h3>
              </div>
              <span>{selectedJob.completion.acceptedUnitCount} of {selectedJob.completion.requiredUnitCount} inspections complete</span>
            </div>
            <p>All required inspections are complete.</p>
            <button type="button" disabled={!canUseServer || loading} onClick={() => void onCloseJob(selectedJob)}>Complete Service</button>
            {!canUseServer ? <p className="offline-notice">Reconnect before completing this service visit.</p> : null}
          </section>
        ) : selectedJob.status === "open" ? (
          <section className="remaining-inspections" aria-labelledby="remaining-inspections-title">
            <div className="workspace-heading"><div><p className="eyebrow">Completion requirements</p><h3 id="remaining-inspections-title">Remaining Inspections</h3></div><span>{selectedJob.completion ? `${selectedJob.completion.acceptedUnitCount} of ${selectedJob.completion.requiredUnitCount} complete` : "Progress unavailable"}</span></div>
            {selectedJob.completion ? (
              <ul className="record-list">
                {selectedJob.completion.systems.flatMap((system) => system.units
                  .filter((unit) => unit.status === "incomplete")
                  .map((unit) => <li className="completion-requirement" key={`${system.systemKey}:${unit.authorityKey}`}>
                    <strong>{system.systemLabel}</strong>
                    <span>{unit.label}</span>
                    <small>{unit.reason === "EVIDENCE_PENDING" ? "Required evidence is pending"
                      : unit.reason === "EVIDENCE_INVALID" ? "Required evidence is invalid"
                      : unit.reason === "SYSTEM_NOT_SUPPORTED" ? "Configured system is not supported"
                      : unit.reason === "CONFIGURATION_INVALID" ? "Authoritative job configuration is invalid"
                      : "Inspection is not complete"}</small>
                  </li>))}
              </ul>
            ) : <p>Reconnect and refresh to confirm completion readiness.</p>}
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
                <span className="navigation-primary"><strong>{system.displayName}</strong><small>{inspectionActionLabel(progress)}</small></span>
                <span className={`status-badge status-badge--${inspectionStatusTone(progress)}`}>{inspectionStatusLabel(progress)}</span>
              </button>
            </li>;
          })}
        </ul>
      </section>
    ) : authState.status === "verified" || authState.status === "offline-unverified" ? (
      <section aria-labelledby="available-jobs-title">
        <h3 className="visually-hidden" id="available-jobs-title">Available service jobs</h3>
        {jobs.length === 0 ? <p className="empty-state">No service jobs are available on this device.</p> : (
          <ul className="job-card-list">
            {jobs.map((job) => {
              const progress = jobProgress(job);
              return <li key={job.id}>
                <button type="button" className="job-card" onClick={() => onSelectJob(job)}>
                  <div className="job-card-heading">
                    <div><span className="job-card-label">Customer</span><strong>{job.configurationSnapshot.customer.displayName}</strong></div>
                    <span className={`status-badge status-badge--${job.status === "closed" ? "complete" : "draft"}`}>{jobStatusLabel(job.status)}</span>
                  </div>
                  <div className="job-service-line">
                    <span className="job-card-label">Site / Service</span>
                    <strong>{job.site?.displayName ?? job.title}</strong>
                  </div>
                  <div className="job-card-meta">
                    <span><small>Service Date</small><strong>{job.serviceDate ? formatClientDate(job.serviceDate) : "Not provided"}</strong></span>
                    <span><small>Inspection progress</small><strong>{progress.complete}/{progress.total} complete</strong></span>
                  </div>
                  <div className="progress-track" aria-label={`${progress.complete} of ${progress.total} inspections complete`}>
                    <span style={{ width: progress.total ? `${(progress.complete / progress.total) * 100}%` : "0%" }} />
                  </div>
                  <span className="job-reference">{job.reference}</span>
                </button>
              </li>;
            })}
          </ul>
        )}
      </section>
    ) : null}
  </section>;
}
