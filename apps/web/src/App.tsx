import { useEffect, useRef, useState } from "react";
import type { InspectionAttachmentRecord } from "./attachments/attachmentTypes";
import { AutomaticSprinklerInspectionForm } from "./automaticSprinkler/AutomaticSprinklerInspectionForm";
import {
  returnFailedAutomaticSprinklerToDraft,
  saveAutomaticSprinklerDraft,
  submitLocalAutomaticSprinkler
} from "./automaticSprinkler/automaticSprinklerRepository";
import {
  resolveAutomaticSprinklerOpenTarget,
  resolveAutomaticSprinklerRoute
} from "./automaticSprinkler/automaticSprinklerResolution";
import { ServerAutomaticSprinklerView } from "./automaticSprinkler/ServerAutomaticSprinklerView";
import type {
  ServerAutomaticSprinklerDetail
} from "./automaticSprinkler/serverAutomaticSprinklerApi";
import type {
  AutomaticSprinklerInspectionRecord,
  AutomaticSprinklerResponses
} from "./automaticSprinkler/automaticSprinklerTypes";
import { DryWetRiserInspectionForm } from "./dryWetRiser/DryWetRiserInspectionForm";
import { returnFailedDryWetRiserToDraft, saveDryWetRiserDraft, submitLocalDryWetRiser } from "./dryWetRiser/dryWetRiserRepository";
import type { DryWetRiserInspectionRecord, DryWetRiserResponses } from "./dryWetRiser/dryWetRiserTypes";
import { resolveDryWetRiserOpenTarget, resolveDryWetRiserRoute } from "./dryWetRiser/dryWetRiserResolution";
import { ServerDryWetRiserView } from "./dryWetRiser/ServerDryWetRiserView";
import type { ServerDryWetRiserDetail } from "./dryWetRiser/serverDryWetRiserApi";
import { FireAlarmInspectionForm } from "./fireAlarm/FireAlarmInspectionForm";
import { returnFailedFireAlarmToDraft, saveFireAlarmDraft, submitFireAlarmLocal } from "./fireAlarm/fireAlarmRepository";
import { resolveFireAlarmOpenTarget, resolveFireAlarmRoute } from "./fireAlarm/fireAlarmResolution";
import { FireAlarmAcceptedDetail } from "./fireAlarm/FireAlarmAcceptedDetail";
import type { FireAlarmInspectionRecord, FireAlarmResponses, ServerFireAlarmDetail } from "./fireAlarm/fireAlarmTypes";
import { HydrantInspectionForm } from "./hydrant/HydrantInspectionForm";
import { returnFailedHydrantToDraft, saveHydrantDraft, submitLocalHydrant } from "./hydrant/hydrantRepository";
import type { HydrantInspectionRecord, HydrantResponses } from "./hydrant/hydrantTypes";
import type { ServerHydrantDetail } from "./hydrant/serverHydrantApi";
import { ServerHydrantView } from "./hydrant/ServerHydrantView";
import { canRenderLocalHydrant, resolveHydrantOpenTarget, resolveHydrantRoute, type HydrantAuthorityResolution } from "./hydrant/hydrantResolution";
import { AuthStatus } from "./auth/AuthStatus";
import { AuthAuthorityGuard } from "./auth/authAuthority";
import { Co2InspectionForm } from "./co2/Co2InspectionForm";
import { Co2LocationList } from "./co2/Co2LocationList";
import {
  initializeCo2InspectionGroup,
  returnFailedCo2ToDraft,
  saveCo2Draft,
  submitLocalCo2
} from "./co2/co2Repository";
import type {
  Co2Responses,
  MasterSystemFormInstanceRecord,
  MasterSystemInspectionGroupRecord
} from "./co2/co2Types";
import { getCurrentUser, login, logout, type AuthUser } from "./auth/authApi";
import {
  clearLocalIdentity,
  getDeviceAuthState,
  identityFromDeviceState,
  storeVerifiedIdentity
} from "./auth/authStateRepository";
import {
  authStateUser,
  shouldRenderLogin,
  type ClientAuthState
} from "./auth/authStateTypes";
import { decideAuthRestoration } from "./auth/authRestoration";
import { LoginForm } from "./auth/LoginForm";
import { initializeLocalDatabase, localDatabase, type InspectionRecord } from "./db/localDatabase";
import { InspectionForm } from "./inspections/InspectionForm";
import { InspectionList } from "./inspections/InspectionList";
import {
  listInspectionRecords,
  saveInspectionDraft,
  submitLocalInspection
} from "./inspections/inspectionRepository";
import type { InspectionFormValues } from "./inspections/inspectionTypes";
import {
  loadServerInspections,
  type ServerInspectionSummary
} from "./inspections/serverInspectionApi";
import { ServerInspectionList } from "./inspections/ServerInspectionList";
import { TechnicianHome } from "./jobs/TechnicianHome";
import { HoseReelInspectionForm } from "./hoseReel/HoseReelInspectionForm";
import { editFailedHoseReel, getOrCreateHoseReelInspection, saveHoseReelDraft, submitLocalHoseReel } from "./hoseReel/hoseReelRepository";
import type { HoseReelResponses, MasterSystemInspectionRecord } from "./hoseReel/hoseReelTypes";
import { ServerMasterSystemInspectionList } from "./hoseReel/ServerMasterSystemInspectionList";
import { loadServerMasterSystemInspections, type ServerMasterSystemInspectionSummary } from "./hoseReel/serverMasterSystemInspectionApi";
import {
  ServerSummaryRefreshGuard,
  type ServerSummaryRefreshToken
} from "./jobs/serverSummaryRefreshGuard";
import type { InspectionJob, JobSystemSnapshot } from "./jobs/jobTypes";
import { TestRecordForm } from "./records/TestRecordForm";
import { TestRecordList } from "./records/TestRecordList";
import {
  loadServerTestRecords,
  type ServerTestRecord
} from "./records/serverTestRecordApi";
import { ServerTestRecordList } from "./records/ServerTestRecordList";
import {
  listTestRecords,
  saveDraft,
  submitLocal
} from "./records/testRecordRepository";
import type {
  TestRecordFormValues,
  TestRecordView
} from "./records/testRecordTypes";
import { ReferenceDataStatus } from "./referenceData/ReferenceDataStatus";
import {
  getCachedInspectionJobs,
  getCachedInspectionCatalog,
  getReferenceCacheSummary,
  refreshInspectionReferenceData
} from "./referenceData/referenceDataCache";
import {
  pruneCompletedOutboxItems,
  recoverInterruptedSync,
  syncPendingTestRecords
} from "./sync/syncEngine";

type ApiHealth = "Not checked" | "Reachable" | "Unavailable";
type AppRoute =
  | { name: "jobs" }
  | { name: "job"; jobId: string }
  | { name: "system"; jobId: string; systemKey: string }
  | { name: "inspection"; clientUuid: string }
  | { name: "sprinkler-form"; clientUuid: string }
  | { name: "riser-form"; clientUuid: string }
  | { name: "fire-alarm-form"; jobId: string; clientUuid: string }
  | { name: "hydrant-form"; clientUuid: string }
  | { name: "co2-form"; clientUuid: string }
  | { name: "development" };

function routeFromHash(): AppRoute {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "development") return { name: "development" };
  if (parts[0] === "inspection" && parts[1]) return { name: "inspection", clientUuid: parts[1] };
  if (parts[0] === "sprinkler-form" && parts[1]) return { name: "sprinkler-form", clientUuid: parts[1] };
  if (parts[0] === "riser-form" && parts[1]) return { name: "riser-form", clientUuid: parts[1] };
  if (parts[0] === "fire-alarm-form" && parts[1] && parts[2]) return { name: "fire-alarm-form", jobId: parts[1], clientUuid: parts[2] };
  if (parts[0] === "hydrant-form" && parts[1]) return { name: "hydrant-form", clientUuid: parts[1] };
  if (parts[0] === "co2-form" && parts[1]) return { name: "co2-form", clientUuid: parts[1] };
  if (parts[0] === "job" && parts[1] && parts[2]) return { name: "system", jobId: parts[1], systemKey: parts[2] };
  if (parts[0] === "job" && parts[1]) return { name: "job", jobId: parts[1] };
  return { name: "jobs" };
}

