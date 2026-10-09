/** Browser-side shape check shared by queued technician drafts and Supervisor review responses.
 * The API remains authoritative and performs the bounded server validation. */
import { maxZoneTextLength } from "../fireRatedRollerShutter/fireRatedRollerShutterSetup";
const zoneFreeKeys: Readonly<Record<string, readonly string[]>> = {
  fire_rated_roller_shutter: ["general"], hose_reel: ["general"],
  fire_alarm_detector: ["general-primary", "general-secondary"],
  smoke_ventilation: ["general"], fire_intercom: ["general"]
};
const zonedSystems = new Set(["co2_fire_extinguisher", "fm200_fire_suppression", "wet_chemical", "hydrant", "dry_wet_riser"]);

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validLocationProposalPatch(value: unknown, systemKey: string): boolean {
  const allowedZoneFreeKeys = Object.hasOwn(zoneFreeKeys, systemKey) ? zoneFreeKeys[systemKey] : undefined;
  if (!object(value) || (!zonedSystems.has(systemKey) && allowedZoneFreeKeys === undefined)) return false;
  if (value.kind === "add-location") {
    return zonedSystems.has(systemKey) && typeof value.locationKey === "string" && typeof value.displayName === "string"
      && (value.zoneKey === null || typeof value.zoneKey === "string")
      && (value.newZone === null || (object(value.newZone) && typeof value.newZone.key === "string" && typeof value.newZone.displayName === "string"));
  }
  if (value.kind !== "update-format" || typeof value.locationKey !== "string"
    || (!zonedSystems.has(systemKey) && !allowedZoneFreeKeys!.includes(value.locationKey))
    || !Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > (zonedSystems.has(systemKey) ? 500 : 250)) return false;
  const baseFields = systemKey === "fire_alarm_detector"
    ? (value.locationKey === "general-primary" ? ["assetReference", "alarmZone", "location"] : ["assetReference", "location"])
    : systemKey === "smoke_ventilation" || systemKey === "fire_intercom" ? ["assetReference"]
    : systemKey === "hose_reel" ? ["assetReference", "locationText", "drumType"]
    : systemKey === "fire_rated_roller_shutter" || systemKey === "hydrant" || systemKey === "dry_wet_riser" ? ["assetReference", "locationText"]
    : ["alarmZone", "location"];
  // Roller Shutter rows may add a free-text zone heading: every row carries `zoneText`, or none does.
  const fields = systemKey === "fire_rated_roller_shutter" && value.rows.every((row) => object(row) && "zoneText" in row)
    ? [...baseFields, "zoneText"] : baseFields;
  return value.rows.every((row) => object(row) && Object.keys(row).length === fields.length
    && fields.every((name) => typeof row[name] === "string" && row[name].length <= (name === "assetReference" ? 200 : name === "zoneText" ? maxZoneTextLength : 300))
    && (!("locationText" in row) || Boolean(String(row.locationText).trim()))
    && (!("drumType" in row) || row.drumType === "" || row.drumType === "swing" || row.drumType === "fixed"));
}
