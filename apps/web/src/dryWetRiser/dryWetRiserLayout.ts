import type { JobSystemSnapshot } from "../jobs/jobTypes";
import { rowSetupStep, type LayoutLimits, type LayoutRow, type RowSetupStep } from "../inspectionControls/rowLayout";
import type { RowSetupStart } from "../inspectionControls/RowSetupPrompt";
import { addRiserOutlet, configuredDryWetRiserOutlets, rowPresets } from "./dryWetRiserRepository";
import type { DryWetRiserInspectionRecord, DryWetRiserResponses, RiserOutlet, V7DryWetRiserResponses } from "./dryWetRiserTypes";

/** Phase 3 for Dry/Wet Riser: how many / same as last time / saved automatically. Mirrors the server's caps (`dryWetRiserOutletMaximum`). */
export const dryWetRiserLayoutLimits: LayoutLimits = { rows: 250, location: 250, assetReference: 200 };
export const dryWetRiserNouns = { noun: "riser outlet", plural: "riser outlets" } as const;

/** The one location whose layout is set up and saved automatically; several (or no) locations keep the per-location buttons. */
export function dryWetRiserLayoutLocation(system: JobSystemSnapshot): JobSystemSnapshot["locations"][number] | undefined {
  return system.locations.length === 1 ? system.locations[0] : undefined;
}

/** The layout the customer has saved: what the form pre-fills from the frozen snapshot (never the technician's edits). */
export function savedDryWetRiserLayout(system: JobSystemSnapshot): LayoutRow[] {
  const location = dryWetRiserLayoutLocation(system);
  if (!location) return [];
  return configuredDryWetRiserOutlets({ ...system, locations: [location] }, true).map((row) => ({ assetReference: row.assetReference, locationText: row.locationText }));
}

export function hasSavedDryWetRiserLayout(system: JobSystemSnapshot): boolean {
  const location = dryWetRiserLayoutLocation(system);
  return !!location && (rowPresets(location) !== undefined || location.presetRowCount > 1);
}

const resultFields = ["canvasHoseAt2Result", "diffuserNozzleResult", "landingValveResult", "crandleResult", "doorResult"] as const;
const untouchedOutlet = (row: RiserOutlet) => row.source === "configured" && resultFields.every((field) => row[field] === null)
  && !row.remarks.trim() && Object.values(row.fieldRemarks ?? {}).every((value) => !String(value ?? "").trim());

/** True when no checklist, measurement, comment or outlet entry has been made (V7 responses). */
function untouched(responses: V7DryWetRiserResponses): boolean {
  return !responses.comments.trim()
    && Object.values(responses.checklist).every((item) => item.result === null && !item.remarks.trim())
    && Object.values(responses.measurements).every((item) => item.result === null && !item.remarks.trim() && Object.values(item.values).every((value) => value === null))
    && responses.riserOutlets.length > 0 && responses.riserOutlets.every(untouchedOutlet);
}

/** Which pre-form step a freshly opened Draft needs, decided from its persisted content only. V7 (schema 2) only. */
export function dryWetRiserSetupStep(record: DryWetRiserInspectionRecord): RowSetupStep | null {
  const responses = record.responses;
  if (record.syncStatus !== "Draft" || responses.schemaVersion !== 2 || !dryWetRiserLayoutLocation(record.inspectionSnapshot.system)) return null;
  return rowSetupStep({ untouched: untouched(responses), hasSavedLayout: hasSavedDryWetRiserLayout(record.inspectionSnapshot.system) });
}

/**
 * What the pre-form step does to a fresh Draft. First visit: the configured outlet the location starts with (the server requires
 * it to stay exactly as frozen) is the first outlet, and blank outlets follow up to `total`. Saved layout: `extra` blank outlets
 * follow the pre-filled ones. A total below the outlets already there adds nothing (configured outlets can never be removed).
 */
export function startDryWetRiserRows(responses: DryWetRiserResponses, start: RowSetupStart): DryWetRiserResponses {
  const more = "total" in start ? start.total - responses.riserOutlets.length : start.extra;
  let next = responses;
  for (let index = 0; index < more; index += 1) next = addRiserOutlet(next);
  return next;
}

/** The outlets as the layout proposal carries them (every outlet, including the ones added during the visit). */
export function dryWetRiserLayoutRows(responses: DryWetRiserResponses): LayoutRow[] {
  return responses.riserOutlets.map((row) => ({ assetReference: row.assetReference, locationText: row.locationText }));
}
