import {
  configuredSingleInstanceRowsMatch,
  expectedConfiguredSingleInstanceRows,
  type ExpectedConfiguredPresetRow
} from "./singleInstancePresetRows.js";

type R = Record<string, unknown>;

/** Smoke Ventilation has no zone dimension and a single primary instance, so its
 * configured Fan Schedule rows are authenticated by the shared no-zone
 * preset-row logic (see `singleInstancePresetRows.ts`). The system-specific
 * field validation stays in `smokeVentilationV7Acceptance.ts`. */
export type ExpectedConfiguredSmokeVentilationRow = ExpectedConfiguredPresetRow;

export function expectedConfiguredSmokeVentilationRows(system: R): ExpectedConfiguredSmokeVentilationRow[] | undefined {
  return expectedConfiguredSingleInstanceRows(system);
}

export function configuredSmokeVentilationRowsMatch(responses: unknown, expected: ExpectedConfiguredSmokeVentilationRow[]) {
  return configuredSingleInstanceRowsMatch(responses, expected);
}
