/**
 * Per-customer zone / location configuration parser + configurable-system
 * registry for the location-dependent master systems.
 *
 * `customer_system_zones` / `customer_system_locations` (+ their FKs and the
 * `enforce_location_zone_system` trigger) have existed since migrations 004/006.
 * Until now their rows were only ever created by the seed or forward-copied
 * verbatim by `copySelectedConfiguration`, so a Manager could not stand up a CO2
 * or Wet Chemical customer through the UI. This module is the single place that
 * validates a client-supplied zone/location payload for one system — mirroring
 * how `systemConfigurationSystemKeys` / `parseSystemConfiguration`
 * (`systemConfiguration.ts`) and `evidencePolicyAssignableSystemKeys` /
 * `parseEvidencePolicyIdInput` (`evidencePolicyAssignment.ts`) bound their
 * editors. Storage, forward-copy (`copySelectedConfiguration`) and job freeze
 * (`serviceVisits.ts`) stay system-agnostic, so this set can widen later with no
 * data migration.
 */

// Submitted zones/locations are cross-referenced by their `key` (a submitted
// `location.zoneId` holds a submitted zone `key`, not a UUID) — the persisted
// UUIDs are minted by `copySelectedConfiguration` at INSERT time — so this
// module needs no `uuidPattern`. It never imports route code by design.

/** Master systems whose "Assigned Services" checkbox is gated on valid existing
 *  zone/location authority (`locationDependentSystemKeys` in
 *  `managerCustomers.ts`). Widenable without a migration, exactly like
 *  `systemConfigurationSystemKeys`. */
export const locationConfigurableSystemKeys: ReadonlySet<string> = new Set([
  "co2_fire_extinguisher",
  "wet_chemical"
]);

const maxZones = 100;
const maxLocations = 500;
const maxKeyLength = 128;
const maxDisplayNameLength = 300;
const maxPresetRowCount = 500;
const maxRowPresetSerialized = 4000;

/** One normalised zone in a submitted zone/location payload. `key` is the zone's
 *  stable identity within the submission — a submitted `location.zoneId`
 *  references it, and `copySelectedConfiguration` maps it to a fresh UUID. */
export type LocationConfigurationZoneInput = {
  key: string;
  displayName: string;
  sortOrder: number;
};

/** One normalised location in a submitted zone/location payload. `zoneId` is the
 *  `key` of a submitted zone (never null for a location-dependent system —
 *  enforced here so the `serviceVisits.ts` buildSnapshot invariant, ~:131,
 *  always holds). `rowPreset` is frozen opaquely into the job snapshot. */
export type LocationConfigurationLocationInput = {
  key: string;
  displayName: string;
  zoneId: string;
  presetRowCount: number;
  rowPreset: Record<string, unknown>;
  sortOrder: number;
};

export type LocationConfigurationInput = {
  zones: LocationConfigurationZoneInput[];
  locations: LocationConfigurationLocationInput[];
};

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return undefined;
  return trimmed;
}

function parseZone(value: unknown, index: number): LocationConfigurationZoneInput | undefined {
  if (!object(value)) return undefined;
  if (Object.keys(value).some((key) => key !== "key" && key !== "displayName" && key !== "sortOrder")) return undefined;
  const key = boundedText(value.key, maxKeyLength);
  const displayName = boundedText(value.displayName, maxDisplayNameLength);
  if (!key || !displayName) return undefined;
  if (value.sortOrder !== undefined
    && (!Number.isInteger(value.sortOrder) || Number(value.sortOrder) < 1)) return undefined;
  // sort_order is always re-derived from submission order so the DB's
  // UNIQUE(enabled_system_id, sort_order) + CHECK(sort_order > 0) always hold.
  return { key, displayName, sortOrder: index + 1 };
}

function parseLocation(
  value: unknown, index: number, zoneKeys: ReadonlySet<string>
): LocationConfigurationLocationInput | undefined {
  if (!object(value)) return undefined;
  const allowed = new Set(["key", "displayName", "zoneId", "presetRowCount", "rowPreset"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return undefined;
  const key = boundedText(value.key, maxKeyLength);
  const displayName = boundedText(value.displayName, maxDisplayNameLength);
  if (!key || !displayName) return undefined;
  if (typeof value.zoneId !== "string" || !zoneKeys.has(value.zoneId)) return undefined;
  if (!Number.isInteger(value.presetRowCount)
    || Number(value.presetRowCount) < 1
    || Number(value.presetRowCount) > maxPresetRowCount) return undefined;
  let rowPreset: Record<string, unknown> = {};
  if (value.rowPreset !== undefined) {
    if (!object(value.rowPreset)) return undefined;
    let serialized: string;
    try { serialized = JSON.stringify(value.rowPreset); } catch { return undefined; }
    if (serialized.length > maxRowPresetSerialized) return undefined;
    rowPreset = value.rowPreset;
  }
  return {
    key,
    displayName,
    zoneId: value.zoneId,
    presetRowCount: Number(value.presetRowCount),
    rowPreset,
    sortOrder: index + 1
  };
}

/**
 * Validate a client-supplied `{ zones, locations }` payload for one
 * location-dependent system. Returns the normalised object to persist, or
 * `undefined` when the payload is not a shape the write path understands (the
 * caller turns that into a `400 INVALID_LOCATION_CONFIGURATION`).
 *
 * Rules: exactly the keys `zones` and `locations`, both arrays; zone keys
 * non-empty, bounded and unique; location keys non-empty, bounded and unique;
 * every `location.zoneId` references a submitted zone `key` (so a
 * location-dependent system never gets a null-zone location); `presetRowCount` a
 * bounded positive integer; optional `rowPreset` a bounded plain object. Empty
 * `zones` / `locations` are permitted here (an explicit "not configured"); the
 * `assertLocationDependentAssignments` guard is what keeps an enabled system from
 * losing valid authority.
 */
export function parseLocationConfigurationInput(value: unknown): LocationConfigurationInput | undefined {
  if (!object(value)) return undefined;
  if (Object.keys(value).some((key) => key !== "zones" && key !== "locations")) return undefined;
  const { zones: rawZones, locations: rawLocations } = value;
  if (!Array.isArray(rawZones) || !Array.isArray(rawLocations)) return undefined;
  if (rawZones.length > maxZones || rawLocations.length > maxLocations) return undefined;

  const zones: LocationConfigurationZoneInput[] = [];
  const zoneKeys = new Set<string>();
  for (const [index, raw] of rawZones.entries()) {
    const zone = parseZone(raw, index);
    if (!zone || zoneKeys.has(zone.key)) return undefined;
    zoneKeys.add(zone.key);
    zones.push(zone);
  }

  const locations: LocationConfigurationLocationInput[] = [];
  const locationKeys = new Set<string>();
  for (const [index, raw] of rawLocations.entries()) {
    const location = parseLocation(raw, index, zoneKeys);
    if (!location || locationKeys.has(location.key)) return undefined;
    locationKeys.add(location.key);
    locations.push(location);
  }

  return { zones, locations };
}
