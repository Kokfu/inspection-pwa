import {
  configuredSingleInstanceRowsMatch,
  expectedConfiguredSingleInstanceRows,
  type ExpectedConfiguredPresetRow
} from "./singleInstancePresetRows.js";

type R = Record<string, unknown>;
const rec = (value: unknown): value is R => typeof value === "object" && value !== null && !Array.isArray(value);

/** Fire Rated Roller Shutter has no zone dimension and a single primary instance, so its
 * configured Roller Shutter Schedule rows are authenticated by the shared no-zone
 * preset-row logic (see `singleInstancePresetRows.ts`) - identical to Smoke
 * Ventilation's Fan Schedule. The system-specific field validation stays in
 * `fireRatedRollerShutterV7Acceptance.ts`. */
export type ExpectedConfiguredFireRatedRollerShutterRow = ExpectedConfiguredPresetRow & { locationText: string };

function rowPresets(location: R): Array<{ assetReference: string; locationText: string }> | undefined {
  if (!rec(location.rowPreset) || !Array.isArray(location.rowPreset.rows)
    || location.rowPreset.rows.length !== location.presetRowCount) return undefined;
  const rows = location.rowPreset.rows;
  if (!rows.every((row) => rec(row) && Object.keys(row).length === 2
    && typeof row.assetReference === "string" && row.assetReference.length <= 200
    && typeof row.locationText === "string" && row.locationText.trim().length > 0 && row.locationText.length <= 300)) return undefined;
  return rows as Array<{ assetReference: string; locationText: string }>;
}

export function expectedConfiguredFireRatedRollerShutterRows(system: R): ExpectedConfiguredFireRatedRollerShutterRow[] | undefined {
  const base = expectedConfiguredSingleInstanceRows(system);
  if (!base || !Array.isArray(system.locations)) return undefined;
  const byId = new Map(system.locations.filter(rec).map((location) => [location.id, rowPresets(location)]));
  return base.map((row) => {
    const preset = byId.get(row.locationId)?.[row.ordinal - 1];
    return { ...row, assetReference: preset?.assetReference ?? row.assetReference,
      locationText: preset?.locationText ?? row.displayName };
  });
}

export function configuredFireRatedRollerShutterRowsMatch(responses: unknown, expected: ExpectedConfiguredFireRatedRollerShutterRow[]) {
  if (!configuredSingleInstanceRowsMatch(responses, expected)) return false;
  const rows = (responses as { rows: Array<{ source: string; configuredLocationId: string | null; configuredRowOrdinal: number | null; locationText: string }> }).rows;
  const locations = new Map(expected.map((row) => [`${row.locationId}:${row.ordinal}`, row.locationText]));
  return rows.every((row) => row.source !== "configured" || row.locationText === locations.get(`${row.configuredLocationId}:${row.configuredRowOrdinal}`));
}
