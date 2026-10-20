import { inspectionCreatorUser, type AuthUser } from "../auth/authApi";
import { localDatabase } from "../db/localDatabase";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import { isUnconfirmedLocalVisit } from "../jobs/offlineServiceVisitStore";
import { isOfflineStartConfirmed, OFFLINE_START_REFUSAL_MESSAGE } from "../jobs/offlineStartReadiness";
import { isServerUnreachable } from "../jobs/serverReachability";
import type { InspectionCatalog } from "../referenceData/referenceDataTypes";
import { findServerMasterSystemInspection } from "../hoseReel/serverMasterSystemInspectionApi";
import {
  getOrCreateAutomaticSprinklerInspection
} from "./automaticSprinklerRepository";
import type { AutomaticSprinklerInspectionRecord } from "./automaticSprinklerTypes";
import {
  loadServerAutomaticSprinklerDetail,
  ServerInspectionNotFoundError,
  type ServerAutomaticSprinklerDetail
} from "./serverAutomaticSprinklerApi";

export type SprinklerRouteResolution =
  | { kind: "local"; record: AutomaticSprinklerInspectionRecord }
  | { kind: "server"; inspection: ServerAutomaticSprinklerDetail }
  | { kind: "not-found" }
  | { kind: "not-cached" }
  | { kind: "server-unavailable"; message: string };

export async function resolveAutomaticSprinklerRoute(
  clientUuid: string,
  authStatus: "verified" | "offline-unverified" | "logged-out",
  loadServer = loadServerAutomaticSprinklerDetail,
  preferServerAccepted = false
): Promise<SprinklerRouteResolution> {
  if (preferServerAccepted) {
    if (authStatus !== "verified") return { kind: "not-cached" };
    try {
      return { kind: "server", inspection: await loadServer(clientUuid) };
    } catch (error) {
      if (error instanceof ServerInspectionNotFoundError) return { kind: "not-found" };
      return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Server inspection is currently unavailable" };
    }
  }
  const local = await localDatabase.masterSystemInspections.get(clientUuid);
  if (local?.systemKey === "automatic_sprinkler") {
    return { kind: "local", record: local };
  }
  if (authStatus !== "verified") {
    return authStatus === "offline-unverified"
      ? { kind: "not-cached" }
      : { kind: "not-found" };
  }
  try {
    return { kind: "server", inspection: await loadServer(clientUuid) };
  } catch (error) {
    if (error instanceof ServerInspectionNotFoundError) {
      return { kind: "not-found" };
    }
    return {
      kind: "server-unavailable",
      message: error instanceof Error
        ? error.message
        : "Server inspection is currently unavailable"
    };
  }
}

export type SprinklerOpenTarget =
  | { kind: "local"; record: AutomaticSprinklerInspectionRecord }
  | { kind: "server"; clientUuid: string }
  // OA-3: never-opened, the server cannot be asked and the job was not confirmed recently.
  | { kind: "not-cached"; message: string };

export async function resolveAutomaticSprinklerOpenTarget(
  job: InspectionJob,
  system: JobSystemSnapshot,
  catalog: InspectionCatalog,
  user: AuthUser | undefined,
  verified: boolean,
  findServer = findServerMasterSystemInspection,
  createLocal = getOrCreateAutomaticSprinklerInspection,
  isUnconfirmedVisit = isUnconfirmedLocalVisit,
  offlineStartConfirmed = isOfflineStartConfirmed
): Promise<SprinklerOpenTarget> {
  // A visit created on this device and not yet confirmed cannot have a server inspection: work from the device, no lookup.
  if (verified && await isUnconfirmedVisit(job.id)) verified = false;
  const jobSystemKey = `${job.id}:${system.systemKey}`;
  if (job.status === "closed" && verified) {
    try {
      const server = await findServer(job.id, system.systemKey);
      if (server) return { kind: "server", clientUuid: server.clientUuid };
    } catch (error) {
      // An unreachable server must not hide a saved local record; anything else still fails closed.
      if (!isServerUnreachable(error)) throw error;
    }
  }
  const local = await localDatabase.masterSystemInspections
    .where("jobSystemKey")
    .equals(jobSystemKey)
    .first();
  if (local?.systemKey === "automatic_sprinkler") {
    return { kind: "local", record: local };
  }
  // A new draft must not be created blindly because the inspection may already be accepted elsewhere. Unreachable
  // or unverified, it needs a recent server confirmation, exactly like every other system (OA-3).
  let serverUnreachable = false;
  if (verified) {
    try {
      const server = await findServer(job.id, system.systemKey);
      if (server) return { kind: "server", clientUuid: server.clientUuid };
    } catch (error) {
      if (!isServerUnreachable(error)) throw error;
      serverUnreachable = true;
    }
  }
  if ((!verified || serverUnreachable) && !await offlineStartConfirmed(job.id, system.systemKey)) return { kind: "not-cached", message: OFFLINE_START_REFUSAL_MESSAGE };
  return {
    kind: "local",
    record: await createLocal(job, system, catalog, inspectionCreatorUser(user))
  };
}
