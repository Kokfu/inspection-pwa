import type { FireRatedRollerShutterResponses, FireRatedRollerShutterRow } from "./fireRatedRollerShutterTypes";

/** Server cap on Roller Shutter schedule rows (`validResponses`); also the cap on a saved layout. */
export const maxShutterRows = 250;

/** One saved-layout row, exactly the shape the `update-format` proposal carries. `zoneText` is present
 *  only when the layout uses zone headings (all rows carry it, or none does). */
export type ShutterLayoutRow = { assetReference: string; locationText: string; zoneText?: string };
export type RollerShutterSetupStep = "count" | "confirm";
/** What the pre-form step hands back: a zones x locations plan (first visit) or extra unzoned rows. */
export type RollerShutterStart = { plan: ZonePlan[] } | { extraRows: number };

/** Which pre-form step a freshly opened Draft needs, decided from its persisted content only.
 *  - `count`: nothing configured and nothing entered -> ask how many shutters to inspect.
 *  - `confirm`: only untouched configured rows -> show the saved layout ("same as last time").
 *  Anything the technician has already entered skips the step, so reopening real work never
 *  puts a prompt in front of it. */
export function rollerShutterSetupStep(responses: FireRatedRollerShutterResponses): RollerShutterSetupStep | null {
  // Schema-1 drafts predate zone headings and keep their original flat flow.
  if (responses.schemaVersion !== 2) return null;
  if (responses.dateTested || responses.zone || responses.inspectedBy || responses.comments) return null;
  if (responses.rows.length === 0) return "count";
  return responses.rows.every(untouchedConfiguredRow) ? "confirm" : null;
}

function untouchedConfiguredRow(row: FireRatedRollerShutterRow) {
  return row.source === "configured" && row.autoAlarmModeResult === null && row.manualModeResult === null
    && !row.remarks && Object.keys(row.fieldRemarks ?? {}).length === 0;
}

/** A whole number within [min, max], or undefined. Rejects blanks, decimals, signs and exponents. */
export function parseShutterCount(raw: string, min: number, max: number): number | undefined {
  const text = raw.trim();
  if (!/^\d{1,3}$/.test(text)) return undefined;
  const value = Number(text);
  return value >= min && value <= max ? value : undefined;
}

/** `zoneText` is passed for schema-2 records (every row carries the key) and omitted for schema 1. */
export function newTechnicianShutterRow(sortOrder: number, zoneText?: string): FireRatedRollerShutterRow {
  return {
    rowUuid: crypto.randomUUID(), source: "technician", configuredLocationId: null, configuredRowOrdinal: null,
    zoneSnapshot: null, locationSnapshot: null, assetReference: "", locationText: "",
    ...(zoneText === undefined ? {} : { zoneText }),
    autoAlarmModeResult: null, manualModeResult: null, remarks: "", fieldRemarks: {}, sortOrder
  };
}

/** One blank row for the record's own schema: schema 2 rows start in the unnamed zone. */
export function newRowFor(responses: FireRatedRollerShutterResponses, sortOrder: number): FireRatedRollerShutterRow {
  return newTechnicianShutterRow(sortOrder, responses.schemaVersion === 2 ? "" : undefined);
}

/** Append `count` blank technician rows after the existing ones, keeping sortOrder contiguous. */
export function addTechnicianShutterRows(responses: FireRatedRollerShutterResponses, count: number): FireRatedRollerShutterResponses {
  if (count <= 0) return responses;
  const rows = [...responses.rows];
  for (let index = 0; index < count; index += 1) rows.push(newRowFor(responses, rows.length + 1));
  return { ...responses, rows };
}

export type ShutterLayoutCorrections = Record<string, { assetReference?: string; locationText?: string; zoneText?: string }>;

/** The layout the form currently describes. `corrections` are the "Correct format for next visit"
 *  edits for configured rows; the inspection's own (frozen) rows are never changed by them.
 *  A zoned layout (schema 2 with at least one named zone) lists rows grouped by zone, in the order
 *  each zone first appears, so the next visit's pre-filled rows are already grouped. */
