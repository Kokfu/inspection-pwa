import { beginWorkspaceActivity, waitForWorkspaceIdle } from "./db/workspaceActivity";
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
import { SmokeVentilationInspectionForm } from "./smokeVentilation/SmokeVentilationInspectionForm";
import { returnFailedSmokeVentilationToDraft, saveSmokeVentilationDraft, submitLocalSmokeVentilation } from "./smokeVentilation/smokeVentilationRepository";
import type { SmokeVentilationInspectionRecord, SmokeVentilationResponses } from "./smokeVentilation/smokeVentilationTypes";
import type { ServerSmokeVentilationDetail } from "./smokeVentilation/serverSmokeVentilationApi";
import { ServerSmokeVentilationView } from "./smokeVentilation/ServerSmokeVentilationView";
import { canRenderLocalSmokeVentilation, resolveSmokeVentilationOpenTarget, resolveSmokeVentilationRoute, type SmokeVentilationAuthorityResolution } from "./smokeVentilation/smokeVentilationResolution";
import { FireIntercomInspectionForm } from "./fireIntercom/FireIntercomInspectionForm";
import { returnFailedFireIntercomToDraft, saveFireIntercomDraft, submitLocalFireIntercom } from "./fireIntercom/fireIntercomRepository";
import type { FireIntercomInspectionRecord, FireIntercomResponses } from "./fireIntercom/fireIntercomTypes";
import type { ServerFireIntercomDetail } from "./fireIntercom/serverFireIntercomApi";
import { ServerFireIntercomView } from "./fireIntercom/ServerFireIntercomView";
import { canRenderLocalFireIntercom, resolveFireIntercomOpenTarget, resolveFireIntercomRoute, type FireIntercomAuthorityResolution } from "./fireIntercom/fireIntercomResolution";
import { PortableFireExtinguisherForm } from "./portableFireExtinguisher/PortableFireExtinguisherForm";
import { ServerPortableFireExtinguisherView } from "./portableFireExtinguisher/ServerPortableFireExtinguisherView";
import { resolvePortableOpenTarget, resolvePortableRoute, returnFailedPortableToDraft, savePortableDraft, submitLocalPortable, type PortableRecord, type PortableResponses, type ServerPortableDetail } from "./portableFireExtinguisher/portableFireExtinguisher";
import { AuthStatus } from "./auth/AuthStatus";
import { AuthAuthorityGuard } from "./auth/authAuthority";
import { Co2InspectionForm } from "./co2/Co2InspectionForm";
import { Co2LocationList } from "./co2/Co2LocationList";
import { resolveCo2Authority } from "./co2/co2Authority";
import { loadServerCo2Detail, type ServerCo2Detail } from "./co2/serverCo2Api";
import { ServerCo2View } from "./co2/ServerCo2View";
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
import { ServerWetChemicalView } from "./wetChemical/ServerWetChemicalView";
import { loadServerWetChemicalDetail, type ServerWetChemicalDetail } from "./wetChemical/serverWetChemicalApi";
import { resolveWetChemicalAuthority } from "./wetChemical/wetChemicalAuthority";
import { getCurrentUser, inspectionCreatorUser, login, logout, type AuthUser } from "./auth/authApi";
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
import { beginAuthVerificationState, decideAuthRestoration } from "./auth/authRestoration";
import { ConnectivityRecovery } from "./auth/connectivityRecovery";
import { LoginForm } from "./auth/LoginForm";
import { ManagerFinalReportView } from "./manager/ManagerFinalReportView";
import { ManagerHome } from "./manager/ManagerHome";
import { ManagerOperations } from "./manager/ManagerOperations";
import { ManagerTechnicians } from "./manager/ManagerTechnicians";
import { ManagerTechnicianDetail } from "./manager/ManagerTechnicianDetail";
import { claimManagerSession, clearManagerSession, readManagerExperience, readManagerReturn, rememberManagerExperience, rememberManagerReturn, type ManagerReturnRoute } from "./manager/managerReturnRoute";
import { ManagerServicesDone } from "./manager/ManagerServicesDone";
import { ManagerUpcomingServices } from "./manager/ManagerUpcomingServices";
import { ManagerCustomerConfiguration, ManagerCustomerConfigurationDetail } from "./manager/ManagerCustomerConfiguration";
import { ManagerServiceEditor } from "./manager/ManagerServiceEditor";
import { allowManagerHashChange, confirmManagerLeave } from "./manager/managerLeaveGuard";
import { ManagerApiError, loadManagerCustomer, loadManagerCustomers, loadManagerServiceVisit, loadManagerServiceVisits, type ManagerCustomer, type ManagerServiceVisit } from "./manager/managerApi";
import { RoleSelection, type ProductRole } from "./manager/RoleSelection";
import { isManagerRole, productRoleMatches, supervisorAllowsRoute } from "./manager/roleAccess";
import { ManagerRequestGuard, type ManagerRequest } from "./manager/managerRequestGuard";
import { activateUserWorkspace, initializeLocalDatabase, localDatabase, type InspectionRecord } from "./db/localDatabase";
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
import { NewServiceVisit } from "./jobs/NewServiceVisit";
import { FinalReportView } from "./jobs/FinalReportView";
import { FinalReportApiError, downloadFinalReport } from "./jobs/finalReportApi";
import { acceptCanonicalNewServiceVisit } from "./jobs/newServiceVisitSuccess";
import { HoseReelInspectionForm } from "./hoseReel/HoseReelInspectionForm";
import { editFailedHoseReel, getOrCreateHoseReelInspection, saveHoseReelDraft, submitLocalHoseReel } from "./hoseReel/hoseReelRepository";
import type { HoseReelResponses, MasterSystemInspectionRecord } from "./hoseReel/hoseReelTypes";
import { resolveHoseReelAuthority } from "./hoseReel/hoseReelAuthority";
import { loadServerHoseReelDetail, type ServerHoseReelDetail } from "./hoseReel/serverHoseReelApi";
import { ServerHoseReelView } from "./hoseReel/ServerHoseReelView";
import { ServerMasterSystemInspectionList } from "./hoseReel/ServerMasterSystemInspectionList";
import { findServerMasterSystemInspection, loadServerMasterSystemInspections, type ServerMasterSystemInspectionSummary } from "./hoseReel/serverMasterSystemInspectionApi";
import {
  ServerSummaryRefreshGuard,
  type ServerSummaryRefreshToken
} from "./jobs/serverSummaryRefreshGuard";
import type { InspectionJob, JobSystemSnapshot } from "./jobs/jobTypes";
import { closeInspectionJob } from "./jobs/jobApi";
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
  cacheCanonicalInspectionJob,
  refreshCachedInspectionJobs,
  refreshInspectionReferenceData
} from "./referenceData/referenceDataCache";
import {
  pruneCompletedOutboxItems,
  recoverInterruptedSync,
  syncPendingTestRecords, waitForSyncIdle
} from "./sync/syncEngine";
import { APP_BUILD_ID } from "./pwa/buildInfo";
import { PwaUpdateNotice } from "./pwa/PwaUpdateNotice";
import { isSafeForAppUpdate } from "./pwa/updateRoutePolicy";
import { usePwaUpdate } from "./pwa/usePwaUpdate";

type ApiHealth = "Not checked" | "Reachable" | "Unavailable";
type AppRoute =
  | { name: "jobs" }
  | { name: "new-service-visit" }
  | { name: "job"; jobId: string }
  | { name: "final-report"; jobId: string }
  | { name: "manager-home" }
  | { name: "manager-technicians" }
  | { name: "manager-technician"; technicianId: string }
  | { name: "manager-customers" }
  | { name: "manager-operations" }
  | { name: "manager-services-done" }
  | { name: "manager-upcoming-services" }
  | { name: "manager-customer"; customerId: string }
  | { name: "manager-customer-service"; customerId: string; systemKey: string }
  | { name: "manager-service-visit"; jobId: string }
  | { name: "manager-final-report"; jobId: string }
  | { name: "system"; jobId: string; systemKey: string }
  | { name: "inspection"; clientUuid: string }
  | { name: "sprinkler-form"; clientUuid: string }
  | { name: "riser-form"; clientUuid: string }
  | { name: "fire-alarm-form"; jobId: string; clientUuid: string }
  | { name: "hydrant-form"; clientUuid: string }
  | { name: "smoke-ventilation-form"; clientUuid: string }
  | { name: "fire-intercom-form"; clientUuid: string }
  | { name: "portable-fire-extinguisher-form"; clientUuid: string }
  | { name: "co2-form"; clientUuid: string }
  | { name: "wet-chemical-form"; clientUuid: string }
  | { name: "development" };

function routeFromHash(): AppRoute {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "development") return { name: "development" };
  if (parts[0] === "manager-technicians") return { name: "manager-technicians" };
  if (parts[0] === "manager-technician" && parts[1]) return { name: "manager-technician", technicianId: parts[1] };
  if (parts[0] === "manager-customers") return { name: "manager-customers" };
  if (parts[0] === "manager-operations") return { name: "manager-operations" };
  if (parts[0] === "manager-services-done") return { name: "manager-services-done" };
  if (parts[0] === "manager-upcoming-services") return { name: "manager-upcoming-services" };
  if (parts[0] === "manager") return { name: "manager-home" };
  if (parts[0] === "manager-customer" && parts[1] && parts[2] === "service" && parts[3]) return { name: "manager-customer-service", customerId: parts[1], systemKey: parts[3] };
  if (parts[0] === "manager-customer" && parts[1]) return { name: "manager-customer", customerId: parts[1] };
  if (parts[0] === "manager-service-visit" && parts[1]) return { name: "manager-service-visit", jobId: parts[1] };
  if (parts[0] === "manager-final-report" && parts[1]) return { name: "manager-final-report", jobId: parts[1] };
  if (parts[0] === "new-service-visit") return { name: "new-service-visit" };
  if (parts[0] === "final-report" && parts[1]) return { name: "final-report", jobId: parts[1] };
  if (parts[0] === "inspection" && parts[1]) return { name: "inspection", clientUuid: parts[1] };
  if (parts[0] === "sprinkler-form" && parts[1]) return { name: "sprinkler-form", clientUuid: parts[1] };
  if (parts[0] === "riser-form" && parts[1]) return { name: "riser-form", clientUuid: parts[1] };
  if (parts[0] === "fire-alarm-form" && parts[1] && parts[2]) return { name: "fire-alarm-form", jobId: parts[1], clientUuid: parts[2] };
  if (parts[0] === "hydrant-form" && parts[1]) return { name: "hydrant-form", clientUuid: parts[1] };
  if (parts[0] === "smoke-ventilation-form" && parts[1]) return { name: "smoke-ventilation-form", clientUuid: parts[1] };
  if (parts[0] === "fire-intercom-form" && parts[1]) return { name: "fire-intercom-form", clientUuid: parts[1] };
  if (parts[0] === "portable-fire-extinguisher-form" && parts[1]) return { name: "portable-fire-extinguisher-form", clientUuid: parts[1] };
  if (parts[0] === "co2-form" && parts[1]) return { name: "co2-form", clientUuid: parts[1] };
  if (parts[0] === "wet-chemical-form" && parts[1]) return { name: "wet-chemical-form", clientUuid: parts[1] };
  if (parts[0] === "job" && parts[1] && parts[2]) return { name: "system", jobId: parts[1], systemKey: parts[2] };
  if (parts[0] === "job" && parts[1]) return { name: "job", jobId: parts[1] };
  return { name: "jobs" };
}

