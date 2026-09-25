import { inspectionCreatorUser, type AuthUser } from "../auth/authApi";
import { localDatabase } from "../db/localDatabase";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import { findServerMasterSystemInspection, type ServerMasterSystemInspectionSummary } from "../hoseReel/serverMasterSystemInspectionApi";
import type { InspectionCatalog } from "../referenceData/referenceDataTypes";
import { getOrCreateFireIntercomInspection } from "./fireIntercomRepository";
import type { FireIntercomInspectionRecord } from "./fireIntercomTypes";
import { loadServerFireIntercomDetail, type ServerFireIntercomDetail } from "./serverFireIntercomApi";

export type FireIntercomOpenTarget =
  | { kind: "local"; record: FireIntercomInspectionRecord }
  | { kind: "server"; clientUuid: string }
  | { kind: "not-cached" }
  | { kind: "server-unavailable"; message: string };

async function getLocalFireIntercom(jobId: string) {
  const record = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(`${jobId}:fire_intercom`).first();
  if (!record) return undefined;
  if (record.systemKey !== "fire_intercom") throw new Error("Stored Fire Intercom inspection identity is invalid");
  return record as FireIntercomInspectionRecord;
}

function validServerFireIntercomIdentity(summary: ServerMasterSystemInspectionSummary, jobId: string) {
  return summary.jobId === jobId
    && summary.systemKey === "fire_intercom"
    && summary.instanceKey === "primary"
    && summary.zoneId === null
    && summary.locationId === null
    && summary.displaySequence === 1
    && summary.status === "submitted";
}

function validServerFireIntercom(summary: ServerMasterSystemInspectionSummary, job: InspectionJob, system: JobSystemSnapshot) {
  return validServerFireIntercomIdentity(summary, job.id)
    && system.systemKey === "fire_intercom";
}

export type FireIntercomRouteResolution =
  | { kind: "local"; record: FireIntercomInspectionRecord }
  | { kind: "server"; inspection: ServerFireIntercomDetail }
  | { kind: "not-cached" }
  | { kind: "server-unavailable"; message: string };

export type FireIntercomAuthorityResolution = { clientUuid: string; generation: number; verifiedAt: string };

export function canRenderLocalFireIntercom(
  active: FireIntercomInspectionRecord | undefined,
  authStatus: "verified" | "offline-unverified" | "verifying" | "online-unavailable" | "restoring" | "logged-out",
  routeClientUuid: string | undefined,
  authorityResolution: FireIntercomAuthorityResolution | undefined,
  authorityGeneration: number,
  verifiedAt: string | undefined
) {
  return active !== undefined && (authStatus === "offline-unverified"
    || authorityResolution?.clientUuid === routeClientUuid
      && authorityResolution?.generation === authorityGeneration
      && authorityResolution?.verifiedAt === verifiedAt);
}

async function getLocalFireIntercomByUuid(clientUuid: string) {
  const record = await localDatabase.masterSystemInspections.get(clientUuid);
  if (!record) return undefined;
  if (record.systemKey !== "fire_intercom") throw new Error("Stored Fire Intercom inspection identity is invalid");
  return record as FireIntercomInspectionRecord;
}

export async function resolveFireIntercomRoute(
  clientUuid: string,
  knownAcceptedClientUuid: string | undefined,
  authStatus: "verified" | "offline-unverified" | "logged-out",
  getLocal = getLocalFireIntercomByUuid,
  findServer = findServerMasterSystemInspection,
  loadDetail = loadServerFireIntercomDetail
): Promise<FireIntercomRouteResolution> {
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
      const summary = await findServer(local.jobId, "fire_intercom");
      if (!summary) return local.syncStatus !== "Synced"
        ? { kind: "local", record: local }
        : { kind: "server-unavailable", message: "The local Synced Fire Intercom record has no matching accepted server summary" };
      if (!validServerFireIntercomIdentity(summary, local.jobId)) {
        return { kind: "server-unavailable", message: "Fire Intercom server summary identity does not match the routed inspection" };
      }
      acceptedClientUuid = summary.clientUuid;
    }
    acceptedClientUuid ??= clientUuid;
    const inspection = await loadDetail(acceptedClientUuid);
    if (local && inspection.jobId !== local.jobId) {
      return { kind: "server-unavailable", message: "Fire Intercom server detail belongs to a different job" };
    }
    return { kind: "server", inspection };
  } catch (error) {
    if (local && error instanceof TypeError) return { kind: "local", record: local };
    return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Accepted Fire Intercom detail is unavailable" };
  }
}

export async function resolveFireIntercomOpenTarget(
  job: InspectionJob,
  system: JobSystemSnapshot,
  user: AuthUser | undefined,
  authStatus: "verified" | "offline-unverified",
  loadCatalog: () => Promise<InspectionCatalog | undefined>,
  findServer = findServerMasterSystemInspection,
  getLocal = getLocalFireIntercom,
  createLocal = getOrCreateFireIntercomInspection
): Promise<FireIntercomOpenTarget> {
  if (authStatus === "verified") {
    let server: ServerMasterSystemInspectionSummary | undefined;
    try {
      server = await findServer(job.id, "fire_intercom");
    } catch (error) {
      return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Fire Intercom server inspection resolution is unavailable" };
    }
    if (server) {
      if (!validServerFireIntercom(server, job, system)) {
        return { kind: "server-unavailable", message: "Fire Intercom server summary identity does not match the requested system" };
      }
      return { kind: "server", clientUuid: server.clientUuid };
    }
  }

  const local = await getLocal(job.id);
  if (local) return { kind: "local", record: local };
  if (authStatus === "offline-unverified") return { kind: "not-cached" };

  const catalog = await loadCatalog();
  if (!catalog) return { kind: "server-unavailable", message: "Fire Intercom reference data is not cached yet. Refresh jobs online first." };
  return { kind: "local", record: await createLocal(job, system, catalog, inspectionCreatorUser(user)) };
}
