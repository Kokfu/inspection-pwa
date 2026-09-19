import { inspectionCreatorUser, type AuthUser } from "../auth/authApi";
import { localDatabase } from "../db/localDatabase";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import { findServerMasterSystemInspection, type ServerMasterSystemInspectionSummary } from "../hoseReel/serverMasterSystemInspectionApi";
import type { InspectionCatalog } from "../referenceData/referenceDataTypes";
import { getOrCreateSmokeVentilationInspection } from "./smokeVentilationRepository";
import type { SmokeVentilationInspectionRecord } from "./smokeVentilationTypes";
import { loadServerSmokeVentilationDetail, type ServerSmokeVentilationDetail } from "./serverSmokeVentilationApi";

export type SmokeVentilationOpenTarget =
  | { kind: "local"; record: SmokeVentilationInspectionRecord }
  | { kind: "server"; clientUuid: string }
  | { kind: "not-cached" }
  | { kind: "server-unavailable"; message: string };

async function getLocalSmokeVentilation(jobId: string) {
  const record = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(`${jobId}:smoke_ventilation`).first();
  if (!record) return undefined;
  if (record.systemKey !== "smoke_ventilation") throw new Error("Stored Smoke Ventilation inspection identity is invalid");
  return record as SmokeVentilationInspectionRecord;
}

function validServerSmokeVentilationIdentity(summary: ServerMasterSystemInspectionSummary, jobId: string) {
  return summary.jobId === jobId
    && summary.systemKey === "smoke_ventilation"
    && summary.instanceKey === "primary"
    && summary.zoneId === null
    && summary.locationId === null
    && summary.displaySequence === 1
    && summary.status === "submitted";
}

function validServerSmokeVentilation(summary: ServerMasterSystemInspectionSummary, job: InspectionJob, system: JobSystemSnapshot) {
  return validServerSmokeVentilationIdentity(summary, job.id)
    && system.systemKey === "smoke_ventilation";
}

export type SmokeVentilationRouteResolution =
  | { kind: "local"; record: SmokeVentilationInspectionRecord }
  | { kind: "server"; inspection: ServerSmokeVentilationDetail }
  | { kind: "not-cached" }
  | { kind: "server-unavailable"; message: string };

export type SmokeVentilationAuthorityResolution = { clientUuid: string; generation: number; verifiedAt: string };

export function canRenderLocalSmokeVentilation(
  active: SmokeVentilationInspectionRecord | undefined,
  authStatus: "verified" | "offline-unverified" | "verifying" | "online-unavailable" | "restoring" | "logged-out",
  routeClientUuid: string | undefined,
  authorityResolution: SmokeVentilationAuthorityResolution | undefined,
  authorityGeneration: number,
  verifiedAt: string | undefined
) {
  return active !== undefined && (authStatus === "offline-unverified"
    || authorityResolution?.clientUuid === routeClientUuid
      && authorityResolution?.generation === authorityGeneration
      && authorityResolution?.verifiedAt === verifiedAt);
}

async function getLocalSmokeVentilationByUuid(clientUuid: string) {
  const record = await localDatabase.masterSystemInspections.get(clientUuid);
  if (!record) return undefined;
  if (record.systemKey !== "smoke_ventilation") throw new Error("Stored Smoke Ventilation inspection identity is invalid");
  return record as SmokeVentilationInspectionRecord;
}

export async function resolveSmokeVentilationRoute(
  clientUuid: string,
  knownAcceptedClientUuid: string | undefined,
  authStatus: "verified" | "offline-unverified" | "logged-out",
  getLocal = getLocalSmokeVentilationByUuid,
  findServer = findServerMasterSystemInspection,
  loadDetail = loadServerSmokeVentilationDetail
): Promise<SmokeVentilationRouteResolution> {
  const local = await getLocal(clientUuid);
  if (authStatus === "offline-unverified") return local && local.syncStatus !== "Synced"
    ? { kind: "local", record: local }
    : { kind: "not-cached" };
  if (authStatus === "logged-out") return { kind: "not-cached" };

  try {
    let acceptedClientUuid = knownAcceptedClientUuid === clientUuid
      ? knownAcceptedClientUuid
      : undefined;
    if (!acceptedClientUuid && local) {
      const summary = await findServer(local.jobId, "smoke_ventilation");
      if (!summary) return local.syncStatus !== "Synced"
        ? { kind: "local", record: local }
        : { kind: "server-unavailable", message: "The local Synced Smoke Ventilation record has no matching accepted server summary" };
      if (!validServerSmokeVentilationIdentity(summary, local.jobId)) {
        return { kind: "server-unavailable", message: "Smoke Ventilation server summary identity does not match the routed inspection" };
      }
      acceptedClientUuid = summary.clientUuid;
    }
    acceptedClientUuid ??= clientUuid;
    const inspection = await loadDetail(acceptedClientUuid);
    if (local && inspection.jobId !== local.jobId) {
      return { kind: "server-unavailable", message: "Smoke Ventilation server detail belongs to a different job" };
    }
    return { kind: "server", inspection };
  } catch (error) {
    return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Accepted Smoke Ventilation detail is unavailable" };
  }
}

export async function resolveSmokeVentilationOpenTarget(
  job: InspectionJob,
  system: JobSystemSnapshot,
  user: AuthUser | undefined,
  authStatus: "verified" | "offline-unverified",
  loadCatalog: () => Promise<InspectionCatalog | undefined>,
  findServer = findServerMasterSystemInspection,
  getLocal = getLocalSmokeVentilation,
  createLocal = getOrCreateSmokeVentilationInspection
): Promise<SmokeVentilationOpenTarget> {
  if (authStatus === "verified") {
    let server: ServerMasterSystemInspectionSummary | undefined;
    try {
      server = await findServer(job.id, "smoke_ventilation");
    } catch (error) {
      return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Smoke Ventilation server inspection resolution is unavailable" };
    }
    if (server) {
      if (!validServerSmokeVentilation(server, job, system)) {
        return { kind: "server-unavailable", message: "Smoke Ventilation server summary identity does not match the requested system" };
      }
      return { kind: "server", clientUuid: server.clientUuid };
    }
  }

  const local = await getLocal(job.id);
  if (local) return { kind: "local", record: local };
  if (authStatus === "offline-unverified") return { kind: "not-cached" };

  const catalog = await loadCatalog();
  if (!catalog) return { kind: "server-unavailable", message: "Smoke Ventilation reference data is not cached yet. Refresh jobs online first." };
  return { kind: "local", record: await createLocal(job, system, catalog, inspectionCreatorUser(user)) };
}
