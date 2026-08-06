import type { AuthUser } from "../auth/authApi";
import type { InspectionJob, JobSystemSnapshot } from "../jobs/jobTypes";
import type { InspectionCatalog } from "../referenceData/referenceDataTypes";
import { findServerMasterSystemInspection } from "../hoseReel/serverMasterSystemInspectionApi";
import { fireAlarmJobSystemKey, getFireAlarmInspection, getOrCreateFireAlarmInspection } from "./fireAlarmRepository";
import type { FireAlarmInspectionRecord } from "./fireAlarmTypes";

export type FireAlarmOpenTarget = { kind: "local"; record: FireAlarmInspectionRecord } | { kind: "server"; clientUuid: string } | { kind: "not-cached" } | { kind: "server-unavailable"; message: string };
export async function resolveFireAlarmOpenTarget(job: InspectionJob, system: JobSystemSnapshot, catalog: InspectionCatalog | undefined, user: AuthUser | undefined, authStatus: "verified" | "offline-unverified", findServer = findServerMasterSystemInspection, createLocal = getOrCreateFireAlarmInspection): Promise<FireAlarmOpenTarget> {
  const local = await getFireAlarmInspection(fireAlarmJobSystemKey(job.id)); if (local) return { kind: "local", record: local };
  if (authStatus === "offline-unverified") return { kind: "not-cached" };
  try {
    const server = await findServer(job.id, system.systemKey);
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
    return { kind: "local", record: await createLocal(job, system, catalog, user) };
  } catch (error) { return { kind: "server-unavailable", message: error instanceof Error ? error.message : "Fire Alarm server summary is currently unavailable" }; }
}
