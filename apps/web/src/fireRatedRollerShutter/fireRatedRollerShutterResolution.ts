import { inspectionCreatorUser, type AuthUser } from "../auth/authApi";
import { localDatabase } from "../db/localDatabase";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import { isServerUnreachable } from "../jobs/serverReachability";
import { findServerMasterSystemInspection, type ServerMasterSystemInspectionSummary } from "../hoseReel/serverMasterSystemInspectionApi";
import type { InspectionCatalog } from "../referenceData/referenceDataTypes";
import { getOrCreateFireRatedRollerShutterInspection } from "./fireRatedRollerShutterRepository";
import type { FireRatedRollerShutterInspectionRecord } from "./fireRatedRollerShutterTypes";
import { loadServerFireRatedRollerShutterDetail, type ServerFireRatedRollerShutterDetail } from "./serverFireRatedRollerShutterApi";

export type FireRatedRollerShutterOpenTarget =
  | { kind: "local"; record: FireRatedRollerShutterInspectionRecord }
  | { kind: "server"; clientUuid: string }
  | { kind: "not-cached" }
  | { kind: "server-unavailable"; message: string };

async function getLocalFireRatedRollerShutter(jobId: string) {
  const record = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(`${jobId}:fire_rated_roller_shutter`).first();
  if (!record) return undefined;
  if (record.systemKey !== "fire_rated_roller_shutter") throw new Error("Stored Fire Rated Roller Shutter inspection identity is invalid");
  return record as FireRatedRollerShutterInspectionRecord;
}

function validServerFireRatedRollerShutterIdentity(summary: ServerMasterSystemInspectionSummary, jobId: string) {
  return summary.jobId === jobId
    && summary.systemKey === "fire_rated_roller_shutter"
    && summary.instanceKey === "primary"
    && summary.zoneId === null
    && summary.locationId === null
    && summary.displaySequence === 1
    && summary.status === "submitted";
}

function validServerFireRatedRollerShutter(summary: ServerMasterSystemInspectionSummary, job: InspectionJob, system: JobSystemSnapshot) {
  return validServerFireRatedRollerShutterIdentity(summary, job.id)
    && system.systemKey === "fire_rated_roller_shutter";
}

export type FireRatedRollerShutterRouteResolution =
  | { kind: "local"; record: FireRatedRollerShutterInspectionRecord }
  | { kind: "server"; inspection: ServerFireRatedRollerShutterDetail }
  | { kind: "not-cached" }
  | { kind: "server-unavailable"; message: string };

export type FireRatedRollerShutterAuthorityResolution = { clientUuid: string; generation: number; verifiedAt: string };

export function canRenderLocalFireRatedRollerShutter(
  active: FireRatedRollerShutterInspectionRecord | undefined,
  authStatus: "verified" | "offline-unverified" | "verifying" | "online-unavailable" | "restoring" | "logged-out",
  routeClientUuid: string | undefined,
  authorityResolution: FireRatedRollerShutterAuthorityResolution | undefined,
  authorityGeneration: number,
  verifiedAt: string | undefined
) {
  return active !== undefined && (authStatus === "offline-unverified"
    || authorityResolution?.clientUuid === routeClientUuid
      && authorityResolution?.generation === authorityGeneration
      && authorityResolution?.verifiedAt === verifiedAt);
}

async function getLocalFireRatedRollerShutterByUuid(clientUuid: string) {
  const record = await localDatabase.masterSystemInspections.get(clientUuid);
  if (!record) return undefined;
  if (record.systemKey !== "fire_rated_roller_shutter") throw new Error("Stored Fire Rated Roller Shutter inspection identity is invalid");
  return record as FireRatedRollerShutterInspectionRecord;
}

export async function resolveFireRatedRollerShutterRoute(
  clientUuid: string,
  knownAcceptedClientUuid: string | undefined,
  authStatus: "verified" | "offline-unverified" | "logged-out",
  getLocal = getLocalFireRatedRollerShutterByUuid,
  findServer = findServerMasterSystemInspection,
  loadDetail = loadServerFireRatedRollerShutterDetail
): Promise<FireRatedRollerShutterRouteResolution> {
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
      const summary = await findServer(local.jobId, "fire_rated_roller_shutter");
      if (!summary) return local.syncStatus !== "Synced"
        ? { kind: "local", record: local }
        : { kind: "server-unavailable", message: "The local Synced Fire Rated Roller Shutter record has no matching accepted server summary" };
      if (!validServerFireRatedRollerShutterIdentity(summary, local.jobId)) {
        return { kind: "server-unavailable", message: "Fire Rated Roller Shutter server summary identity does not match the routed inspection" };
      }
      acceptedClientUuid = summary.clientUuid;
    }
    acceptedClientUuid ??= clientUuid;
    const inspection = await loadDetail(acceptedClientUuid);
    if (local && inspection.jobId !== local.jobId) {
      return { kind: "server-unavailable", message: "Fire Rated Roller Shutter server detail belongs to a different job" };
    }
    return { kind: "server", inspection };
  } catch (error) {
    if (local && isServerUnreachable(error)) return { kind: "local", record: local };
    return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Accepted Fire Rated Roller Shutter detail is unavailable" };
  }
}

export async function resolveFireRatedRollerShutterOpenTarget(
  job: InspectionJob,
  system: JobSystemSnapshot,
  user: AuthUser | undefined,
  authStatus: "verified" | "offline-unverified",
  loadCatalog: () => Promise<InspectionCatalog | undefined>,
  findServer = findServerMasterSystemInspection,
  getLocal = getLocalFireRatedRollerShutter,
  createLocal = getOrCreateFireRatedRollerShutterInspection
): Promise<FireRatedRollerShutterOpenTarget> {
  let serverUnreachable = false;
  if (authStatus === "verified") {
    let server: ServerMasterSystemInspectionSummary | undefined;
    try {
      server = await findServer(job.id, "fire_rated_roller_shutter");
    } catch (error) {
      // An unreachable server (weak signal, server restarting) must not lock the technician out of a saved
      // local draft. Only a deliberate server answer or an integrity failure fails closed.
      if (!isServerUnreachable(error)) return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Fire Rated Roller Shutter server inspection resolution is unavailable" };
      serverUnreachable = true;
    }
    if (server) {
      if (!validServerFireRatedRollerShutter(server, job, system)) {
        return { kind: "server-unavailable", message: "Fire Rated Roller Shutter server summary identity does not match the requested system" };
      }
      return { kind: "server", clientUuid: server.clientUuid };
    }
  }

  const local = await getLocal(job.id);
  if (local) return { kind: "local", record: local };
  if (authStatus === "offline-unverified" || serverUnreachable) return { kind: "not-cached" };

  const catalog = await loadCatalog();
  if (!catalog) return { kind: "server-unavailable", message: "Fire Rated Roller Shutter reference data is not cached yet. Refresh jobs online first." };
  return { kind: "local", record: await createLocal(job, system, catalog, inspectionCreatorUser(user)) };
}
