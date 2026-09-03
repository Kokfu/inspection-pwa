import type { JobSystemSnapshot } from "../jobs/jobTypes";

export type RepeatableRowProvenance = {
  rowUuid: string;
  source: "configured" | "technician";
  configuredLocationId: string | null;
  configuredRowOrdinal: number | null;
  zoneSnapshot: { id: string; displayName: string } | null;
  locationSnapshot: { id: string; displayName: string } | null;
  assetReference: string;
  locationText: string;
  remarks: string;
  sortOrder: number;
};

export type RepeatableRow<TResults> = RepeatableRowProvenance & TResults;

export function buildConfiguredRows<TResults extends object>(
  system: JobSystemSnapshot,
  makeResults: () => TResults,
): RepeatableRow<TResults>[] {
  let sortOrder = 0;

  return system.locations.flatMap((location) =>
    Array.from({ length: location.presetRowCount }, (_, index) => {
      const zone = system.zones.find((candidate) => candidate.id === location.zoneId);
      const assetReference =
        typeof location.rowPreset === "object" &&
        location.rowPreset !== null &&
        "assetReference" in location.rowPreset &&
        typeof location.rowPreset.assetReference === "string"
          ? location.rowPreset.assetReference
          : "";

      // Result fields first, so the shared provenance below always wins even if a
      // TResults type accidentally names a provenance key.
      return {
        ...makeResults(),
        rowUuid: crypto.randomUUID(),
        source: "configured",
        configuredLocationId: location.id,
        configuredRowOrdinal: index + 1,
        zoneSnapshot: zone ? { id: location.zoneId!, displayName: zone.displayName } : null,
        locationSnapshot: { id: location.id, displayName: location.displayName },
        assetReference,
        locationText: location.displayName,
        remarks: "",
        sortOrder: ++sortOrder,
      } as RepeatableRow<TResults>;
    }),
  );
}

export function repeatableRowIssues<TResults>(
  rows: readonly RepeatableRow<TResults>[],
  system: JobSystemSnapshot,
  opts: { maximum: number },
): string[] {
  const issues: string[] = [];
  const expectedConfiguredRows = new Set(
    system.locations.flatMap((location) =>
      Array.from({ length: location.presetRowCount }, (_, index) => `${location.id}:${index + 1}`),
    ),
  );
  const configuredCounts = new Map<string, number>();
  const rowUuids = new Set<string>();

  if (rows.length < 1 || rows.length > opts.maximum) {
    issues.push(`Rows must contain between 1 and ${opts.maximum} entries`);
  }

  rows.forEach((row, index) => {
    if (!row.locationText?.trim() || row.locationText.length > 300) {
      issues.push("Row location text is invalid");
    }

    if (row.sortOrder !== index + 1) {
      issues.push("Row ordering must be dense and 1-based");
    }

    if (!row.rowUuid || rowUuids.has(row.rowUuid)) {
      issues.push("Row UUIDs must be unique");
    }
    rowUuids.add(row.rowUuid);

    if (row.source === "configured") {
      if (!row.configuredLocationId || !row.configuredRowOrdinal) {
        issues.push("Configured row provenance is invalid");
      } else {
        const configuredKey = `${row.configuredLocationId}:${row.configuredRowOrdinal}`;
        configuredCounts.set(configuredKey, (configuredCounts.get(configuredKey) ?? 0) + 1);
      }
    } else if (row.source === "technician") {
      if (row.configuredLocationId !== null || row.configuredRowOrdinal !== null) {
        issues.push("Technician row provenance is invalid");
      }
    } else {
      issues.push("Row provenance is invalid");
    }
  });

  for (const configuredKey of expectedConfiguredRows) {
    if (configuredCounts.get(configuredKey) !== 1) {
      issues.push("Configured rows must be retained exactly once");
      break;
    }
  }

  for (const configuredKey of configuredCounts.keys()) {
    if (!expectedConfiguredRows.has(configuredKey)) {
      issues.push("Configured row provenance is invalid");
      break;
    }
  }

  return issues;
}
