import { inspectionCreatorUser, type AuthUser } from "../auth/authApi";
import { localDatabase } from "../db/localDatabase";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import { findServerMasterSystemInspection, type ServerMasterSystemInspectionSummary } from "../hoseReel/serverMasterSystemInspectionApi";
import type { InspectionCatalog } from "../referenceData/referenceDataTypes";
import { getOrCreateHydrantInspection } from "./hydrantRepository";
import type { HydrantInspectionRecord } from "./hydrantTypes";
import { loadServerHydrantDetail, type ServerHydrantDetail } from "./serverHydrantApi";

export type HydrantOpenTarget =
  | { kind: "local"; record: HydrantInspectionRecord }
  | { kind: "server"; clientUuid: string }
  | { kind: "not-cached" }
  | { kind: "server-unavailable"; message: string };

async function getLocalHydrant(jobId: string) {
  const record = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(`${jobId}:hydrant`).first();
  if (!record) return undefined;
  if (record.systemKey !== "hydrant") throw new Error("Stored Hydrant inspection identity is invalid");
  return record as HydrantInspectionRecord;
}

function validServerHydrant(summary: ServerMasterSystemInspectionSummary, job: InspectionJob, system: JobSystemSnapshot) {
  return validServerHydrantIdentity(summary, job.id)
    && system.systemKey === "hydrant";
}

function validServerHydrantIdentity(summary: ServerMasterSystemInspectionSummary, jobId: string) {
  return summary.jobId === jobId
    && summary.systemKey === "hydrant"
    && summary.instanceKey === "primary"
    && summary.zoneId === null
    && summary.locationId === null
    && summary.displaySequence === 1
    && summary.status === "submitted";
}

export type HydrantRouteResolution =
  | { kind: "local"; record: HydrantInspectionRecord }
  | { kind: "server"; inspection: ServerHydrantDetail }
  | { kind: "not-cached" }
  | { kind: "server-unavailable"; message: string };

export type HydrantAuthorityResolution = { clientUuid: string; generation: number; verifiedAt: string };

export function canRenderLocalHydrant(
  active: HydrantInspectionRecord | undefined,
  authStatus: "verified" | "offline-unverified" | "verifying" | "online-unavailable" | "restoring" | "logged-out",
  routeClientUuid: string | undefined,
  authorityResolution: HydrantAuthorityResolution | undefined,
  authorityGeneration: number,
  verifiedAt: string | undefined
) {
  return active !== undefined && (authStatus === "offline-unverified"
    || authorityResolution?.clientUuid === routeClientUuid
      && authorityResolution?.generation === authorityGeneration
      && authorityResolution?.verifiedAt === verifiedAt);
}

async function getLocalHydrantByUuid(clientUuid: string) {
  const record = await localDatabase.masterSystemInspections.get(clientUuid);
  if (!record) return undefined;
  if (record.systemKey !== "hydrant") throw new Error("Stored Hydrant inspection identity is invalid");
  return record as HydrantInspectionRecord;
}

export async function resolveHydrantRoute(
  clientUuid: string,
  knownAcceptedClientUuid: string | undefined,
  authStatus: "verified" | "offline-unverified" | "logged-out",
  getLocal = getLocalHydrantByUuid,
  findServer = findServerMasterSystemInspection,
  loadDetail = loadServerHydrantDetail
): Promise<HydrantRouteResolution> {
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
      const summary = await findServer(local.jobId, "hydrant");
      if (!summary) return local.syncStatus !== "Synced"
        ? { kind: "local", record: local }
        : { kind: "server-unavailable", message: "The local Synced Hydrant record has no matching accepted server summary" };
      if (!validServerHydrantIdentity(summary, local.jobId)) {
        return { kind: "server-unavailable", message: "Hydrant server summary identity does not match the routed inspection" };
      }
      acceptedClientUuid = summary.clientUuid;
    }
    acceptedClientUuid ??= clientUuid;
    const inspection = await loadDetail(acceptedClientUuid);
    if (local && inspection.jobId !== local.jobId) {
      return { kind: "server-unavailable", message: "Hydrant server detail belongs to a different job" };
    }
    return { kind: "server", inspection };
  } catch (error) {
    if (local && error instanceof TypeError) return { kind: "local", record: local };
    return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Accepted Hydrant detail is unavailable" };
  }
}

export async function resolveHydrantOpenTarget(
  job: InspectionJob,
  system: JobSystemSnapshot,
  user: AuthUser | undefined,
  authStatus: "verified" | "offline-unverified",
  loadCatalog: () => Promise<InspectionCatalog | undefined>,
  findServer = findServerMasterSystemInspection,
  getLocal = getLocalHydrant,
  createLocal = getOrCreateHydrantInspection
): Promise<HydrantOpenTarget> {
  if (authStatus === "verified") {
    let server: ServerMasterSystemInspectionSummary | undefined;
    try {
      server = await findServer(job.id, "hydrant");
    } catch (error) {
      return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Hydrant server inspection resolution is unavailable" };
    }
    if (server) {
      if (!validServerHydrant(server, job, system)) {
        return { kind: "server-unavailable", message: "Hydrant server summary identity does not match the requested system" };
      }
      return { kind: "server", clientUuid: server.clientUuid };
    }
  }

  const local = await getLocal(job.id);
  if (local) return { kind: "local", record: local };
  if (authStatus === "offline-unverified") return { kind: "not-cached" };

  const catalog = await loadCatalog();
  if (!catalog) return { kind: "server-unavailable", message: "Hydrant reference data is not cached yet. Refresh jobs online first." };
  return { kind: "local", record: await createLocal(job, system, catalog, inspectionCreatorUser(user)) };
}
