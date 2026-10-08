import { inspectionCreatorUser, type AuthUser } from "../auth/authApi";
import { isOfflineStartConfirmed } from "../jobs/offlineStartReadiness";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import { isServerUnreachable } from "../jobs/serverReachability";
import type { InspectionCatalog } from "../referenceData/referenceDataTypes";
import { findServerMasterSystemInspection } from "../hoseReel/serverMasterSystemInspectionApi";
import { fireAlarmJobSystemKey, getFireAlarmInspection, getOrCreateFireAlarmInspection, loadFireAlarmInspection } from "./fireAlarmRepository";
import type { FireAlarmInspectionRecord } from "./fireAlarmTypes";
import { FireAlarmAuthenticationError, FireAlarmDetailNotFoundError, InvalidFireAlarmDetailError, loadServerFireAlarmDetail } from "./serverFireAlarmApi";
import type { ServerFireAlarmDetail } from "./fireAlarmTypes";

export type FireAlarmRouteResolution =
  | { kind: "local"; record: FireAlarmInspectionRecord }
  | { kind: "server"; inspection: ServerFireAlarmDetail }
  | { kind: "not-cached" }
  | { kind: "signed-out" }
  | { kind: "inconsistent"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "server-unavailable"; message: string };

export async function resolveFireAlarmRoute(clientUuid:string,expectedJobId:string,authStatus:"verified"|"offline-unverified"|"logged-out",loadServer=loadServerFireAlarmDetail,getLocal=getFireAlarmInspectionByUuid):Promise<FireAlarmRouteResolution>{
  const local=await getLocal(clientUuid);
  if(local&&local.jobId!==expectedJobId)return{kind:"inconsistent",message:"The local Fire Alarm inspection belongs to a different job."};
  if(local&&local.syncStatus!=="Synced")return{kind:"local",record:local};
  if(authStatus==="offline-unverified")return{kind:"not-cached"};
  if(authStatus==="logged-out")return{kind:"signed-out"};
  try{return{kind:"server",inspection:await loadServer(clientUuid,expectedJobId)};}catch(error){
    if(error instanceof FireAlarmDetailNotFoundError)return{kind:"inconsistent",message:local?"The local Synced record has no matching accepted server detail.":"No accepted Fire Alarm inspection exists for this UUID."};
    if(error instanceof FireAlarmAuthenticationError)return{kind:"signed-out"};
    if(error instanceof InvalidFireAlarmDetailError)return{kind:"invalid",message:error.message};
    if(local&&isServerUnreachable(error))return{kind:"local",record:local};
    return{kind:"server-unavailable",message:error instanceof Error?error.message:"Accepted Fire Alarm detail is unavailable"};
  }
}

async function getFireAlarmInspectionByUuid(clientUuid:string){
  return loadFireAlarmInspection(clientUuid);
}

export type FireAlarmOpenTarget = { kind: "local"; record: FireAlarmInspectionRecord } | { kind: "server"; clientUuid: string } | { kind: "not-cached" } | { kind: "server-unavailable"; message: string };
export async function resolveFireAlarmOpenTarget(job: InspectionJob, system: JobSystemSnapshot, catalog: InspectionCatalog | undefined, user: AuthUser | undefined, authStatus: "verified" | "offline-unverified", findServer = findServerMasterSystemInspection, createLocal = getOrCreateFireAlarmInspection, offlineStartConfirmed = isOfflineStartConfirmed): Promise<FireAlarmOpenTarget> {
  // I-02 (A1): with the server out of reach, a system the server last confirmed as having nothing accepted may be started from the cached catalog.
  const startOffline = async (): Promise<FireAlarmOpenTarget> => {
    if (!await offlineStartConfirmed(job.id, system.systemKey)) return { kind: "not-cached" };
    try { if (!catalog) throw new Error("Fire Alarm reference data is not cached yet. Refresh jobs online first."); return { kind: "local", record: await createLocal(job, system, catalog, inspectionCreatorUser(user)) }; }
    catch (error) { return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Fire Alarm server summary is currently unavailable" }; }
  };
  const local = await getFireAlarmInspection(fireAlarmJobSystemKey(job.id));
  if (local) return local.syncStatus === "Synced" && authStatus === "verified"
    ? { kind: "server", clientUuid: local.clientUuid }
    : local.syncStatus === "Synced" ? { kind: "not-cached" } : { kind: "local", record: local };
  if (authStatus === "offline-unverified") return startOffline();
  let server: Awaited<ReturnType<typeof findServer>>;
  try { server = await findServer(job.id, system.systemKey); } catch (error) {
    // No local record and the server cannot be reached: nothing to continue, and a new draft must not be
    // created blindly (it may already be accepted elsewhere). Same outcome as the offline branch.
    if (isServerUnreachable(error)) return startOffline();
    return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Fire Alarm server summary is currently unavailable" };
  }
  try {
    if (server) {
      if (server.jobId !== job.id
        || server.systemKey !== "fire_alarm_detector"
        || server.instanceKey !== "primary"
        || server.zoneId !== null
        || server.locationId !== null
        || server.displaySequence !== 1
        || server.status !== "submitted") throw new Error("Fire Alarm server summary identity does not match the requested inspection");
      return { kind: "server", clientUuid: server.clientUuid };
    }
    if (!catalog) throw new Error("Fire Alarm reference data is not cached yet. Refresh jobs online first.");
    return { kind: "local", record: await createLocal(job, system, catalog, inspectionCreatorUser(user)) };
  } catch (error) { return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Fire Alarm server summary is currently unavailable" }; }
}
