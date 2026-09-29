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

/** Master systems with optional per-customer zone/location authority.
 *  New visits use a server-owned General location when none are set.
 *  Widenable without a migration, exactly like
 *  `systemConfigurationSystemKeys`. */
export const locationConfigurableSystemKeys: ReadonlySet<string> = new Set([
  "co2_fire_extinguisher",
  "wet_chemical",
  "fm200_fire_suppression",
  "hose_reel",
  "fire_rated_roller_shutter",
  "hydrant",
  "dry_wet_riser",
  "fire_alarm_detector"
]);

/** Systems with no real zone/location structure -- their `locations` are a fixed set of implicit
 *  keys rather than technician/Manager-named places. Roller Shutter and Hose Reel have exactly one
 *  ("general"); Fire Alarm has two, one per repeatable table (`fireAlarmRepository.ts`'s
 *  `configuredRows()` routes a whole location's rows to either table via `rowPreset.fireAlarmTable`,
 *  never both) -- so "Save as format" is one action per table, not a technician-named location. */
export const zoneFreeLocationKeysBySystem: Readonly<Record<string, readonly string[]>> = {
  fire_rated_roller_shutter: ["general"],
  hose_reel: ["general"],
  fire_alarm_detector: ["general-primary", "general-secondary"]
};

const maxZones = 100;
const maxLocations = 500;
const maxKeyLength = 128;
const maxDisplayNameLength = 300;
const maxPresetRowCount = 500;
const maxRowPresetSerialized = 4000;
const maxShutterRowPresetSerialized = 150_000;

/** One normalised zone in a submitted zone/location payload. `key` is the zone's
 *  stable identity within the submission — a submitted `location.zoneId`
 *  references it, and `copySelectedConfiguration` maps it to a fresh UUID. */
export type LocationConfigurationZoneInput = {
  key: string;
  displayName: string;
  sortOrder: number;
};

/** One normalised location. `zoneId` names a submitted zone, except for the
 *  zone-free Roller Shutter configuration. `rowPreset` is frozen into the job snapshot. */
