import type { AuthUser } from "../auth/authApi";
import { localDatabase } from "../db/localDatabase";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import type { InspectionCatalog } from "../referenceData/referenceDataTypes";
import { findServerMasterSystemInspection } from "../hoseReel/serverMasterSystemInspectionApi";
import { getOrCreateDryWetRiserInspection } from "./dryWetRiserRepository";
import type { DryWetRiserInspectionRecord } from "./dryWetRiserTypes";
import { loadServerDryWetRiserDetail, ServerDryWetRiserNotFoundError, type ServerDryWetRiserDetail } from "./serverDryWetRiserApi";

export type DryWetRiserRouteResolution = { kind: "local"; record: DryWetRiserInspectionRecord } | { kind: "server"; inspection: ServerDryWetRiserDetail } | { kind: "not-found" } | { kind: "not-cached" } | { kind: "signed-out" } | { kind: "server-unavailable"; message: string };
export async function resolveDryWetRiserRoute(clientUuid: string, authStatus: "verified" | "offline-unverified" | "logged-out", loadServer = loadServerDryWetRiserDetail, preferServerAccepted = false): Promise<DryWetRiserRouteResolution> {
  if (preferServerAccepted) {
    if (authStatus !== "verified") return { kind: "not-cached" };
    try { return { kind: "server", inspection: await loadServer(clientUuid) }; } catch (error) { if (error instanceof ServerDryWetRiserNotFoundError) return { kind: "not-found" }; return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Server inspection is currently unavailable" }; }
  }
  const local = await localDatabase.masterSystemInspections.get(clientUuid);
  if (local?.systemKey === "dry_wet_riser") return { kind: "local", record: local as DryWetRiserInspectionRecord };
  if (authStatus === "offline-unverified") return { kind: "not-cached" };
  if (authStatus === "logged-out") return { kind: "signed-out" };
  try { return { kind: "server", inspection: await loadServer(clientUuid) }; } catch (error) { if (error instanceof ServerDryWetRiserNotFoundError) return { kind: "not-found" }; return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Server inspection is currently unavailable" }; }
}
export type DryWetRiserOpenTarget = { kind: "local"; record: DryWetRiserInspectionRecord } | { kind: "server"; clientUuid: string } | { kind: "not-cached" } | { kind: "server-unavailable"; message: string };
export async function resolveDryWetRiserOpenTarget(job: InspectionJob, system: JobSystemSnapshot, catalog: InspectionCatalog | undefined, user: AuthUser | undefined, authStatus: "verified" | "offline-unverified", findServer = findServerMasterSystemInspection, createLocal = getOrCreateDryWetRiserInspection): Promise<DryWetRiserOpenTarget> {
  if (job.status === "closed" && authStatus === "verified") {
    try { const server = await findServer(job.id, system.systemKey); if (server) return { kind: "server", clientUuid: server.clientUuid }; } catch (error) { return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Server inspection check is currently unavailable" }; }
  }
  const local = await localDatabase.masterSystemInspections.where("jobSystemKey").equals(`${job.id}:${system.systemKey}`).first();
  if (local?.systemKey === "dry_wet_riser") return { kind: "local", record: local as DryWetRiserInspectionRecord };
  if (authStatus === "offline-unverified") return { kind: "not-cached" };
  try { const server = await findServer(job.id, system.systemKey); if (server) return { kind: "server", clientUuid: server.clientUuid }; if (!catalog) throw new Error("Dry/Wet Riser reference data is not cached yet. Refresh jobs online first."); return { kind: "local", record: await createLocal(job, system, catalog, user) }; } catch (error) { return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Server inspection check is currently unavailable" }; }
}