function hashForRoute(route: AppRoute) {
  if (route.name === "development") return "#/development";
  if (route.name === "manager-technicians") return "#/manager-technicians";
  if (route.name === "manager-technician") return `#/manager-technician/${encodeURIComponent(route.technicianId)}`;
  if (route.name === "manager-customers") return "#/manager-customers";
  if (route.name === "manager-operations") return "#/manager-operations";
  if (route.name === "manager-services-done") return "#/manager-services-done";
  if (route.name === "manager-upcoming-services") return "#/manager-upcoming-services";
  if (route.name === "manager-home") return "#/manager";
  if (route.name === "manager-customer") return `#/manager-customer/${encodeURIComponent(route.customerId)}`;
  if (route.name === "manager-customer-service") return `#/manager-customer/${encodeURIComponent(route.customerId)}/service/${encodeURIComponent(route.systemKey)}`;
  if (route.name === "manager-service-visit") return `#/manager-service-visit/${encodeURIComponent(route.jobId)}`;
  if (route.name === "manager-final-report") return `#/manager-final-report/${encodeURIComponent(route.jobId)}`;
  if (route.name === "new-service-visit") return "#/new-service-visit";
  if (route.name === "final-report") return `#/final-report/${encodeURIComponent(route.jobId)}`;
  if (route.name === "inspection") return `#/inspection/${encodeURIComponent(route.clientUuid)}`;
  if (route.name === "sprinkler-form") return `#/sprinkler-form/${encodeURIComponent(route.clientUuid)}`;
  if (route.name === "riser-form") return `#/riser-form/${encodeURIComponent(route.clientUuid)}`;
  if (route.name === "fire-alarm-form") return `#/fire-alarm-form/${encodeURIComponent(route.jobId)}/${encodeURIComponent(route.clientUuid)}`;
  if (route.name === "hydrant-form") return `#/hydrant-form/${encodeURIComponent(route.clientUuid)}`;
  if (route.name === "smoke-ventilation-form") return `#/smoke-ventilation-form/${encodeURIComponent(route.clientUuid)}`;
  if (route.name === "fire-intercom-form") return `#/fire-intercom-form/${encodeURIComponent(route.clientUuid)}`;
  if (route.name === "portable-fire-extinguisher-form") return `#/portable-fire-extinguisher-form/${encodeURIComponent(route.clientUuid)}`;
  if (route.name === "co2-form") return `#/co2-form/${encodeURIComponent(route.clientUuid)}`;
  if (route.name === "wet-chemical-form") return `#/wet-chemical-form/${encodeURIComponent(route.clientUuid)}`;
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
  const [connectivityRecoveryActive, setConnectivityRecoveryActive] = useState(false);
  const [selectedExperience, setSelectedExperience] = useState<ProductRole>();
  // A reload restores a remembered Manager choice once, at this page load's first completed verification.
  const managerChoiceRestoreAttempted = useRef(false);
  const [roleMessage, setRoleMessage] = useState("");
  const [route, setRoute] = useState<AppRoute>(routeFromHash);
  const pwaUpdate = usePwaUpdate(import.meta.env.PROD, () => isSafeForAppUpdate(route));
  const [managerVisits, setManagerVisits] = useState<ManagerServiceVisit[]>([]);
  const [managerVisit, setManagerVisit] = useState<ManagerServiceVisit>();
  const [managerCustomers, setManagerCustomers] = useState<ManagerCustomer[]>([]);
  const [managerCustomer, setManagerCustomer] = useState<ManagerCustomer>();
  const [managerLoading, setManagerLoading] = useState(false);
  const [managerMessage, setManagerMessage] = useState("");
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
    MasterSystemInspectionRecord | AutomaticSprinklerInspectionRecord | DryWetRiserInspectionRecord | FireAlarmInspectionRecord | HydrantInspectionRecord | SmokeVentilationInspectionRecord | FireIntercomInspectionRecord | PortableRecord
  >>([]);
  const [activeHoseReel, setActiveHoseReel] = useState<MasterSystemInspectionRecord>();
  const [serverHoseReel, setServerHoseReel] = useState<ServerHoseReelDetail>();
  const [hoseReelAuthorityState, setHoseReelAuthorityState] = useState<"idle"|"loading"|"local"|"server"|"server-unavailable">("idle");
  const [hoseReelRouteMessage, setHoseReelRouteMessage] = useState("");
  const [activeAutomaticSprinkler, setActiveAutomaticSprinkler] = useState<AutomaticSprinklerInspectionRecord>();
  const [activeDryWetRiser, setActiveDryWetRiser] = useState<DryWetRiserInspectionRecord>();
  const [serverAcceptedAutomaticSprinklerUuid, setServerAcceptedAutomaticSprinklerUuid] = useState<string>();
  const [serverAcceptedDryWetRiserUuid, setServerAcceptedDryWetRiserUuid] = useState<string>();
  const [activeFireAlarm, setActiveFireAlarm] = useState<FireAlarmInspectionRecord>();
  const [activeHydrant, setActiveHydrant] = useState<HydrantInspectionRecord>();
  const [activePortable, setActivePortable] = useState<PortableRecord>();
  const [serverPortable, setServerPortable] = useState<ServerPortableDetail>();
  const [serverAcceptedPortableUuid, setServerAcceptedPortableUuid] = useState<string>();
  const [portableRouteState, setPortableRouteState] = useState<"idle" | "loading" | "not-cached" | "server-unavailable">("idle");
  const [portableRouteMessage, setPortableRouteMessage] = useState("");
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
  const [activeSmokeVentilation, setActiveSmokeVentilation] = useState<SmokeVentilationInspectionRecord>();
  const [serverSmokeVentilation, setServerSmokeVentilation] = useState<ServerSmokeVentilationDetail>();
  const [serverAcceptedSmokeVentilationUuid, setServerAcceptedSmokeVentilationUuid] = useState<string>();
  const [smokeVentilationRouteState, setSmokeVentilationRouteState] = useState<"idle" | "loading" | "not-cached" | "server-unavailable">("idle");
  const [smokeVentilationRouteMessage, setSmokeVentilationRouteMessage] = useState("");
  const [smokeVentilationAuthorityResolution, setSmokeVentilationAuthorityResolution] = useState<SmokeVentilationAuthorityResolution>();
  const verifiedSmokeVentilationAuthorityToken = authState.status === "verified" ? authState.lastVerifiedAt : undefined;
  useEffect(() => {
    if (route.name !== "smoke-ventilation-form") { setActiveSmokeVentilation(undefined); setServerSmokeVentilation(undefined); setServerAcceptedSmokeVentilationUuid(undefined); setSmokeVentilationAuthorityResolution(undefined); setSmokeVentilationRouteState("idle"); setSmokeVentilationRouteMessage(""); return; }
    if (!initialAuthRestored || authState.status === "restoring" || authState.status === "verifying") { setActiveSmokeVentilation(undefined); setServerSmokeVentilation(undefined); setSmokeVentilationAuthorityResolution(undefined); setSmokeVentilationRouteState("loading"); setSmokeVentilationRouteMessage(authState.status === "verifying" ? "Verifying server session before resolving the Smoke Ventilation inspection." : ""); return; }
    if (authState.status === "online-unavailable") { setActiveSmokeVentilation(undefined); setServerSmokeVentilation(undefined); setSmokeVentilationAuthorityResolution(undefined); setSmokeVentilationRouteState("server-unavailable"); setSmokeVentilationRouteMessage(authState.message); return; }
    let currentSmokeVentilation = true;
    setActiveSmokeVentilation(undefined); setServerSmokeVentilation(undefined); setSmokeVentilationAuthorityResolution(undefined); setSmokeVentilationRouteState("loading"); setSmokeVentilationRouteMessage("");
    void resolveSmokeVentilationRoute(route.clientUuid, serverAcceptedSmokeVentilationUuid, authState.status).then((resolution) => {
      if (!currentSmokeVentilation) return;
      if (resolution.kind === "local") { setActiveSmokeVentilation(resolution.record); setServerSmokeVentilation(undefined); if (authState.status === "verified") setSmokeVentilationAuthorityResolution({ clientUuid: route.clientUuid, generation: authAuthorityGeneration, verifiedAt: authState.lastVerifiedAt }); setSmokeVentilationRouteState("idle"); }
      else if (resolution.kind === "server") { setActiveSmokeVentilation(undefined); setServerSmokeVentilation(resolution.inspection); setSmokeVentilationRouteState("idle"); }
      else { setActiveSmokeVentilation(undefined); setServerSmokeVentilation(undefined); setSmokeVentilationRouteState(resolution.kind); setSmokeVentilationRouteMessage("message" in resolution ? resolution.message : ""); }
    });
    return () => { currentSmokeVentilation = false; };
  }, [authAuthorityGeneration, authState.status, initialAuthRestored, masterSystemInspections, route, serverAcceptedSmokeVentilationUuid, verifiedSmokeVentilationAuthorityToken]);
  const [activeFireIntercom, setActiveFireIntercom] = useState<FireIntercomInspectionRecord>();
  const [serverFireIntercom, setServerFireIntercom] = useState<ServerFireIntercomDetail>();
  const [serverAcceptedFireIntercomUuid, setServerAcceptedFireIntercomUuid] = useState<string>();
  const [fireIntercomRouteState, setFireIntercomRouteState] = useState<"idle" | "loading" | "not-cached" | "server-unavailable">("idle");
  const [fireIntercomRouteMessage, setFireIntercomRouteMessage] = useState("");
  const [fireIntercomAuthorityResolution, setFireIntercomAuthorityResolution] = useState<FireIntercomAuthorityResolution>();
  const verifiedFireIntercomAuthorityToken = authState.status === "verified" ? authState.lastVerifiedAt : undefined;
  useEffect(() => {
    if (route.name !== "fire-intercom-form") { setActiveFireIntercom(undefined); setServerFireIntercom(undefined); setServerAcceptedFireIntercomUuid(undefined); setFireIntercomAuthorityResolution(undefined); setFireIntercomRouteState("idle"); setFireIntercomRouteMessage(""); return; }
    if (!initialAuthRestored || authState.status === "restoring" || authState.status === "verifying") { setActiveFireIntercom(undefined); setServerFireIntercom(undefined); setFireIntercomAuthorityResolution(undefined); setFireIntercomRouteState("loading"); setFireIntercomRouteMessage(authState.status === "verifying" ? "Verifying server session before resolving the Fire Intercom inspection." : ""); return; }
    if (authState.status === "online-unavailable") { setActiveFireIntercom(undefined); setServerFireIntercom(undefined); setFireIntercomAuthorityResolution(undefined); setFireIntercomRouteState("server-unavailable"); setFireIntercomRouteMessage(authState.message); return; }
    let currentFireIntercom = true;
    setActiveFireIntercom(undefined); setServerFireIntercom(undefined); setFireIntercomAuthorityResolution(undefined); setFireIntercomRouteState("loading"); setFireIntercomRouteMessage("");
    void resolveFireIntercomRoute(route.clientUuid, serverAcceptedFireIntercomUuid, authState.status).then((resolution) => {
      if (!currentFireIntercom) return;
      if (resolution.kind === "local") { setActiveFireIntercom(resolution.record); setServerFireIntercom(undefined); if (authState.status === "verified") setFireIntercomAuthorityResolution({ clientUuid: route.clientUuid, generation: authAuthorityGeneration, verifiedAt: authState.lastVerifiedAt }); setFireIntercomRouteState("idle"); }
      else if (resolution.kind === "server") { setActiveFireIntercom(undefined); setServerFireIntercom(resolution.inspection); setFireIntercomRouteState("idle"); }
      else { setActiveFireIntercom(undefined); setServerFireIntercom(undefined); setFireIntercomRouteState(resolution.kind); setFireIntercomRouteMessage("message" in resolution ? resolution.message : ""); }
    });
    return () => { currentFireIntercom = false; };
  }, [authAuthorityGeneration, authState.status, initialAuthRestored, masterSystemInspections, route, serverAcceptedFireIntercomUuid, verifiedFireIntercomAuthorityToken]);
  useEffect(() => {
    if (route.name !== "portable-fire-extinguisher-form") { setActivePortable(undefined); setServerPortable(undefined); setServerAcceptedPortableUuid(undefined); setPortableRouteState("idle"); setPortableRouteMessage(""); return; }
    if (!initialAuthRestored || authState.status === "restoring" || authState.status === "verifying") { setActivePortable(undefined); setServerPortable(undefined); setPortableRouteState("loading"); return; }
    if (authState.status === "online-unavailable") { setActivePortable(undefined); setServerPortable(undefined); setPortableRouteState("server-unavailable"); setPortableRouteMessage(authState.message); return; }
    let current=true; setActivePortable(undefined); setServerPortable(undefined); setPortableRouteState("loading"); setPortableRouteMessage("");
    void resolvePortableRoute(route.clientUuid,serverAcceptedPortableUuid,authState.status).then(resolution=>{if(!current)return;if(resolution.kind==="local"){setActivePortable(resolution.record);setPortableRouteState("idle");}else if(resolution.kind==="server"){setServerPortable(resolution.inspection);setPortableRouteState("idle");}else{setPortableRouteState(resolution.kind);setPortableRouteMessage(("message" in resolution?resolution.message:"")??"");}});
    return()=>{current=false;};
  },[authAuthorityGeneration,authState.status,initialAuthRestored,masterSystemInspections,route,serverAcceptedPortableUuid]);
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
  const [serverCo2, setServerCo2] = useState<ServerCo2Detail>();
  const [co2AuthorityState, setCo2AuthorityState] = useState<"idle"|"loading"|"local"|"server"|"server-unavailable">("idle");
  const [co2RouteMessage, setCo2RouteMessage] = useState("");
  const [serverWetChemical, setServerWetChemical] = useState<ServerWetChemicalDetail>();
  const [wetChemicalAuthorityState, setWetChemicalAuthorityState] = useState<"idle" | "loading" | "server" | "local" | "server-unavailable">("idle");
  const [wetChemicalRouteMessage, setWetChemicalRouteMessage] = useState("");
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
  const authRestorationReady = useRef(false);
  const activeExplicitAuthOperation = useRef<number | undefined>(undefined);
  const authRequestQueue = useRef<Promise<void>>(Promise.resolve());
  const connectivityRecovery = useRef(new ConnectivityRecovery(setConnectivityRecoveryActive));
  const authAuthorityGuard = useRef(new AuthAuthorityGuard());
  const serverSummaryRefreshGuard = useRef(new ServerSummaryRefreshGuard());
  const serverSummaryJobContext = useRef("");
  const sprinklerRouteGeneration = useRef(0);
  const riserRouteGeneration = useRef(0);
  const fireAlarmRouteGeneration = useRef(0);
  const managerRequestGuard = useRef(new ManagerRequestGuard());

  function navigate(nextRoute: AppRoute) {
    const nextHash = hashForRoute(nextRoute);
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
  }

  function beginExplicitAuthOperation() {
    connectivityRecovery.current.cancel();
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
    // Manager Operations is not an offline cache. Revocation and verification
    // transitions immediately invalidate data and every in-flight request.
    managerRequestGuard.current.invalidate();
    setManagerVisits([]);
    setManagerVisit(undefined);
    setManagerCustomers([]);
    setManagerCustomer(undefined);
    setManagerLoading(false);
    setManagerMessage("");
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

  async function prepareLocalWorkspace(user: AuthUser) {
    await waitForSyncIdle();
    await waitForWorkspaceIdle();
    if (!await activateUserWorkspace(user.id)) return;
    setJobs([]);
    setActiveInspectionDraft(undefined); setActiveHoseReel(undefined);
    setActiveCo2Form(undefined); setActiveAutomaticSprinkler(undefined);
    setActiveDryWetRiser(undefined); setActiveFireAlarm(undefined);
    setActiveHydrant(undefined); setActivePortable(undefined);
    setActiveSmokeVentilation(undefined); setActiveFireIntercom(undefined);
    setRecords(await listTestRecords());
    setInspections(await listInspectionRecords());
    setMasterSystemInspections(await localDatabase.masterSystemInspections.toArray());
    setMasterSystemInspectionGroups(await localDatabase.masterSystemInspectionGroups.toArray());
    setMasterSystemFormInstances(await localDatabase.masterSystemFormInstances.toArray());
    setInspectionAttachments(await localDatabase.inspectionAttachments.toArray());
    setReferenceCache(await getReferenceCacheSummary());
    if (user.role === "inspector") navigate({ name: "jobs" });
  }

  function prepareVerifiedAuthority(user: AuthUser, forceReplacement = false) {
    if (!forceReplacement && authAuthorityGuard.current.matches(user)) return false;
    invalidateServerDerivedAuthority();
    authAuthorityGuard.current.revoke();
    return true;
  }

  function installVerifiedAuthority(user: AuthUser, preparedReplacement: boolean) {
    // The authenticated UI can appear before reference refresh finishes.
    // Connectivity changes during that refresh must still revalidate authority.
    authRestorationReady.current = true;
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
    const ownerDatabase = localDatabase;
    const [localInspections, localMasters, localGroups, localForms, localPhotos] = await Promise.all([
      ownerDatabase.inspectionRecords.toArray(), ownerDatabase.masterSystemInspections.toArray(),
      ownerDatabase.masterSystemInspectionGroups.toArray(), ownerDatabase.masterSystemFormInstances.toArray(),
      ownerDatabase.inspectionAttachments.toArray()
    ]);
    if (ownerDatabase !== localDatabase || !isCurrentAuthOperation(operation)
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
    setInspections(localInspections); setMasterSystemInspections(localMasters);
    setMasterSystemInspectionGroups(localGroups); setMasterSystemFormInstances(localForms);
    setInspectionAttachments(localPhotos);
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
      await refreshCachedInspectionJobs(user.id, isCurrentRefresh);
      if (!isCurrentRefresh()) return;
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
      setJobMessage(`${cachedJobs.length} ${cachedJobs.length === 1 ? "job" : "jobs"} available on this device`);
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

  async function reconcileAuthentication(): Promise<"verified" | "offline-unverified" | "online-unavailable" | "logged-out" | undefined> {
    if (activeExplicitAuthOperation.current !== undefined) return undefined;
    const operation = authOperationGeneration.current;
    const reconciliation = ++authReconciliationGeneration.current;
    const isCurrentReconciliation = () => isCurrentAuthOperation(operation)
      && authReconciliationGeneration.current === reconciliation;
    const deviceState = await getDeviceAuthState();
    if (!isCurrentReconciliation()) return undefined;

    if (deviceState?.serverLogoutPending) {
      setJobs([]);
      revokeVerifiedAuthority();
      setAuthState({
        status: "logged-out",
        message: "Signed out locally. Completing server logout when available."
      });
      const logoutResult = await resolvePendingServerLogout(operation);
      if (!isCurrentReconciliation()) return undefined;
      setAuthState({
        status: "logged-out",
        message: logoutResult === "unavailable"
          ? "Signed out locally. Server logout will complete after reconnecting."
          : "Signed out. Sign in to prepare offline work."
      });
      return "logged-out";
    }

    const cachedIdentity = identityFromDeviceState(deviceState);
    if (cachedIdentity && !authAuthorityGuard.current.hasAuthority) {
      await loadCachedJobs(cachedIdentity.user.id, operation, undefined, isCurrentReconciliation);
      if (!isCurrentReconciliation()) return undefined;
      setAuthState({
        status: "verifying",
        user: cachedIdentity.user,
        lastVerifiedAt: cachedIdentity.lastVerifiedAt
      });
      setJobMessage("Using jobs previously cached for this user while verifying the session");
    }

    const probe = await getCurrentUser();
    if (!isCurrentReconciliation()) return undefined;
    const decision = decideAuthRestoration(cachedIdentity, probe);
    if (decision.kind === "verified") {
      // Bind this tab's Manager session state to the verified user before any verified render; a
      // restore or cross-tab revalidation that returns a different user starts clean.
      claimManagerSession(decision.user.id);
      const authorityReplacement = prepareVerifiedAuthority(decision.user);
      await prepareLocalWorkspace(decision.user);
      const lastVerifiedAt = await storeVerifiedIdentity(decision.user);
      if (!isCurrentReconciliation()) return undefined;
      installVerifiedAuthority(decision.user, authorityReplacement);
      setAuthState({ status: "verified", user: decision.user, lastVerifiedAt });
      // Reload of a verified admin who had chosen Manager in this tab: skip the role chooser, once, at
      // this page load's first completed verification (an offline start that reconnects still restores).
      // The key survives only for the same verified user (owner stamp claimed above).
      if (!managerChoiceRestoreAttempted.current) {
        managerChoiceRestoreAttempted.current = true;
        if (isManagerRole(decision.user.role) && readManagerExperience()) setSelectedExperience((current) => current ?? "manager");
      }
      await loadCachedJobs(decision.user.id, operation, undefined, isCurrentReconciliation);
      if (!isCurrentReconciliation()) return undefined;
      await refreshServerWorkspace(decision.user, operation);
      return decision.kind;
    }

    if (decision.kind === "logged-out") {
      revokeVerifiedAuthority();
      if (decision.clearIdentity) await clearLocalIdentity();
      if (!isCurrentReconciliation()) return undefined;
      setJobs([]);
      setAuthState({
        status: "logged-out",
        message: decision.clearIdentity
          ? "Sign in required before server actions"
          : "Server unavailable. Sign in online once to prepare offline technician access."
      });
      return decision.kind;
    }

    if (decision.kind === "online-unavailable") {
      revokeVerifiedAuthority();
      setAuthState({
        status: "online-unavailable",
        user: decision.identity?.user,
        lastVerifiedAt: decision.identity?.lastVerifiedAt,
        message: "Server session verification is unavailable."
      });
      setJobMessage("Server session verification is unavailable; cached local inspection authority remains protected.");
      return decision.kind;
    }

    if (decision.kind === "offline-unverified") {
      revokeVerifiedAuthority();
      setAuthState({
        status: "offline-unverified",
        user: decision.identity.user,
        lastVerifiedAt: decision.identity.lastVerifiedAt
      });
      setJobMessage("Using jobs saved on this device while the service is unavailable.");
      return decision.kind;
    }
  }

  function beginServerVerification() {
    authReconciliationGeneration.current += 1;
    if (authAuthorityGuard.current.hasAuthority) revokeVerifiedAuthority();
    setAuthState(beginAuthVerificationState);
  }

  async function revalidateAuthentication() {
    connectivityRecovery.current.cancel();
    beginServerVerification();
    return reconcileAuthentication();
  }

  async function revalidateForConnectivityRecovery() {
    beginServerVerification();
    return (await reconcileAuthentication()) === "offline-unverified";
  }

  function beginOnlineConnectivityRecovery() {
    connectivityRecovery.current.start(revalidateForConnectivityRecovery);
  }

  useEffect(() => {
    const handleOffline = () => {
      connectivityRecovery.current.cancel();
      if (authRestorationReady.current) void revalidateForConnectivityRecovery();
    };
    const handleOnline = () => {
      if (authRestorationReady.current) beginOnlineConnectivityRecovery();
    };
    const handleIdentityChange = (event: StorageEvent) => {
      if (event.key === "inspection-auth-change") void revalidateAuthentication();
    };
    const handleHashChange = () => {
      // The per-service editor registers a guard while it holds unsaved wording
      // edits; a declined "leave?" confirm puts its hash back instead of routing.
      const leave = allowManagerHashChange(window.location.hash);
      if (!leave.allow) { window.location.hash = leave.restoreHash; return; }
      const nextRoute = routeFromHash();
      setRoute((current) => hashForRoute(current) === hashForRoute(nextRoute) ? current : nextRoute);
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("storage", handleIdentityChange);
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
      authRestorationReady.current = true;
      setInitialAuthRestored(true);
    });

    return () => {
      authRestorationReady.current = false;
      connectivityRecovery.current.cancel();
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("storage", handleIdentityChange);
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
    if (route.name !== "riser-form") { setActiveDryWetRiser(undefined); setServerDryWetRiser(undefined); setServerAcceptedDryWetRiserUuid(undefined); setRiserRouteState("idle"); setRiserRouteMessage(""); return; }
    if (!initialAuthRestored || authState.status === "restoring" || authState.status === "verifying" || authState.status === "online-unavailable") { setRiserRouteState("loading"); return; }
    setRiserRouteState("loading"); setRiserRouteMessage("");
    const restoredCompletedJob = masterSystemInspections.find((record) => record.clientUuid === route.clientUuid);
    const preferAcceptedServer = serverAcceptedDryWetRiserUuid === route.clientUuid
      || Boolean(restoredCompletedJob && jobs.some((job) => job.id === restoredCompletedJob.jobId && job.status === "closed"));
    void resolveDryWetRiserRoute(route.clientUuid, authState.status, undefined, preferAcceptedServer).then((resolution) => {
      if (riserRouteGeneration.current !== generation) return;
      if (resolution.kind === "local") { setActiveDryWetRiser(resolution.record); setServerDryWetRiser(undefined); setRiserRouteState("idle"); }
      else if (resolution.kind === "server") { setActiveDryWetRiser(undefined); setServerDryWetRiser(resolution.inspection); setRiserRouteState("idle"); }
      else { setActiveDryWetRiser(undefined); setServerDryWetRiser(undefined); setRiserRouteState(resolution.kind); setRiserRouteMessage("message" in resolution ? resolution.message : ""); }
    });
  }, [authAuthorityGeneration, authState.status, initialAuthRestored, jobs, masterSystemInspections, route, serverAcceptedDryWetRiserUuid]);

  useEffect(() => {
    const generation = ++sprinklerRouteGeneration.current;
    if (route.name !== "sprinkler-form") {
      setActiveAutomaticSprinkler(undefined);
      setServerAutomaticSprinkler(undefined);
      setServerAcceptedAutomaticSprinklerUuid(undefined);
      setSprinklerRouteState("idle");
      setSprinklerRouteMessage("");
      return;
    }
    if (!initialAuthRestored || authState.status === "restoring" || authState.status === "verifying" || authState.status === "online-unavailable") {
      setSprinklerRouteState("loading");
      return;
    }
    setSprinklerRouteState("loading");
    setSprinklerRouteMessage("");
    const restoredCompletedJob = masterSystemInspections.find((record) => record.clientUuid === route.clientUuid);
    const preferAcceptedServer = serverAcceptedAutomaticSprinklerUuid === route.clientUuid
      || Boolean(restoredCompletedJob && jobs.some((job) => job.id === restoredCompletedJob.jobId && job.status === "closed"));
    void resolveAutomaticSprinklerRoute(route.clientUuid, authState.status, undefined, preferAcceptedServer).then((resolution) => {
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
  }, [authAuthorityGeneration, authState.status, initialAuthRestored, jobs, masterSystemInspections, route, serverAcceptedAutomaticSprinklerUuid]);

  useEffect(() => {
    setActiveCo2Form((route.name === "co2-form" || route.name === "wet-chemical-form")
      ? masterSystemFormInstances.find((record) => record.clientUuid === route.clientUuid)
      : undefined);
  }, [masterSystemFormInstances, route]);
  useEffect(()=>{if(route.name!=="inspection"){setServerHoseReel(undefined);setHoseReelAuthorityState("idle");setHoseReelRouteMessage("");return;}let current=true;setServerHoseReel(undefined);setHoseReelAuthorityState("loading");setHoseReelRouteMessage("");const local=masterSystemInspections.find(record=>record.clientUuid===route.clientUuid&&record.systemKey==="hose_reel") as MasterSystemInspectionRecord|undefined;void resolveHoseReelAuthority(authState.status,route.clientUuid,local,{findSummary:(jobId)=>findServerMasterSystemInspection(jobId,"hose_reel"),loadDetail:loadServerHoseReelDetail}).then(resolution=>{if(!current)return;if(resolution.kind==="server"){setActiveHoseReel(undefined);setServerHoseReel(resolution.inspection);setHoseReelAuthorityState("server");}else if(resolution.kind==="local"){setActiveHoseReel(resolution.record);setServerHoseReel(undefined);setHoseReelAuthorityState("local");}else{setActiveHoseReel(undefined);setServerHoseReel(undefined);setHoseReelAuthorityState(resolution.kind);setHoseReelRouteMessage(resolution.kind==="server-unavailable"?resolution.message:"");}});return()=>{current=false;};},[authAuthorityGeneration,authState.status,masterSystemInspections,route]);
  useEffect(()=>{if(route.name!=="co2-form"){setServerCo2(undefined);setCo2AuthorityState("idle");setCo2RouteMessage("");return;}let current=true;setServerCo2(undefined);setCo2AuthorityState("loading");setCo2RouteMessage("");const local=masterSystemFormInstances.find(record=>record.clientUuid===route.clientUuid&&record.systemKey==="co2_fire_extinguisher");void resolveCo2Authority(authState.status,route.clientUuid,local,{findSummary:(record)=>findServerMasterSystemInspection(record.jobId,"co2_fire_extinguisher",{configuredLocationId:record.configuredLocationId,instanceKey:record.instanceKey,configuredZoneId:record.configuredZoneId,displaySequence:record.displaySequence}),loadDetail:loadServerCo2Detail}).then(resolution=>{if(!current)return;if(resolution.kind==="server"){setActiveCo2Form(undefined);setServerCo2(resolution.inspection);setCo2AuthorityState("server");}else if(resolution.kind==="local"){setActiveCo2Form(resolution.record);setServerCo2(undefined);setCo2AuthorityState("local");}else{setActiveCo2Form(undefined);setServerCo2(undefined);setCo2AuthorityState(resolution.kind);setCo2RouteMessage(resolution.kind==="server-unavailable"?resolution.message:"");}});return()=>{current=false;};},[authAuthorityGeneration,authState.status,masterSystemFormInstances,route]);
  useEffect(() => {
    if (route.name !== "wet-chemical-form") {
      setServerWetChemical(undefined); setWetChemicalRouteMessage(""); setWetChemicalAuthorityState("idle"); return;
    }
    let current = true;
    setServerWetChemical(undefined); setWetChemicalRouteMessage(""); setWetChemicalAuthorityState("loading");
    const local = masterSystemFormInstances.find((record) => record.clientUuid === route.clientUuid && record.systemKey === "wet_chemical");
    void resolveWetChemicalAuthority(authState.status, route.clientUuid, local, {
      findSummary: (record) => findServerMasterSystemInspection(record.jobId, "wet_chemical", {
        configuredLocationId: record.configuredLocationId,
        instanceKey: record.instanceKey,
        configuredZoneId: record.configuredZoneId,
        displaySequence: record.displaySequence
      }),
      loadDetail: loadServerWetChemicalDetail
    }).then((resolution) => {
      if (!current) return;
      if (resolution.kind === "server") {
        setServerWetChemical(resolution.inspection); setActiveCo2Form(undefined); setWetChemicalAuthorityState("server");
      } else if (resolution.kind === "local") {
        setServerWetChemical(undefined); setWetChemicalAuthorityState("local");
      } else {
        setServerWetChemical(undefined); setActiveCo2Form(undefined); setWetChemicalAuthorityState(resolution.kind);
        setWetChemicalRouteMessage(resolution.kind === "server-unavailable" ? resolution.message : "");
      }
    });
    return () => { current = false; };
  }, [authAuthorityGeneration, authState.status, masterSystemFormInstances, route]);

  useEffect(()=>{const generation=++fireAlarmRouteGeneration.current;if(route.name!=="fire-alarm-form"){setActiveFireAlarm(undefined);setServerFireAlarm(undefined);setFireAlarmRouteState("idle");setFireAlarmRouteMessage("");return;}if(authState.status==="restoring"||authState.status==="verifying"||authState.status==="online-unavailable"){setFireAlarmRouteState("loading");return;}setFireAlarmRouteState("loading");setFireAlarmRouteMessage("");void resolveFireAlarmRoute(route.clientUuid,route.jobId,authState.status).then(resolution=>{if(fireAlarmRouteGeneration.current!==generation)return;if(resolution.kind==="local"){setActiveFireAlarm(resolution.record);setServerFireAlarm(undefined);setFireAlarmRouteState("idle");}else if(resolution.kind==="server"){setActiveFireAlarm(undefined);setServerFireAlarm(resolution.inspection);setFireAlarmRouteState("idle");}else{setActiveFireAlarm(undefined);setServerFireAlarm(undefined);setFireAlarmRouteState(resolution.kind);setFireAlarmRouteMessage("message" in resolution?resolution.message:"");}});},[authAuthorityGeneration,authState.status,masterSystemInspections,route]);

  const currentUser = authStateUser(authState);
  const canUseServer = authState.status === "verified";
  const technicianExperience = selectedExperience === "technician"
    && (authState.status === "verified" || authState.status === "offline-unverified")
    && currentUser?.role === "inspector";
  // Manager operational data is server-backed. A cached identity alone never
  // unlocks it, even after a previously verified login.
  const managerExperience = selectedExperience === "manager"
    && authState.status === "verified"
    && currentUser !== undefined && isManagerRole(currentUser.role);
  // A supervisor gets the review-only part of the Manager experience (T4).
  const supervisorExperience = managerExperience && currentUser?.role === "supervisor";
  // Remember the Manager choice for this tab only while the verified Manager experience is active.
  useEffect(() => { if (managerExperience) rememberManagerExperience(true); }, [managerExperience]);
  const managerReturn = managerExperience && (route.name === "manager-final-report" || route.name === "manager-service-visit")
    ? readManagerReturn(route.jobId)
    : null;

  function selectExperience(role: ProductRole) {
    setRoleMessage("");
    if (currentUser && !productRoleMatches(role, currentUser)) {
      setSelectedExperience(undefined);
      rememberManagerExperience(false);
      setRoleMessage(role === "manager"
        ? "This signed-in account does not have Manager access. Choose Technician to continue."
        : "This signed-in account does not have Technician access. Choose Manager to continue.");
      return;
    }
    setSelectedExperience(role);
    if (role === "manager" && authState.status === "verified") navigate({ name: "manager-home" });
    if (role === "technician" && currentUser?.role === "inspector") navigate({ name: "jobs" });
  }

  function beginManagerRequest() {
    return managerRequestGuard.current.begin(authAuthorityGuard.current.currentGeneration);
  }

  function managerRequestIsCurrent(request: ManagerRequest) {
    return managerRequestGuard.current.isCurrent(
      request,
      authAuthorityGuard.current.currentGeneration,
      authAuthorityGuard.current.hasAuthority
    );
  }

  function failClosedManagerOperations(message: string, revalidate = true) {
    managerRequestGuard.current.invalidate();
    setManagerVisits([]);
    setManagerVisit(undefined);
    setManagerCustomers([]);
    setManagerCustomer(undefined);
    setManagerLoading(false);
    setManagerMessage(message);
    // Server-derived Manager views are unusable when their authority cannot
    // be refreshed. This does not alter verified session state by itself.
    setSelectedExperience(undefined);
    rememberManagerExperience(false);
    setRoleMessage(message);
    if (revalidate) void revalidateAuthentication();
  }

  function handleManagerRequestFailure(error: unknown) {
    const message = error instanceof ManagerApiError
      ? error.message
      : "Manager Operations cannot be verified or refreshed right now.";
    if (error instanceof ManagerApiError && error.kind === "domain") {
      setManagerMessage(message);
      return;
    }
    if (error instanceof ManagerApiError && error.kind === "authorization") {
      // A protected Manager endpoint rejected the session. Do not retain a
      // selected Manager presentation while the authoritative session check runs.
      setSelectedExperience(undefined);
      rememberManagerExperience(false);
      setRoleMessage(message);
    }
    failClosedManagerOperations(message, error instanceof ManagerApiError && error.kind === "authorization");
  }

  function handleManagerReportAuthorizationFailure(message: string) {
    setSelectedExperience(undefined);
    rememberManagerExperience(false);
    setRoleMessage(message);
    failClosedManagerOperations(message);
  }

  function handleManagerReportDownloadFailure(error: unknown) {
    const message = error instanceof Error
      ? error.message
      : "The final report PDF could not be downloaded. Please try again.";
    if (error instanceof FinalReportApiError && error.kind === "domain") {
      setManagerMessage(message);
      return;
    }
    if (error instanceof FinalReportApiError && error.kind === "authorization") {
      handleManagerReportAuthorizationFailure(message);
      return;
    }
    failClosedManagerOperations(message, false);
  }

  /** Opens a Manager visit/report; `returnTo` (null = Operations) decides where its Back goes. */
  function openManagerVisit(name: "manager-service-visit" | "manager-final-report", jobId: string, returnTo: Omit<ManagerReturnRoute, "jobId"> | null) {
    rememberManagerReturn(returnTo ? { ...returnTo, jobId } : null);
    navigate({ name, jobId });
  }

  function backFromManagerVisit() {
    const target = managerReturn;
    if (target) window.location.hash = target.hash;
    else navigate({ name: "manager-operations" });
  }

  async function downloadManagerReport(jobId: string) {
    try {
      await downloadFinalReport(jobId, "/api/manager/service-visits");
    } catch (error) {
      handleManagerReportDownloadFailure(error);
    }
  }

  async function refreshManagerVisits() {
    if (!managerExperience) return;
    const request = beginManagerRequest();
    setManagerLoading(true);
    setManagerMessage("");
    try {
      const [visits, customers] = await Promise.all([loadManagerServiceVisits(request.signal), loadManagerCustomers(request.signal)]);
      if (!managerRequestIsCurrent(request)) return;
      setManagerVisits(visits);
      setManagerCustomers(customers);
    } catch (error) {
      if (!managerRequestIsCurrent(request)) return;
      handleManagerRequestFailure(error);
    } finally {
      if (managerRequestIsCurrent(request)) setManagerLoading(false);
    }
  }

  useEffect(() => {
    if (!managerExperience) {
      setManagerVisit(undefined);
      setManagerCustomer(undefined);
      return;
    }
    if (!route.name.startsWith("manager-")) { navigate({ name: "manager-home" }); return; }
    // A supervisor deep-linking to an admin-only Manager screen lands on Manager Home (T4).
    if (supervisorExperience && !supervisorAllowsRoute(route.name)) { navigate({ name: "manager-home" }); return; }
    if (route.name === "manager-operations" || route.name === "manager-customers") void refreshManagerVisits();
    if (route.name === "manager-service-visit") {
      const request = beginManagerRequest();
      setManagerVisit(undefined);
      setManagerLoading(true);
      setManagerMessage("");
      void loadManagerServiceVisit(route.jobId, request.signal).then(
        (visit) => { if (managerRequestIsCurrent(request)) setManagerVisit(visit); },
        (error: unknown) => {
          if (!managerRequestIsCurrent(request)) return;
          handleManagerRequestFailure(error);
        }
      ).finally(() => { if (managerRequestIsCurrent(request)) setManagerLoading(false); });
    }
    if (route.name === "manager-customer" || route.name === "manager-customer-service") {
      const request = beginManagerRequest(); setManagerCustomer(undefined); setManagerLoading(true); setManagerMessage("");
      void loadManagerCustomer(route.customerId, request.signal).then(
        (customer) => { if (managerRequestIsCurrent(request)) setManagerCustomer(customer); },
        (error: unknown) => { if (managerRequestIsCurrent(request)) handleManagerRequestFailure(error); }
      ).finally(() => { if (managerRequestIsCurrent(request)) setManagerLoading(false); });
    }
    return () => managerRequestGuard.current.invalidate();
  }, [managerExperience, supervisorExperience, route]);
  const jobIsCompleted = (jobId: string) => jobs.some((job) => job.id === jobId && job.status === "closed");
  const mayRenderLocalHydrant = canRenderLocalHydrant(
    activeHydrant,
    authState.status,
    route.name === "hydrant-form" ? route.clientUuid : undefined,
    hydrantAuthorityResolution,
    authAuthorityGeneration,
    authState.status === "verified" ? authState.lastVerifiedAt : undefined
  );
  const mayRenderLocalSmokeVentilation = canRenderLocalSmokeVentilation(
    activeSmokeVentilation,
    authState.status,
    route.name === "smoke-ventilation-form" ? route.clientUuid : undefined,
    smokeVentilationAuthorityResolution,
    authAuthorityGeneration,
    authState.status === "verified" ? authState.lastVerifiedAt : undefined
  );
  const mayRenderLocalFireIntercom = canRenderLocalFireIntercom(
    activeFireIntercom,
    authState.status,
    route.name === "fire-intercom-form" ? route.clientUuid : undefined,
    fireIntercomAuthorityResolution,
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
    const finishLocalWork = beginWorkspaceActivity();
    try {

    await saveDraft(values);
    await refreshRecords();

    } finally { finishLocalWork(); }
  }

  async function handleSubmitLocal(values: TestRecordFormValues) {
    const finishLocalWork = beginWorkspaceActivity();
    try {

    await submitLocal(values);
    await refreshRecords();
    setSyncMessage("Record is pending sync");

    } finally { finishLocalWork(); }
  }

  async function handleSync() {
    if (!canUseServer) {
      setSyncMessage("Reconnect to verify your session before syncing");
      return;
    }
    const result = await syncPendingTestRecords(currentUser?.id);
    setSyncMessage(result.message);
    await refreshRecords();
    await refreshMasterSystemInspections();
    await refreshCo2Inspections();
    await refreshInspectionAttachments();
    if (currentUser) {
      await refreshServerWorkspace(currentUser, authOperationGeneration.current);
    }
  }

  async function handleCloseJob(job: InspectionJob) {
    if (!canUseServer || !currentUser) {
      setJobMessage("Reconnect and verify your session before completing this job");
      return;
    }
    setJobLoading(true);
    setJobMessage("Verifying accepted inspection work with the server");
    try {
      const result = await closeInspectionJob(job.id);
      setJobs((current) => current.map((candidate) => candidate.id === job.id
        ? { ...candidate, status: result.completion.jobStatus, completion: result.completion }
        : candidate));
      setJobMessage(result.outcome === "incomplete"
        ? "Job remains open because required inspection work is incomplete"
        : result.outcome === "already-completed"
          ? "Job was already completed"
          : "Job completed successfully");
      await refreshServerWorkspace(currentUser, authOperationGeneration.current);
    } catch (error) {
      setJobMessage(error instanceof Error ? error.message : "Job could not be completed");
    } finally {
      setJobLoading(false);
    }
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
        await waitForSyncIdle();
        await waitForWorkspaceIdle();
        return login(username, password);
      });
      if (!isCurrentAuthOperation(operation) || !user) return;
      // A credential login starts a fresh Manager session before any verified render, even when the
      // previous identity ended without a logout (expired session, reload).
      clearManagerSession();
      claimManagerSession(user.id);
      const authorityReplacement = prepareVerifiedAuthority(user, true);
      await prepareLocalWorkspace(user);
      const lastVerifiedAt = await storeVerifiedIdentity(user);
      if (!isCurrentAuthOperation(operation)) return;
      installVerifiedAuthority(user, authorityReplacement);
      setAuthState({ status: "verified", user, lastVerifiedAt });
      if (!selectedExperience || !productRoleMatches(selectedExperience, user)) {
        setSelectedExperience(undefined);
        setRoleMessage(selectedExperience === "manager"
          ? "This account is signed in, but it does not have Manager access. Choose Technician to continue."
          : selectedExperience === "technician"
            ? "This account is signed in, but it does not have Technician access. Choose Manager to continue."
            : "Choose the appropriate role to continue.");
        navigate({ name: "jobs" });
        return;
      }
      if (selectedExperience === "manager") {
        navigate({ name: "manager-home" });
        return;
      }
      // The job list is already rendered while the workspace refreshes. If the user
      // navigated meanwhile (e.g. opened an accepted detail), keep their route.
      const landingHash = window.location.hash;
      await loadCachedJobs(user.id, operation);
      await refreshServerWorkspace(user, operation);
      if (window.location.hash === landingHash) navigate({ name: "jobs" });
    } finally {
      finishExplicitAuthOperation(operation);
    }
  }

  async function handleLogout() {
    // Unsaved Manager wording edits are asked about before signing out, never dropped silently.
    if (!confirmManagerLeave()) return;
    const operation = beginExplicitAuthOperation();
    try {
      clearManagerSession();
      revokeVerifiedAuthority();
      setAuthState({ status: "logged-out", message: "Signed out locally" });
      setSelectedExperience(undefined);
      setRoleMessage("");
      navigate({ name: "jobs" });
      await waitForSyncIdle();
      await waitForWorkspaceIdle();
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
    const finishLocalWork = beginWorkspaceActivity();
    try {

    const record = await saveInspectionDraft(values, activeInspectionDraft);
    setActiveInspectionDraft(record);
    await refreshInspections();

    } finally { finishLocalWork(); }
  }

  async function handleSubmitLocalInspection(values: InspectionFormValues) {
    const finishLocalWork = beginWorkspaceActivity();
    try {

    await submitLocalInspection(values, activeInspectionDraft);
    setActiveInspectionDraft(undefined);
    await refreshInspections();
    setInspectionSyncMessage("Inspection is pending sync");

    } finally { finishLocalWork(); }
  }

  async function handleInspectionSync() {
    if (!canUseServer) {
      setInspectionSyncMessage("Reconnect to verify your session before syncing");
      return;
    }
    const result = await syncPendingTestRecords(currentUser?.id);
    setInspectionSyncMessage(result.message);
    await refreshInspections();
    await refreshRecords();
    await refreshMasterSystemInspections();
    await refreshCo2Inspections();
    await refreshInspectionAttachments();
  }

  async function handleOpenHoseReel(job: InspectionJob, system: JobSystemSnapshot) {
    const finishLocalWork = beginWorkspaceActivity();
    try {

    try {
      if (authState.status === "verified") {
        const accepted = await findServerMasterSystemInspection(job.id, "hose_reel");
        if (accepted) { navigate({ name: "inspection", clientUuid: accepted.clientUuid }); return; }
      }
      if (job.status === "closed") throw new Error("This service visit is complete and read-only. Reconnect to view the completed inspection.");
      const catalog = await getCachedInspectionCatalog();
      if (!catalog) throw new Error("Hose Reel reference data is not cached yet. Refresh jobs online first.");
      const record = await getOrCreateHoseReelInspection(job, system, catalog, inspectionCreatorUser(currentUser));
      setActiveHoseReel(record);
      await refreshMasterSystemInspections();
      navigate({ name: "inspection", clientUuid: record.clientUuid });
    } catch (error) {
      setJobMessage(error instanceof Error ? error.message : "Hose Reel inspection could not be opened");
    }

    } finally { finishLocalWork(); }
  }

  async function handleOpenCo2(job: InspectionJob, system: JobSystemSnapshot) {
    const finishLocalWork = beginWorkspaceActivity();
    try {

    try {
      if (job.status === "closed") {
        if (!canUseServer) throw new Error("This service visit is complete and read-only. Reconnect to view completed location details.");
        navigate({ name: "system", jobId: job.id, systemKey: system.systemKey });
        return;
      }
      const catalog = await getCachedInspectionCatalog();
      if (!catalog) throw new Error("CO2 reference data is not cached yet. Refresh jobs online first.");
      await initializeCo2InspectionGroup(job, system, catalog, inspectionCreatorUser(currentUser));
      await refreshCo2Inspections();
      navigate({ name: "system", jobId: job.id, systemKey: system.systemKey });
    } catch (error) {
      setJobMessage(error instanceof Error ? error.message : "CO2 locations could not be opened");
    }

    } finally { finishLocalWork(); }
  }

  async function handleOpenAutomaticSprinkler(job: InspectionJob, system: JobSystemSnapshot) {
    const finishLocalWork = beginWorkspaceActivity();
    try {

    try {
      if (job.status === "closed" && !canUseServer) throw new Error("This service visit is complete and read-only. Reconnect to view the completed inspection.");
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
        setServerAcceptedAutomaticSprinklerUuid(target.clientUuid);
        navigate({ name: "sprinkler-form", clientUuid: target.clientUuid });
        return;
      }
      if (job.status === "closed") throw new Error("Completed jobs cannot create a new Automatic Sprinkler Draft");
      setServerAcceptedAutomaticSprinklerUuid(undefined);
      setActiveAutomaticSprinkler(target.record);
      await refreshMasterSystemInspections();
      navigate({ name: "sprinkler-form", clientUuid: target.record.clientUuid });
    } catch (error) {
      setJobMessage(error instanceof Error ? error.message : "Automatic Sprinkler inspection could not be opened");
    }

    } finally { finishLocalWork(); }
  }
  async function handleOpenDryWetRiser(job: InspectionJob, system: JobSystemSnapshot) {
    const finishLocalWork = beginWorkspaceActivity();
    try {
 try { if(job.status==="closed"&&authState.status!=="verified"){setJobMessage("This service visit is complete and read-only. Reconnect to view the completed inspection.");return;} const target = await resolveDryWetRiserOpenTarget(job, system, await getCachedInspectionCatalog(), currentUser, authState.status === "verified" ? "verified" : "offline-unverified"); if (target.kind === "server") { setServerAcceptedDryWetRiserUuid(target.clientUuid); navigate({ name: "riser-form", clientUuid: target.clientUuid }); return; } if (target.kind === "not-cached") { setJobMessage("This Dry/Wet Riser inspection is not cached on this device."); return; } if (target.kind === "server-unavailable") { setJobMessage(target.message); return; } if(job.status==="closed"){setJobMessage("This service visit is complete and read-only.");return;} setServerAcceptedDryWetRiserUuid(undefined); setActiveDryWetRiser(target.record); await refreshMasterSystemInspections(); navigate({ name: "riser-form", clientUuid: target.record.clientUuid }); } catch (error) { setJobMessage(error instanceof Error ? error.message : "Dry/Wet Riser could not be opened"); }
    } finally { finishLocalWork(); }
  }
  async function handleOpenFireAlarm(job: InspectionJob, system: JobSystemSnapshot) {
    const finishLocalWork = beginWorkspaceActivity();
    try {
 try { if(job.status==="closed"&&authState.status!=="verified"){setJobMessage("This service visit is complete and read-only. Reconnect to view the completed inspection.");return;} const target = await resolveFireAlarmOpenTarget(job, system, await getCachedInspectionCatalog(), currentUser, authState.status === "verified" ? "verified" : "offline-unverified"); if (target.kind === "not-cached") { setJobMessage("This completed Fire Alarm inspection is not available on this device. Reconnect to view it."); return; } if (target.kind === "server-unavailable") { setJobMessage(target.message); return; } if (target.kind === "local" && job.status === "closed") { setJobMessage("This service visit is complete and read-only."); return; } if (target.kind === "local") { setActiveFireAlarm(target.record); await refreshMasterSystemInspections(); } navigate({ name: "fire-alarm-form", jobId: job.id, clientUuid: target.kind === "local" ? target.record.clientUuid : target.clientUuid }); } catch (error) { setJobMessage(error instanceof Error ? error.message : "Fire Alarm inspection could not be opened"); }
    } finally { finishLocalWork(); }
  }
  async function handleOpenHydrant(job:InspectionJob,system:JobSystemSnapshot){
    const finishLocalWork = beginWorkspaceActivity();
    try {
try{if(job.status==="closed"&&authState.status!=="verified"){setJobMessage("This service visit is complete and read-only. Reconnect to view the completed inspection.");return;}const target=await resolveHydrantOpenTarget(job,system,currentUser,authState.status==="verified"?"verified":"offline-unverified",getCachedInspectionCatalog);if(target.kind==="server"){setServerAcceptedHydrantUuid(target.clientUuid);navigate({name:"hydrant-form",clientUuid:target.clientUuid});return;}if(target.kind==="not-cached"){setJobMessage("This Hydrant inspection is not cached on this device. Reconnect to confirm inspection status before creating a draft.");return;}if(target.kind==="server-unavailable"){setJobMessage(target.message);return;}if(job.status==="closed"){setJobMessage("This service visit is complete and read-only.");return;}setServerAcceptedHydrantUuid(undefined);setActiveHydrant(target.record);await refreshMasterSystemInspections();navigate({name:"hydrant-form",clientUuid:target.record.clientUuid});}catch(error){setJobMessage(error instanceof Error?error.message:"Hydrant inspection could not be opened");}
    } finally { finishLocalWork(); }
  }
  async function handleSaveHydrant(responses:HydrantResponses){
    const finishLocalWork = beginWorkspaceActivity();
    try {
if(activeHydrant){setActiveHydrant(await saveHydrantDraft(activeHydrant,responses));await refreshMasterSystemInspections();}
    } finally { finishLocalWork(); }
  }
  async function handleSubmitHydrant(responses:HydrantResponses){
    const finishLocalWork = beginWorkspaceActivity();
    try {
if(activeHydrant){setActiveHydrant(await submitLocalHydrant(activeHydrant,responses));await refreshMasterSystemInspections();}
    } finally { finishLocalWork(); }
  }
  async function handleEditFailedHydrant(){
    const finishLocalWork = beginWorkspaceActivity();
    try {
if(activeHydrant){setActiveHydrant(await returnFailedHydrantToDraft(activeHydrant));await refreshMasterSystemInspections();}
    } finally { finishLocalWork(); }
  }
  async function handleOpenSmokeVentilation(job:InspectionJob,system:JobSystemSnapshot){
    const finishLocalWork = beginWorkspaceActivity();
    try {
try{if(job.status==="closed"&&authState.status!=="verified"){setJobMessage("This service visit is complete and read-only. Reconnect to view the completed inspection.");return;}const target=await resolveSmokeVentilationOpenTarget(job,system,currentUser,authState.status==="verified"?"verified":"offline-unverified",getCachedInspectionCatalog);if(target.kind==="server"){setServerAcceptedSmokeVentilationUuid(target.clientUuid);navigate({name:"smoke-ventilation-form",clientUuid:target.clientUuid});return;}if(target.kind==="not-cached"){setJobMessage("This Smoke Ventilation inspection is not cached on this device. Reconnect to confirm inspection status before creating a draft.");return;}if(target.kind==="server-unavailable"){setJobMessage(target.message);return;}if(job.status==="closed"){setJobMessage("This service visit is complete and read-only.");return;}setServerAcceptedSmokeVentilationUuid(undefined);setActiveSmokeVentilation(target.record);await refreshMasterSystemInspections();navigate({name:"smoke-ventilation-form",clientUuid:target.record.clientUuid});}catch(error){setJobMessage(error instanceof Error?error.message:"Smoke Ventilation inspection could not be opened");}
    } finally { finishLocalWork(); }
  }
  async function handleSaveSmokeVentilation(responses:SmokeVentilationResponses){
    const finishLocalWork = beginWorkspaceActivity();
    try {
if(activeSmokeVentilation){setActiveSmokeVentilation(await saveSmokeVentilationDraft(activeSmokeVentilation,responses));await refreshMasterSystemInspections();}
    } finally { finishLocalWork(); }
  }
  async function handleSubmitSmokeVentilation(responses:SmokeVentilationResponses){
    const finishLocalWork = beginWorkspaceActivity();
    try {
if(activeSmokeVentilation){setActiveSmokeVentilation(await submitLocalSmokeVentilation(activeSmokeVentilation,responses));await refreshMasterSystemInspections();}
    } finally { finishLocalWork(); }
  }
  async function handleEditFailedSmokeVentilation(){
    const finishLocalWork = beginWorkspaceActivity();
    try {
if(activeSmokeVentilation){setActiveSmokeVentilation(await returnFailedSmokeVentilationToDraft(activeSmokeVentilation));await refreshMasterSystemInspections();}
    } finally { finishLocalWork(); }
  }
  async function handleOpenFireIntercom(job:InspectionJob,system:JobSystemSnapshot){
    const finishLocalWork = beginWorkspaceActivity();
    try {
try{if(job.status==="closed"&&authState.status!=="verified"){setJobMessage("This service visit is complete and read-only. Reconnect to view the completed inspection.");return;}const target=await resolveFireIntercomOpenTarget(job,system,currentUser,authState.status==="verified"?"verified":"offline-unverified",getCachedInspectionCatalog);if(target.kind==="server"){setServerAcceptedFireIntercomUuid(target.clientUuid);navigate({name:"fire-intercom-form",clientUuid:target.clientUuid});return;}if(target.kind==="not-cached"){setJobMessage("This Fire Intercom inspection is not cached on this device. Reconnect to confirm inspection status before creating a draft.");return;}if(target.kind==="server-unavailable"){setJobMessage(target.message);return;}if(job.status==="closed"){setJobMessage("This service visit is complete and read-only.");return;}setServerAcceptedFireIntercomUuid(undefined);setActiveFireIntercom(target.record);await refreshMasterSystemInspections();navigate({name:"fire-intercom-form",clientUuid:target.record.clientUuid});}catch(error){setJobMessage(error instanceof Error?error.message:"Fire Intercom inspection could not be opened");}
    } finally { finishLocalWork(); }
  }
  async function handleSaveFireIntercom(responses:FireIntercomResponses){
    const finishLocalWork = beginWorkspaceActivity();
    try {
if(activeFireIntercom){setActiveFireIntercom(await saveFireIntercomDraft(activeFireIntercom,responses));await refreshMasterSystemInspections();}
    } finally { finishLocalWork(); }
  }
  async function handleSubmitFireIntercom(responses:FireIntercomResponses){
    const finishLocalWork = beginWorkspaceActivity();
    try {
if(activeFireIntercom){setActiveFireIntercom(await submitLocalFireIntercom(activeFireIntercom,responses));await refreshMasterSystemInspections();}
    } finally { finishLocalWork(); }
  }
  async function handleEditFailedFireIntercom(){
    const finishLocalWork = beginWorkspaceActivity();
    try {
if(activeFireIntercom){setActiveFireIntercom(await returnFailedFireIntercomToDraft(activeFireIntercom));await refreshMasterSystemInspections();}
    } finally { finishLocalWork(); }
  }
  async function handleOpenPortableFireExtinguisher(job:InspectionJob,system:JobSystemSnapshot){
    const finishLocalWork = beginWorkspaceActivity();
    try {
try{if(job.status==="closed"&&authState.status!=="verified"){setJobMessage("This service visit is complete and read-only. Reconnect to view the completed inspection.");return;}const target=await resolvePortableOpenTarget(job,system,currentUser,authState.status==="verified"?"verified":"offline-unverified",getCachedInspectionCatalog);if(target.kind==="server"){setServerAcceptedPortableUuid(target.clientUuid);navigate({name:"portable-fire-extinguisher-form",clientUuid:target.clientUuid});return;}if(target.kind==="not-cached"){setJobMessage("This Portable Fire Extinguisher inspection is not cached on this device. Reconnect to confirm inspection status before creating a draft.");return;}if(target.kind==="server-unavailable"){setJobMessage(target.message);return;}if(job.status==="closed"){setJobMessage("This service visit is complete and read-only.");return;}setServerAcceptedPortableUuid(undefined);setActivePortable(target.record);await refreshMasterSystemInspections();navigate({name:"portable-fire-extinguisher-form",clientUuid:target.record.clientUuid});}catch(error){setJobMessage(error instanceof Error?error.message:"Portable Fire Extinguisher inspection could not be opened");}
    } finally { finishLocalWork(); }
  }
  async function handleSavePortable(responses:PortableResponses){
    const finishLocalWork = beginWorkspaceActivity();
    try {
if(activePortable){setActivePortable(await savePortableDraft(activePortable,responses));await refreshMasterSystemInspections();}
    } finally { finishLocalWork(); }
  }
  async function handleSubmitPortable(responses:PortableResponses){
    const finishLocalWork = beginWorkspaceActivity();
    try {
if(activePortable){setActivePortable(await submitLocalPortable(activePortable,responses));await refreshMasterSystemInspections();}
    } finally { finishLocalWork(); }
  }
  async function handleEditFailedPortable(){
    const finishLocalWork = beginWorkspaceActivity();
    try {
if(activePortable){setActivePortable(await returnFailedPortableToDraft(activePortable));await refreshMasterSystemInspections();}
    } finally { finishLocalWork(); }
  }
  async function handleSaveFireAlarm(responses: FireAlarmResponses) {
    const finishLocalWork = beginWorkspaceActivity();
    try {
 if (!activeFireAlarm) return; try { setActiveFireAlarm(await saveFireAlarmDraft(activeFireAlarm, responses)); await refreshMasterSystemInspections(); } catch (error) { if (error instanceof Error && error.message.includes("changed elsewhere")) await refreshMasterSystemInspections(); throw error; }
    } finally { finishLocalWork(); }
  }
  async function handleSubmitFireAlarm(responses: FireAlarmResponses) {
    const finishLocalWork = beginWorkspaceActivity();
    try {
 if (!activeFireAlarm) return; try { setActiveFireAlarm(await submitFireAlarmLocal(activeFireAlarm, responses)); await refreshMasterSystemInspections(); } catch (error) { if (error instanceof Error && error.message.includes("changed elsewhere")) await refreshMasterSystemInspections(); throw error; }
    } finally { finishLocalWork(); }
  }
  async function handleEditFailedFireAlarm() {
    const finishLocalWork = beginWorkspaceActivity();
    try {
 if (!activeFireAlarm) return; try { setActiveFireAlarm(await returnFailedFireAlarmToDraft(activeFireAlarm)); await refreshMasterSystemInspections(); } catch (error) { if (error instanceof Error && error.message.includes("changed elsewhere")) await refreshMasterSystemInspections(); throw error; }
    } finally { finishLocalWork(); }
  }
  async function handleSaveDryWetRiser(responses: DryWetRiserResponses) {
    const finishLocalWork = beginWorkspaceActivity();
    try {
 if (!activeDryWetRiser) return; setActiveDryWetRiser(await saveDryWetRiserDraft(activeDryWetRiser, responses)); await refreshMasterSystemInspections();
    } finally { finishLocalWork(); }
  }
  async function handleSubmitDryWetRiser(responses: DryWetRiserResponses) {
    const finishLocalWork = beginWorkspaceActivity();
    try {
 if (!activeDryWetRiser) return; setActiveDryWetRiser(await submitLocalDryWetRiser(activeDryWetRiser, responses)); await refreshMasterSystemInspections();
    } finally { finishLocalWork(); }
  }
  async function handleEditFailedDryWetRiser() {
    const finishLocalWork = beginWorkspaceActivity();
    try {
 if (!activeDryWetRiser) return; setActiveDryWetRiser(await returnFailedDryWetRiserToDraft(activeDryWetRiser)); await refreshMasterSystemInspections();
    } finally { finishLocalWork(); }
  }

  async function handleSaveCo2Draft(responses: Co2Responses) {
    const finishLocalWork = beginWorkspaceActivity();
    try {

    if (!activeCo2Form) return;
    setActiveCo2Form(await saveCo2Draft(activeCo2Form, responses));
    await refreshCo2Inspections();

    } finally { finishLocalWork(); }
  }

  async function handleSubmitCo2(responses: Co2Responses) {
    const finishLocalWork = beginWorkspaceActivity();
    try {

    if (!activeCo2Form) return;
    setActiveCo2Form(await submitLocalCo2(activeCo2Form, responses));
    await refreshCo2Inspections();

    } finally { finishLocalWork(); }
  }

  async function handleEditFailedCo2() {
    const finishLocalWork = beginWorkspaceActivity();
    try {

    if (!activeCo2Form) return;
    setActiveCo2Form(await returnFailedCo2ToDraft(activeCo2Form));
    await refreshCo2Inspections();

    } finally { finishLocalWork(); }
  }

  async function handleSaveHoseReelDraft(responses: HoseReelResponses) {
    const finishLocalWork = beginWorkspaceActivity();
    try {

    if (!activeHoseReel) return;
    const record = await saveHoseReelDraft(activeHoseReel, responses);
    setActiveHoseReel(record);
    await refreshMasterSystemInspections();

    } finally { finishLocalWork(); }
  }

  async function handleSubmitHoseReel(responses: HoseReelResponses) {
    const finishLocalWork = beginWorkspaceActivity();
    try {

    if (!activeHoseReel) return;
    const record = await submitLocalHoseReel(activeHoseReel, responses);
    setActiveHoseReel(record);
    await refreshMasterSystemInspections();

    } finally { finishLocalWork(); }
  }

  async function handleEditFailedHoseReel() {
    const finishLocalWork = beginWorkspaceActivity();
    try {

    if (!activeHoseReel) return;
    const record = await editFailedHoseReel(activeHoseReel);
    setActiveHoseReel(record);
    await refreshMasterSystemInspections();

    } finally { finishLocalWork(); }
  }

  async function handleSaveAutomaticSprinklerDraft(responses: AutomaticSprinklerResponses) {
    const finishLocalWork = beginWorkspaceActivity();
    try {

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

    } finally { finishLocalWork(); }
  }

  async function handleSubmitAutomaticSprinkler(responses: AutomaticSprinklerResponses) {
    const finishLocalWork = beginWorkspaceActivity();
    try {

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

    } finally { finishLocalWork(); }
  }

  async function handleEditFailedAutomaticSprinkler() {
    const finishLocalWork = beginWorkspaceActivity();
    try {

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

    } finally { finishLocalWork(); }
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
  const headerUser = authState.status === "verified" || authState.status === "offline-unverified" || authState.status === "verifying" || authState.status === "online-unavailable"
    ? authState.user
    : undefined;
  const connectionState = authState.status === "verified"
    ? { className: "online", label: "Online" }
    : authState.status === "online-unavailable"
      ? { className: "unavailable", label: "Server unavailable" }
      : authState.status === "verifying" || connectivityRecoveryActive
        ? { className: "reconnecting", label: "Reconnecting" }
        : { className: "offline", label: "Offline" };
  const inspectionStatuses = [
    ...inspections.map((record) => record.syncStatus),
    ...masterSystemInspections.map((record) => record.syncStatus),
    ...masterSystemFormInstances.map((record) => record.syncStatus)
  ];
  const waitingToSyncCount = inspectionStatuses.filter((status) => status === "Pending").length;
  const syncIsRunning = inspectionStatuses.some((status) => status === "Syncing")
    || inspectionAttachments.some((attachment) => attachment.syncStatus === "Uploading");
  const syncNeedsAttention = inspectionStatuses.some((status) => status === "Failed" || status === "Conflict")
    || inspectionAttachments.some((attachment) => attachment.syncStatus === "Failed" || attachment.syncStatus === "Conflict");
  const syncSummary = syncNeedsAttention
    ? "Sync needs attention"
    : syncIsRunning
      ? "Syncing\u2026"
      : waitingToSyncCount > 0
        ? `${waitingToSyncCount} ${waitingToSyncCount === 1 ? "inspection" : "inspections"} waiting to sync`
        : "All submitted changes synced";
  const safeToUpdate = isSafeForAppUpdate(route);

  return (
    <main className="app-shell">
      <header className="app-header" aria-labelledby="app-title">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">MFE</span>
          <div>
            <p className="eyebrow">MFE Services Sdn. Bhd.</p>
            <h1 id="app-title">{managerExperience || selectedExperience === "manager" ? "Field Service Management" : "Field Service Inspections"}</h1>
            <span className="app-build" aria-label={`Application build ${APP_BUILD_ID}`}>Support build {APP_BUILD_ID}</span>
          </div>
        </div>
        {headerUser ? <div className="header-utilities">
          <div className="connection-summary" aria-live="polite">
            <span className={`connection-state connection-state--${connectionState.className}`}>
              <i aria-hidden="true" />{connectionState.label}
            </span>
            <span className={syncNeedsAttention ? "sync-summary sync-summary--attention" : "sync-summary"}>{syncSummary}</span>
          </div>
          <div className="app-account">
            <span className="app-account-name">{headerUser.username}</span>
            {route.name === "development" ? <button type="button" onClick={() => navigate({ name: "jobs" })}>Service Jobs</button> : null}
            {authState.status === "offline-unverified" ? <button type="button" onClick={() => void revalidateAuthentication()}>Reconnect</button> : null}
            <button type="button" onClick={() => void handleLogout()}>Sign out</button>
          </div>
        </div> : null}
      </header>

      <PwaUpdateNotice
        updateAvailable={pwaUpdate.updateAvailable}
        reloadPending={pwaUpdate.reloadPending}
        updating={pwaUpdate.updating}
        safeToUpdate={safeToUpdate}
        onUpdate={pwaUpdate.requestUpdate}
      />

      {!selectedExperience || (authenticated && !technicianExperience && !managerExperience) ? (
        <section className="login-view workspace" aria-label="Choose sign-in role">
          <RoleSelection message={roleMessage || (selectedExperience === "manager" && authState.status === "offline-unverified" ? "Reconnect to verify Manager access. Manager operations are not available offline." : "")} onSelect={selectExperience} />
        </section>
      ) : authState.status === "restoring" || authState.status === "verifying" || authState.status === "online-unavailable" ? (
        <section className="login-view workspace">
          <AuthStatus state={authState} onLogout={handleLogout} onRevalidate={async () => { await revalidateAuthentication(); }} />
        </section>
      ) : shouldRenderLogin(authState) ? (
        <section className="login-view workspace" aria-label="Server sign-in">
          <AuthStatus state={authState} onLogout={handleLogout} onRevalidate={async () => { await revalidateAuthentication(); }} />
          <LoginForm roleLabel={selectedExperience === "manager" ? "Manager" : "Technician"} onLogin={handleLogin} />
        </section>
      ) : null}

      {technicianExperience ? (
        <>
          {route.name === "development" && currentUser?.role === "admin" ? (
            <section className="development-tools" aria-labelledby="development-tools-title">
              <header className="development-header">
                <p className="eyebrow">For Development / Testing Only</p>
                <h2 id="development-tools-title">Development / Regression Tools</h2>
                <p>Legacy fixtures and server verification controls are isolated from technician field work.</p>
                <dl>
                  <div><dt>Local database</dt><dd>{databaseReady ? "Ready" : "Starting"}</dd></div>
                  <div><dt>API health</dt><dd>{apiHealth}</dd></div>
                </dl>
                <button type="button" className="secondary-command" onClick={checkApiHealth}>Check API</button>
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
            hoseReelAuthorityState === "server" && serverHoseReel ? <ServerHoseReelView inspection={serverHoseReel} onBack={()=>navigate({name:"job",jobId:serverHoseReel.jobId})}/> : hoseReelAuthorityState === "local" && activeHoseReel && !jobIsCompleted(activeHoseReel.jobId) ? (
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
                <p>{hoseReelAuthorityState==="loading"?"Checking inspection completion before displaying local data.":hoseReelRouteMessage||"This inspection is not available in local device storage."}</p>
                <button type="button" className="secondary-command" onClick={() => navigate({ name: "jobs" })}>Back to Jobs</button>
              </section>
            )
          ) : route.name === "sprinkler-form" ? (
            activeAutomaticSprinkler && !jobIsCompleted(activeAutomaticSprinkler.jobId) ? (
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
                        ? "No inspection is available for this record."
                        : sprinklerRouteMessage || "The server inspection is currently unavailable."
                }</p>
                <button type="button" className="secondary-command" onClick={() => navigate({ name: "jobs" })}>Back to Jobs</button>
              </section>
            )
          ) : route.name === "riser-form" ? (
            activeDryWetRiser && !jobIsCompleted(activeDryWetRiser.jobId) ? <DryWetRiserInspectionForm record={activeDryWetRiser} onBack={() => navigate({ name: "job", jobId: activeDryWetRiser.jobId })} onSaveDraft={handleSaveDryWetRiser} onSubmitLocal={handleSubmitDryWetRiser} onEditFailed={handleEditFailedDryWetRiser} /> : serverDryWetRiser ? <ServerDryWetRiserView inspection={serverDryWetRiser} onBack={() => navigate({ name: "job", jobId: serverDryWetRiser.jobId })} /> : <section className="workspace"><h2>Dry/Wet Riser inspection unavailable</h2><p>{activeDryWetRiser && jobIsCompleted(activeDryWetRiser.jobId) ? "This service visit is complete and read-only. Reconnect to view the completed inspection." : riserRouteState === "loading" ? "Loading the inspection." : riserRouteState === "not-cached" ? "This inspection is not cached on this device." : riserRouteState === "signed-out" ? "Sign in to view this inspection." : riserRouteState === "not-found" ? "No inspection is available for this record." : riserRouteMessage || "The server inspection is currently unavailable."}</p><button type="button" className="secondary-command" onClick={() => navigate({ name: "jobs" })}>Back to Jobs</button></section>
          ) : route.name === "fire-alarm-form" ? (
            activeFireAlarm && !jobIsCompleted(activeFireAlarm.jobId) ? <FireAlarmInspectionForm record={activeFireAlarm} onBack={() => navigate({ name: "job", jobId: activeFireAlarm.jobId })} onSaveDraft={handleSaveFireAlarm} onSubmitLocal={handleSubmitFireAlarm} onEditFailed={handleEditFailedFireAlarm} onRecordChange={(saved) => { setActiveFireAlarm(saved); void refreshMasterSystemInspections(); }} /> : serverFireAlarm ? <FireAlarmAcceptedDetail inspection={serverFireAlarm} onBack={()=>navigate({name:"job",jobId:serverFireAlarm.jobId})}/> : <section className="workspace"><h2>Fire Alarm inspection unavailable</h2><p>{activeFireAlarm&&jobIsCompleted(activeFireAlarm.jobId)?"This service visit is complete and read-only. Reconnect to view the completed inspection.":fireAlarmRouteState==="loading"?"Loading completed inspection detail.":fireAlarmRouteState==="not-cached"?"Completed inspection detail is not available on this device. Reconnect to view it.":fireAlarmRouteState==="signed-out"?"Sign in to view this completed inspection.":fireAlarmRouteState==="inconsistent"?fireAlarmRouteMessage||"The completed inspection could not be verified.":fireAlarmRouteState==="invalid"?fireAlarmRouteMessage||"The completed inspection cannot be displayed.":fireAlarmRouteMessage||"The server detail is currently unavailable."}</p><button type="button" className="secondary-command" onClick={() => navigate({ name: "jobs" })}>Back to Jobs</button></section>
          ) : route.name === "wet-chemical-form" ? (
            wetChemicalAuthorityState === "server" && serverWetChemical ? <ServerWetChemicalView inspection={serverWetChemical} onBack={() => navigate({ name: "job", jobId: serverWetChemical.jobId })} /> : wetChemicalAuthorityState === "loading" ? <section className="workspace"><h2>Loading authoritative Wet Chemical inspection</h2><p>Checking inspection completion before displaying editable data.</p></section> : wetChemicalAuthorityState === "local" && activeCo2Form && activeCo2Form.systemKey === "wet_chemical" && !jobIsCompleted(activeCo2Form.jobId) ? <Co2InspectionForm record={activeCo2Form} onBack={() => navigate({ name: "system", jobId: activeCo2Form.jobId, systemKey: activeCo2Form.systemKey })} onSaveDraft={handleSaveCo2Draft} onSubmitLocal={handleSubmitCo2} onEditFailed={handleEditFailedCo2} /> : <section className="workspace"><h2>Wet Chemical inspection unavailable</h2><p>{activeCo2Form&&jobIsCompleted(activeCo2Form.jobId)?"This service visit is complete and read-only. Reconnect to view the completed inspection.":wetChemicalRouteMessage || "This inspection is not available in local device storage."}</p><button type="button" className="secondary-command" onClick={() => navigate({ name: "jobs" })}>Back to Jobs</button></section>
          ) : route.name === "co2-form" ? (
            co2AuthorityState === "server" && serverCo2 ? <ServerCo2View inspection={serverCo2} onBack={()=>navigate({name:"system",jobId:serverCo2.jobId,systemKey:"co2_fire_extinguisher"})}/> : co2AuthorityState === "local" && activeCo2Form && !jobIsCompleted(activeCo2Form.jobId) ? (
              <Co2InspectionForm
                record={activeCo2Form}
                onBack={() => navigate({ name: "system", jobId: activeCo2Form.jobId, systemKey: activeCo2Form.systemKey })}
                onSaveDraft={handleSaveCo2Draft}
                onSubmitLocal={handleSubmitCo2}
                onEditFailed={handleEditFailedCo2}
              />
            ) : (
              <section className="workspace"><h2>CO2 form unavailable</h2><p>{co2AuthorityState==="loading"?"Checking inspection completion for this configured location.":co2RouteMessage||"This form is not available in local device storage."}</p><button type="button" className="secondary-command" onClick={() => navigate({ name: "jobs" })}>Back to Jobs</button></section>
            )
          ) : route.name === "hydrant-form" ? (
            mayRenderLocalHydrant && activeHydrant && !jobIsCompleted(activeHydrant.jobId) ? <HydrantInspectionForm record={activeHydrant} onBack={()=>navigate({name:"job",jobId:activeHydrant.jobId})} onSaveDraft={handleSaveHydrant} onSubmitLocal={handleSubmitHydrant} onEditFailed={handleEditFailedHydrant} /> : serverHydrant ? <ServerHydrantView inspection={serverHydrant} onBack={()=>navigate({name:"job",jobId:serverHydrant.jobId})} /> : <section className="workspace"><h2>Hydrant inspection unavailable</h2><p>{activeHydrant&&jobIsCompleted(activeHydrant.jobId)?"This service visit is complete and read-only. Reconnect to view the completed inspection.":hydrantRouteState==="loading"||authState.status==="verified"&&!hydrantAuthorityResolution&&hydrantRouteState==="idle"?"Loading completed Hydrant inspection.":hydrantRouteState==="not-cached"?"This inspection is not cached on this device. Reconnect to view the completed inspection.":hydrantRouteMessage||"The completed Hydrant inspection is currently unavailable."}</p><button type="button" className="secondary-command" onClick={()=>navigate({name:"jobs"})}>Back to Jobs</button></section>
          ) : route.name === "smoke-ventilation-form" ? (
            mayRenderLocalSmokeVentilation && activeSmokeVentilation && !jobIsCompleted(activeSmokeVentilation.jobId) ? <SmokeVentilationInspectionForm record={activeSmokeVentilation} onBack={()=>navigate({name:"job",jobId:activeSmokeVentilation.jobId})} onSaveDraft={handleSaveSmokeVentilation} onSubmitLocal={handleSubmitSmokeVentilation} onEditFailed={handleEditFailedSmokeVentilation} /> : serverSmokeVentilation ? <ServerSmokeVentilationView inspection={serverSmokeVentilation} onBack={()=>navigate({name:"job",jobId:serverSmokeVentilation.jobId})} /> : <section className="workspace"><h2>Smoke Ventilation inspection unavailable</h2><p>{activeSmokeVentilation&&jobIsCompleted(activeSmokeVentilation.jobId)?"This service visit is complete and read-only. Reconnect to view the completed inspection.":smokeVentilationRouteState==="loading"||authState.status==="verified"&&!smokeVentilationAuthorityResolution&&smokeVentilationRouteState==="idle"?"Loading completed Smoke Ventilation inspection.":smokeVentilationRouteState==="not-cached"?"This inspection is not cached on this device. Reconnect to view the completed inspection.":smokeVentilationRouteMessage||"The completed Smoke Ventilation inspection is currently unavailable."}</p><button type="button" className="secondary-command" onClick={()=>navigate({name:"jobs"})}>Back to Jobs</button></section>
          ) : route.name === "fire-intercom-form" ? (
            mayRenderLocalFireIntercom && activeFireIntercom && !jobIsCompleted(activeFireIntercom.jobId) ? <FireIntercomInspectionForm record={activeFireIntercom} onBack={()=>navigate({name:"job",jobId:activeFireIntercom.jobId})} onSaveDraft={handleSaveFireIntercom} onSubmitLocal={handleSubmitFireIntercom} onEditFailed={handleEditFailedFireIntercom} /> : serverFireIntercom ? <ServerFireIntercomView inspection={serverFireIntercom} onBack={()=>navigate({name:"job",jobId:serverFireIntercom.jobId})} /> : <section className="workspace"><h2>Fire Intercom inspection unavailable</h2><p>{activeFireIntercom&&jobIsCompleted(activeFireIntercom.jobId)?"This service visit is complete and read-only. Reconnect to view the completed inspection.":fireIntercomRouteState==="loading"||authState.status==="verified"&&!fireIntercomAuthorityResolution&&fireIntercomRouteState==="idle"?"Loading completed Fire Intercom inspection.":fireIntercomRouteState==="not-cached"?"This inspection is not cached on this device. Reconnect to view the completed inspection.":fireIntercomRouteMessage||"The completed Fire Intercom inspection is currently unavailable."}</p><button type="button" className="secondary-command" onClick={()=>navigate({name:"jobs"})}>Back to Jobs</button></section>
          ) : route.name === "portable-fire-extinguisher-form" ? (
            activePortable && !jobIsCompleted(activePortable.jobId) ? <PortableFireExtinguisherForm record={activePortable} onBack={()=>navigate({name:"job",jobId:activePortable.jobId})} onSaveDraft={handleSavePortable} onSubmitLocal={handleSubmitPortable} onEditFailed={handleEditFailedPortable} /> : serverPortable ? <ServerPortableFireExtinguisherView inspection={serverPortable} onBack={()=>navigate({name:"job",jobId:serverPortable.jobId})} /> : <section className="workspace"><h2>Portable Fire Extinguisher inspection unavailable</h2><p>{activePortable&&jobIsCompleted(activePortable.jobId)?"This service visit is complete and read-only. Reconnect to view the completed inspection.":portableRouteState==="loading"?"Loading completed Portable Fire Extinguisher inspection.":portableRouteState==="not-cached"?"This inspection is not cached on this device. Reconnect to view the completed inspection.":portableRouteMessage||"The completed Portable Fire Extinguisher inspection is currently unavailable."}</p><button type="button" className="secondary-command" onClick={()=>navigate({name:"jobs"})}>Back to Jobs</button></section>
          ) : route.name === "system" && (route.systemKey === "co2_fire_extinguisher" || route.systemKey === "wet_chemical") ? (
            (() => {
              const group = masterSystemInspectionGroups.find((candidate) => candidate.groupKey === `${route.jobId}:${route.systemKey}`);
              const completedJob = jobs.find((candidate) => candidate.id === route.jobId && candidate.status === "closed");
              const acceptedLocations = serverMasterSystemInspections.filter((summary) => summary.jobId === route.jobId && summary.systemKey === route.systemKey);
              return completedJob ? (
                <section className="workspace">
                  <button type="button" className="secondary-command" onClick={() => navigate({ name: "job", jobId: route.jobId })}>Back to Systems</button>
                  <h2>{route.systemKey === "wet_chemical" ? "Wet Chemical" : "CO2"} Completed Locations</h2>
                  {acceptedLocations.length > 0 ? <ul className="navigation-list">{acceptedLocations.map((summary) => <li key={summary.clientUuid}><button type="button" onClick={() => navigate({ name: route.systemKey === "wet_chemical" ? "wet-chemical-form" : "co2-form", clientUuid: summary.clientUuid })}><span>{summary.instanceKey}</span><span className="status-badge status-badge--complete">Inspection Complete</span></button></li>)}</ul> : <p>Reconnect and refresh to load completed location details.</p>}
                </section>
              ) : group ? (
                <Co2LocationList
                  group={group}
                  instances={masterSystemFormInstances.filter((instance) => instance.groupKey === group.groupKey)}
                  serverSummaries={serverMasterSystemInspections.filter((summary)=>summary.jobId===route.jobId&&summary.systemKey===route.systemKey)}
                  onBack={() => navigate({ name: "job", jobId: route.jobId })}
                  onOpen={(record) => navigate({ name: route.systemKey === "wet_chemical" ? "wet-chemical-form" : "co2-form", clientUuid: record.clientUuid })}
                />
              ) : (
                <section className="workspace"><h2>{route.systemKey === "wet_chemical" ? "Wet Chemical" : "CO2"} locations unavailable</h2><p>Open this system from the cached job to initialize its configured locations.</p><button type="button" className="secondary-command" onClick={() => navigate({ name: "job", jobId: route.jobId })}>Back to Systems</button></section>
              );
            })()
          ) : route.name === "new-service-visit" ? (
            <NewServiceVisit
              onCancel={() => navigate({ name: "jobs" })}
              onCreated={async (job) => {
                if (!currentUser || !canUseServer) {
                  throw new Error("Connect to the server to create a new service visit.");
                }
                try {
                  await acceptCanonicalNewServiceVisit(job, {
                    cacheCanonicalJob: (canonicalJob) => cacheCanonicalInspectionJob(currentUser.id, canonicalJob),
                    setJobs,
                    navigateToJob: (jobId) => navigate({ name: "job", jobId }),
                    reconcileWorkspace: () => refreshServerWorkspace(currentUser, authOperationGeneration.current)
                  });
                } catch {
                  throw new Error("Service visit was created on the server but could not be saved on this device. Reconnect and refresh My Service Jobs; do not create it again.");
                }
              }}
            />
          ) : route.name === "final-report" ? (
            <FinalReportView jobId={route.jobId} onBack={() => navigate({ name: "job", jobId: route.jobId })} />
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
              onRefresh={async () => {
                if (currentUser && canUseServer) {
                  await refreshServerWorkspace(currentUser, authOperationGeneration.current);
                }
              }}
              onSync={handleSync}
              onCloseJob={handleCloseJob}
              onViewFinalReport={(job) => navigate({ name: "final-report", jobId: job.id })}
              onNewServiceVisit={() => navigate({ name: "new-service-visit" })}
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
              onOpenSmokeVentilation={handleOpenSmokeVentilation}
              onOpenFireIntercom={handleOpenFireIntercom}
              onOpenPortableFireExtinguisher={handleOpenPortableFireExtinguisher}
            />
          )}
        </>
      ) : managerExperience ? (
        !route.name.startsWith("manager-") || (supervisorExperience && !supervisorAllowsRoute(route.name)) ? <p role="status">Opening Manager Home…</p>
        : route.name === "manager-home" ? <ManagerHome navigate={navigate} supervisor={supervisorExperience} />
        : route.name === "manager-technicians" ? <><button type="button" className="secondary-command" onClick={() => navigate({ name: "manager-home" })}>Back to Home</button><ManagerTechnicians key={authAuthorityGuard.current.currentGeneration} onAuthorityFailure={handleManagerRequestFailure} onOpen={(technician) => navigate({ name: "manager-technician", technicianId: String(technician.id) })} /></>
        : route.name === "manager-technician" ? (/^[1-9]\d{0,9}$/.test(route.technicianId)
          ? <ManagerTechnicianDetail
            key={`${authAuthorityGuard.current.currentGeneration}:${route.technicianId}`}
            technicianId={Number(route.technicianId)}
            onBack={() => navigate({ name: "manager-technicians" })}
            onViewServiceVisit={(jobId) => openManagerVisit("manager-service-visit", jobId, { hash: hashForRoute(route), label: "Back to Technician" })}
            onViewReport={(jobId) => openManagerVisit("manager-final-report", jobId, { hash: hashForRoute(route), label: "Back to Technician" })}
            onDownloadReport={downloadManagerReport}
            onAuthorityFailure={handleManagerRequestFailure}
          />
          : <><button type="button" className="secondary-command" onClick={() => navigate({ name: "manager-technicians" })}>Back to Technicians</button><p className="empty-state">Technician not found.</p></>)
        : route.name === "manager-upcoming-services" ? <><button type="button" className="secondary-command" onClick={() => navigate({ name: "manager-home" })}>Back to Home</button><ManagerUpcomingServices key={authAuthorityGuard.current.currentGeneration} onAuthorityFailure={handleManagerRequestFailure} /></>
        : route.name === "manager-customers" ? <><button type="button" className="secondary-command" onClick={() => navigate({ name: "manager-home" })}>Back to Home</button><ManagerCustomerConfiguration customers={managerCustomers} loading={managerLoading} message={managerMessage} onRefresh={refreshManagerVisits} onManage={(customer) => navigate({ name: "manager-customer", customerId: customer.customer.id })} onAuthorityFailure={handleManagerRequestFailure} /></>
        : route.name === "manager-services-done" ? <><button type="button" className="secondary-command" onClick={() => navigate({ name: "manager-home" })}>Back to Home</button><ManagerServicesDone key={authAuthorityGuard.current.currentGeneration} onAuthorityFailure={handleManagerRequestFailure} onViewServiceVisit={(jobId) => openManagerVisit("manager-service-visit", jobId, { hash: hashForRoute(route), label: "Back to Services Done" })} onViewReport={(jobId) => openManagerVisit("manager-final-report", jobId, { hash: hashForRoute(route), label: "Back to Services Done" })} onDownloadReport={downloadManagerReport} /></>
        : route.name === "manager-final-report" ? (
          <ManagerFinalReportView jobId={route.jobId} backLabel={managerReturn?.label} onBack={backFromManagerVisit} onAuthorizationFailure={handleManagerReportAuthorizationFailure} onServerUnavailable={(message) => failClosedManagerOperations(message, false)} />
        ) : route.name === "manager-customer-service" ? (
          managerCustomer && managerCustomer.customer.id === route.customerId
            ? <ManagerServiceEditor
              key={`${route.customerId}:${route.systemKey}`}
              customer={managerCustomer}
              systemKey={route.systemKey}
              onBack={() => navigate({ name: "manager-customer", customerId: route.customerId })}
              onSaved={(customer) => { setManagerCustomer(customer); setManagerCustomers((current) => current.map((value) => value.customer.id === customer.customer.id ? customer : value)); }}
              onAuthorityFailure={handleManagerRequestFailure}
            />
            : <><button type="button" className="secondary-command" onClick={() => navigate({ name: "manager-customer", customerId: route.customerId })}>Back to Customer</button>{managerMessage ? <p className="form-message" role="alert">{managerMessage}</p> : <p role="status">Loading service settings…</p>}</>
        ) : route.name === "manager-customer" && managerCustomer ? (
          <ManagerCustomerConfigurationDetail
            customer={managerCustomer}
            onBack={() => navigate({ name: "manager-customers" })}
            onSaved={(customer) => { setManagerCustomer(customer); setManagerCustomers((current) => current.map((value) => value.customer.id === customer.customer.id ? customer : value)); }}
            onAuthorityFailure={handleManagerRequestFailure}
            onOpenService={(systemKey) => navigate({ name: "manager-customer-service", customerId: managerCustomer.customer.id, systemKey })}
            onViewServiceVisit={(jobId) => openManagerVisit("manager-service-visit", jobId, null)}
            onViewFinalReport={(jobId) => openManagerVisit("manager-final-report", jobId, null)}
            onDownloadFinalReport={async (jobId) => {
              try {
                await downloadFinalReport(jobId, "/api/manager/service-visits");
              } catch (error) {
                handleManagerReportDownloadFailure(error);
              }
            }}
          />
        ) : (
          <>{route.name === "manager-operations" && <button type="button" className="secondary-command" onClick={() => navigate({ name: "manager-home" })}>Back to Home</button>}<ManagerOperations
            visits={managerVisits}
            loading={managerLoading}
            message={managerMessage}
            selectedVisit={route.name === "manager-service-visit" ? managerVisit : undefined}
            onRefresh={refreshManagerVisits}
            backLabel={route.name === "manager-service-visit" ? managerReturn?.label : undefined}
            onSelect={(visit) => openManagerVisit("manager-service-visit", visit.id, null)}
            onBack={backFromManagerVisit}
            onViewReport={(visit) => openManagerVisit("manager-final-report", visit.id, null)}
            onDownloadReport={async (visit) => {
              try {
                await downloadFinalReport(visit.id, "/api/manager/service-visits");
              } catch (error) {
                handleManagerReportDownloadFailure(error);
              }
            }}
          /></>
        )
      ) : null}
    </main>
  );
}