export function layoutRowsFromResponses(responses: FireRatedRollerShutterResponses, corrections: ShutterLayoutCorrections): ShutterLayoutRow[] {
  const items = responses.rows.map((row) => ({
    assetReference: corrections[row.rowUuid]?.assetReference ?? row.assetReference,
    locationText: corrections[row.rowUuid]?.locationText ?? row.locationText,
    zone: corrections[row.rowUuid]?.zoneText ?? row.zoneText ?? ""
  }));
  if (responses.schemaVersion !== 2 || items.every((item) => item.zone.trim() === "")) {
    return items.map(({ assetReference, locationText }) => ({ assetReference, locationText }));
  }
  const zones = [...new Set(items.map((item) => item.zone))];
  return zones.flatMap((zone) => items.filter((item) => item.zone === zone)
    .map(({ assetReference, locationText }) => ({ assetReference, locationText, zoneText: zone })));
}

export function layoutDiffersFrom(saved: readonly ShutterLayoutRow[], proposed: readonly ShutterLayoutRow[]): boolean {
  return saved.length !== proposed.length || proposed.some((row, index) =>
    row.assetReference !== saved[index]!.assetReference || row.locationText !== saved[index]!.locationText
    || (row.zoneText ?? "") !== (saved[index]!.zoneText ?? ""));
}

/** Rows grouped by zone heading, in the order each zone first appears. A group that holds a configured
 *  row keeps its frozen heading (it cannot be renamed here); a technician-only group can be. */
export type ShutterZoneGroup = { zoneText: string; rows: FireRatedRollerShutterRow[]; hasConfigured: boolean };
export function zoneGroups(rows: readonly FireRatedRollerShutterRow[]): ShutterZoneGroup[] {
  const groups: ShutterZoneGroup[] = [];
  for (const row of rows) {
    const zoneText = row.zoneText ?? "";
    let group = groups.find((candidate) => candidate.zoneText === zoneText);
    if (!group) { group = { zoneText, rows: [], hasConfigured: false }; groups.push(group); }
    group.rows.push(row);
    if (row.source === "configured") group.hasConfigured = true;
  }
  return groups;
}

const renumbered = (rows: FireRatedRollerShutterRow[]) => rows.map((row, index) => ({ ...row, sortOrder: index + 1 }));

/** Insert a blank technician row into `zoneText`. Configured rows always stay first, so the row goes
 *  after the zone's last technician row, or at the start of the technician rows when it has none. */
export function addRowToZone(responses: FireRatedRollerShutterResponses, zoneText: string): FireRatedRollerShutterResponses {
  if (responses.rows.length >= maxShutterRows) return responses;
  const rows = [...responses.rows];
  const technicianStart = rows.findIndex((row) => row.source === "technician");
  let insertAt = technicianStart === -1 ? rows.length : technicianStart;
  rows.forEach((row, index) => { if (row.source === "technician" && (row.zoneText ?? "") === zoneText) insertAt = index + 1; });
  rows.splice(insertAt, 0, { ...newTechnicianShutterRow(0), zoneText });
  return { ...responses, rows: renumbered(rows) };
}

/** Add a new zone with one blank row. When the form still has a single unnamed technician zone, that
 *  zone becomes "Zone 1" so the new one reads "Zone 2". */
export function addZone(responses: FireRatedRollerShutterResponses): FireRatedRollerShutterResponses {
  if (responses.rows.length >= maxShutterRows) return responses;
  let current = responses;
  const groups = zoneGroups(current.rows);
  if (groups.length === 1 && groups[0]!.zoneText === "" && !groups[0]!.hasConfigured) current = renameTechnicianZone(current, "", "Zone 1");
  const used = new Set(zoneGroups(current.rows).map((group) => group.zoneText));
  let number = used.size + 1;
  while (used.has(`Zone ${number}`)) number += 1;
  return { ...current, rows: renumbered([...current.rows, { ...newTechnicianShutterRow(0), zoneText: `Zone ${number}` }]) };
}

