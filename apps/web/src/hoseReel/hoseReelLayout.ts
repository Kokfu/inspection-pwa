import type { JobSystemSnapshot } from "../jobs/jobTypes";
import { rowSetupStep, type LayoutLimits, type LayoutRow, type RowSetupStep } from "../inspectionControls/rowLayout";
import type { RowSetupStart } from "../inspectionControls/RowSetupPrompt";
import { configuredHoseReelRows, setHoseReelDrumCount } from "./hoseReelRepository";
import { hoseReelLimits, type HoseReelResponses, type HoseReelRow } from "./hoseReelTypes";

/** Phase 3 for Hose Reel: how many drums / same as last time / saved automatically. One zone-free "general" layout. */
export const hoseReelLayoutLimits: LayoutLimits = { rows: hoseReelLimits.rows, location: hoseReelLimits.location, assetReference: hoseReelLimits.assetReference };
export const hoseReelNouns = { noun: "hose reel drum", plural: "hose reel drums" } as const;
/** Hose Reel has exactly one implicit location (see `zoneFreeLocationKeysBySystem` on the server). */
export const hoseReelLayoutLocationKey = "general";

const resultFields = ["drumResult", "hoseResult", "nozzleResult", "valveResult", "nozzleBoxResult"] as const;

/**
 * A drum section nobody has touched: still exactly the saved layout's drum (Hose Reel lets a technician correct a configured
 * drum's location, reference and type, so changing one of those is work too) with no result and no remark.
 */
const untouchedRow = (row: HoseReelRow, saved: LayoutRow | undefined) => row.source === "configured"
  && !!saved && row.locationText === saved.locationText && (row.assetReference ?? "") === saved.assetReference && (row.drumType ?? "") === (saved.drumType ?? "")
  && resultFields.every((field) => row[field] === null) && !row.remarks.trim()
  && Object.values(row.fieldRemarks ?? {}).every((value) => !String(value ?? "").trim());

/** True when no checklist, measurement, comment or drum entry has been made. */
function untouched(responses: HoseReelResponses, saved: readonly LayoutRow[]): boolean {
  return !responses.comments.trim()
    && Object.values(responses.checklist).every((item) => item.result === null && !item.remarks.trim())
    && Object.values(responses.measurements).every((item) => item.result === null && !item.remarks.trim() && Object.values(item.values).every((value) => value === null))
    && responses.rows.every((row, index) => untouchedRow(row, saved[index]));
}

/** Which pre-form step a freshly opened Draft needs, decided from its persisted content only. Schema 3 (V7) only; older drafts keep their flow. */
export function hoseReelSetupStep(input: { syncStatus: string; responses: HoseReelResponses; system: JobSystemSnapshot }): RowSetupStep | null {
  if (input.syncStatus !== "Draft" || input.responses.schemaVersion !== 3) return null;
  return rowSetupStep({ untouched: untouched(input.responses, savedHoseReelLayout(input.system)), hasSavedLayout: input.responses.rows.length > 0 });
}

/** The layout the customer has saved: what the form pre-fills from the frozen snapshot (never the technician's edits). */
export function savedHoseReelLayout(system: JobSystemSnapshot): LayoutRow[] {
  return configuredHoseReelRows(system, true).map((row) => ({ assetReference: row.assetReference ?? "", locationText: row.locationText, drumType: row.drumType ?? "" }));
}

/** First visit: `total` blank drum sections. Saved layout: `extra` blank sections after the pre-filled ones. */
export function startHoseReelRows(responses: HoseReelResponses, start: RowSetupStart): HoseReelResponses {
  const target = "total" in start ? start.total : responses.rows.length + start.extra;
  return setHoseReelDrumCount(responses, target);
}

/** The drums as the layout proposal carries them. */
export function hoseReelLayoutRows(responses: HoseReelResponses): LayoutRow[] {
  return responses.rows.map((row) => ({ assetReference: row.assetReference ?? "", locationText: row.locationText, drumType: row.drumType ?? "" }));
}
