/**
 * I-45 / I-46: display-only helpers for the Fire Rated Roller Shutter schema 2 response.
 *
 * The stored response is never changed: configured rows keep their frozen order and a shutter the technician added
 * during a visit is stored after them. For reading, the rows are grouped by zone (zones in the order they first appear,
 * rows keeping their stored order inside a zone) so an added shutter sits next to its zone's other shutters.
 */

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const trimmed = (value: unknown) => typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/** True for a schema 2 Roller Shutter response whose rows can be grouped. */
export function isZonedRollerShutterResponse(response: unknown): response is RecordValue & { rows: unknown[] } {
  return isRecord(response) && response.schemaVersion === 2 && Array.isArray(response.rows);
}

/** Rows grouped by zone for display. Rows without a zone keep their place in a group of their own. */
export function rollerShutterRowsInDisplayOrder<T>(rows: readonly T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const zone = isRecord(row) ? trimmed(row.zoneText) ?? "" : "";
    const group = groups.get(zone);
    if (group) group.push(row); else groups.set(zone, [row]);
  }
  return [...groups.values()].flat();
}

/** "Zone 3 — Dock door", or just the location when the row has no zone. Null when the row has neither. */
export function rollerShutterRowLocation(row: unknown): string | null {
  if (!isRecord(row)) return null;
  const zone = trimmed(row.zoneText);
  const location = trimmed(row.locationText);
  if (location === null) return zone;
  return zone === null ? location : `${zone} — ${location}`;
}

/** The distinct zone headings, in display order. */
export function rollerShutterZones(rows: readonly unknown[]): string[] {
  return [...new Set(rollerShutterRowsInDisplayOrder(rows).map((row) => (isRecord(row) ? trimmed(row.zoneText) : null)).filter((zone): zone is string => zone !== null))];
}
