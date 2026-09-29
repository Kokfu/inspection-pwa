/** Read a complete saved row format or fall back to the legacy flat label. */
export function singleInstanceAssetReferences(rowPreset: unknown, count: number): string[] {
  const preset = typeof rowPreset === "object" && rowPreset !== null && !Array.isArray(rowPreset)
    ? rowPreset as Record<string, unknown> : {};
  const fallback = typeof preset.assetReference === "string" && preset.assetReference.length <= 200
    ? preset.assetReference : "";
  const rows = preset.rows;
  if (!Array.isArray(rows) || rows.length !== count || !rows.every((row) =>
    typeof row === "object" && row !== null && !Array.isArray(row)
    && Object.keys(row).length === 1 && typeof row.assetReference === "string" && row.assetReference.length <= 200)) {
    return Array(count).fill(fallback) as string[];
  }
  return rows.map((row) => row.assetReference as string);
}
