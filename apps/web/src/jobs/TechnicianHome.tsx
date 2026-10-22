import { useEffect, useMemo, useState } from "react";
import type { ClientAuthState } from "../auth/authStateTypes";
import type { InspectionAttachmentRecord } from "../attachments/attachmentTypes";
import type { AutomaticSprinklerInspectionRecord } from "../automaticSprinkler/automaticSprinklerTypes";
import type { DryWetRiserInspectionRecord } from "../dryWetRiser/dryWetRiserTypes";
import type { FireAlarmInspectionRecord } from "../fireAlarm/fireAlarmTypes";
import type { HydrantInspectionRecord } from "../hydrant/hydrantTypes";
import type { SmokeVentilationInspectionRecord } from "../smokeVentilation/smokeVentilationTypes";
import type { FireIntercomInspectionRecord } from "../fireIntercom/fireIntercomTypes";
import type { FireRatedRollerShutterInspectionRecord } from "../fireRatedRollerShutter/fireRatedRollerShutterTypes";
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
import { ServiceJobCard } from "./ServiceJobCard";
import { MissingServiceVisit } from "../visits/MissingServiceVisit";
import { useBrowserOnline } from "../pwa/browserOnline";
import { OpenWorkSection, matchesOpenWork } from "./OpenWorkSection";
import { isLocalVisitReference, presentLocalVisit, withConfirmedReference } from "./offlineServiceVisitStore";
import { deleteUnsyncedLocalVisit, prefetchCustomerSitesForOffline, requeueOfflineServiceVisit } from "./offlineServiceVisitLocal";
import { useOfflineServiceVisits } from "./useOfflineServiceVisits";
import { useLocalRepairVisits } from "../repairVisits/useRepairVisits";
import { presentRepairVisit, visitNumberText } from "../repairVisits/repairVisitPresentation";
import { offersAddLocation } from "../manager/managerApi";
import type {
  ServerMasterSystemInspectionSummary
} from "../hoseReel/serverMasterSystemInspectionApi";
import {
  inspectionStatusLabel,
  inspectionStatusTone,
  inspectionActionLabel,
  formatClientDateTime,
  formatMalaysiaDateTime,
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
  masterSystemInspections: Array<MasterSystemInspectionRecord | AutomaticSprinklerInspectionRecord | DryWetRiserInspectionRecord | FireAlarmInspectionRecord | HydrantInspectionRecord | SmokeVentilationInspectionRecord | FireIntercomInspectionRecord | FireRatedRollerShutterInspectionRecord | PortableRecord>;
  masterSystemInspectionGroups: MasterSystemInspectionGroupRecord[];
  masterSystemFormInstances: MasterSystemFormInstanceRecord[];
  inspectionAttachments: InspectionAttachmentRecord[];
  serverMasterSystemInspections: ServerMasterSystemInspectionSummary[];
  serverMasterSystemProgressState: "idle" | "loading" | "loaded" | "failed";
  /** I-02: jobs the server confirmed recently enough to start their systems offline. */
  offlineReadyJobIds?: ReadonlySet<string>;
  loading: boolean;
  message: string;
  creationConfirmation?: string;
  selectedJobId?: string;
  selectedSystemKey?: string;
  onRefresh: () => Promise<void>;
  onSync: () => Promise<void>;
  onCloseJob: (job: InspectionJob) => Promise<void>;
  onDeleteJob: (job: InspectionJob) => Promise<void>;
  onArchiveJob: (job: InspectionJob) => Promise<void>;
  onViewFinalReport: (job: InspectionJob) => void;
  onNewServiceVisit: () => void;
  onSelectJob: (job: InspectionJob) => void;
  onSelectSystem: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onBackToJobs: () => void;
  onBackToSystems: (job: InspectionJob) => void;
  onOpenHoseReel: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenCo2: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenFm200: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenAutomaticSprinkler: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenDryWetRiser: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenFireAlarm: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenHydrant: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenPortableFireExtinguisher: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenSmokeVentilation: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenFireIntercom: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenFireRatedRollerShutter: (job: InspectionJob, system: JobSystemSnapshot) => void;
  onOpenLocationProposal: (job: InspectionJob) => void;
};

