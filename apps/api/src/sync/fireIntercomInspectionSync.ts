type R = Record<string, unknown>;
const rec = (value: unknown): value is R => typeof value === "object" && value !== null && !Array.isArray(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ExpectedConfiguredFireIntercomRow = {
  locationId: string;
  ordinal: number;
  sortOrder: number;
  assetReference: string;
  displayName: string;
};

/** Fire Intercom has no zone dimension (`configuration.supportsZones = false`),
 * so exactly like Smoke Ventilation - and unlike Hydrant/Hose Reel/Riser -
 * there is no zone snapshot or per-row location text to authenticate, only the
 * fixed Station Schedule identity (`locationId` + `ordinal` ->
 * `assetReference`). Configured rows come before technician rows. */
export function expectedConfiguredFireIntercomRows(system: R): ExpectedConfiguredFireIntercomRow[] | undefined {
  if (!uuid.test(String(system.enabledSystemId)) || !Array.isArray(system.locations)) return undefined;

  const enabledSystemId = system.enabledSystemId;
  const locations: Array<{ id: string; presetRowCount: number; assetReference: string; sortOrder: number; displayName: string }> = [];
  const locationIds = new Set<string>();
  const sortOrders = new Set<number>();
  for (const location of system.locations) {
    if (!rec(location) || typeof location.id !== "string" || !uuid.test(location.id) || location.enabledSystemId !== enabledSystemId
      || locationIds.has(location.id) || typeof location.displayName !== "string" || location.displayName.length === 0 || location.displayName.length > 300
      || !Number.isInteger(location.presetRowCount) || Number(location.presetRowCount) < 0 || Number(location.presetRowCount) > 250
      || !Number.isInteger(location.sortOrder) || Number(location.sortOrder) < 1 || sortOrders.has(Number(location.sortOrder))
      || location.zoneId !== null) return undefined;
    const assetReference = rec(location.rowPreset) && typeof location.rowPreset.assetReference === "string"
      ? location.rowPreset.assetReference
      : "";
    if (assetReference.length > 200) return undefined;
    locationIds.add(location.id);
    sortOrders.add(Number(location.sortOrder));
    locations.push({ id: location.id, presetRowCount: Number(location.presetRowCount), assetReference, sortOrder: Number(location.sortOrder), displayName: location.displayName });
  }

  const expected: ExpectedConfiguredFireIntercomRow[] = [];
  for (const location of locations.sort((left, right) => left.sortOrder - right.sortOrder)) {
    for (let ordinal = 1; ordinal <= location.presetRowCount; ordinal += 1) {
      expected.push({ locationId: location.id, ordinal, sortOrder: expected.length + 1, assetReference: location.assetReference, displayName: location.displayName });
    }
  }
  return expected.length <= 250 ? expected : undefined;
}

export function configuredFireIntercomRowsMatch(responses: unknown, expected: ExpectedConfiguredFireIntercomRow[]) {
  if (!rec(responses) || !Array.isArray(responses.rows)) return false;
  const expectedByIdentity = new Map(expected.map((row) => [`${row.locationId}:${row.ordinal}`, row]));
  if (expectedByIdentity.size !== expected.length) return false;

  const seen = new Set<string>();
  let technicianRowsStarted = false;
  for (const row of responses.rows) {
    if (!rec(row)) return false;
    if (row.source === "configured") {
      if (technicianRowsStarted || typeof row.configuredLocationId !== "string" || !Number.isInteger(row.configuredRowOrdinal)) return false;
      const identity = `${row.configuredLocationId}:${row.configuredRowOrdinal}`;
      const authoritative = expectedByIdentity.get(identity);
      if (!authoritative || seen.has(identity)
        || row.sortOrder !== authoritative.sortOrder
        || row.assetReference !== authoritative.assetReference
        || !rec(row.locationSnapshot) || Object.keys(row.locationSnapshot).length !== 2
        || row.locationSnapshot.id !== row.configuredLocationId || row.locationSnapshot.displayName !== authoritative.displayName) return false;
      seen.add(identity);
    } else {
      technicianRowsStarted = true;
      if (row.source !== "technician" || row.configuredLocationId !== null || row.configuredRowOrdinal !== null || row.locationSnapshot !== null) return false;
    }
  }
  return seen.size === expected.length;
}
