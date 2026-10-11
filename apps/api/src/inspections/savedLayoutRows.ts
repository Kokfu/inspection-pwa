/**
 * I-60: a location's saved layout (`rowPreset.rows`, what an approved `update-format` proposal stores) read exactly like the
 * web's `rowPresets` readers (`hydrantRepository.ts`, `dryWetRiserRepository.ts`): one `{assetReference, locationText}` per
 * configured row, index-aligned with `presetRowCount`. A missing or malformed list is NOT an error: the caller falls back to
 * the original rule for that location (every row reads as the location name with the location's single
 * `rowPreset.assetReference`), so every customer without a saved layout validates exactly as before. The web and the server
 * must make the same decision here, or a visit the web built is rejected.
 */
export type SavedLayoutRow = { assetReference: string; locationText: string };

export function savedLayoutRows(location: Record<string, unknown>): SavedLayoutRow[] | undefined {
  const preset = location.rowPreset;
  if (typeof preset !== "object" || preset === null || Array.isArray(preset)) return undefined;
  const rows = (preset as Record<string, unknown>).rows;
  if (!Array.isArray(rows) || rows.length !== location.presetRowCount) return undefined;
  const valid = rows.every((row: unknown) => {
    if (typeof row !== "object" || row === null || Array.isArray(row)) return false;
    const value = row as Record<string, unknown>;
    return Object.keys(value).length === 2
      && typeof value.assetReference === "string" && value.assetReference.length <= 200
      && typeof value.locationText === "string" && value.locationText.trim().length > 0 && value.locationText.length <= 300;
  });
  return valid ? rows as SavedLayoutRow[] : undefined;
}
