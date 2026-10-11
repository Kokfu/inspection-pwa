import type { JobSystemSnapshot } from "../jobs/jobTypes";
import { rowSetupStep, type LayoutLimits, type LayoutRow, type RowSetupStep } from "../inspectionControls/rowLayout";
import type { RowSetupStart } from "../inspectionControls/RowSetupPrompt";
import { configuredHydrantRows, rowPresets } from "./hydrantRepository";
import { hydrantResultColumns, type HydrantInspectionRecord, type HydrantResponses, type HydrantRow } from "./hydrantTypes";

/** Phase 3 for Hydrant: how many / same as last time / saved automatically. Mirrors the server's caps (`expectedConfiguredHydrantRows` refuses more than 250 configured rows). */
export const hydrantLayoutLimits: LayoutLimits = { rows: 250, location: 300, assetReference: 200 };
export const hydrantNouns = { noun: "hydrant", plural: "hydrants" } as const;

/**
 * The one location whose layout is set up and saved automatically. A customer with no location, or with several named
 * locations, keeps the per-location "Save as format" buttons: one count and one saved list cannot describe several places.
 */
export function hydrantLayoutLocation(system: JobSystemSnapshot): JobSystemSnapshot["locations"][number] | undefined {
  return system.locations.length === 1 ? system.locations[0] : undefined;
}

/** The layout the customer has saved: what the form pre-fills from the frozen snapshot (never the technician's edits). */
export function savedHydrantLayout(system: JobSystemSnapshot): LayoutRow[] {
  const location = hydrantLayoutLocation(system);
  if (!location) return [];
  return configuredHydrantRows({ ...system, locations: [location] }, true).map((row) => ({ assetReference: row.assetReference, locationText: row.locationText }));
}

/** True when the customer really saved a layout (an approved `rowPreset`, or a configured count above the default of one). */
export function hasSavedHydrantLayout(system: JobSystemSnapshot): boolean {
  const location = hydrantLayoutLocation(system);
  return !!location && (rowPresets(location) !== undefined || location.presetRowCount > 1);
}

/** A configured row nobody has touched. (The server requires a configured row's location and reference to stay exactly as
 *  frozen, so a configured row can only be touched through its results and remarks.) */
const untouchedConfiguredRow = (row: HydrantRow) => row.source === "configured"
  && hydrantResultColumns.every(([field]) => row[field] === null) && !row.remarks && Object.keys(row.fieldRemarks ?? {}).length === 0;

/** Which pre-form step a freshly opened Draft needs, decided from its persisted content only. */
export function hydrantSetupStep(record: HydrantInspectionRecord): RowSetupStep | null {
  if (record.syncStatus !== "Draft" || !hydrantLayoutLocation(record.inspectionSnapshot.system)) return null;
  const responses = record.responses;
  const untouched = responses.hydrantType === null && !responses.comments && responses.rows.length > 0 && responses.rows.every(untouchedConfiguredRow);
  return rowSetupStep({ untouched, hasSavedLayout: hasSavedHydrantLayout(record.inspectionSnapshot.system) });
}

export function newHydrantTechnicianRow(sortOrder: number, isV7: boolean): HydrantRow {
  return {
    rowUuid: crypto.randomUUID(), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null,
    assetReference: "", locationText: "", canvasHose1Result: null, canvasHose2Result: null, diffuserNozzleResult: null, landingValveResult: null,
    landingValveHandleResult: null, hoseCabinetResult: null, keyLockResult: null, remarks: "", ...(isV7 ? { fieldRemarks: {} } : {}), sortOrder
  };
}

/**
 * What the pre-form step does to a fresh Draft. First visit: the configured row the location starts with (the server requires
 * it to stay exactly as frozen) is the first hydrant, and blank rows follow up to `total`. Saved layout: `extra` blank rows
 * follow the pre-filled ones. A total below the rows already there adds nothing (configured rows can never be removed).
 */
export function startHydrantRows(responses: HydrantResponses, start: RowSetupStart, isV7: boolean): HydrantResponses {
  const rows = [...responses.rows];
  const more = "total" in start ? start.total - rows.length : start.extra;
  for (let index = 0; index < more; index += 1) rows.push(newHydrantTechnicianRow(rows.length + 1, isV7));
  return { ...responses, rows };
}

/** The rows as the layout proposal carries them (every row, including the ones added during the visit). */
export function hydrantLayoutRows(responses: HydrantResponses): LayoutRow[] {
  return responses.rows.map((row) => ({ assetReference: row.assetReference, locationText: row.locationText }));
}
