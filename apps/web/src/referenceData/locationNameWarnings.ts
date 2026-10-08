type Named = { displayName: string };
type ZonedLocation = Named & { zoneId: string | null };

const normalizedName = (name: string) => name.trim().toLowerCase();

/** Advisory only. Stable identities remain authoritative; repeated names are allowed. */
export function locationNameWarnings(zones: readonly Named[], locations: readonly ZonedLocation[]): string[] {
  const zoneNames = new Set<string>();
  const locationNamesByZone = new Map<string | null, Set<string>>();
  const duplicateZones = new Set<string>();
  const duplicateLocations = new Set<string>();
  for (const zone of zones) {
    const name = normalizedName(zone.displayName);
    if (!name) continue;
    if (zoneNames.has(name)) duplicateZones.add(name);
    zoneNames.add(name);
  }
  for (const location of locations) {
    const name = normalizedName(location.displayName);
    if (!name) continue;
    const names = locationNamesByZone.get(location.zoneId) ?? new Set<string>();
    if (names.has(name)) duplicateLocations.add(name);
    names.add(name);
    locationNamesByZone.set(location.zoneId, names);
  }
  const warnings: string[] = [];
  if (duplicateZones.size) warnings.push(`Duplicate zone names: ${[...duplicateZones].join(", ")}.`);
  if (duplicateLocations.size) warnings.push(`Duplicate location names within a zone: ${[...duplicateLocations].join(", ")}.`);
  return warnings;
}