export function TechnicianHome({
  authState,
  jobs: serverJobs,
  inspections,
  masterSystemInspections,
  masterSystemInspectionGroups,
  masterSystemFormInstances,
  inspectionAttachments,
  serverMasterSystemInspections,
  serverMasterSystemProgressState,
  offlineReadyJobIds,
  loading,
  message,
  creationConfirmation,
  selectedJobId,
  selectedSystemKey,
  onRefresh,
  onSync,
  onCloseJob, onDeleteJob, onArchiveJob, onViewFinalReport, onNewServiceVisit,
  onSelectJob,
  onSelectSystem,
  onBackToJobs,
  onBackToSystems,
  onOpenHoseReel,
  onOpenCo2,
  onOpenFm200,
  onOpenAutomaticSprinkler, onOpenDryWetRiser, onOpenFireAlarm, onOpenHydrant, onOpenPortableFireExtinguisher, onOpenSmokeVentilation, onOpenFireIntercom, onOpenFireRatedRollerShutter,
  onOpenLocationProposal
}: TechnicianHomeProps) {
  const repairs = useLocalRepairVisits();
  const browserOnline = useBrowserOnline();
  const { visits: localVisits, loaded: localVisitsLoaded } = useOfflineServiceVisits();
  const localById = useMemo(() => new Map(localVisits.map((visit) => [visit.clientJobUuid, visit])), [localVisits]);
  // Visits made on this device appear (and show the server's SV number once confirmed) without waiting for a server list.
  const jobs = useMemo(() => {
    const merged = serverJobs
      .filter((job) => !isLocalVisitReference(job.reference) || !localVisitsLoaded || localById.has(job.id))
      .map((job) => withConfirmedReference(job, localById.get(job.id)));
    const known = new Set(merged.map((job) => job.id));
    for (const visit of localVisits) if (visit.syncStatus !== "Synced" && !known.has(visit.clientJobUuid)) merged.push(visit.job);
    return merged;
  }, [serverJobs, localVisits, localVisitsLoaded, localById]);
  const [localMessage, setLocalMessage] = useState("");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  useEffect(() => {
    // Keep each customer's sites on the device so a visit can be started later with no signal.
    if (authState.status === "verified") void prefetchCustomerSitesForOffline().catch(() => undefined);
  }, [authState.status]);
  const localPresentation = (jobId: string) => {
    const visit = localById.get(jobId);
    return visit && visit.syncStatus !== "Synced" ? presentLocalVisit(visit) : undefined;
  };
  async function retryLocalVisit(job: InspectionJob) {
    setLocalMessage("");
    await requeueOfflineServiceVisit(job.id);
    if (canUseServer) void onSync();
  }
  async function deleteLocalVisit(job: InspectionJob) {
    try { setLocalMessage(""); await deleteUnsyncedLocalVisit(job.id); onBackToJobs(); }
    catch (error) { setLocalMessage(error instanceof Error ? error.message : "The visit could not be deleted."); }
  }
  // A visit made on this device stays openable after it syncs, until the server list carries it.
  const selectedLocalVisit = selectedJobId ? localById.get(selectedJobId) : undefined;
  const selectedJob = jobs.find((job) => job.id === selectedJobId)
    ?? (selectedLocalVisit ? withConfirmedReference(selectedLocalVisit.job, selectedLocalVisit) : undefined);
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
  const serverSuppressionCompleted = (jobId: string, systemKey: "co2_fire_extinguisher" | "wet_chemical" | "fm200_fire_suppression") => {
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
    if (systemKey === "dry_wet_riser" || systemKey === "smoke_ventilation" || systemKey === "fire_intercom" || systemKey === "fire_rated_roller_shutter") { const record = masterSystemInspections.find((x) => x.jobSystemKey === `${jobId}:${systemKey}`); return record ? deriveMasterSystemProgress(record as MasterSystemInspectionRecord) : noLocalProgress(jobId, systemKey); }
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
    if (systemKey === "co2_fire_extinguisher" || systemKey === "wet_chemical" || systemKey === "fm200_fire_suppression") {
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
  const selectedHasDeviceWork = selectedJob ? inspections.some((record) => record.jobId === selectedJob.id)
    || masterSystemInspections.some((record) => record.jobId === selectedJob.id)
    || masterSystemInspectionGroups.some((record) => record.jobId === selectedJob.id)
    || masterSystemFormInstances.some((record) => record.jobId === selectedJob.id) : false;
  const canDeleteSelectedJob = !!selectedJob && selectedJob.status === "open" && canUseServer && !loading
    && serverMasterSystemProgressState === "loaded" && !selectedHasDeviceWork
    && systems.length > 0 && systems.every((system) => progressFor(selectedJob.id, system.systemKey) === "Not Started")
    && selectedJob.completion?.acceptedUnitCount === 0;
  // Soft-delete: any open job, even one with local work already started -- unlike
  // canDeleteSelectedJob above, which only permits the untouched-job hard delete. Recoverable by
  // an admin (Manager Operations archive/restore); never a hard delete.
  const canArchiveSelectedJob = !!selectedJob && selectedJob.status === "open" && canUseServer && !loading;
  const operationalMessage = message && !isRoutineJobCountMessage(message, jobs.length)
    ? technicianOperationalMessage(message)
    : undefined;
  const newestFirst = (a: InspectionJob, b: InspectionJob) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
  const currentJobs = jobs.filter((job) => job.status !== "closed").sort(newestFirst);
  const actorId = "user" in authState ? authState.user?.id : undefined;
  const openRepairs = repairs.visits.filter(visit => visit.createdByUserId === actorId
    && presentRepairVisit(visit).tab === "in-progress")
    .sort((a, b) => b.visitDate.localeCompare(a.visitDate) || b.localCreatedAt.localeCompare(a.localCreatedAt));
  const filteredJobs = currentJobs.filter(job => matchesOpenWork(query, [
    job.configurationSnapshot.customer.displayName, job.site?.displayName, job.title, job.reference
  ]));
  const filteredRepairs = openRepairs.filter(visit => matchesOpenWork(query, [
    visit.customerName, visit.siteName, visit.visitNumber
  ]));
  const matchCount = filteredJobs.length + filteredRepairs.length;
  const jobCard = (job: InspectionJob) => {
    const progress = jobProgress(job);
    const local = localPresentation(job.id);
    return <ServiceJobCard key={job.id} job={job} progress={progress} canViewReport={canUseServer}
      offlineReady={local ? undefined : offlineReadyJobIds ? offlineReadyJobIds.has(job.id) : undefined}
      localVisit={local} onRetryLocalVisit={(candidate) => void retryLocalVisit(candidate)}
      onSelectJob={onSelectJob} onViewFinalReport={onViewFinalReport} />;
  };

  return <section className="technician-home page-stack" aria-labelledby="technician-home-title">
    {!selectedJob && !selectedJobId ? <div className="home-toolbar">
      <div className="workspace-heading"><div>
        <p className="eyebrow">Technician workspace</p>
        <h2 id="technician-home-title">Open Work</h2>
        <p>Unfinished service and repair visits saved on this device</p>
      </div></div>
      <div className="home-utility-actions">
        <a className="secondary-command" href="#/technician-completed-services">Recent completed</a>
        <button type="button" className="new-service-primary" onClick={onNewServiceVisit} disabled={(!canUseServer && authState.status !== "offline-unverified") || loading}>+ New Service Visit</button>
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
    <div role="status" aria-live="polite" aria-atomic="true">
      {creationConfirmation ? <p className="operational-message operational-message--info">{creationConfirmation}</p> : null}
    </div>
    {operationalMessage ? <p className={`operational-message operational-message--${operationalMessage.tone}`}>
      {operationalMessage.text}
    </p> : null}

    {selectedJob && selectedSystem ? (
      <SystemNavigator
        system={selectedSystem}
        progress={progressFor(selectedJob.id, selectedSystem.systemKey)}
        onBack={() => onBackToSystems(selectedJob)}
        onOpenHoseReel={() => onOpenHoseReel(selectedJob, selectedSystem)}
        onOpenSuppressionLocations={selectedSystem.systemKey === "co2_fire_extinguisher" || selectedSystem.systemKey === "wet_chemical" ? () => onOpenCo2(selectedJob, selectedSystem) : selectedSystem.systemKey === "fm200_fire_suppression" ? () => onOpenFm200(selectedJob, selectedSystem) : undefined}
        onNewServiceVisit={onNewServiceVisit}
        onOpenPortableFireExtinguisher={selectedSystem.systemKey === "portable_fire_extinguisher" ? () => onOpenPortableFireExtinguisher(selectedJob, selectedSystem) : undefined}
      />
    ) : selectedJob ? (
      <section aria-labelledby="applicable-systems-title">
        <button type="button" className="secondary-command back-command" onClick={onBackToJobs}>Back to My Jobs</button>
        <div className="job-context job-context-card">
          <div className="job-context-title">
            <div>
              <p className="eyebrow">Customer</p>
              <h2>{selectedJob.configurationSnapshot.customer.displayName}</h2>
            </div>
            <span className={`status-badge status-badge--${selectedJob.status === "closed" ? "complete" : "draft"}`}>
              {jobStatusLabel(selectedJob.status)}
            </span>
          </div>
          <dl className="job-facts">
            <div><dt>Site / Service</dt><dd>{selectedJob.site?.displayName ?? selectedJob.title}</dd></div>
            <div><dt>Created Date & Time</dt><dd>{formatMalaysiaDateTime(selectedJob.createdAt)}</dd></div>
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
          {selectedJob.status === "open" && localPresentation(selectedJob.id) ? <div className="local-visit-panel">
            <p role="status" className={`operational-message operational-message--${localPresentation(selectedJob.id)?.tone === "attention" ? "warning" : "info"}`}>
              <strong>{localPresentation(selectedJob.id)?.label}</strong>{localPresentation(selectedJob.id)?.reason ? `: ${localPresentation(selectedJob.id)?.reason}` : ". This visit is saved on this device and is sent when you are connected."}
            </p>
            <div className="inline-actions">
              {localPresentation(selectedJob.id)?.tone === "attention" ? <button type="button" className="secondary-command" onClick={() => void retryLocalVisit(selectedJob)}>Retry sync</button> : null}
              <button type="button" className="secondary-command danger-command" disabled={selectedHasDeviceWork || localById.get(selectedJob.id)?.syncStatus === "Syncing"}
                aria-describedby={selectedHasDeviceWork ? "delete-local-visit-note" : undefined}
                onClick={() => { if (window.confirm("Delete this visit from this device? It has not been sent to the server.")) void deleteLocalVisit(selectedJob); }}>Delete unsynced visit</button>
              {selectedHasDeviceWork ? <span className="support-metadata" id="delete-local-visit-note">Inspection work has started on this visit, so it is kept and will sync.</span> : null}
            </div>
            {localMessage ? <p role="alert" className="operational-message operational-message--warning">{localMessage}</p> : null}
          </div> : selectedJob.status === "open" ? <div className="inline-actions">
            <button type="button" className="secondary-command danger-command" disabled={!canDeleteSelectedJob} aria-describedby={canDeleteSelectedJob ? undefined : "delete-visit-unavailable-note"} onClick={() => {
              if (window.confirm(`Permanently delete service visit ${selectedJob.reference}? This cannot be undone.`)) void onDeleteJob(selectedJob);
            }}>Delete unfinished visit</button>
            {!canDeleteSelectedJob ? <span className="support-metadata" id="delete-visit-unavailable-note">Deletion is available online only before inspection work starts. Existing work must be preserved.</span> : null}
            {selectedHasDeviceWork ? <button type="button" className="secondary-command danger-command" disabled={!canArchiveSelectedJob} onClick={() => {
              if (window.confirm(`Delete this in-progress service visit? A manager can restore it if this was a mistake.`)) void onArchiveJob(selectedJob);
            }}>Delete this job</button> : null}
          </div> : null}
          {selectedJob.configurationSnapshot.enabledSystems.some(offersAddLocation) ? <div className="inline-actions">
            <button type="button" className="secondary-command" onClick={() => onOpenLocationProposal(selectedJob)}>Add a New Location</button>
          </div> : null}
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
            <details key={selectedJob.id}>
              <summary id="remaining-inspections-title">Remaining Inspections - {selectedJob.completion ? `${selectedJob.completion.acceptedUnitCount} of ${selectedJob.completion.requiredUnitCount} complete` : "Progress unavailable"}</summary>
              {selectedJob.completion ? (
                <ul className="record-list">
                  {selectedJob.completion.systems.flatMap((system) => system.units
                    .filter((unit) => unit.status === "incomplete")
                    .map((unit) => <li className="completion-requirement" key={`${system.systemKey}:${unit.authorityKey}`}>
                      <div><strong>{system.systemLabel}</strong> - <span>{unit.label}</span></div>
                      <small>{unit.reason === "EVIDENCE_PENDING" ? "Required evidence is pending"
                        : unit.reason === "EVIDENCE_INVALID" ? "Required evidence is invalid"
                        : unit.reason === "SYSTEM_NOT_SUPPORTED" ? "Configured system is not supported"
                        : unit.reason === "CONFIGURATION_INVALID" ? "Authoritative job configuration is invalid"
                        : "Inspection is not complete"}</small>
                    </li>))}
                </ul>
              ) : null}
            </details>
            {!selectedJob.completion ? <p>Reconnect and refresh to confirm completion readiness.</p> : null}
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
                    : system.systemKey === "fm200_fire_suppression"
                      ? onOpenFm200(selectedJob, system)
                    : system.systemKey === "automatic_sprinkler"
                      ? onOpenAutomaticSprinkler(selectedJob, system)
                    : system.systemKey === "dry_wet_riser" ? onOpenDryWetRiser(selectedJob, system)
                    : system.systemKey === "fire_alarm_detector" ? onOpenFireAlarm(selectedJob, system)
                    : system.systemKey === "hydrant" ? onOpenHydrant(selectedJob, system)
                    : system.systemKey === "portable_fire_extinguisher" ? onOpenPortableFireExtinguisher(selectedJob, system)
                    : system.systemKey === "smoke_ventilation" ? onOpenSmokeVentilation(selectedJob, system)
                    : system.systemKey === "fire_intercom" ? onOpenFireIntercom(selectedJob, system)
                    : system.systemKey === "fire_rated_roller_shutter" ? onOpenFireRatedRollerShutter(selectedJob, system)
                    : onSelectSystem(selectedJob, system)}
              >
                <span className="navigation-primary"><strong>{system.displayName}</strong><small>{inspectionActionLabel(progress)}</small></span>
                <span className={`status-badge status-badge--${inspectionStatusTone(progress)}`}>{inspectionStatusLabel(progress)}</span>
              </button>
            </li>;
          })}
        </ul>
      </section>
    ) : selectedJobId && (authState.status === "verified" || authState.status === "offline-unverified") ? (
      <MissingServiceVisit jobId={selectedJobId} userId={authState.user.id} online={browserOnline} ready={localVisitsLoaded}
        onBack={onBackToJobs} onRefresh={onRefresh} />
    ) : authState.status === "verified" || authState.status === "offline-unverified" ? (
      <section aria-label="Open visits">
        <div className="open-work-search">
          <label htmlFor="open-work-search">Search open work</label>
          <input id="open-work-search" type="search" value={search}
            placeholder="Customer, site / service or SV / RV number"
            onChange={event => setSearch(event.target.value)} />
          {query ? <p role="status">Showing {matchCount} of {currentJobs.length + openRepairs.length}</p> : null}
          {query && matchCount === 0 ? <div className="empty-state">
            <p>No visits match</p>
            <button type="button" className="secondary-command" onClick={() => setSearch("")}>Clear</button>
          </div> : null}
        </div>
        <OpenWorkSection key={`service:${actorId}`} userId={actorId} section="service" title="Service visits"
          count={currentJobs.length} matchCount={filteredJobs.length} query={query}>
          {filteredJobs.length ? <ul className="job-card-list">{filteredJobs.map(jobCard)}</ul>
            : !query ? <p className="empty-state">No open service visits. Start a new service visit to begin.</p> : null}
        </OpenWorkSection>
        <OpenWorkSection key={`repair:${actorId}`} userId={actorId} section="repair" title="Repair visits"
          count={openRepairs.length} matchCount={filteredRepairs.length} query={query}>
        {!repairs.loaded ? <p role="status">Loading repair visits…</p>
          : repairs.failed ? <p role="alert">The repair visits on this device could not be read. Open Repair List and reload.</p>
          : filteredRepairs.length ? <ul className="job-card-list">{filteredRepairs.map(visit => {
            const state = presentRepairVisit(visit);
            return <li key={visit.clientUuid}><a className="job-card" href={`#/repair-visits/${encodeURIComponent(visit.clientUuid)}`}>
              <span className="job-card-heading"><strong>Repair visit - {visitNumberText(visit)}</strong>
                <span className={`status-badge status-badge--${state.tone === "attention" ? "attention" : state.tone === "syncing" ? "syncing" : "draft"}`}>{state.label}</span></span>
              <span>{visit.visitDate}</span>
              {state.reason ? <span>{state.reason}</span> : null}
            </a></li>;
          })}</ul> : !query ? <p className="empty-state">No open repair visits saved on this device.</p> : null}
        <p className="support-metadata">Repair visits show the last known state on this device. Open Repair List to refresh, retry sync or start a visit.</p>
        <a className="secondary-command" href="#/repair-visits">Repair List</a>
        </OpenWorkSection>
      </section>
    ) : null}
  </section>;
}
