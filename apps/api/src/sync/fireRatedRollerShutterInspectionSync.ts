import { maxZoneTextLength } from "../inspections/locationConfiguration.js";
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
export type ExpectedConfiguredFireRatedRollerShutterRow = ExpectedConfiguredPresetRow & { locationText: string; zoneText: string };

/** A saved row is `{assetReference, locationText}` (legacy, no zone) or `{assetReference, locationText,
 *  zoneText}` (zone headings). `zoneText` is a free-text label, not a customer_system_zones row.
 *
 *  `legacy` reproduces what a pre-zone (schema-1) client built from the same preset: it only understood
 *  two-field rows, so a location holding any zoned row fell back wholesale to default row labels. A
 *  schema-1 record is therefore judged against that reading, never stranded by a newer layout. */
function rowPresets(location: R, legacy: boolean): Array<{ assetReference: string; locationText: string; zoneText?: string }> | undefined {
  if (!rec(location.rowPreset) || !Array.isArray(location.rowPreset.rows)
    || location.rowPreset.rows.length !== location.presetRowCount) return undefined;
  const rows = location.rowPreset.rows;
  if (legacy && rows.some((row) => rec(row) && Object.hasOwn(row, "zoneText"))) return undefined;
  if (!rows.every((row) => rec(row) && (Object.keys(row).length === 2 || (Object.keys(row).length === 3 && typeof row.zoneText === "string" && row.zoneText.length <= maxZoneTextLength))
    && typeof row.assetReference === "string" && row.assetReference.length <= 200
    && typeof row.locationText === "string" && row.locationText.trim().length > 0 && row.locationText.length <= 300)) return undefined;
  return rows as Array<{ assetReference: string; locationText: string; zoneText?: string }>;
}

/** `schemaVersion` is the submitted response's: 1 is judged against the legacy (pre-zone) reading of the preset. */
export function expectedConfiguredFireRatedRollerShutterRows(system: R, schemaVersion?: unknown): ExpectedConfiguredFireRatedRollerShutterRow[] | undefined {
  const base = expectedConfiguredSingleInstanceRows(system);
  if (!base || !Array.isArray(system.locations)) return undefined;
  const legacy = schemaVersion === 1;
  const byId = new Map(system.locations.filter(rec).map((location) => [location.id, rowPresets(location, legacy)]));
  return base.map((row) => {
    const preset = byId.get(row.locationId)?.[row.ordinal - 1];
    return { ...row, assetReference: preset?.assetReference ?? row.assetReference,
      locationText: preset?.locationText ?? row.displayName, zoneText: preset?.zoneText ?? "" };
  });
}

export function configuredFireRatedRollerShutterRowsMatch(responses: unknown, expected: ExpectedConfiguredFireRatedRollerShutterRow[]) {
  if (!configuredSingleInstanceRowsMatch(responses, expected)) return false;
  const body = responses as { schemaVersion?: number; rows: Array<{ source: string; configuredLocationId: string | null; configuredRowOrdinal: number | null; locationText: string; zoneText?: string }> };
  const byIdentity = new Map(expected.map((row) => [`${row.locationId}:${row.ordinal}`, row]));
  // Schema 2 rows carry the frozen zone heading and must equal it; schema 1 rows predate zone headings.
  return body.rows.every((row) => {
    if (row.source !== "configured") return true;
    const authoritative = byIdentity.get(`${row.configuredLocationId}:${row.configuredRowOrdinal}`);
    return authoritative !== undefined && row.locationText === authoritative.locationText
      && (body.schemaVersion !== 2 || row.zoneText === authoritative.zoneText);
  });
}
