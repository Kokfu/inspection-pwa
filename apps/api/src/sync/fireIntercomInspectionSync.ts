import {
  configuredSingleInstanceRowsMatch,
  expectedConfiguredSingleInstanceRows,
  type ExpectedConfiguredPresetRow
} from "./singleInstancePresetRows.js";

type R = Record<string, unknown>;

/** Fire Intercom has no zone dimension and a single primary instance, so its
 * configured Station Schedule rows are authenticated by the shared no-zone
 * preset-row logic (see `singleInstancePresetRows.ts`) - identical to Smoke
 * Ventilation's Fan Schedule. The system-specific field validation stays in
 * `fireIntercomV7Acceptance.ts`. */
export type ExpectedConfiguredFireIntercomRow = ExpectedConfiguredPresetRow;

export function expectedConfiguredFireIntercomRows(system: R): ExpectedConfiguredFireIntercomRow[] | undefined {
  return expectedConfiguredSingleInstanceRows(system);
}

export function configuredFireIntercomRowsMatch(responses: unknown, expected: ExpectedConfiguredFireIntercomRow[]) {
  return configuredSingleInstanceRowsMatch(responses, expected);
}