export type LocationConfigurationLocationInput = {
  key: string;
  displayName: string;
  zoneId: string | null;
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
  value: unknown, index: number, zoneKeys: ReadonlySet<string>, allowNoZone: boolean
): LocationConfigurationLocationInput | undefined {
  if (!object(value)) return undefined;
  const allowed = new Set(["key", "displayName", "zoneId", "presetRowCount", "rowPreset"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return undefined;
  const key = boundedText(value.key, maxKeyLength);
  const displayName = boundedText(value.displayName, maxDisplayNameLength);
  if (!key || !displayName) return undefined;
  if (value.zoneId === null ? !allowNoZone : typeof value.zoneId !== "string" || !zoneKeys.has(value.zoneId)) return undefined;
  if (!Number.isInteger(value.presetRowCount)
    || Number(value.presetRowCount) < 1
    || Number(value.presetRowCount) > maxPresetRowCount) return undefined;
  let rowPreset: Record<string, unknown> = {};
  if (value.rowPreset !== undefined) {
    if (!object(value.rowPreset)) return undefined;
    let serialized: string;
    try { serialized = JSON.stringify(value.rowPreset); } catch { return undefined; }
    if (serialized.length > (allowNoZone ? maxShutterRowPresetSerialized : maxRowPresetSerialized)) return undefined;
    rowPreset = value.rowPreset;
  }
  return {
    key,
    displayName,
    zoneId: value.zoneId as string | null,
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
 * every `location.zoneId` references a submitted zone `key`, except zone-free
 * Roller Shutter locations; `presetRowCount` a
 * bounded positive integer; optional `rowPreset` a bounded plain object. Empty
 * `zones` / `locations` are permitted here (an explicit "not configured"); the
 * `assertLocationDependentAssignments` guard is what keeps an enabled system from
 * losing valid authority.
 */
export function parseLocationConfigurationInput(value: unknown, systemKey?: string): LocationConfigurationInput | undefined {
  if (!object(value)) return undefined;
  if (Object.keys(value).some((key) => key !== "zones" && key !== "locations")) return undefined;
  const { zones: rawZones, locations: rawLocations } = value;
  if (!Array.isArray(rawZones) || !Array.isArray(rawLocations)) return undefined;
  if (rawZones.length > maxZones || rawLocations.length > maxLocations) return undefined;
  const zoneFreeKeys = systemKey !== undefined ? zoneFreeLocationKeysBySystem[systemKey] : undefined;
  const allowNoZone = zoneFreeKeys !== undefined;
  if (allowNoZone && rawZones.length !== 0) return undefined;
  if (allowNoZone) {
    if (rawLocations.length > zoneFreeKeys.length) return undefined;
    const seenKeys = new Set<string>();
    for (const location of rawLocations) {
      if (!object(location) || typeof location.key !== "string" || !zoneFreeKeys.includes(location.key)
        || seenKeys.has(location.key) || !Number.isInteger(location.presetRowCount)
        || Number(location.presetRowCount) > 250) return undefined;
      seenKeys.add(location.key);
    }
  }

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
    const location = parseLocation(raw, index, zoneKeys, allowNoZone);
    if (!location || locationKeys.has(location.key)) return undefined;
    locationKeys.add(location.key);
    locations.push(location);
  }

  return { zones, locations };
}

/**
 * Location proposal patches (docs: Phase 1 redesign). A technician's proposal no longer carries "the
 * complete desired {zones, locations}" (that's `parseLocationConfigurationInput`, still used verbatim
 * by the Manager's own PUT route) -- it carries a scoped PATCH that the server merges into whatever
 * the customer's CURRENT state is at Approve time (`applyLocationProposalPatch`, called from
 * `locationProposals.ts`'s decision route). This is what makes proposing something offline-safe (no
 * need to know the current full structure) and lets two proposals targeting different locations of the
 * same system be pending, and approved, independently.
 *
 * `add-location`: names a brand-new location (no real inspection data exists yet -- that's the whole
 * reason this stays a separate, lightweight, naming-only patch kind rather than folding into
 * `update-format`). `update-format`: replaces an existing location's row count + per-row content,
 * derived from the live inspection form. Roller Shutter creates its zone-free General location
 * on the first approved format update.
 */
export type LocationProposalRowPreset = Record<string, string>;

const formatRowFieldsBySystem: Readonly<Record<string, readonly string[]>> = {
  co2_fire_extinguisher: ["alarmZone", "location"],
  wet_chemical: ["alarmZone", "location"],
  fm200_fire_suppression: ["alarmZone", "location"],
  fire_rated_roller_shutter: ["assetReference", "locationText"],
  hose_reel: ["assetReference", "locationText", "drumType"],
  hydrant: ["assetReference", "locationText"],
  dry_wet_riser: ["assetReference", "locationText"]
};

/** Fire Alarm's two pseudo-locations (see `zoneFreeLocationKeysBySystem`) carry different row shapes:
 *  `general-primary` rows mirror `FireAlarmPrimaryDeviceRow`'s identity columns (assetReference,
 *  alarmZone, location); `general-secondary` rows mirror `FireAlarmSecondaryAlarmDeviceRow`'s
 *  (assetReference, location -- no zone). The `locationKey` alone determines the shape, both at parse
 *  time and at merge time, so this needs no cross-reference against stored state. */
const fireAlarmFormatFieldsByLocationKey: Readonly<Record<string, readonly string[]>> = {
  "general-primary": ["assetReference", "alarmZone", "location"],
  "general-secondary": ["assetReference", "location"]
};
function formatRowFields(systemKey: string | undefined, locationKey: string): readonly string[] | undefined {
  if (systemKey === "fire_alarm_detector") return fireAlarmFormatFieldsByLocationKey[locationKey];
  return formatRowFieldsBySystem[systemKey ?? "co2_fire_extinguisher"];
}

export type LocationProposalAddPatch = {
  kind: "add-location";
  locationKey: string;
  displayName: string;
  zoneKey: string | null;
  newZone: { key: string; displayName: string } | null;
};

export type LocationProposalFormatPatch = {
  kind: "update-format";
  locationKey: string;
  rows: LocationProposalRowPreset[];
};

export type LocationProposalPatch = LocationProposalAddPatch | LocationProposalFormatPatch;

/** Free-text row content may legitimately be blank mid-Draft (the whole point of "save any time from
 *  Draft") -- unlike `boundedText`, empty is allowed here; only the max length is enforced. */
function boundedTextAllowEmpty(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || value.length > max) return undefined;
  return value;
}

function parseAddPatch(value: Record<string, unknown>): LocationProposalAddPatch | undefined {
  const allowed = new Set(["kind", "locationKey", "displayName", "zoneKey", "newZone"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return undefined;
  const locationKey = boundedText(value.locationKey, maxKeyLength);
  const displayName = boundedText(value.displayName, maxDisplayNameLength);
  if (!locationKey || !displayName) return undefined;
  const hasZoneKey = value.zoneKey !== null && value.zoneKey !== undefined;
  const hasNewZone = value.newZone !== null && value.newZone !== undefined;
  // Exactly one of zoneKey / newZone must be set.
  if (hasZoneKey === hasNewZone) return undefined;
  if (hasZoneKey) {
    const zoneKey = boundedText(value.zoneKey, maxKeyLength);
    if (!zoneKey) return undefined;
    return { kind: "add-location", locationKey, displayName, zoneKey, newZone: null };
  }
  if (!object(value.newZone) || Object.keys(value.newZone).some((key) => key !== "key" && key !== "displayName")) return undefined;
  const zoneKey = boundedText(value.newZone.key, maxKeyLength);
  const zoneDisplayName = boundedText(value.newZone.displayName, maxDisplayNameLength);
  if (!zoneKey || !zoneDisplayName) return undefined;
  return { kind: "add-location", locationKey, displayName, zoneKey: null, newZone: { key: zoneKey, displayName: zoneDisplayName } };
}

function parseRow(value: unknown, systemKey: string | undefined, locationKey: string): LocationProposalRowPreset | undefined {
  if (!object(value)) return undefined;
  const fields = formatRowFields(systemKey, locationKey);
  if (!fields || Object.keys(value).length !== fields.length
    || Object.keys(value).some((key) => !fields.includes(key))) return undefined;
  const parsed: LocationProposalRowPreset = {};
  for (const field of fields) {
    const text = boundedTextAllowEmpty(value[field], field === "assetReference" ? 200 : maxDisplayNameLength);
    if (text === undefined || (field === "locationText" && !text.trim())
      || (field === "drumType" && text !== "" && text !== "swing" && text !== "fixed")) return undefined;
    parsed[field] = text;
  }
  return parsed;
}

function parseFormatPatch(value: Record<string, unknown>, systemKey?: string): LocationProposalFormatPatch | undefined {
  const allowed = new Set(["kind", "locationKey", "rows"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return undefined;
  const locationKey = boundedText(value.locationKey, maxKeyLength);
  if (!locationKey) return undefined;
  const zoneFreeKeys = systemKey !== undefined ? zoneFreeLocationKeysBySystem[systemKey] : undefined;
  if (zoneFreeKeys !== undefined && !zoneFreeKeys.includes(locationKey)) return undefined;
  const capped250 = zoneFreeKeys !== undefined;
  if (!Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > maxPresetRowCount) return undefined;
  if (capped250 && value.rows.length > 250) return undefined;
  const rows: LocationProposalRowPreset[] = [];
  for (const raw of value.rows) {
    const row = parseRow(raw, systemKey, locationKey);
    if (!row) return undefined;
    rows.push(row);
  }
  if (capped250 && JSON.stringify({ rows }).length > maxShutterRowPresetSerialized) return undefined;
  return { kind: "update-format", locationKey, rows };
}

/** Validate a client-submitted location proposal patch. Returns `undefined` for a malformed body (the
 *  caller turns that into a `400 INVALID_LOCATION_PROPOSAL_REQUEST`); this is structural validation
 *  only -- whether `locationKey`/`zoneKey` actually exist is checked later, against LIVE state, by
 *  `applyLocationProposalPatch` at Approve time. */
export function parseLocationProposalPatch(value: unknown, systemKey?: string): LocationProposalPatch | undefined {
  if (!object(value)) return undefined;
  if (value.kind === "add-location") return systemKey !== undefined && systemKey in zoneFreeLocationKeysBySystem ? undefined : parseAddPatch(value);
  if (value.kind === "update-format") return parseFormatPatch(value, systemKey);
  return undefined;
}

/**
 * Pure merge: applies one patch to the CURRENT `{zones, locations}` of one system, returning the full
 * updated set to pass to `applyManagerLocationsUpdate` -- or `undefined` when the patch's target is
 * invalid against `current` (an `update-format` naming a `locationKey` that no longer exists,
 * except for Roller Shutter's first General format; an
 * `add-location` whose `locationKey` collides with an existing one, or whose `zoneKey` no longer
 * exists, or whose `newZone.key` collides with an existing zone). Every location/zone in `current`
 * OTHER than the patch's target is returned byte-identical -- the entire point of the patch redesign
 * is that two patches targeting different locations of the same system never clobber each other.
 */
export function applyLocationProposalPatch(
  current: LocationConfigurationInput, patch: LocationProposalPatch, systemKey?: string
): LocationConfigurationInput | undefined {
  if (patch.kind === "update-format") {
    const fireAlarmTable = systemKey === "fire_alarm_detector"
      ? (patch.locationKey === "general-primary" ? "primary" : patch.locationKey === "general-secondary" ? "secondary" : undefined)
      : undefined;
    const rowPreset: Record<string, unknown> = fireAlarmTable ? { fireAlarmTable, rows: patch.rows } : { rows: patch.rows };
    const index = current.locations.findIndex((location) => location.key === patch.locationKey);
    if (index === -1) {
      const zoneFreeKeys = systemKey !== undefined ? zoneFreeLocationKeysBySystem[systemKey] : undefined;
      if (!zoneFreeKeys || !zoneFreeKeys.includes(patch.locationKey) || current.zones.length !== 0
        || current.locations.length >= zoneFreeKeys.length) return undefined;
      const displayName = fireAlarmTable ? (fireAlarmTable === "primary" ? "General (Primary Devices)" : "General (Secondary Alarm Devices)") : "General";
      return { zones: [], locations: [...current.locations, { key: patch.locationKey, displayName, zoneId: null,
        presetRowCount: patch.rows.length, rowPreset, sortOrder: current.locations.length + 1 }] };
    }
    // Fire Alarm's routing (`rowPreset.fireAlarmTable`) is fully determined by `locationKey` and must
    // never diverge from how this location was bootstrapped -- fail closed rather than silently
    // re-route an existing location's rows to the other repeatable table.
    if (fireAlarmTable) {
      const existing = current.locations[index]!.rowPreset;
      const existingTable = object(existing) ? existing.fireAlarmTable : undefined;
      if (existingTable !== fireAlarmTable) return undefined;
    }
    const locations = current.locations.slice();
    locations[index] = { ...locations[index]!, presetRowCount: patch.rows.length, rowPreset };
    return { zones: current.zones, locations };
  }
  if (current.locations.some((location) => location.key === patch.locationKey)) return undefined;
  let zones = current.zones;
  let zoneId: string;
  if (patch.zoneKey !== null) {
    if (!current.zones.some((zone) => zone.key === patch.zoneKey)) return undefined;
    zoneId = patch.zoneKey;
  } else if (patch.newZone !== null) {
    if (current.zones.some((zone) => zone.key === patch.newZone!.key)) return undefined;
    zones = [...current.zones, { key: patch.newZone.key, displayName: patch.newZone.displayName, sortOrder: current.zones.length + 1 }];
    zoneId = patch.newZone.key;
  } else {
    return undefined;
  }
  const locations = [...current.locations, {
    key: patch.locationKey, displayName: patch.displayName, zoneId,
    presetRowCount: 1, rowPreset: {}, sortOrder: current.locations.length + 1
  }];
  return { zones, locations };
}