/** Rename a technician-only zone. Configured rows keep their frozen heading, so a zone that holds one is left alone. */
export function renameTechnicianZone(responses: FireRatedRollerShutterResponses, from: string, to: string): FireRatedRollerShutterResponses {
  if (from === to || responses.rows.some((row) => row.source === "configured" && (row.zoneText ?? "") === from)) return responses;
  return { ...responses, rows: responses.rows.map((row) => row.source === "technician" && (row.zoneText ?? "") === from ? { ...row, zoneText: to } : row) };
}

/** The first-visit plan: how many zones, and how many locations (shutters) in each. */
export const maxZones = 50;
export type ZonePlan = { name: string; count: number };
export function defaultZoneName(index: number, zoneCount: number): string { return zoneCount === 1 ? "" : `Zone ${index + 1}`; }

/** Validate the "How many zones / locations?" inputs. `overrides[i]` replaces the per-zone default for zone i. */
export function parseZonePlan(zonesRaw: string, perZoneRaw: string, overrides: Readonly<Record<number, string>> = {}): { plan: ZonePlan[] } | { error: string } {
  const zones = parseShutterCount(zonesRaw, 1, maxZones);
  if (zones === undefined) return { error: `Enter a whole number of zones from 1 to ${maxZones}.` };
  const plan: ZonePlan[] = [];
  let total = 0;
  for (let index = 0; index < zones; index += 1) {
    const raw = (overrides[index] ?? "").trim() === "" ? perZoneRaw : overrides[index]!;
    const count = parseShutterCount(raw, 1, maxShutterRows);
    if (count === undefined) {
      return { error: overrides[index]?.trim() ? `Zone ${index + 1} needs a whole number of locations from 1 to ${maxShutterRows}.` : `Enter a whole number of locations from 1 to ${maxShutterRows}.` };
    }
    total += count;
    plan.push({ name: defaultZoneName(index, zones), count });
  }
  if (total > maxShutterRows) return { error: `That is ${total} shutters. A visit can have at most ${maxShutterRows}.` };
  return { plan };
}

/** Append blank technician rows for each zone of the plan, in order. */
export function addPlannedZoneRows(responses: FireRatedRollerShutterResponses, plan: readonly ZonePlan[]): FireRatedRollerShutterResponses {
  const rows = [...responses.rows];
  for (const zone of plan) for (let index = 0; index < zone.count; index += 1) rows.push({ ...newTechnicianShutterRow(rows.length + 1), zoneText: zone.name });
  return { ...responses, rows };
}

export type LayoutProposalDecision =
  | { action: "skip" }
  | { action: "note"; note: string }
  | { action: "send" };

/** What the submit-time layout save should do. `existingStatus` is the local proposal draft already
 *  stored for this job + system (a second proposal would overwrite its draft row and strand its outbox item). */
export function decideLayoutProposal(
  saved: readonly ShutterLayoutRow[], proposed: readonly ShutterLayoutRow[], existingStatus: string | undefined
): LayoutProposalDecision {
  if (!layoutDiffersFrom(saved, proposed)) return { action: "skip" };
  const issue = layoutIssue(proposed);
  if (issue) return { action: "note", note: `Inspection submitted. The shutter layout was not saved for next visit: ${issue}` };
  if (existingStatus !== undefined && existingStatus !== "Draft") {
    return { action: "note", note: "Inspection submitted. A shutter layout for this visit was already sent for review." };
  }
  return { action: "send" };
}

/** Why this layout cannot be proposed, or undefined when it can. Mirrors the server's row bounds. */
export function layoutIssue(rows: readonly ShutterLayoutRow[]): string | undefined {
  if (!rows.length || rows.length > maxShutterRows || rows.some((row) => !row.locationText.trim())) {
    return "Add at least one Shutter with a location before saving a format.";
  }
  return undefined;
}