function hashForRoute(route: AppRoute) {
  if (route.name === "development") return "#/development";
  if (route.name === "inspection") return `#/inspection/${encodeURIComponent(route.clientUuid)}`;
  if (route.name === "sprinkler-form") return `#/sprinkler-form/${encodeURIComponent(route.clientUuid)}`;
  if (route.name === "riser-form") return `#/riser-form/${encodeURIComponent(route.clientUuid)}`;
  if (route.name === "fire-alarm-form") return `#/fire-alarm-form/${encodeURIComponent(route.jobId)}/${encodeURIComponent(route.clientUuid)}`;
  if (route.name === "hydrant-form") return `#/hydrant-form/${encodeURIComponent(route.clientUuid)}`;
  if (route.name === "co2-form") return `#/co2-form/${encodeURIComponent(route.clientUuid)}`;
  if (route.name === "system") return `#/job/${encodeURIComponent(route.jobId)}/${encodeURIComponent(route.systemKey)}`;
  if (route.name === "job") return `#/job/${encodeURIComponent(route.jobId)}`;
  return "#/jobs";
}

const emptyReferenceCache = {
  catalogAvailable: false,
  systemCount: 0,
  customerCount: 0,
  fetchedAt: undefined as string | undefined
};

export function App() {
  const [databaseReady, setDatabaseReady] = useState(false);
  const [apiHealth, setApiHealth] = useState<ApiHealth>("Not checked");
  const [authState, setAuthState] = useState<ClientAuthState>({ status: "restoring" });
  const [initialAuthRestored, setInitialAuthRestored] = useState(false);
  const [authAuthorityGeneration, setAuthAuthorityGeneration] = useState(0);
  const [route, setRoute] = useState<AppRoute>(routeFromHash);
  const [jobs, setJobs] = useState<InspectionJob[]>([]);
  const [jobMessage, setJobMessage] = useState("");
  const [jobLoading, setJobLoading] = useState(false);
  const [records, setRecords] = useState<TestRecordView[]>([]);
  const [syncMessage, setSyncMessage] = useState("");
  const [serverRecords, setServerRecords] = useState<ServerTestRecord[]>([]);
  const [serverRecordsMessage, setServerRecordsMessage] = useState("");
  const [serverRecordsLoading, setServerRecordsLoading] = useState(false);
  const [inspections, setInspections] = useState<Awaited<ReturnType<typeof listInspectionRecords>>>([]);
  const [masterSystemInspections, setMasterSystemInspections] = useState<Array<
    MasterSystemInspectionRecord | AutomaticSprinklerInspectionRecord | DryWetRiserInspectionRecord | FireAlarmInspectionRecord | HydrantInspectionRecord
  >>([]);
  const [activeHoseReel, setActiveHoseReel] = useState<MasterSystemInspectionRecord>();
  const [activeAutomaticSprinkler, setActiveAutomaticSprinkler] = useState<AutomaticSprinklerInspectionRecord>();
  const [activeDryWetRiser, setActiveDryWetRiser] = useState<DryWetRiserInspectionRecord>();
  const [activeFireAlarm, setActiveFireAlarm] = useState<FireAlarmInspectionRecord>();
  const [activeHydrant, setActiveHydrant] = useState<HydrantInspectionRecord>();
  const [serverHydrant, setServerHydrant] = useState<ServerHydrantDetail>();
  const [serverAcceptedHydrantUuid, setServerAcceptedHydrantUuid] = useState<string>();
  const [hydrantRouteState, setHydrantRouteState] = useState<"idle" | "loading" | "not-cached" | "server-unavailable">("idle");
  const [hydrantRouteMessage, setHydrantRouteMessage] = useState("");
  const [hydrantAuthorityResolution, setHydrantAuthorityResolution] = useState<HydrantAuthorityResolution>();
  const verifiedHydrantAuthorityToken = authState.status === "verified" ? authState.lastVerifiedAt : undefined;
  useEffect(() => {
    if (route.name !== "hydrant-form") { setActiveHydrant(undefined); setServerHydrant(undefined); setServerAcceptedHydrantUuid(undefined); setHydrantAuthorityResolution(undefined); setHydrantRouteState("idle"); setHydrantRouteMessage(""); return; }
    if (!initialAuthRestored || authState.status === "restoring" || authState.status === "verifying") { setActiveHydrant(undefined); setServerHydrant(undefined); setHydrantAuthorityResolution(undefined); setHydrantRouteState("loading"); setHydrantRouteMessage(authState.status === "verifying" ? "Verifying server session before resolving the Hydrant inspection." : ""); return; }
    if (authState.status === "online-unavailable") { setActiveHydrant(undefined); setServerHydrant(undefined); setHydrantAuthorityResolution(undefined); setHydrantRouteState("server-unavailable"); setHydrantRouteMessage(authState.message); return; }
    let current = true;
    setActiveHydrant(undefined); setServerHydrant(undefined); setHydrantAuthorityResolution(undefined); setHydrantRouteState("loading"); setHydrantRouteMessage("");
    void resolveHydrantRoute(route.clientUuid, serverAcceptedHydrantUuid, authState.status).then((resolution) => {
      if (!current) return;
      if (resolution.kind === "local") { setActiveHydrant(resolution.record); setServerHydrant(undefined); if (authState.status === "verified") setHydrantAuthorityResolution({ clientUuid: route.clientUuid, generation: authAuthorityGeneration, verifiedAt: authState.lastVerifiedAt }); setHydrantRouteState("idle"); }
      else if (resolution.kind === "server") { setActiveHydrant(undefined); setServerHydrant(resolution.inspection); setHydrantRouteState("idle"); }
      else { setActiveHydrant(undefined); setServerHydrant(undefined); setHydrantRouteState(resolution.kind); setHydrantRouteMessage("message" in resolution ? resolution.message : ""); }
    });
    return () => { current = false; };
  }, [authAuthorityGeneration, authState.status, initialAuthRestored, masterSystemInspections, route, serverAcceptedHydrantUuid, verifiedHydrantAuthorityToken]);
  const [serverFireAlarm, setServerFireAlarm] = useState<ServerFireAlarmDetail>();
  const [fireAlarmRouteState, setFireAlarmRouteState] = useState<"idle"|"loading"|"not-cached"|"signed-out"|"inconsistent"|"invalid"|"server-unavailable">("idle");
  const [fireAlarmRouteMessage, setFireAlarmRouteMessage] = useState("");
  const [serverDryWetRiser, setServerDryWetRiser] = useState<ServerDryWetRiserDetail>();
  const [riserRouteState, setRiserRouteState] = useState<"idle" | "loading" | "not-found" | "not-cached" | "signed-out" | "server-unavailable">("idle");
  const [riserRouteMessage, setRiserRouteMessage] = useState("");
  const [serverAutomaticSprinkler, setServerAutomaticSprinkler] =
    useState<ServerAutomaticSprinklerDetail>();
  const [sprinklerRouteState, setSprinklerRouteState] = useState<
    "idle" | "loading" | "not-found" | "not-cached" | "server-unavailable"
  >("idle");
  const [sprinklerRouteMessage, setSprinklerRouteMessage] = useState("");
  const [masterSystemInspectionGroups, setMasterSystemInspectionGroups] = useState<MasterSystemInspectionGroupRecord[]>([]);
  const [masterSystemFormInstances, setMasterSystemFormInstances] = useState<MasterSystemFormInstanceRecord[]>([]);
  const [inspectionAttachments, setInspectionAttachments] = useState<InspectionAttachmentRecord[]>([]);
  const [activeCo2Form, setActiveCo2Form] = useState<MasterSystemFormInstanceRecord>();
  const [serverMasterSystemInspections, setServerMasterSystemInspections] = useState<ServerMasterSystemInspectionSummary[]>([]);
  const [serverMasterSystemInspectionMessage, setServerMasterSystemInspectionMessage] = useState("");
  const [serverMasterSystemInspectionLoading, setServerMasterSystemInspectionLoading] = useState(false);
  const [serverMasterSystemProgressState, setServerMasterSystemProgressState] =
    useState<"idle" | "loading" | "loaded" | "failed">("idle");
  const [activeInspectionDraft, setActiveInspectionDraft] = useState<InspectionRecord>();
  const [inspectionSyncMessage, setInspectionSyncMessage] = useState("");
  const [serverInspections, setServerInspections] = useState<ServerInspectionSummary[]>([]);
  const [serverInspectionsMessage, setServerInspectionsMessage] = useState("");
  const [serverInspectionsLoading, setServerInspectionsLoading] = useState(false);
  const [referenceCache, setReferenceCache] = useState(emptyReferenceCache);
  const [referenceCacheMessage, setReferenceCacheMessage] = useState("");
  const [referenceCacheLoading, setReferenceCacheLoading] = useState(false);
  const authOperationGeneration = useRef(0);
  const authReconciliationGeneration = useRef(0);
  const activeExplicitAuthOperation = useRef<number | undefined>(undefined);
  const authRequestQueue = useRef<Promise<void>>(Promise.resolve());
  const authAuthorityGuard = useRef(new AuthAuthorityGuard());
  const serverSummaryRefreshGuard = useRef(new ServerSummaryRefreshGuard());
  const serverSummaryJobContext = useRef("");
  const sprinklerRouteGeneration = useRef(0);
  const riserRouteGeneration = useRef(0);
  const fireAlarmRouteGeneration = useRef(0);

  function navigate(nextRoute: AppRoute) {
    setRoute(nextRoute);
    const nextHash = hashForRoute(nextRoute);
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
  }

  function beginExplicitAuthOperation() {
    authOperationGeneration.current += 1;
    authReconciliationGeneration.current += 1;
    const operation = authOperationGeneration.current;
    activeExplicitAuthOperation.current = operation;
    return operation;
  }

  function finishExplicitAuthOperation(operation: number) {
    if (activeExplicitAuthOperation.current === operation) {
      activeExplicitAuthOperation.current = undefined;
    }
  }

  function isCurrentAuthOperation(operation: number) {
    return authOperationGeneration.current === operation;
  }

  function clearServerSummaryAuthority(progressState: "idle" | "failed" = "idle") {
    serverSummaryJobContext.current = "";
    serverSummaryRefreshGuard.current.invalidate();
    setServerMasterSystemInspections([]);
    setServerMasterSystemProgressState(progressState);
  }

  function invalidateServerDerivedAuthority(progressState: "idle" | "failed" = "failed") {
    clearServerSummaryAuthority(progressState);
    setJobLoading(false);
    setReferenceCacheLoading(false);
    setServerMasterSystemInspectionLoading(false);
    sprinklerRouteGeneration.current += 1;
    riserRouteGeneration.current += 1;
    fireAlarmRouteGeneration.current += 1;
    setServerAutomaticSprinkler(undefined);
    setServerDryWetRiser(undefined);
    setServerFireAlarm(undefined);
  }

  function prepareVerifiedAuthority(user: AuthUser, forceReplacement = false) {
    if (!forceReplacement && authAuthorityGuard.current.matches(user)) return false;
    invalidateServerDerivedAuthority();
    authAuthorityGuard.current.revoke();
    return true;
  }

  function installVerifiedAuthority(user: AuthUser, preparedReplacement: boolean) {
    if (preparedReplacement) authAuthorityGuard.current.install(user);
    setAuthAuthorityGeneration(authAuthorityGuard.current.currentGeneration);
  }

  function revokeVerifiedAuthority(progressState: "idle" | "failed" = "idle") {
    invalidateServerDerivedAuthority(progressState);
    authAuthorityGuard.current.revoke();
    setAuthAuthorityGeneration(authAuthorityGuard.current.currentGeneration);
  }

  function beginServerSummaryRefresh(cachedJobs: InspectionJob[]) {
    const jobContext = cachedJobs.map((job) => job.id).sort().join(",");
    serverSummaryJobContext.current = jobContext;
    const refresh = serverSummaryRefreshGuard.current.begin(
      authAuthorityGuard.current.currentGeneration,
      jobContext
    );
    // This runs before the caller's first await: previously accepted summaries
    // cannot remain authority while reference/job refresh is in flight.
    setServerMasterSystemInspections([]);
    setServerMasterSystemProgressState("loading");
    return refresh;
  }

  function isCurrentServerSummaryRefresh(
    refresh: ServerSummaryRefreshToken,
    operation: number
  ) {
    return isCurrentAuthOperation(operation)
      && authAuthorityGuard.current.isCurrent(refresh.authGeneration)
      && serverSummaryRefreshGuard.current.isCurrent(
        refresh,
        authAuthorityGuard.current.currentGeneration,
        serverSummaryJobContext.current
      );
  }

  function enqueueAuthRequest<T>(
    operation: number,
    request: () => Promise<T>
  ) {
    const queuedRequest = authRequestQueue.current.then(async () => {
      if (!isCurrentAuthOperation(operation)) return undefined;
      return request();
    });
    authRequestQueue.current = queuedRequest.then(
      () => undefined,
      () => undefined
    );
    return queuedRequest;
  }

  async function loadCachedJobs(
    userId: number,
    operation: number,
    refresh?: ServerSummaryRefreshToken,
    canContinue: () => boolean = () => true
  ) {
    const cachedJobs = await getCachedInspectionJobs(userId);
    if (!isCurrentAuthOperation(operation)
      || !canContinue()
      || (refresh && !isCurrentServerSummaryRefresh(refresh, operation))) {
      return undefined;
    }
    const jobContext = cachedJobs.map((job) => job.id).sort().join(",");
    let currentRefresh = refresh;
    if (refresh) {
      currentRefresh = serverSummaryRefreshGuard.current.continueWithJobContext(
        refresh,
        authAuthorityGuard.current.currentGeneration,
        serverSummaryJobContext.current,
        jobContext
      );
      if (!currentRefresh) return undefined;
      if (currentRefresh !== refresh) {
        serverSummaryJobContext.current = jobContext;
        setServerMasterSystemInspections([]);
        setServerMasterSystemProgressState("loading");
      }
    } else if (serverSummaryJobContext.current !== jobContext) {
      serverSummaryJobContext.current = jobContext;
      serverSummaryRefreshGuard.current.invalidate();
      setServerMasterSystemInspections([]);
      setServerMasterSystemProgressState("idle");
    }
    setJobs(cachedJobs);
    return { jobs: cachedJobs, refresh: currentRefresh };
  }

  async function refreshServerMasterSystemProgress(
    cachedJobs: InspectionJob[],
    operation: number,
    includeAllServerSummaries = false,
    existingRefresh?: ServerSummaryRefreshToken
  ) {
    if (!isCurrentAuthOperation(operation) || !authAuthorityGuard.current.hasAuthority) {
      clearServerSummaryAuthority("failed");
      return "stale" as const;
    }
    const refresh = existingRefresh ?? beginServerSummaryRefresh(cachedJobs);
    const isCurrentRefresh = () => isCurrentServerSummaryRefresh(refresh, operation);
    if (!isCurrentRefresh()) return "stale" as const;
    try {
      const summaries = await loadServerMasterSystemInspections(
        includeAllServerSummaries ? [] : cachedJobs.map((job) => job.id)
      );
      if (!isCurrentRefresh()) return "stale" as const;
      setServerMasterSystemInspections(summaries);
      setServerMasterSystemProgressState("loaded");
      return "loaded" as const;
    } catch {
      if (!isCurrentRefresh()) return "stale" as const;
      setServerMasterSystemInspections([]);
      setServerMasterSystemProgressState("failed");
      return "failed" as const;
    }
  }

  async function refreshServerWorkspace(user: AuthUser, operation: number) {
    if (!isCurrentAuthOperation(operation)) return;
    let refresh = beginServerSummaryRefresh(jobs);
    const isCurrentRefresh = () => isCurrentServerSummaryRefresh(refresh, operation);
    setJobLoading(true);
    setReferenceCacheLoading(true);
    setJobMessage("");
    setReferenceCacheMessage("");
    try {
      await refreshInspectionReferenceData(
        user.id,
        isCurrentRefresh
      );
      if (!isCurrentRefresh()) return;
      const loadedJobs = await loadCachedJobs(user.id, operation, refresh);
      if (!loadedJobs) return;
      refresh = loadedJobs.refresh ?? refresh;
      const cachedJobs = loadedJobs.jobs;
      if (!isCurrentRefresh()) return;
      const summary = await getReferenceCacheSummary();
      if (!isCurrentRefresh()) return;
      setReferenceCache(summary);
      setJobMessage(`${cachedJobs.length} technician jobs cached for offline use`);
      setReferenceCacheMessage("Reference data cached for offline use");
      await refreshServerMasterSystemProgress(cachedJobs, operation, false, refresh);
    } catch (error) {
      if (!isCurrentRefresh()) return;
      const message = error instanceof Error ? error.message : "Server data is currently unavailable";
      try {
        const loadedJobs = await loadCachedJobs(user.id, operation, refresh);
        if (!loadedJobs) return;
        refresh = loadedJobs.refresh ?? refresh;
      } catch {
        // The guarded failure below is the terminal fail-closed state.
      }
      if (!isCurrentRefresh()) return;
      setServerMasterSystemInspections([]);
      setServerMasterSystemProgressState("failed");
      setJobMessage(`${message}; existing cached jobs remain available`);
      setReferenceCacheMessage("Reference refresh failed; existing offline cache remains available");
    } finally {
      if (!isCurrentRefresh()) return;
      setJobLoading(false);
      setReferenceCacheLoading(false);
    }
  }

  async function resolvePendingServerLogout(operation: number) {
    const result = await enqueueAuthRequest(operation, logout);
    if (!isCurrentAuthOperation(operation) || result === undefined) return "stale" as const;
    if (result === "unavailable") return "unavailable" as const;

    await clearLocalIdentity();
    return isCurrentAuthOperation(operation) ? "resolved" as const : "stale" as const;
  }

  async function reconcileAuthentication() {
    if (activeExplicitAuthOperation.current !== undefined) return;
    const operation = authOperationGeneration.current;
    const reconciliation = ++authReconciliationGeneration.current;
    const isCurrentReconciliation = () => isCurrentAuthOperation(operation)
      && authReconciliationGeneration.current === reconciliation;
    const deviceState = await getDeviceAuthState();
    if (!isCurrentReconciliation()) return;

    if (deviceState?.serverLogoutPending) {
      setJobs([]);
      revokeVerifiedAuthority();
      setAuthState({
        status: "logged-out",
        message: "Signed out locally. Completing server logout when available."
      });
      const logoutResult = await resolvePendingServerLogout(operation);
      if (!isCurrentReconciliation()) return;
      setAuthState({
        status: "logged-out",
        message: logoutResult === "unavailable"
          ? "Signed out locally. Server logout will complete after reconnecting."
          : "Signed out. Sign in to prepare offline work."
      });
      return;
    }

    const cachedIdentity = identityFromDeviceState(deviceState);
    if (cachedIdentity && !authAuthorityGuard.current.hasAuthority) {
      await loadCachedJobs(cachedIdentity.user.id, operation, undefined, isCurrentReconciliation);
      if (!isCurrentReconciliation()) return;
      setAuthState(window.navigator.onLine
        ? {
          status: "verifying",
          user: cachedIdentity.user,
          lastVerifiedAt: cachedIdentity.lastVerifiedAt
        }
        : {
          status: "offline-unverified",
          user: cachedIdentity.user,
          lastVerifiedAt: cachedIdentity.lastVerifiedAt
        });
      setJobMessage("Using jobs previously cached for this user while verifying the session");
    }

    const probe = await getCurrentUser();
    if (!isCurrentReconciliation()) return;
    const decision = decideAuthRestoration(cachedIdentity, probe, window.navigator.onLine);
    if (decision.kind === "verified") {
      const authorityReplacement = prepareVerifiedAuthority(decision.user);
      const lastVerifiedAt = await storeVerifiedIdentity(decision.user);
      if (!isCurrentReconciliation()) return;
      installVerifiedAuthority(decision.user, authorityReplacement);
      setAuthState({ status: "verified", user: decision.user, lastVerifiedAt });
      await loadCachedJobs(decision.user.id, operation, undefined, isCurrentReconciliation);
      if (!isCurrentReconciliation()) return;
      await refreshServerWorkspace(decision.user, operation);
      return;
    }

    if (decision.kind === "logged-out") {
      revokeVerifiedAuthority();
      if (decision.clearIdentity) await clearLocalIdentity();
      if (!isCurrentReconciliation()) return;
      setJobs([]);
      setAuthState({
        status: "logged-out",
        message: decision.clearIdentity
          ? "Sign in required before server actions"
          : "Server unavailable. Sign in online once to prepare offline technician access."
      });
      return;
    }

    if (decision.kind === "online-unavailable") {
      revokeVerifiedAuthority();
      setAuthState({
        status: "online-unavailable",
        user: decision.identity?.user,
        lastVerifiedAt: decision.identity?.lastVerifiedAt,
        message: "Server session verification is unavailable while this device is online."
      });
      setJobMessage("Server session verification is unavailable; cached local inspection authority remains protected.");
      return;
    }

    if (decision.kind === "offline-unverified") {
      return;
    }
  }

  function beginServerVerification() {
    authReconciliationGeneration.current += 1;
    if (authAuthorityGuard.current.hasAuthority) revokeVerifiedAuthority();
    setAuthState((current) => {
      if (current.status === "verified" || current.status === "offline-unverified") {
        return { status: "verifying", user: current.user, lastVerifiedAt: current.lastVerifiedAt };
      }
      if (current.status === "online-unavailable") {
        return { status: "verifying", user: current.user, lastVerifiedAt: current.lastVerifiedAt };
      }
      return current;
    });
  }

  async function revalidateAuthentication() {
    if (!window.navigator.onLine) {
      await reconcileAuthentication();
      return;
    }
    beginServerVerification();
    await reconcileAuthentication();
  }

  useEffect(() => {
    void initializeLocalDatabase().then(async () => {
      const recovered = await recoverInterruptedSync();
      setDatabaseReady(true);
      void pruneCompletedOutboxItems().catch(() => undefined);
      setRecords(await listTestRecords());
      setInspections(await listInspectionRecords());
      setMasterSystemInspections(await localDatabase.masterSystemInspections.toArray());
      setMasterSystemInspectionGroups(await localDatabase.masterSystemInspectionGroups.toArray());
      setMasterSystemFormInstances(await localDatabase.masterSystemFormInstances.toArray());
      setInspectionAttachments(await localDatabase.inspectionAttachments.toArray());
      setReferenceCache(await getReferenceCacheSummary());
      if (recovered > 0) {
        setSyncMessage("Recovered interrupted sync; record is retryable");
      }
      await reconcileAuthentication();
      setInitialAuthRestored(true);
    });

    const handleOffline = () => {
      // A browser-confirmed offline transition removes the authority to resolve
      // server-backed inspection state. Keep the cached identity, but require a
      // fresh verification before permitting server authority again.
      authReconciliationGeneration.current += 1;
      if (authAuthorityGuard.current.hasAuthority) revokeVerifiedAuthority();
      setAuthState((current) => (current.status === "verified" || current.status === "verifying")
        && current.user && current.lastVerifiedAt
        ? {
          status: "offline-unverified",
          user: current.user,
          lastVerifiedAt: current.lastVerifiedAt
        }
        : current.status === "online-unavailable" && current.user && current.lastVerifiedAt
          ? {
            status: "offline-unverified",
            user: current.user,
            lastVerifiedAt: current.lastVerifiedAt
          }
        : current);
    };
    const handleOnline = () => void revalidateAuthentication();
    const handleHashChange = () => setRoute(routeFromHash());
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    if (route.name === "inspection") {
      const record = masterSystemInspections.find((candidate) => candidate.clientUuid === route.clientUuid);
      setActiveHoseReel(record?.systemKey === "hose_reel" ? record : undefined);
    } else {
      setActiveHoseReel(undefined);
    }
  }, [masterSystemInspections, route]);
  useEffect(() => {
    const generation = ++riserRouteGeneration.current;
    if (route.name !== "riser-form") { setActiveDryWetRiser(undefined); setServerDryWetRiser(undefined); setRiserRouteState("idle"); setRiserRouteMessage(""); return; }
    if (authState.status === "restoring" || authState.status === "verifying" || authState.status === "online-unavailable") { setRiserRouteState("loading"); return; }
    setRiserRouteState("loading"); setRiserRouteMessage("");
    void resolveDryWetRiserRoute(route.clientUuid, authState.status).then((resolution) => {
      if (riserRouteGeneration.current !== generation) return;
      if (resolution.kind === "local") { setActiveDryWetRiser(resolution.record); setServerDryWetRiser(undefined); setRiserRouteState("idle"); }
      else if (resolution.kind === "server") { setActiveDryWetRiser(undefined); setServerDryWetRiser(resolution.inspection); setRiserRouteState("idle"); }
      else { setActiveDryWetRiser(undefined); setServerDryWetRiser(undefined); setRiserRouteState(resolution.kind); setRiserRouteMessage("message" in resolution ? resolution.message : ""); }
    });
  }, [authAuthorityGeneration, authState.status, masterSystemInspections, route]);

  useEffect(() => {
    const generation = ++sprinklerRouteGeneration.current;
    if (route.name !== "sprinkler-form") {
      setActiveAutomaticSprinkler(undefined);
      setServerAutomaticSprinkler(undefined);
      setSprinklerRouteState("idle");
      setSprinklerRouteMessage("");
      return;
    }
    if (authState.status === "restoring" || authState.status === "verifying" || authState.status === "online-unavailable") {
      setSprinklerRouteState("loading");
      return;
    }
    setSprinklerRouteState("loading");
    setSprinklerRouteMessage("");
    void resolveAutomaticSprinklerRoute(route.clientUuid, authState.status).then((resolution) => {
      if (sprinklerRouteGeneration.current !== generation) return;
      if (resolution.kind === "local") {
        setActiveAutomaticSprinkler(resolution.record);
        setServerAutomaticSprinkler(undefined);
        setSprinklerRouteState("idle");
      } else if (resolution.kind === "server") {
        setActiveAutomaticSprinkler(undefined);
        setServerAutomaticSprinkler(resolution.inspection);
        setSprinklerRouteState("idle");
      } else {
        setActiveAutomaticSprinkler(undefined);
        setServerAutomaticSprinkler(undefined);
        setSprinklerRouteState(resolution.kind);
        setSprinklerRouteMessage(
          resolution.kind === "server-unavailable" ? resolution.message : ""
        );
      }
    });
  }, [authAuthorityGeneration, authState.status, masterSystemInspections, route]);

  useEffect(() => {
    setActiveCo2Form(route.name === "co2-form"
      ? masterSystemFormInstances.find((record) => record.clientUuid === route.clientUuid)
      : undefined);
  }, [masterSystemFormInstances, route]);

  useEffect(()=>{const generation=++fireAlarmRouteGeneration.current;if(route.name!=="fire-alarm-form"){setActiveFireAlarm(undefined);setServerFireAlarm(undefined);setFireAlarmRouteState("idle");setFireAlarmRouteMessage("");return;}if(authState.status==="restoring"||authState.status==="verifying"||authState.status==="online-unavailable"){setFireAlarmRouteState("loading");return;}setFireAlarmRouteState("loading");setFireAlarmRouteMessage("");void resolveFireAlarmRoute(route.clientUuid,route.jobId,authState.status).then(resolution=>{if(fireAlarmRouteGeneration.current!==generation)return;if(resolution.kind==="local"){setActiveFireAlarm(resolution.record);setServerFireAlarm(undefined);setFireAlarmRouteState("idle");}else if(resolution.kind==="server"){setActiveFireAlarm(undefined);setServerFireAlarm(resolution.inspection);setFireAlarmRouteState("idle");}else{setActiveFireAlarm(undefined);setServerFireAlarm(undefined);setFireAlarmRouteState(resolution.kind);setFireAlarmRouteMessage("message" in resolution?resolution.message:"");}});},[authAuthorityGeneration,authState.status,masterSystemInspections,route]);

  const currentUser = authStateUser(authState);
  const canUseServer = authState.status === "verified";
  const mayRenderLocalHydrant = canRenderLocalHydrant(
    activeHydrant,
    authState.status,
    route.name === "hydrant-form" ? route.clientUuid : undefined,
    hydrantAuthorityResolution,
    authAuthorityGeneration,
    authState.status === "verified" ? authState.lastVerifiedAt : undefined
  );

  async function refreshRecords() {
    setRecords(await listTestRecords());
  }

  async function refreshInspections() {
    setInspections(await listInspectionRecords());
  }

  async function refreshMasterSystemInspections() {
    const records = await localDatabase.masterSystemInspections.toArray();
    setMasterSystemInspections(records);
    if (activeHoseReel) {
      const record = records.find((candidate) => candidate.clientUuid === activeHoseReel.clientUuid);
      setActiveHoseReel(record?.systemKey === "hose_reel" ? record : undefined);
    }
    if (activeAutomaticSprinkler) {
      const record = records.find((candidate) => candidate.clientUuid === activeAutomaticSprinkler.clientUuid);
      setActiveAutomaticSprinkler(record?.systemKey === "automatic_sprinkler" ? record : undefined);
    }
    if (activeFireAlarm) {
      const record = records.find((candidate) => candidate.clientUuid === activeFireAlarm.clientUuid);
      setActiveFireAlarm(record?.systemKey === "fire_alarm_detector" ? record : undefined);
    }
  }

  async function refreshInspectionAttachments() {
    setInspectionAttachments(await localDatabase.inspectionAttachments.toArray());
  }

  async function refreshCo2Inspections() {
    const [groups, instances] = await Promise.all([
      localDatabase.masterSystemInspectionGroups.toArray(),
      localDatabase.masterSystemFormInstances.toArray()
    ]);
    setMasterSystemInspectionGroups(groups);
    setMasterSystemFormInstances(instances);
    if (activeCo2Form) setActiveCo2Form(instances.find((record) => record.clientUuid === activeCo2Form.clientUuid));
  }

  async function checkApiHealth() {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      setApiHealth(response.ok ? "Reachable" : "Unavailable");
    } catch {
      setApiHealth("Unavailable");
    }
  }

  async function handleSaveDraft(values: TestRecordFormValues) {
    await saveDraft(values);
    await refreshRecords();
  }

  async function handleSubmitLocal(values: TestRecordFormValues) {
    await submitLocal(values);
    await refreshRecords();
    setSyncMessage("Record is pending sync");
  }

  async function handleSync() {
    if (!canUseServer) {
      setSyncMessage("Reconnect to verify your session before syncing");
      return;
    }
    const result = await syncPendingTestRecords();
    setSyncMessage(result.message);
    await refreshRecords();
    await refreshMasterSystemInspections();
    await refreshCo2Inspections();
    await refreshInspectionAttachments();
  }

  async function handleLogin(username: string, password: string) {
    const operation = beginExplicitAuthOperation();
    try {
      const user = await enqueueAuthRequest(operation, async () => {
        const deviceState = await getDeviceAuthState();
        if (!isCurrentAuthOperation(operation)) return undefined;
        if (deviceState?.serverLogoutPending) {
          const logoutResult = await logout();
          if (!isCurrentAuthOperation(operation)) return undefined;
          if (logoutResult === "unavailable") {
            throw new Error("Reconnect to complete the previous server logout before signing in");
          }
          await clearLocalIdentity();
          if (!isCurrentAuthOperation(operation)) return undefined;
        }
        return login(username, password);
      });
      if (!isCurrentAuthOperation(operation) || !user) return;
      const authorityReplacement = prepareVerifiedAuthority(user, true);
      const lastVerifiedAt = await storeVerifiedIdentity(user);
      if (!isCurrentAuthOperation(operation)) return;
      installVerifiedAuthority(user, authorityReplacement);
      setAuthState({ status: "verified", user, lastVerifiedAt });
      await loadCachedJobs(user.id, operation);
      await refreshServerWorkspace(user, operation);
      navigate({ name: "jobs" });
    } finally {
      finishExplicitAuthOperation(operation);
    }
  }

  async function handleLogout() {
    const operation = beginExplicitAuthOperation();
    try {
      revokeVerifiedAuthority();
      setAuthState({ status: "logged-out", message: "Signed out locally" });
      navigate({ name: "jobs" });
      await clearLocalIdentity(true);
      if (!isCurrentAuthOperation(operation)) return;
      setJobs([]);
      setServerRecords([]);
      setServerRecordsMessage("");
      setServerInspections([]);
      setServerInspectionsMessage("");
      setServerMasterSystemInspections([]);
      setServerMasterSystemInspectionMessage("");
      setServerAutomaticSprinkler(undefined);
      const result = await resolvePendingServerLogout(operation);
      if (!isCurrentAuthOperation(operation)) return;
      if (result === "resolved") {
        setAuthState({ status: "logged-out", message: "Signed out. Local records remain on this device." });
      } else {
        setAuthState({
          status: "logged-out",
          message: "Signed out locally. Server logout will complete after reconnecting."
        });
      }
    } finally {
      finishExplicitAuthOperation(operation);
    }
  }

  async function handleSaveInspectionDraft(values: InspectionFormValues) {
    const record = await saveInspectionDraft(values, activeInspectionDraft);
    setActiveInspectionDraft(record);
    await refreshInspections();
  }

  async function handleSubmitLocalInspection(values: InspectionFormValues) {
    await submitLocalInspection(values, activeInspectionDraft);
    setActiveInspectionDraft(undefined);
    await refreshInspections();
    setInspectionSyncMessage("Inspection is pending sync");
  }

  async function handleInspectionSync() {
    if (!canUseServer) {
      setInspectionSyncMessage("Reconnect to verify your session before syncing");
      return;
    }
    const result = await syncPendingTestRecords();
    setInspectionSyncMessage(result.message);
    await refreshInspections();
    await refreshRecords();
    await refreshMasterSystemInspections();
    await refreshCo2Inspections();
    await refreshInspectionAttachments();
  }

  async function handleOpenHoseReel(job: InspectionJob, system: JobSystemSnapshot) {
    try {
      const catalog = await getCachedInspectionCatalog();
      if (!catalog) throw new Error("Hose Reel reference data is not cached yet. Refresh jobs online first.");
      const record = await getOrCreateHoseReelInspection(job, system, catalog, currentUser);
      setActiveHoseReel(record);
      await refreshMasterSystemInspections();
      navigate({ name: "inspection", clientUuid: record.clientUuid });
    } catch (error) {
      setJobMessage(error instanceof Error ? error.message : "Hose Reel inspection could not be opened");
    }
  }

  async function handleOpenCo2(job: InspectionJob, system: JobSystemSnapshot) {
    try {
      const catalog = await getCachedInspectionCatalog();
      if (!catalog) throw new Error("CO2 reference data is not cached yet. Refresh jobs online first.");
      await initializeCo2InspectionGroup(job, system, catalog, currentUser);
      await refreshCo2Inspections();
      navigate({ name: "system", jobId: job.id, systemKey: system.systemKey });
    } catch (error) {
      setJobMessage(error instanceof Error ? error.message : "CO2 locations could not be opened");
    }
  }

  async function handleOpenAutomaticSprinkler(job: InspectionJob, system: JobSystemSnapshot) {
    try {
      const catalog = await getCachedInspectionCatalog();
      if (!catalog) throw new Error("Automatic Sprinkler reference data is not cached yet. Refresh jobs online first.");
      const target = await resolveAutomaticSprinklerOpenTarget(
        job,
        system,
        catalog,
        currentUser,
        canUseServer
      );
      if (target.kind === "server") {
        navigate({ name: "sprinkler-form", clientUuid: target.clientUuid });
        return;
      }
      setActiveAutomaticSprinkler(target.record);
      await refreshMasterSystemInspections();
      navigate({ name: "sprinkler-form", clientUuid: target.record.clientUuid });
    } catch (error) {
      setJobMessage(error instanceof Error ? error.message : "Automatic Sprinkler inspection could not be opened");
    }
  }
  async function handleOpenDryWetRiser(job: InspectionJob, system: JobSystemSnapshot) { try { const target = await resolveDryWetRiserOpenTarget(job, system, await getCachedInspectionCatalog(), currentUser, authState.status === "verified" ? "verified" : "offline-unverified"); if (target.kind === "server") { navigate({ name: "riser-form", clientUuid: target.clientUuid }); return; } if (target.kind === "not-cached") { setJobMessage("This Dry/Wet Riser inspection is not cached on this device."); return; } if (target.kind === "server-unavailable") { setJobMessage(target.message); return; } setActiveDryWetRiser(target.record); await refreshMasterSystemInspections(); navigate({ name: "riser-form", clientUuid: target.record.clientUuid }); } catch (error) { setJobMessage(error instanceof Error ? error.message : "Dry/Wet Riser could not be opened"); } }
  async function handleOpenFireAlarm(job: InspectionJob, system: JobSystemSnapshot) { try { const target = await resolveFireAlarmOpenTarget(job, system, await getCachedInspectionCatalog(), currentUser, authState.status === "verified" ? "verified" : "offline-unverified"); if (target.kind === "not-cached") { setJobMessage("This accepted Fire Alarm inspection is not cached. Reconnect to load server detail."); return; } if (target.kind === "server-unavailable") { setJobMessage(target.message); return; } if (target.kind === "local") { setActiveFireAlarm(target.record); await refreshMasterSystemInspections(); } navigate({ name: "fire-alarm-form", jobId: job.id, clientUuid: target.kind === "local" ? target.record.clientUuid : target.clientUuid }); } catch (error) { setJobMessage(error instanceof Error ? error.message : "Fire Alarm inspection could not be opened"); } }
  async function handleOpenHydrant(job:InspectionJob,system:JobSystemSnapshot){try{const target=await resolveHydrantOpenTarget(job,system,currentUser,authState.status==="verified"?"verified":"offline-unverified",getCachedInspectionCatalog);if(target.kind==="server"){setServerAcceptedHydrantUuid(target.clientUuid);navigate({name:"hydrant-form",clientUuid:target.clientUuid});return;}if(target.kind==="not-cached"){setJobMessage("This Hydrant inspection is not cached on this device. Reconnect to check accepted server detail before creating a Draft.");return;}if(target.kind==="server-unavailable"){setJobMessage(target.message);return;}setServerAcceptedHydrantUuid(undefined);setActiveHydrant(target.record);await refreshMasterSystemInspections();navigate({name:"hydrant-form",clientUuid:target.record.clientUuid});}catch(error){setJobMessage(error instanceof Error?error.message:"Hydrant inspection could not be opened");}}
  async function handleSaveHydrant(responses:HydrantResponses){if(activeHydrant){setActiveHydrant(await saveHydrantDraft(activeHydrant,responses));await refreshMasterSystemInspections();}}
  async function handleSubmitHydrant(responses:HydrantResponses){if(activeHydrant){setActiveHydrant(await submitLocalHydrant(activeHydrant,responses));await refreshMasterSystemInspections();}}
  async function handleEditFailedHydrant(){if(activeHydrant){setActiveHydrant(await returnFailedHydrantToDraft(activeHydrant));await refreshMasterSystemInspections();}}
  async function handleSaveFireAlarm(responses: FireAlarmResponses) { if (!activeFireAlarm) return; try { setActiveFireAlarm(await saveFireAlarmDraft(activeFireAlarm, responses)); await refreshMasterSystemInspections(); } catch (error) { if (error instanceof Error && error.message.includes("changed elsewhere")) await refreshMasterSystemInspections(); throw error; } }
  async function handleSubmitFireAlarm(responses: FireAlarmResponses) { if (!activeFireAlarm) return; try { setActiveFireAlarm(await submitFireAlarmLocal(activeFireAlarm, responses)); await refreshMasterSystemInspections(); } catch (error) { if (error instanceof Error && error.message.includes("changed elsewhere")) await refreshMasterSystemInspections(); throw error; } }
  async function handleEditFailedFireAlarm() { if (!activeFireAlarm) return; try { setActiveFireAlarm(await returnFailedFireAlarmToDraft(activeFireAlarm)); await refreshMasterSystemInspections(); } catch (error) { if (error instanceof Error && error.message.includes("changed elsewhere")) await refreshMasterSystemInspections(); throw error; } }
  async function handleSaveDryWetRiser(responses: DryWetRiserResponses) { if (!activeDryWetRiser) return; setActiveDryWetRiser(await saveDryWetRiserDraft(activeDryWetRiser, responses)); await refreshMasterSystemInspections(); }
  async function handleSubmitDryWetRiser(responses: DryWetRiserResponses) { if (!activeDryWetRiser) return; setActiveDryWetRiser(await submitLocalDryWetRiser(activeDryWetRiser, responses)); await refreshMasterSystemInspections(); }
  async function handleEditFailedDryWetRiser() { if (!activeDryWetRiser) return; setActiveDryWetRiser(await returnFailedDryWetRiserToDraft(activeDryWetRiser)); await refreshMasterSystemInspections(); }

  async function handleSaveCo2Draft(responses: Co2Responses) {
    if (!activeCo2Form) return;
    setActiveCo2Form(await saveCo2Draft(activeCo2Form, responses));
    await refreshCo2Inspections();
  }

  async function handleSubmitCo2(responses: Co2Responses) {
    if (!activeCo2Form) return;
    setActiveCo2Form(await submitLocalCo2(activeCo2Form, responses));
    await refreshCo2Inspections();
  }

  async function handleEditFailedCo2() {
    if (!activeCo2Form) return;
    setActiveCo2Form(await returnFailedCo2ToDraft(activeCo2Form));
    await refreshCo2Inspections();
  }

  async function handleSaveHoseReelDraft(responses: HoseReelResponses) {
    if (!activeHoseReel) return;
    const record = await saveHoseReelDraft(activeHoseReel, responses);
    setActiveHoseReel(record);
    await refreshMasterSystemInspections();
  }

  async function handleSubmitHoseReel(responses: HoseReelResponses) {
    if (!activeHoseReel) return;
    const record = await submitLocalHoseReel(activeHoseReel, responses);
    setActiveHoseReel(record);
    await refreshMasterSystemInspections();
  }

  async function handleEditFailedHoseReel() {
    if (!activeHoseReel) return;
    const record = await editFailedHoseReel(activeHoseReel);
    setActiveHoseReel(record);
    await refreshMasterSystemInspections();
  }

  async function handleSaveAutomaticSprinklerDraft(responses: AutomaticSprinklerResponses) {
    if (!activeAutomaticSprinkler) return;
    try {
      const record = await saveAutomaticSprinklerDraft(activeAutomaticSprinkler, responses);
      setActiveAutomaticSprinkler(record);
      await refreshMasterSystemInspections();
    } catch (error) {
      if (error instanceof Error && error.message.includes("changed elsewhere")) {
        await refreshMasterSystemInspections();
      }
      throw error;
    }
  }

  async function handleSubmitAutomaticSprinkler(responses: AutomaticSprinklerResponses) {
    if (!activeAutomaticSprinkler) return;
    try {
      const record = await submitLocalAutomaticSprinkler(activeAutomaticSprinkler, responses);
      setActiveAutomaticSprinkler(record);
      await refreshMasterSystemInspections();
    } catch (error) {
      if (error instanceof Error && error.message.includes("changed elsewhere")) {
        await refreshMasterSystemInspections();
      }
      throw error;
    }
  }

  async function handleEditFailedAutomaticSprinkler() {
    if (!activeAutomaticSprinkler) return;
    try {
      const record = await returnFailedAutomaticSprinklerToDraft(activeAutomaticSprinkler);
      setActiveAutomaticSprinkler(record);
      await refreshMasterSystemInspections();
    } catch (error) {
      if (error instanceof Error && error.message.includes("changed elsewhere")) {
        await refreshMasterSystemInspections();
      }
      throw error;
    }
  }

  async function handleLoadServerInspections() {
    if (!canUseServer) return;
    setServerInspectionsLoading(true);
    setServerInspectionsMessage("");
    try {
      setServerInspections(await loadServerInspections());
    } catch (error) {
      setServerInspectionsMessage(error instanceof Error ? error.message : "Server inspections are currently unavailable");
    } finally {
      setServerInspectionsLoading(false);
    }
  }

  async function handleLoadServerRecords() {
    if (!canUseServer) return;
    setServerRecordsLoading(true);
    setServerRecordsMessage("");
    try {
      setServerRecords(await loadServerTestRecords());
    } catch (error) {
      setServerRecordsMessage(error instanceof Error ? error.message : "Server records are currently unavailable");
    } finally {
      setServerRecordsLoading(false);
    }
  }

  async function handleLoadServerMasterSystemInspections() {
    if (!canUseServer) return;
    setServerMasterSystemInspectionLoading(true);
    setServerMasterSystemInspectionMessage("");
    const result = await refreshServerMasterSystemProgress(
      jobs,
      authOperationGeneration.current,
      true
    );
    if (result !== "stale") {
      if (result === "failed") {
        setServerMasterSystemInspectionMessage("Server Master system inspections are currently unavailable");
      }
      setServerMasterSystemInspectionLoading(false);
    }
  }

  const selectedJobId = route.name === "job" || route.name === "system"
    ? route.jobId
    : undefined;
  const selectedSystemKey = route.name === "system" ? route.systemKey : undefined;
  const authenticated = authState.status === "verified" || authState.status === "offline-unverified";

  return (
    <main className="app-shell">
      <header className="app-header" aria-labelledby="app-title">
        <div>
          <p className="eyebrow">Field Inspection</p>
          <h1 id="app-title">Inspection PWA</h1>
        </div>
        <dl>
          <div><dt>Local database</dt><dd>{databaseReady ? "Ready" : "Starting"}</dd></div>
          <div><dt>API health</dt><dd>{apiHealth}</dd></div>
        </dl>
        <button type="button" className="secondary-command" onClick={checkApiHealth}>Check API</button>
      </header>

      {authState.status === "restoring" || authState.status === "verifying" || authState.status === "online-unavailable" ? (
        <section className="login-view workspace">
          <AuthStatus state={authState} onLogout={handleLogout} onRevalidate={revalidateAuthentication} />
        </section>
      ) : shouldRenderLogin(authState) ? (
        <section className="login-view workspace" aria-label="Server sign-in">
          <AuthStatus state={authState} onLogout={handleLogout} onRevalidate={revalidateAuthentication} />
          <LoginForm onLogin={handleLogin} />
        </section>
      ) : null}

      {authenticated ? (
        <>
          <nav className="app-navigation" aria-label="Application views">
            <button
              type="button"
              className={route.name !== "development" ? "active-navigation" : "secondary-command"}
              onClick={() => navigate({ name: "jobs" })}
            >
              Jobs
            </button>
            <button
              type="button"
              className={route.name === "development" ? "active-navigation" : "secondary-command"}
              onClick={() => navigate({ name: "development" })}
            >
              Development Tools
            </button>
          </nav>

          <section className="session-strip workspace">
            <AuthStatus state={authState} onLogout={handleLogout} onRevalidate={revalidateAuthentication} />
          </section>

          {route.name === "development" ? (
            <section className="development-tools" aria-labelledby="development-tools-title">
              <header className="development-header">
                <p className="eyebrow">For Development / Testing Only</p>
                <h2 id="development-tools-title">Development / Regression Tools</h2>
                <p>Legacy fixtures and server verification controls are isolated from technician field work.</p>
              </header>
              <div className="development-tools-content">
                <section className="workspace" aria-label="Generic test record workspace">
                  <TestRecordForm onSaveDraft={handleSaveDraft} onSubmitLocal={handleSubmitLocal} />
                  <div className="sync-panel">
                    <button type="button" disabled={!canUseServer} onClick={handleSync}>Sync Pending</button>
                    {syncMessage ? <p>{syncMessage}</p> : null}
                  </div>
                  <TestRecordList records={records} />
                </section>
                <section className="workspace" aria-label="Inspection reference data">
                  <ReferenceDataStatus
                    {...referenceCache}
                    canRefresh={canUseServer}
                    loading={referenceCacheLoading}
                    message={referenceCacheMessage}
                    onRefresh={async () => {
                      if (currentUser && canUseServer) {
                        await refreshServerWorkspace(currentUser, authOperationGeneration.current);
                      }
                    }}
                  />
                </section>
                <section className="workspace" aria-label="Read-only server records">
                  <ServerTestRecordList
                    records={serverRecords}
                    isLoading={serverRecordsLoading}
                    message={serverRecordsMessage}
                    canLoad={canUseServer}
                    onLoad={handleLoadServerRecords}
                  />
                </section>
                <section className="workspace" aria-label="Inspection workspace">
                  <InspectionForm
                    draft={activeInspectionDraft}
                    onSaveDraft={handleSaveInspectionDraft}
                    onSubmitLocal={handleSubmitLocalInspection}
                  />
                  <div className="sync-panel">
                    <button type="button" disabled={!canUseServer} onClick={handleInspectionSync}>Sync Pending</button>
                    {inspectionSyncMessage ? <p>{inspectionSyncMessage}</p> : null}
                  </div>
                  <InspectionList records={inspections} onResumeDraft={setActiveInspectionDraft} />
                </section>
                <section className="workspace" aria-label="Read-only server inspections">
                  <ServerInspectionList
                    inspections={serverInspections}
                    loading={serverInspectionsLoading}
                    message={serverInspectionsMessage}
                    canLoad={canUseServer}
                    onLoad={handleLoadServerInspections}
                  />
                </section>
                <section className="workspace" aria-label="Read-only server Master system inspections">
                  <ServerMasterSystemInspectionList
                    inspections={serverMasterSystemInspections}
                    canLoad={canUseServer}
                    loading={serverMasterSystemInspectionLoading}
                    message={serverMasterSystemInspectionMessage}
                    onLoad={handleLoadServerMasterSystemInspections}
                  />
                </section>
              </div>
            </section>
          ) : route.name === "inspection" ? (
            activeHoseReel ? (
              <HoseReelInspectionForm
                record={activeHoseReel}
                onSaveDraft={handleSaveHoseReelDraft}
                onSubmitLocal={handleSubmitHoseReel}
                onEditFailed={handleEditFailedHoseReel}
                onClose={() => navigate({ name: "job", jobId: activeHoseReel.jobId })}
              />
            ) : (
              <section className="workspace">
                <h2>Inspection unavailable</h2>
                <p>{databaseReady ? "This inspection is not available in local device storage." : "Loading the local inspection."}</p>
                <button type="button" className="secondary-command" onClick={() => navigate({ name: "jobs" })}>Back to Jobs</button>
              </section>
            )
          ) : route.name === "sprinkler-form" ? (
            activeAutomaticSprinkler ? (
              <AutomaticSprinklerInspectionForm
                record={activeAutomaticSprinkler}
                onBack={() => navigate({ name: "job", jobId: activeAutomaticSprinkler.jobId })}
                onSaveDraft={handleSaveAutomaticSprinklerDraft}
                onSubmitLocal={handleSubmitAutomaticSprinkler}
                onEditFailed={handleEditFailedAutomaticSprinkler}
                onAttachmentsChange={refreshInspectionAttachments}
              />
            ) : serverAutomaticSprinkler ? (
              <ServerAutomaticSprinklerView
                inspection={serverAutomaticSprinkler}
                onBack={() => navigate({
                  name: "job",
                  jobId: serverAutomaticSprinkler.jobId
                })}
              />
            ) : (
              <section className="workspace">
                <h2>Automatic Sprinkler inspection unavailable</h2>
                <p>{
                  sprinklerRouteState === "loading"
                    ? "Loading the inspection."
                    : sprinklerRouteState === "not-cached"
                      ? "This inspection is not cached on this device. Reconnect to view the accepted server inspection."
                      : sprinklerRouteState === "not-found"
                        ? "No local or accepted server inspection exists for this UUID."
                        : sprinklerRouteMessage || "The server inspection is currently unavailable."
                }</p>
                <button type="button" className="secondary-command" onClick={() => navigate({ name: "jobs" })}>Back to Jobs</button>
              </section>
            )
          ) : route.name === "riser-form" ? (
            activeDryWetRiser ? <DryWetRiserInspectionForm record={activeDryWetRiser} onBack={() => navigate({ name: "job", jobId: activeDryWetRiser.jobId })} onSaveDraft={handleSaveDryWetRiser} onSubmitLocal={handleSubmitDryWetRiser} onEditFailed={handleEditFailedDryWetRiser} /> : serverDryWetRiser ? <ServerDryWetRiserView inspection={serverDryWetRiser} onBack={() => navigate({ name: "job", jobId: serverDryWetRiser.jobId })} /> : <section className="workspace"><h2>Dry/Wet Riser inspection unavailable</h2><p>{riserRouteState === "loading" ? "Loading the inspection." : riserRouteState === "not-cached" ? "This inspection is not cached on this device." : riserRouteState === "signed-out" ? "Sign in to view this inspection." : riserRouteState === "not-found" ? "No local or accepted server inspection exists for this UUID." : riserRouteMessage || "The server inspection is currently unavailable."}</p><button type="button" className="secondary-command" onClick={() => navigate({ name: "jobs" })}>Back to Jobs</button></section>
          ) : route.name === "fire-alarm-form" ? (
            activeFireAlarm ? <FireAlarmInspectionForm record={activeFireAlarm} onBack={() => navigate({ name: "job", jobId: activeFireAlarm.jobId })} onSaveDraft={handleSaveFireAlarm} onSubmitLocal={handleSubmitFireAlarm} onEditFailed={handleEditFailedFireAlarm} onRecordChange={(saved) => { setActiveFireAlarm(saved); void refreshMasterSystemInspections(); }} /> : serverFireAlarm ? <FireAlarmAcceptedDetail inspection={serverFireAlarm} onBack={()=>navigate({name:"job",jobId:serverFireAlarm.jobId})}/> : <section className="workspace"><h2>Fire Alarm inspection unavailable</h2><p>{fireAlarmRouteState==="loading"?"Loading authoritative accepted detail.":fireAlarmRouteState==="not-cached"?"Accepted detail is not cached on this device. Reconnect to view it.":fireAlarmRouteState==="signed-out"?"Sign in to view this accepted inspection.":fireAlarmRouteState==="inconsistent"?fireAlarmRouteMessage||"The accepted inspection is inconsistent with local state.":fireAlarmRouteState==="invalid"?fireAlarmRouteMessage||"The accepted detail is invalid and cannot be displayed.":fireAlarmRouteMessage||"The server detail is currently unavailable."}</p><button type="button" className="secondary-command" onClick={() => navigate({ name: "jobs" })}>Back to Jobs</button></section>
          ) : route.name === "co2-form" ? (
            activeCo2Form ? (
              <Co2InspectionForm
                record={activeCo2Form}
                onBack={() => navigate({ name: "system", jobId: activeCo2Form.jobId, systemKey: activeCo2Form.systemKey })}
                onSaveDraft={handleSaveCo2Draft}
                onSubmitLocal={handleSubmitCo2}
                onEditFailed={handleEditFailedCo2}
              />
            ) : (
              <section className="workspace"><h2>CO2 form unavailable</h2><p>This form is not available in local device storage.</p><button type="button" className="secondary-command" onClick={() => navigate({ name: "jobs" })}>Back to Jobs</button></section>
            )
          ) : route.name === "hydrant-form" ? (
            mayRenderLocalHydrant ? <HydrantInspectionForm record={activeHydrant!} onBack={()=>navigate({name:"job",jobId:activeHydrant!.jobId})} onSaveDraft={handleSaveHydrant} onSubmitLocal={handleSubmitHydrant} onEditFailed={handleEditFailedHydrant} /> : serverHydrant ? <ServerHydrantView inspection={serverHydrant} onBack={()=>navigate({name:"job",jobId:serverHydrant.jobId})} /> : <section className="workspace"><h2>Hydrant inspection unavailable</h2><p>{hydrantRouteState==="loading"||authState.status==="verified"&&!hydrantAuthorityResolution&&hydrantRouteState==="idle"?"Loading authoritative accepted Hydrant detail.":hydrantRouteState==="not-cached"?"This inspection is not cached on this device. Reconnect to view accepted server detail.":hydrantRouteMessage||"Accepted Hydrant detail is not available from the server."}</p><button type="button" className="secondary-command" onClick={()=>navigate({name:"jobs"})}>Back to Jobs</button></section>
          ) : route.name === "system" && route.systemKey === "co2_fire_extinguisher" ? (
            (() => {
              const group = masterSystemInspectionGroups.find((candidate) => candidate.groupKey === `${route.jobId}:co2_fire_extinguisher`);
              return group ? (
                <Co2LocationList
                  group={group}
                  instances={masterSystemFormInstances.filter((instance) => instance.groupKey === group.groupKey)}
                  onBack={() => navigate({ name: "job", jobId: route.jobId })}
                  onOpen={(record) => navigate({ name: "co2-form", clientUuid: record.clientUuid })}
                />
              ) : (
                <section className="workspace"><h2>CO2 locations unavailable</h2><p>Open this system from the cached job to initialize its configured locations.</p><button type="button" className="secondary-command" onClick={() => navigate({ name: "job", jobId: route.jobId })}>Back to Systems</button></section>
              );
            })()
          ) : (
            <TechnicianHome
              authState={authState}
              jobs={jobs}
              inspections={inspections}
              masterSystemInspections={masterSystemInspections}
              masterSystemInspectionGroups={masterSystemInspectionGroups}
              masterSystemFormInstances={masterSystemFormInstances}
              inspectionAttachments={inspectionAttachments}
              serverMasterSystemInspections={serverMasterSystemInspections}
              serverMasterSystemProgressState={serverMasterSystemProgressState}
              loading={jobLoading}
              message={jobMessage}
              selectedJobId={selectedJobId}
              selectedSystemKey={selectedSystemKey}
              syncMessage={syncMessage}
              onRefresh={async () => {
                if (currentUser && canUseServer) {
                  await refreshServerWorkspace(currentUser, authOperationGeneration.current);
                }
              }}
              onSync={handleSync}
              onSelectJob={(job) => navigate({ name: "job", jobId: job.id })}
              onSelectSystem={(job, system) => navigate({
                name: "system",
                jobId: job.id,
                systemKey: system.systemKey
              })}
              onBackToJobs={() => navigate({ name: "jobs" })}
              onBackToSystems={(job) => navigate({ name: "job", jobId: job.id })}
              onOpenHoseReel={handleOpenHoseReel}
              onOpenCo2={handleOpenCo2}
              onOpenAutomaticSprinkler={handleOpenAutomaticSprinkler}
              onOpenDryWetRiser={handleOpenDryWetRiser}
              onOpenFireAlarm={handleOpenFireAlarm}
              onOpenHydrant={handleOpenHydrant}
            />
          )}
        </>
      ) : null}
    </main>
  );
}
