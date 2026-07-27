import type { AuthUser } from "../auth/authApi";
import { localDatabase } from "../db/localDatabase";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
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
  loadServer = loadServerAutomaticSprinklerDetail
): Promise<SprinklerRouteResolution> {
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
  | { kind: "server"; clientUuid: string };

export async function resolveAutomaticSprinklerOpenTarget(
  job: InspectionJob,
  system: JobSystemSnapshot,
  catalog: InspectionCatalog,
  user: AuthUser | undefined,
  verified: boolean,
  findServer = findServerMasterSystemInspection,
  createLocal = getOrCreateAutomaticSprinklerInspection
): Promise<SprinklerOpenTarget> {
  const jobSystemKey = `${job.id}:${system.systemKey}`;
  const local = await localDatabase.masterSystemInspections
    .where("jobSystemKey")
    .equals(jobSystemKey)
    .first();
  if (local?.systemKey === "automatic_sprinkler") {
    return { kind: "local", record: local };
  }
  if (verified) {
    const server = await findServer(job.id, system.systemKey);
    if (server) return { kind: "server", clientUuid: server.clientUuid };
  }
  return {
    kind: "local",
    record: await createLocal(job, system, catalog, user)
  };
}
