import type { FireRatedRollerShutterResponses, FireRatedRollerShutterRow } from "./fireRatedRollerShutterTypes";

/** Server cap on Roller Shutter schedule rows (`validResponses`); also the cap on a saved layout. */
export const maxShutterRows = 250;

/** One saved-layout row, exactly the shape the `update-format` proposal carries. */
export type ShutterLayoutRow = { assetReference: string; locationText: string };
export type RollerShutterSetupStep = "count" | "confirm";

/** Which pre-form step a freshly opened Draft needs, decided from its persisted content only.
 *  - `count`: nothing configured and nothing entered -> ask how many shutters to inspect.
 *  - `confirm`: only untouched configured rows -> show the saved layout ("same as last time").
 *  Anything the technician has already entered skips the step, so reopening real work never
 *  puts a prompt in front of it. */
export function rollerShutterSetupStep(responses: FireRatedRollerShutterResponses): RollerShutterSetupStep | null {
  if (responses.dateTested || responses.zone || responses.inspectedBy || responses.comments) return null;
  if (responses.rows.length === 0) return "count";
  return responses.rows.every(untouchedConfiguredRow) ? "confirm" : null;
}

function untouchedConfiguredRow(row: FireRatedRollerShutterRow) {
  return row.source === "configured" && row.autoAlarmModeResult === null && row.manualModeResult === null
    && !row.remarks && Object.keys(row.fieldRemarks ?? {}).length === 0;
}

/** A whole number within [min, max], or undefined. Rejects blanks, decimals, signs and exponents. */
export function parseShutterCount(raw: string, min: number, max: number): number | undefined {
  const text = raw.trim();
  if (!/^\d{1,3}$/.test(text)) return undefined;
  const value = Number(text);
  return value >= min && value <= max ? value : undefined;
}

export function newTechnicianShutterRow(sortOrder: number): FireRatedRollerShutterRow {
  return {
    rowUuid: crypto.randomUUID(), source: "technician", configuredLocationId: null, configuredRowOrdinal: null,
    zoneSnapshot: null, locationSnapshot: null, assetReference: "", locationText: "",
    autoAlarmModeResult: null, manualModeResult: null, remarks: "", fieldRemarks: {}, sortOrder
  };
}

/** Append `count` blank technician rows after the existing ones, keeping sortOrder contiguous. */
export function addTechnicianShutterRows(responses: FireRatedRollerShutterResponses, count: number): FireRatedRollerShutterResponses {
  if (count <= 0) return responses;
  const rows = [...responses.rows];
  for (let index = 0; index < count; index += 1) rows.push(newTechnicianShutterRow(rows.length + 1));
  return { ...responses, rows };
}

/** The layout the form currently describes. `corrections` are the "Correct format for next visit"
 *  edits for configured rows; the inspection's own (frozen) rows are never changed by them. */
export function layoutRowsFromResponses(
  responses: FireRatedRollerShutterResponses,
  corrections: Record<string, { assetReference?: string; locationText?: string }>
): ShutterLayoutRow[] {
  return responses.rows.map((row) => ({
    assetReference: corrections[row.rowUuid]?.assetReference ?? row.assetReference,
    locationText: corrections[row.rowUuid]?.locationText ?? row.locationText
  }));
}

export function layoutDiffersFrom(saved: readonly ShutterLayoutRow[], proposed: readonly ShutterLayoutRow[]): boolean {
  return saved.length !== proposed.length || proposed.some((row, index) =>
    row.assetReference !== saved[index]!.assetReference || row.locationText !== saved[index]!.locationText);
}

/** Why this layout cannot be proposed, or undefined when it can. Mirrors the server's row bounds. */
export function layoutIssue(rows: readonly ShutterLayoutRow[]): string | undefined {
  if (!rows.length || rows.length > maxShutterRows || rows.some((row) => !row.locationText.trim())) {
    return "Add at least one Shutter with a location before saving a format.";
  }
  return undefined;
}
