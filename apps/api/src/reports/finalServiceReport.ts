import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { QueryResultRow } from "pg";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { loadConfig } from "../config/env.js";
import { buildJobCompletion, type AcceptedAuthorityRow, type CompletionJobRow } from "../jobs/jobCompletion.js";
import { resolveCo2Controls } from "../inspections/templates/co2DefinitionControls.js";
import { resolveAutomaticSprinklerControls } from "../inspections/templates/automaticSprinklerDefinitionControls.js";
import { resolveHoseReelControls } from "../inspections/templates/definitionControls.js";
import { applyLabelOverrides, collectResolvedLabelPaths } from "../inspections/labelOverrides.js";
import { validateCo2Responses } from "../sync/co2FormInstanceSync.js";
import { validateAutomaticSprinklerHistoricalPayload } from "../sync/automaticSprinklerInspectionSync.js";
import { validStoredDryWetRiser } from "../inspections/dryWetRiserAccepted.js";
import { validateHoseReelHistoricalPayload } from "../inspections/acceptedMasterSystemDetail.js";
import { validateFireAlarmHistoricalPayload } from "../inspections/fireAlarmAccepted.js";
import { resolveFireAlarmV6Controls } from "../inspections/templates/fireAlarmDefinitionControls.js";
import { validateHydrantHistoricalPayload } from "../sync/hydrantInspectionSync.js";
import { validatePortableHistoricalPayload } from "../sync/portableFireExtinguisherSync.js";
import { parseV7EvidenceManifest, resolveV7EvidenceContract } from "../inspections/evidence/v7EvidenceContracts.js";

type RecordValue = Record<string, unknown>;
type Queryable = { query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }> };

export type FinalReportErrorCode = "JOB_NOT_FOUND" | "FINAL_REPORT_NOT_AVAILABLE" | "FINAL_REPORT_DATA_INVALID";
export class FinalReportError extends Error {
  constructor(public readonly code: FinalReportErrorCode, public readonly status: number, message: string) { super(message); }
}

export type FinalReportField = { label: string; value: string; depth: number };
export type FinalReportEvidence = { field: string; caption?: string; content: Buffer; width: number; height: number };
export type FinalReportLocation = { locationId: string; locationLabel: string; zoneId: string | null; zoneLabel: string | null; instanceKey: string };
export type FinalReportSection = { systemKey: string; label: string; location?: FinalReportLocation; fields: FinalReportField[]; evidence: FinalReportEvidence[] };
/**
 * Derived, report-output-only per-system roll-up after the client's "Summary of
 * Testing" (docs/client-format-request/asiamost-sample-report-format.md §1,
 * Option 1 of docs/client-format-request/format-adoption-options.md). It is NOT a
 * stored field, NOT a template/contract field, and is a different axis from the
 * per-field result model (4-state good/not_good/complete_repair/na since d7ecc0d;
 * legacy 3-state good/poor/not_relevant). The 4->3 mapping below is PROVISIONAL,
 * pending client confirmation:
 *   any field "Not Good" / "Poor"        -> FAILED
 *   else any field "Complete Repair"     -> REFER DETAIL PAGE
 *   else (Good / N.A. / Not Relevant)    -> GOOD CONDITIONS
 */
export type FinalReportSystemCondition = "GOOD CONDITIONS" | "REFER DETAIL PAGE" | "FAILED";
export type FinalServiceReport = {
  customer: string; site: string; serviceDate: string; jobReference: string; completedAt: string; completedBy: string;
  systems: Array<{ systemKey: string; label: string; status: "Accepted"; condition: FinalReportSystemCondition; conditionDetail: string; locations: string[] }>;
  sections: FinalReportSection[];
};

type ReportJobRow = CompletionJobRow & { reference: string; title: string; service_date: string | null };
type ReportInstanceRow = AcceptedAuthorityRow & { form_instance_id: string; master_template_version_id: string; customer_configuration_revision_id: string; inspection_snapshot: unknown; response_payload: unknown; stored_sha256: string | null; storage_relative_path: string | null; width: number | null; height: number | null };
const supported = new Set(["automatic_sprinkler", "dry_wet_riser", "hose_reel", "fire_alarm_detector", "hydrant", "co2_fire_extinguisher", "wet_chemical", "portable_fire_extinguisher", "smoke_ventilation", "fire_intercom"]);
const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const exactKeys = (value: RecordValue, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : isRecord(value) ? `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const text = (value: unknown, maximum = 4000): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
function requiredText(value: unknown, maximum: number, message: string): string {
  if (!text(value, maximum)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, message);
  return value;
}
function optionalAssetReference(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 250) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 report data is invalid.");
  return value.trim().length > 0 ? value : undefined;
}

function prettifyLabelSegment(segment: string) {
  return segment.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Display label for a flattened response path. With no `lookup` the whole key is
 * prettified exactly as before slice 1a-iv — splitting on " - " and rejoining is
 * a no-op for `prettifyLabelSegment`, which never adds or consumes " - " (`-` is
 * not `_` and not a camelCase hump), so a report for a job with no frozen
 * override map stays byte-identical, PDF bytes included.
 *
 * With a `lookup` (per-system `responseKey -> frozen/overridden display label`,
 * see `v7DisplayLabelLookup`), each " - "-joined segment the lookup covers is
 * replaced by that label and every other segment is prettified as before. This
 * keeps the structural " - Result" / " - Remarks" suffixes that
 * `sectionRemarkLines` matches on, and only swaps the field-name segment.
 */
function labelFor(key: string, lookup?: ReadonlyMap<string, string>) {
  if (!lookup) return prettifyLabelSegment(key);
  return key.split(" - ").map((segment) => lookup.get(segment) ?? prettifyLabelSegment(segment)).join(" - ");
}

type V7DisplayLabels = { display: ReadonlyMap<string, string>; definition: ReadonlyMap<string, string> };

/**
 * The accepted V7 response is intentionally not a serialization of the
 * resolved controls tree.  These are the explicit, contract-owned response
 * aliases for the few resolved keys whose spelling differs.  Do not replace
 * this with a casing heuristic: a response key is part of each system's
 * frozen contract and Wet Chemical's second detector demonstrates why.
 *
 * The `"…Status 1" / " 2" / " 3"` variants exist because the frozen V7 CO2 /
 * Wet Chemical detector columns are `normal_test_isolation_multi` (multi_select):
 * the response serializes each as an ordered array, so `flatten` renders the
 * per-element segments as `<row> - heatDetectorStatus 1` … `- heatDetectorStatus 3`
 * (bounded at 3 — normal / test / isolation are the only options). Registering
 * the bare key plus those three bounded segments points every rendered form of
 * the column at the frozen/overridden definition wording.
 */
const v7DisplayResponseKeyAliases: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  hose_reel: {
    drum: ["drumResult"], hose: ["hoseResult"], nozzle: ["nozzleResult"], valve: ["valveResult"], nozzle_box: ["nozzleBoxResult"]
  },
  co2_fire_extinguisher: {
    control_panel_location: ["controlPanelLocation"], alarm_zone: ["alarmZone"], heat_detector: ["heatDetectorStatus", "heatDetectorStatus 1", "heatDetectorStatus 2", "heatDetectorStatus 3"], smoke_detector: ["smokeDetectorStatus", "smokeDetectorStatus 1", "smokeDetectorStatus 2", "smokeDetectorStatus 3"]
  },
  wet_chemical: {
    control_panel_location: ["controlPanelLocation"], alarm_zone: ["alarmZone"], heat_detector: ["heatDetectorStatus", "heatDetectorStatus 1", "heatDetectorStatus 2", "heatDetectorStatus 3"], unconfirmed_second_heat_detector: ["smokeDetectorStatus", "smokeDetectorStatus 1", "smokeDetectorStatus 2", "smokeDetectorStatus 3"]
  }
};

/**
 * Slice 1a-iv: a per-system flat `responseKey -> displayLabel` lookup for the
 * four systems that carry per-customer display-label overrides
 * (`automatic_sprinkler`, `co2_fire_extinguisher`, `wet_chemical`, `hose_reel`).
 *
 * Built ONLY from the frozen authority chain: the existing per-system resolver
 * runs on the accepted snapshot's frozen `system.definition` at the frozen
 * `template.version`, then `applyLabelOverrides` swaps labels ONCE, on a clone,
 * using the map frozen into the JOB's `configuration_snapshot` for this system
 * (`frozenSystem.labelOverrides`) — never the live customer revision. Display
 * strings only: keys, response shape, evidence `fieldPath`s and
 * `contractSha256 = sha256(canonical(definition))` are untouched.
 *
 * `flatten()` walks the RESPONSE payload, whose path shape
 * (`checklist.trfp_jockey_pump`) does not line up with the resolved-controls
 * path shape (`checklist.testRunFirePump.trfp_jockey_pump`). Response keys are
 * unique within a system, so a flat `key -> label` map sidesteps the mismatch
 * (KEY DESIGN POINT of the 1a-iv brief). The only key that resolves to more than
 * one label in a tree is the generic single-measurement value key `value`; such
 * a key is dropped so it prettifies exactly as before rather than an arbitrary
 * winner. The CO2 / Wet Chemical camelCase response keys
 * (`controlPanelLocation`, `alarmZone`, the `heatDetectorStatus` /
 * `smokeDetectorStatus` detector columns) are covered too, via the explicit
 * `v7DisplayResponseKeyAliases` table above. `labelFor` keeps the prettifier as
 * the fallback only for keys genuinely outside the tree and the alias table
 * (row `remarks`, `rowUuid`, `displaySequence`, `unit`, …).
 *
 * Returns `undefined` (labels and evidence captions fall back to the pre-1a-iv
 * behaviour, byte-identical) for any non-V7 record, any out-of-scope system, a
 * tree whose every label survived unchanged with an empty map, or a resolver
 * failure.
 */
function v7DisplayLabelLookup(systemKey: string, snapshot: unknown, frozenSystem: unknown): V7DisplayLabels | undefined {
  if (!isRecord(snapshot) || snapshot.schemaVersion !== 2 || !isRecord(snapshot.system) || !isRecord(snapshot.template)) return undefined;
  const definition = snapshot.system.definition;
  const version = snapshot.template.version;
  if (!isRecord(definition) || typeof version !== "number") return undefined;
  let resolved: unknown;
  try {
    if (systemKey === "automatic_sprinkler") resolved = resolveAutomaticSprinklerControls(definition, "MFE-FSSR", version);
    else if (systemKey === "co2_fire_extinguisher" || systemKey === "wet_chemical") resolved = resolveCo2Controls(definition, "MFE-FSSR", version);
    else if (systemKey === "hose_reel") resolved = resolveHoseReelControls(definition, "MFE-FSSR", version);
    else return undefined;
  } catch { return undefined; }
  const overrides = isRecord(frozenSystem) ? frozenSystem.labelOverrides : undefined;
  const overridden = applyLabelOverrides(resolved, overrides);
  // `entry.definitionLabel` is `fieldNode.label` from the walked tree — i.e. the
  // EFFECTIVE label after any override on `overridden`, and the pure definition
  // label on `resolved`.
  const aliases = v7DisplayResponseKeyAliases[systemKey] ?? {};
  const build = (tree: unknown) => {
    const map = new Map<string, string>();
    const ambiguous = new Set<string>();
    const register = (key: string, label: string) => {
      if (ambiguous.has(key)) return;
      const existing = map.get(key);
      if (existing === undefined) map.set(key, label);
      else if (existing !== label) { map.delete(key); ambiguous.add(key); }
    };
    for (const entry of collectResolvedLabelPaths(tree)) {
      register(entry.key, entry.definitionLabel);
      for (const alias of aliases[entry.key] ?? []) register(alias, entry.definitionLabel);
    }
    return { map, ambiguous };
  };
  const display = build(overridden);
  const definition_ = overridden === resolved ? { map: new Map(display.map), ambiguous: display.ambiguous } : build(resolved);
  // A key ambiguous in EITHER tree is dropped from BOTH, so the field map and the
  // evidence-caption suffix swap always agree on which keys they cover.
  for (const key of display.ambiguous) definition_.map.delete(key);
  for (const key of definition_.ambiguous) display.map.delete(key);
  if (display.map.size === 0) return undefined;
  return { display: display.map, definition: definition_.map };
}

/**
 * Slice 1a-iv: when the job froze an override that RENAMES an evidenced field,
 * swap the field-name suffix of the V7 evidence-contract caption so the PDF's
 * "Final evidence included: …" line matches the renamed field label. Surgical:
 * fires only when a real rename exists AND the frozen contract caption ends with
 * the exact definition label, so a job with no override is byte-identical. The
 * frozen evidence contract (`v7EvidenceContracts.ts`) stays the caption
 * authority; this is display-only, on the already-built report object.
 */
function remapEvidenceCaptions(evidence: FinalReportEvidence[], labels: V7DisplayLabels) {
  for (const item of evidence) {
    const key = String(item.field).split(".").pop() ?? "";
    const definitionLabel = labels.definition.get(key);
    const displayLabel = labels.display.get(key);
    if (definitionLabel !== undefined && displayLabel !== undefined && definitionLabel !== displayLabel
      && item.caption !== undefined && item.caption.endsWith(definitionLabel)) {
      item.caption = `${item.caption.slice(0, item.caption.length - definitionLabel.length)}${displayLabel}`;
    }
  }
}

function scalar(value: unknown) {
  if (typeof value === "string") {
    const labels: Readonly<Record<string, string>> = {
      good: "Good", poor: "Poor", not_relevant: "Not Relevant",
      not_good: "Not Good", complete_repair: "Complete Repair", na: "No Need Checking / N.A.",
      normal: "Normal", test: "Test", isolation: "Isolation"
    };
    return labels[value] ?? value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "Not recorded";
  return undefined;
}

/** Keeps the accepted response's JSON insertion order, which is the submitted form/section order. */
function flatten(value: unknown, prefix = "", depth = 0, output: FinalReportField[] = [], lookup?: ReadonlyMap<string, string>) {
  const simple = scalar(value);
  if (simple !== undefined) { output.push({ label: labelFor(prefix || "Result", lookup), value: simple, depth }); return output; }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix || "Item"} ${index + 1}`, depth + 1, output, lookup));
    return output;
  }
  if (!isRecord(value)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted inspection data is malformed and cannot be reported.");
  for (const [key, child] of Object.entries(value)) {
    if (key === "schemaVersion" || /(^|_)(id|uuid)$|Id$/.test(key)) continue;
    flatten(child, prefix ? `${prefix} - ${key}` : key, depth + (prefix ? 1 : 0), output, lookup);
  }
  return output;
}

function expectedSystem(snapshot: unknown, key: string) {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.enabledSystems)) return undefined;
  return snapshot.enabledSystems.find((system) => isRecord(system) && system.systemKey === key && system.definitionStatus === "confirmed");
}

/** Validates the persisted suppression-form authority; no live/current definition is consulted. */
function validSuppressionInstance(row: ReportInstanceRow, snapshot: RecordValue, system: RecordValue) {
  if (!isRecord(snapshot.instance) || !exactKeys(snapshot.instance, ["instanceKey", "displaySequence", "zone", "location"])
    || snapshot.instance.instanceKey !== row.instance_key || snapshot.instance.displaySequence !== row.display_sequence
    || !Array.isArray(system.locations) || !Array.isArray(system.zones)) return false;
  const locations = system.locations.filter(isRecord);
  const zones = system.zones.filter(isRecord);
  if (locations.length !== system.locations.length || zones.length !== system.zones.length) return false;
  const location = locations.find((candidate) => candidate.id === row.location_id);
  if (!location || row.instance_key !== `location:${row.location_id}` || row.location_id === null
    || row.zone_id !== (location.zoneId ?? null) || !isRecord(snapshot.instance.location)
    || !exactKeys(snapshot.instance.location, ["id", "key", "displayName", "sortOrder"])
    || snapshot.instance.location.id !== location.id || snapshot.instance.location.key !== location.key
    || snapshot.instance.location.displayName !== location.displayName || snapshot.instance.location.sortOrder !== location.sortOrder) return false;
  const zone = row.zone_id === null ? null : zones.find((candidate) => candidate.id === row.zone_id);
  if ((zone === null && snapshot.instance.zone !== null) || (zone !== null && (!zone || !isRecord(snapshot.instance.zone)
    || !exactKeys(snapshot.instance.zone, ["id", "key", "displayName", "sortOrder"])
    || snapshot.instance.zone.id !== zone.id || snapshot.instance.zone.key !== zone.key
    || snapshot.instance.zone.displayName !== zone.displayName || snapshot.instance.zone.sortOrder !== zone.sortOrder))) return false;
  const order = locations.slice().sort((left, right) => {
    const leftZone = typeof left.zoneId === "string" ? zones.find((zoneItem) => zoneItem.id === left.zoneId)?.sortOrder : Number.MAX_SAFE_INTEGER;
    const rightZone = typeof right.zoneId === "string" ? zones.find((zoneItem) => zoneItem.id === right.zoneId)?.sortOrder : Number.MAX_SAFE_INTEGER;
    return Number(leftZone ?? Number.MAX_SAFE_INTEGER) - Number(rightZone ?? Number.MAX_SAFE_INTEGER)
      || Number(left.sortOrder) - Number(right.sortOrder) || String(left.id).localeCompare(String(right.id));
  });
  return row.display_sequence === order.findIndex((candidate) => candidate.id === row.location_id) + 1;
}

function validSuppressionHistoricalUnit(row: ReportInstanceRow, snapshot: RecordValue, response: RecordValue, system: RecordValue) {
  if (!exactKeys(snapshot, ["schemaVersion", "acceptedAt", "job", "customer", "configuration", "template", "system", "instance"])
    || typeof snapshot.acceptedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(snapshot.acceptedAt)
    || !isRecord(snapshot.system) || !exactKeys(snapshot.system, ["key", "displayName", "definition", "resolvedControls", "repetitionMode"])
    || snapshot.system.key !== row.system_key || snapshot.system.displayName !== system.displayName
    || snapshot.system.repetitionMode !== "per_location" || !validSuppressionInstance(row, snapshot, system)) return false;
  try {
    const controls = resolveCo2Controls(snapshot.system.definition, "MFE-FSSR", (snapshot.template as RecordValue).version as number);
    return controls.source.systemKey === row.system_key
      && canonical(snapshot.system.resolvedControls) === canonical(controls)
      && validateCo2Responses(response, controls);
  } catch { return false; }
}

function validHistoricalUnit(row: ReportInstanceRow, job: ReportJobRow, system: RecordValue) {
  const snapshot = row.inspection_snapshot;
  const response = row.response_payload;
  const frozenJob = isRecord(job.configuration_snapshot) ? job.configuration_snapshot : undefined;
  const frozenTemplate = frozenJob && isRecord(frozenJob.template) ? frozenJob.template : undefined;
  const frozenConfiguration = frozenJob && isRecord(frozenJob.configuration) ? frozenJob.configuration : undefined;
  const v7Suppression = (row.system_key === "co2_fire_extinguisher" || row.system_key === "wet_chemical" || row.system_key === "fire_alarm_detector" || row.system_key === "hydrant" || row.system_key === "hose_reel" || row.system_key === "automatic_sprinkler" || row.system_key === "smoke_ventilation" || row.system_key === "fire_intercom") && isRecord(snapshot) && snapshot.schemaVersion === 2;
  if (!isRecord(snapshot) || !isRecord(response) || Object.keys(response).length === 0
    || (snapshot.schemaVersion !== 1 && !(row.system_key === "fire_alarm_detector" && snapshot.schemaVersion === 2) && !v7Suppression) || !isRecord(snapshot.job) || !isRecord(snapshot.configuration)
    || !isRecord(snapshot.template) || !isRecord(snapshot.system)
    || !frozenTemplate || !frozenConfiguration
    || snapshot.job.id !== job.id || snapshot.job.reference !== job.reference
    || frozenConfiguration.revisionId !== row.customer_configuration_revision_id
    || !Number.isSafeInteger(frozenConfiguration.revisionNumber) || Number(frozenConfiguration.revisionNumber) < 1
    || snapshot.configuration.revisionId !== frozenConfiguration.revisionId
    || snapshot.configuration.revisionNumber !== frozenConfiguration.revisionNumber
    || frozenTemplate.id !== row.master_template_version_id
    || !Number.isSafeInteger(frozenTemplate.version) || Number(frozenTemplate.version) < 1
    || snapshot.template.id !== frozenTemplate.id || snapshot.template.version !== frozenTemplate.version
    || snapshot.template.code !== "MFE-FSSR" || !Number.isSafeInteger(snapshot.template.version)
    || (snapshot.system.systemKey !== row.system_key && snapshot.system.key !== row.system_key)) return false;
  if (row.system_key === "fire_alarm_detector" && snapshot.schemaVersion === 2) {
    return (frozenTemplate.version === 6 || frozenTemplate.version === 7) && row.master_template_version_id === frozenTemplate.id
      && snapshot.template.id === frozenTemplate.id && (snapshot.template.version === 6 || snapshot.template.version === 7)
      && validateFireAlarmHistoricalPayload(snapshot, response);
  }
  // CO2 and Wet Chemical accepted snapshots predate the common systemKey field
  // and their responses intentionally have no schemaVersion property. Reuse the
  // same frozen-definition validator that accepted their production payload.
  if ((row.system_key === "co2_fire_extinguisher" || row.system_key === "wet_chemical")
    && snapshot.system.key === row.system_key) {
    return validSuppressionHistoricalUnit(row, snapshot, response, system);
  }
  if (row.system_key === "hydrant" && snapshot.schemaVersion === 2) {
    if (frozenTemplate.version !== 7 || snapshot.template.version !== 7 || snapshot.system.key !== "hydrant"
      || snapshot.system.systemKey !== "hydrant" || snapshot.system.repetitionMode !== "single_with_repeatable_rows"
      || !isRecord(snapshot.system.definition) || !isRecord(snapshot.instance)
      || !exactKeys(snapshot.instance, ["instanceKey", "displaySequence", "zone", "location"])
      || snapshot.instance.instanceKey !== "primary" || snapshot.instance.displaySequence !== 1 || snapshot.instance.zone !== null || snapshot.instance.location !== null
      || typeof snapshot.contractSha256 !== "string") return false;
    const adapter = resolveV7EvidenceContract({ systemKey: "hydrant", templateId: snapshot.template.id, templateVersion: snapshot.template.version, definition: snapshot.system.definition, contractSha256: snapshot.contractSha256 });
    return !!adapter && parseV7EvidenceManifest(snapshot.evidenceManifest, adapter, response) !== undefined;
  }
  if (row.system_key === "hose_reel" && snapshot.schemaVersion === 2) {
    if (frozenTemplate.version !== 7 || snapshot.template.version !== 7 || snapshot.system.key !== "hose_reel"
      || snapshot.system.systemKey !== "hose_reel" || snapshot.system.repetitionMode !== "single_with_repeatable_rows"
      || !isRecord(snapshot.system.definition) || !isRecord(snapshot.instance)
      || !exactKeys(snapshot.instance, ["instanceKey", "displaySequence", "zone", "location"])
      || snapshot.instance.instanceKey !== "primary" || snapshot.instance.displaySequence !== 1 || snapshot.instance.zone !== null || snapshot.instance.location !== null
      || typeof snapshot.contractSha256 !== "string") return false;
    const adapter = resolveV7EvidenceContract({ systemKey: "hose_reel", templateId: snapshot.template.id, templateVersion: snapshot.template.version, definition: snapshot.system.definition, contractSha256: snapshot.contractSha256 });
    return !!adapter && parseV7EvidenceManifest(snapshot.evidenceManifest, adapter, response) !== undefined;
  }
  if (row.system_key === "automatic_sprinkler" && snapshot.schemaVersion === 2) {
    if (frozenTemplate.version !== 7 || snapshot.template.version !== 7 || snapshot.system.key !== "automatic_sprinkler"
      || snapshot.system.systemKey !== "automatic_sprinkler" || snapshot.system.repetitionMode !== "single"
      || !isRecord(snapshot.system.definition) || !isRecord(snapshot.instance)
      || !exactKeys(snapshot.instance, ["instanceKey", "displaySequence", "zone", "location"])
      || snapshot.instance.instanceKey !== "primary" || snapshot.instance.displaySequence !== 1 || snapshot.instance.zone !== null || snapshot.instance.location !== null
      || typeof snapshot.contractSha256 !== "string") return false;
    const adapter = resolveV7EvidenceContract({ systemKey: "automatic_sprinkler", templateId: snapshot.template.id, templateVersion: snapshot.template.version, definition: snapshot.system.definition, contractSha256: snapshot.contractSha256 });
    return !!adapter && parseV7EvidenceManifest(snapshot.evidenceManifest, adapter, response) !== undefined;
  }
  if (row.system_key === "fire_intercom") {
    // Fire Intercom has no V1-V6 lineage at all, so like Smoke Ventilation it
    // has no historical fallback - a schemaVersion other than 2 here can never
    // be authentic.
    if (snapshot.schemaVersion !== 2 || frozenTemplate.version !== 7 || snapshot.template.version !== 7 || snapshot.system.key !== "fire_intercom"
      || snapshot.system.systemKey !== "fire_intercom" || snapshot.system.repetitionMode !== "single_with_repeatable_rows"
      || !isRecord(snapshot.system.definition) || !isRecord(snapshot.instance)
      || !exactKeys(snapshot.instance, ["instanceKey", "displaySequence", "zone", "location"])
      || snapshot.instance.instanceKey !== "primary" || snapshot.instance.displaySequence !== 1 || snapshot.instance.zone !== null || snapshot.instance.location !== null
      || typeof snapshot.contractSha256 !== "string") return false;
    const adapter = resolveV7EvidenceContract({ systemKey: "fire_intercom", templateId: snapshot.template.id, templateVersion: snapshot.template.version, definition: snapshot.system.definition, contractSha256: snapshot.contractSha256 });
    return !!adapter && parseV7EvidenceManifest(snapshot.evidenceManifest, adapter, response) !== undefined;
  }
  if (row.system_key === "smoke_ventilation") {
    // Smoke Ventilation has no V1-V6 lineage at all, so unlike every branch
    // above it has no historical fallback - a schemaVersion other than 2 here
    // can never be authentic.
    if (snapshot.schemaVersion !== 2 || frozenTemplate.version !== 7 || snapshot.template.version !== 7 || snapshot.system.key !== "smoke_ventilation"
      || snapshot.system.systemKey !== "smoke_ventilation" || snapshot.system.repetitionMode !== "single_with_repeatable_rows"
      || !isRecord(snapshot.system.definition) || !isRecord(snapshot.instance)
      || !exactKeys(snapshot.instance, ["instanceKey", "displaySequence", "zone", "location"])
      || snapshot.instance.instanceKey !== "primary" || snapshot.instance.displaySequence !== 1 || snapshot.instance.zone !== null || snapshot.instance.location !== null
      || typeof snapshot.contractSha256 !== "string") return false;
    const adapter = resolveV7EvidenceContract({ systemKey: "smoke_ventilation", templateId: snapshot.template.id, templateVersion: snapshot.template.version, definition: snapshot.system.definition, contractSha256: snapshot.contractSha256 });
    return !!adapter && parseV7EvidenceManifest(snapshot.evidenceManifest, adapter, response) !== undefined;
  }
  if (snapshot.system.enabledSystemId !== system.enabledSystemId || snapshot.system.definitionStatus !== "confirmed") return false;
  switch (row.system_key) {
    case "automatic_sprinkler": return validateAutomaticSprinklerHistoricalPayload(response, snapshot);
    case "dry_wet_riser": return validStoredDryWetRiser(response, snapshot.system, snapshot.system.systemConfiguration);
    case "hose_reel": return validateHoseReelHistoricalPayload(snapshot, response);
    case "fire_alarm_detector": return validateFireAlarmHistoricalPayload(snapshot, response);
    case "hydrant": return validateHydrantHistoricalPayload(response, snapshot);
    case "portable_fire_extinguisher": return validatePortableHistoricalPayload(response, snapshot);
    default: return false;
  }
}

function fireAlarmV6PoorFields(snapshot: unknown, response: unknown) {
  const context = fireAlarmV6ReportContext(snapshot, response);
  if (!context || context.response.schemaVersion !== 2) return undefined;
  const version = context.controls.source.templateVersion;
  const finding = (value: unknown) => version === 7 ? value === "not_good" || value === "complete_repair" : value === "poor";
  const fields: string[] = [];
  const checklist = [["chargerAndBatteries", "charger_batteries.charger_battery_checks", context.controls.chargerAndBatteries], ["mainFunctionKeys", "main_function_key.function_checks", context.controls.mainFunctionKeys]] as const;
  for (const [group, prefix, definitions] of checklist) { const values = context.response[group]; if (!isRecord(values) || !exactKeys(values, definitions.map((item) => item.key))) return undefined; for (const definition of definitions) { const item = values[definition.key]; if (!isRecord(item) || !definition.result.options.some((option) => option.value === item.result)) return undefined; if (finding(item.result)) fields.push(`${prefix}.${definition.key}`); } }
  if (!Array.isArray(context.response.secondaryAlarmDeviceRows)) return undefined;
  const rowIds = new Set<string>();
  for (const row of context.response.secondaryAlarmDeviceRows) { if (!isRecord(row) || !uuid.test(String(row.rowUuid)) || rowIds.has(String(row.rowUuid)) || !isRecord(row.fieldRemarks)) return undefined; rowIds.add(String(row.rowUuid)); for (const [key, pathKey, definition] of [["alarmBell", "alarm_bell", context.controls.secondaryAlarmDeviceRows.alarmBell], ["manualCallPoint", "manual_call_point", context.controls.secondaryAlarmDeviceRows.manualCallPoint]] as const) { if (!definition.options.some((option) => option.value === row[key]) || (finding(row[key]) && (!text(row.fieldRemarks[key], 2000)))) return undefined; if (finding(row[key])) fields.push(`alarm_devices.alarm_device_rows.rows.${row.rowUuid}.${pathKey}`); } }
  return fields.sort();
}

function v6Result(value: unknown) {
  if (value === "good") return "Good";
  if (value === "poor") return "Poor";
  if (value === "not_relevant") return "Not Relevant";
  if (value === "not_good") return "Not Good";
  if (value === "complete_repair") return "Complete Repair";
  if (value === "na") return "No Need Checking / N.A.";
  return undefined;
}

/**
 * Roll a system up to the client's 3-state "Summary of Testing" condition
 * (see FinalReportSystemCondition) by scanning every accepted section for that
 * system — all location units, in submitted order — over each field value.
 * The matched strings ("Not Good" / "Poor" / "Complete Repair") are the exact
 * display values emitted by scalar() and v6Result() in this file; keep this in
 * lock-step with those two functions. Exported only so the report unit tests
 * can exercise the 4->3 mapping without a database. "No Need Checking / N.A." and
 * "Not Relevant" are never findings.
 *
 * The detail must track the condition's worst severity, not freeze on whichever
 * finding was seen first (Sol P1-1): scan once, remember the FIRST "Not Good" /
 * "Poor" (`failedDetail`) and, separately, the FIRST "Complete Repair"
 * (`referDetail`); then after the whole scan pick the detail that matches the
 * final condition. So a FAILED system always shows a real failure line even when
 * an earlier section only had a "Complete Repair". Each detail is
 * "`label: value`", hard-capped at 200 chars ("" when the system is GOOD).
 */
export function deriveSystemCondition(systemSections: FinalReportSection[]): { condition: FinalReportSystemCondition; conditionDetail: string } {
  let failedDetail = "";
  let referDetail = "";
  for (const section of systemSections) {
    for (const field of section.fields) {
      if (failedDetail === "" && (field.value === "Not Good" || field.value === "Poor")) failedDetail = `${field.label}: ${field.value}`.slice(0, 200);
      if (referDetail === "" && field.value === "Complete Repair") referDetail = `${field.label}: ${field.value}`.slice(0, 200);
    }
  }
  if (failedDetail !== "") return { condition: "FAILED", conditionDetail: failedDetail };
  if (referDetail !== "") return { condition: "REFER DETAIL PAGE", conditionDetail: referDetail };
  return { condition: "GOOD CONDITIONS", conditionDetail: "" };
}

/**
 * The numbered lines of the per-section "Remarks:" block in the PDF: one line per
 * finding field (value "Not Good" / "Poor" / "Complete Repair"), each carrying
 * that finding's OWN remark when one can be located by LABEL STRUCTURE — never by
 * adjacency (Sol P1-2: the old code folded on whatever field happened to sit next
 * to the result, which for the flatten-based V7 systems is a row-level `remarks`,
 * not the finding's own `fieldRemarks` entry emitted many fields later).
 *
 * Returns [] when the section has no finding, so renderFinalServiceReportPdf
 * emits no "Remarks:" heading. Line format (unchanged):
 *   `${i}. ${field.label}: ${field.value}`  + ` — ${ownRemark}` when found.
 *
 * A finding's own remark is the first of these label shapes that exists with a
 * non-empty trimmed value (else the line is rendered with no " — remark" suffix):
 *   1. Fire Alarm (`fireAlarmV6Fields`): a field `${L} Remark` / `${L} Remarks`
 *      (that helper emits the finding immediately followed by its remark with
 *      exactly that suffix).
 *   2. V7 flat {result,remarks} checklist / measurement: `L` ends " - Result"
 *      and a field exists with " - Result" replaced by " - Remarks".
 *   3. V7 repeatable-row `fieldRemarks`: split `L` at its LAST " - " into
 *      head + tail; a field `${head} - Field Remarks - ${tail}` exists. Verified
 *      against a real flattened hydrant row: "Rows 1 - Canvas Hose1Result" pairs
 *      with "Rows 1 - Field Remarks - Canvas Hose1Result".
 * A bare `<prefix> - Remarks` (a row-level remark) is folded only when rule 1 or
 * 2 produced exactly that label; rule 3 never targets it.
 */
export function sectionRemarkLines(section: FinalReportSection): string[] {
  const isFinding = (value: string) => value === "Not Good" || value === "Poor" || value === "Complete Repair";
  const valueByLabel = new Map(section.fields.map((field) => [field.label, field.value] as const));
  const ownRemark = (label: string): string => {
    const candidates = [`${label} Remark`, `${label} Remarks`];
    if (label.endsWith(" - Result")) candidates.push(`${label.slice(0, -" - Result".length)} - Remarks`);
    const cut = label.lastIndexOf(" - ");
    if (cut > 0) candidates.push(`${label.slice(0, cut)} - Field Remarks - ${label.slice(cut + 3)}`);
    for (const candidate of candidates) {
      const value = valueByLabel.get(candidate);
      if (typeof value === "string" && value.trim() !== "") return value;
    }
    return "";
  };
  const lines: string[] = [];
  for (const field of section.fields) {
    if (!isFinding(field.value)) continue;
    const remark = ownRemark(field.label);
    lines.push(`${lines.length + 1}. ${field.label}: ${field.value}${remark ? ` — ${remark}` : ""}`);
  }
  return lines;
}

type FireAlarmV6ReportResponse = RecordValue & {
  primaryDeviceRows: unknown[];
  secondaryAlarmDeviceRows: unknown[];
  chargerAndBatteries: RecordValue;
  mainFunctionKeys: RecordValue;
};

function fireAlarmV6ReportContext(snapshot: unknown, response: unknown) {
  if (!isRecord(snapshot) || !isRecord(snapshot.system) || !isRecord(snapshot.system.definition) || !isRecord(response)) return undefined;
  try {
    const template = isRecord(snapshot.template) ? snapshot.template : undefined;
    const version = template?.version === 7 ? 7 : 6;
    const controls = resolveFireAlarmV6Controls(snapshot.system.definition, version);
    if (!Array.isArray(response.primaryDeviceRows) || !Array.isArray(response.secondaryAlarmDeviceRows) || !isRecord(response.chargerAndBatteries) || !isRecord(response.mainFunctionKeys)) return undefined;
    return { controls, response: response as FireAlarmV6ReportResponse };
  } catch { return undefined; }
}

function fireAlarmV6Fields(snapshot: unknown, response: unknown) {
  const context = fireAlarmV6ReportContext(snapshot, response);
  if (!context) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 report data is invalid.");
  const fields: FinalReportField[] = [];
  const add = (label: string, value: unknown, depth = 0) => {
    const rendered = typeof value === "string" ? value
      : Array.isArray(value) && value.length > 0 && value.every((item, index) => typeof item === "string"
        && ["normal", "test", "isolation"].includes(item)
        && (index === 0 || ["normal", "test", "isolation"].indexOf(value[index - 1] as string) < ["normal", "test", "isolation"].indexOf(item)))
        ? value.map((item) => item[0]!.toUpperCase() + item.slice(1)).join(", ")
        : undefined;
    if (!rendered) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 report data is invalid.");
    fields.push({ label, value: rendered, depth });
  };
  add(context.controls.controlPanelLocation.label, context.response.controlPanelLocation);
  for (const [index, row] of context.response.primaryDeviceRows.entries()) {
    if (!isRecord(row)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 report data is invalid.");
    const prefix = `Control Panel Row ${index + 1}`;
    const assetReference = optionalAssetReference(row.assetReference);
    if (assetReference) add(`${prefix} - ${context.controls.primaryDeviceRows.assetReference.label}`, assetReference);
    add(`${prefix} - ${context.controls.primaryDeviceRows.alarmZone.label}`, row.alarmZone);
    add(`${prefix} - ${context.controls.primaryDeviceRows.location.label}`, row.location);
    add(`${prefix} - Manual Call Point`, row.manualCallPoint);
    add(`${prefix} - Flow Switch`, row.flowSwitch);
    add(`${prefix} - Heat Detector`, row.heatDetector);
    add(`${prefix} - Smoke Detector`, row.smokeDetector);
    if (typeof row.remarks === "string" && row.remarks) add(`${prefix} - Remarks`, row.remarks);
  }
  const checklist = (title: string, values: RecordValue, items: readonly { key: string; label: string }[]) => {
    for (const item of items) {
      const value = values[item.key]; if (!isRecord(value)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 report data is invalid.");
      const result = v6Result(value.result); if (!result || typeof value.remarks !== "string") throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 report data is invalid.");
      add(`${title} - ${item.label}`, result); if ((result === "Poor") || (context.controls.source.templateVersion === 7 && (result === "Not Good" || result === "Complete Repair"))) add(`${title} - ${item.label} Remark`, value.remarks, 1);
    }
  };
  checklist("Charger & Batteries", context.response.chargerAndBatteries, context.controls.chargerAndBatteries);
  checklist("Main Function Key", context.response.mainFunctionKeys, context.controls.mainFunctionKeys);
  for (const [index, row] of context.response.secondaryAlarmDeviceRows.entries()) {
    if (!isRecord(row) || !isRecord(row.fieldRemarks) || typeof row.location !== "string") throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 report data is invalid.");
    const prefix = `Alarm Device Row ${index + 1} (${row.location})`;
    const assetReference = optionalAssetReference(row.assetReference);
    if (assetReference) add(`${prefix} - ${context.controls.secondaryAlarmDeviceRows.assetReference.label}`, assetReference);
    for (const [key, item] of [["alarmBell", context.controls.secondaryAlarmDeviceRows.alarmBell], ["manualCallPoint", context.controls.secondaryAlarmDeviceRows.manualCallPoint]] as const) {
      const result = v6Result(row[key]); if (!result) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 report data is invalid.");
      add(`${prefix} - ${key === "alarmBell" ? "Alarm Bell" : "Manual Call Point"}`, result);
      if ((result === "Poor") || (context.controls.source.templateVersion === 7 && (result === "Not Good" || result === "Complete Repair"))) add(`${prefix} - ${key === "alarmBell" ? "Alarm Bell" : "Manual Call Point"} Remark`, row.fieldRemarks[key], 1);
    }
    if (typeof row.remarks === "string" && row.remarks) add(`${prefix} - Remarks`, row.remarks);
  }
  if (typeof context.response.comments === "string" && context.response.comments) add("Comments", context.response.comments);
  return fields;
}

function fireAlarmV6EvidenceCaption(snapshot: unknown, response: unknown, fieldPath: string) {
  const context = fireAlarmV6ReportContext(snapshot, response);
  if (!context) return undefined;
  for (const [title, prefix, items] of [["Charger & Batteries", "charger_batteries.charger_battery_checks", context.controls.chargerAndBatteries], ["Main Function Key", "main_function_key.function_checks", context.controls.mainFunctionKeys]] as const) {
    for (const item of items) if (fieldPath === `${prefix}.${item.key}`) return `${title} - ${item.label}`;
  }
  const match = /^alarm_devices\.alarm_device_rows\.rows\.([0-9a-f-]{36})\.(alarm_bell|manual_call_point)$/.exec(fieldPath);
  if (!match) return undefined;
  const rowIndex = context.response.secondaryAlarmDeviceRows.findIndex((row) => isRecord(row) && row.rowUuid === match[1]); const row = context.response.secondaryAlarmDeviceRows[rowIndex];
  if (!isRecord(row) || typeof row.location !== "string" || rowIndex < 0) return undefined;
  return `Alarm Device Row ${rowIndex + 1} (${row.location}) - ${match[2] === "alarm_bell" ? "Alarm Bell" : "Manual Call Point"}`;
}

async function validatedFireAlarmV6Evidence(database: Queryable, row: ReportInstanceRow) {
  const required = fireAlarmV6PoorFields(row.inspection_snapshot, row.response_payload);
  if (!required) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 evidence requirements are invalid.");
  const rows = (await database.query<{ field_path: string; stored_sha256: string; storage_relative_path: string; width: number; height: number }>(`SELECT field_path,stored_sha256,storage_relative_path,width,height FROM staged_inspection_evidence WHERE form_instance_id=$1 AND status='accepted' ORDER BY field_path,photo_uuid`, [row.form_instance_id])).rows;
  if (rows.length !== required.length || rows.some((item, index) => item.field_path !== required[index])) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 evidence is incomplete or mismatched.");
  const uploadsRoot = path.resolve(loadConfig().uploadsPath); const evidence: FinalReportEvidence[] = [];
  for (const item of rows) { const caption = fireAlarmV6EvidenceCaption(row.inspection_snapshot, row.response_payload, item.field_path); if (!caption || !text(item.storage_relative_path, 500) || !/^[0-9a-f]{64}$/.test(item.stored_sha256) || !Number.isInteger(item.width) || !Number.isInteger(item.height)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted Fire Alarm V6 evidence is invalid."); const relative=item.storage_relative_path; if (relative.includes("\\") || relative.split("/").some((part)=>part===""||part==="."||part==="..")) throw new FinalReportError("FINAL_REPORT_DATA_INVALID",409,"Accepted Fire Alarm V6 evidence is invalid."); const file=path.resolve(uploadsRoot,...relative.split("/")); if(!file.startsWith(`${uploadsRoot}${path.sep}`))throw new FinalReportError("FINAL_REPORT_DATA_INVALID",409,"Accepted Fire Alarm V6 evidence is invalid."); let content:Buffer;try{content=await readFile(file);}catch{throw new FinalReportError("FINAL_REPORT_DATA_INVALID",409,"Accepted Fire Alarm V6 evidence is unavailable.");} if(createHash("sha256").update(content).digest("hex")!==item.stored_sha256)throw new FinalReportError("FINAL_REPORT_DATA_INVALID",409,"Accepted Fire Alarm V6 evidence is corrupt."); let metadata:{format?:string;width?:number;height?:number};try{metadata=await sharp(content,{failOn:"error"}).metadata();}catch{throw new FinalReportError("FINAL_REPORT_DATA_INVALID",409,"Accepted Fire Alarm V6 evidence is corrupt.");}if(metadata.format!=="jpeg"||metadata.width!==item.width||metadata.height!==item.height)throw new FinalReportError("FINAL_REPORT_DATA_INVALID",409,"Accepted Fire Alarm V6 evidence is corrupt.");evidence.push({field:item.field_path,caption,content,width:item.width,height:item.height}); }
  return evidence;
}

async function validatedV7SuppressionEvidence(database: Queryable, row: ReportInstanceRow) {
  const snapshot = row.inspection_snapshot;
  if (!isRecord(snapshot) || !isRecord(snapshot.template) || !isRecord(snapshot.system) || !isRecord(snapshot.system.definition)
    || (snapshot.system.key !== "co2_fire_extinguisher" && snapshot.system.key !== "wet_chemical" && snapshot.system.key !== "fire_alarm_detector" && snapshot.system.key !== "hydrant" && snapshot.system.key !== "hose_reel" && snapshot.system.key !== "automatic_sprinkler" && snapshot.system.key !== "smoke_ventilation" && snapshot.system.key !== "fire_intercom")) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence authority is invalid.");
  const adapter = resolveV7EvidenceContract({ systemKey: snapshot.system.key, templateId: snapshot.template.id, templateVersion: snapshot.template.version, definition: snapshot.system.definition, contractSha256: createHash("sha256").update(canonical(snapshot.system.definition)).digest("hex") });
  const required = adapter?.derivePoorFieldPaths(row.response_payload);
  if (!adapter || !required) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence requirements are invalid.");
  const rows = (await database.query<{ field_path: string; stored_sha256: string; storage_relative_path: string; width: number; height: number }>(`SELECT field_path,stored_sha256,storage_relative_path,width,height FROM staged_inspection_evidence WHERE form_instance_id=$1 AND master_template_version=7 AND status='accepted' ORDER BY field_path,photo_uuid`, [row.form_instance_id])).rows;
  if (rows.length !== required.length || rows.some((item, index) => item.field_path !== required[index])) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence is incomplete or mismatched.");
  const uploadsRoot = path.resolve(loadConfig().uploadsPath); const evidence: FinalReportEvidence[] = [];
  for (const item of rows) {
    const caption = adapter.acceptedEvidenceCaption(item.field_path); const relative = item.storage_relative_path;
    if (!caption || !text(relative, 500) || !/^[0-9a-f]{64}$/.test(item.stored_sha256) || !Number.isInteger(item.width) || !Number.isInteger(item.height) || relative.includes("\\") || relative.split("/").some((part) => !part || part === "." || part === "..")) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence is invalid.");
    const file = path.resolve(uploadsRoot, ...relative.split("/")); if (!file.startsWith(`${uploadsRoot}${path.sep}`)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence is invalid.");
    let content: Buffer; try { content = await readFile(file); } catch { throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence is unavailable."); }
    if (createHash("sha256").update(content).digest("hex") !== item.stored_sha256) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence is corrupt.");
    let metadata: { format?: string; width?: number; height?: number }; try { metadata = await sharp(content, { failOn: "error" }).metadata(); } catch { throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence is corrupt."); }
    if (metadata.format !== "jpeg" || metadata.width !== item.width || metadata.height !== item.height) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Accepted V7 evidence is corrupt.");
    evidence.push({ field: item.field_path, caption, content, width: item.width, height: item.height });
  }
  return evidence;
}

function historicalLocation(system: RecordValue, unit: { authorityKey: string; label: string }, instanceKey: string): FinalReportLocation | undefined {
  if (!unit.authorityKey.startsWith("location:") || !Array.isArray(system.locations) || !Array.isArray(system.zones)) return undefined;
  const locationId = unit.authorityKey.slice("location:".length);
  const location = system.locations.find((item) => isRecord(item) && item.id === locationId);
  if (!isRecord(location) || !text(location.displayName, 300) || !(location.zoneId === null || typeof location.zoneId === "string")) return undefined;
  const zone = location.zoneId === null ? undefined : system.zones.find((item) => isRecord(item) && item.id === location.zoneId);
  if (location.zoneId !== null && (!isRecord(zone) || !text(zone.displayName, 200))) return undefined;
  return { locationId, locationLabel: location.displayName, zoneId: location.zoneId, zoneLabel: isRecord(zone) ? zone.displayName as string : null, instanceKey };
}

function instanceMatches(row: ReportInstanceRow, system: RecordValue, authorityKey: string) {
  if (authorityKey === "primary") return row.instance_key === "primary" && row.location_id === null && row.zone_id === null && row.display_sequence === 1;
  const locationId = authorityKey.slice("location:".length);
  // buildJobCompletion has already strictly validated frozen location UUIDs.
  if (!Array.isArray(system.locations)) return false;
  const location = system.locations.find((value) => isRecord(value) && value.id === locationId);
  if (!isRecord(location)) return false;
  const zones = new Map((Array.isArray(system.zones) ? system.zones : []).filter(isRecord).map((zone) => [String(zone.id), Number(zone.sortOrder)]));
  const ordered = system.locations.filter(isRecord).sort((left, right) => {
    const leftZone = typeof left.zoneId === "string" ? zones.get(left.zoneId) : Number.MAX_SAFE_INTEGER;
    const rightZone = typeof right.zoneId === "string" ? zones.get(right.zoneId) : Number.MAX_SAFE_INTEGER;
    return (leftZone ?? Number.MAX_SAFE_INTEGER) - (rightZone ?? Number.MAX_SAFE_INTEGER)
      || Number(left.sortOrder) - Number(right.sortOrder) || String(left.id).localeCompare(String(right.id));
  });
  return row.instance_key === authorityKey && row.location_id === locationId && row.zone_id === (location.zoneId ?? null)
    && row.display_sequence === ordered.findIndex((value) => value.id === locationId) + 1;
}

async function validatedEvidence(rows: ReportInstanceRow[], system: RecordValue) {
  const policy = system.evidencePolicy;
  if (policy === undefined) return [];
  if (!isRecord(policy) || !isRecord(policy.definition) || !isRecord(policy.definition.points) || !text(policy.id, 64)) {
    throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Frozen Automatic Sprinkler evidence requirements are invalid.");
  }
  const required = Object.entries(policy.definition.points).filter(([, point]) => isRecord(point) && point.required === true).map(([field]) => field);
  const uploadsRoot = path.resolve(loadConfig().uploadsPath);
  const evidence: FinalReportEvidence[] = [];
  for (const field of required) {
    const match = rows.filter((row) => row.attachment_field_path === field);
    if (match.length !== 1 || !match[0] || !text(match[0].storage_relative_path, 500) || !text(match[0].stored_sha256, 64)
      || !Number.isInteger(match[0].width) || !Number.isInteger(match[0].height)) {
      throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Required final Automatic Sprinkler evidence is unavailable.");
    }
    const relative = match[0].storage_relative_path!;
    if (relative.includes("\\") || relative.split("/").some((part) => part === "" || part === "." || part === "..")) {
      throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Required final Automatic Sprinkler evidence is unavailable.");
    }
    const file = path.resolve(uploadsRoot, ...relative.split("/"));
    if (!file.startsWith(`${uploadsRoot}${path.sep}`)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Required final Automatic Sprinkler evidence is unavailable.");
    let content: Buffer;
    try { content = await readFile(file); } catch { throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Required final Automatic Sprinkler evidence is unavailable."); }
    if (createHash("sha256").update(content).digest("hex") !== match[0].stored_sha256 || content.length > 2_097_152 || content.length < 4) {
      throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Required final Automatic Sprinkler evidence is corrupt.");
    }
    let metadata: { format?: string; width?: number; height?: number };
    try { metadata = await sharp(content, { failOn: "error" }).metadata(); } catch { throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Required final Automatic Sprinkler evidence is corrupt."); }
    if (metadata.format !== "jpeg" || metadata.width !== match[0].width || metadata.height !== match[0].height) {
      throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Required final Automatic Sprinkler evidence is corrupt.");
    }
    evidence.push({ field, content, width: match[0].width!, height: match[0].height! });
  }
  return evidence;
}

export type FinalReportAccess = "technician" | "manager";

/**
 * Access selection is derived by the authenticated route caller, never from a
 * browser parameter. Content validation below remains identical for both.
 */
export async function loadFinalServiceReport(
  jobId: string,
  database: Queryable,
  access: FinalReportAccess = "technician"
): Promise<FinalServiceReport> {
  const accessClause = access === "manager"
    ? "job.is_sample = false"
    : "job.technician_visible = true AND job.is_sample = false";
  const jobResult = await database.query<ReportJobRow>(`SELECT job.id, job.status, job.configuration_snapshot, job.completed_at, job.completed_by_user_id,
      job.completed_by_display_name, NULL::text AS completed_by_username,
      job.job_reference AS reference, job.title, job.service_date::text AS service_date
    FROM inspection_jobs job
    WHERE job.id = $1 AND job.master_template_version_id IS NOT NULL
      AND ${accessClause}
    LIMIT 1`, [jobId]);
  const job = jobResult.rows[0];
  if (!job) throw new FinalReportError("JOB_NOT_FOUND", 404, "Service visit not found.");
  if (job.status !== "closed" || !job.completed_at || !job.completed_by_display_name) {
    throw new FinalReportError("FINAL_REPORT_NOT_AVAILABLE", 409, "A final report is available only after this service visit is completed.");
  }
  const frozen = isRecord(job.configuration_snapshot) ? job.configuration_snapshot : undefined;
  const frozenCustomer = frozen && isRecord(frozen.customer) ? frozen.customer.displayName : undefined;
  const frozenSite = frozen && isRecord(frozen.site) ? frozen.site.displayName : undefined;
  const customer = requiredText(frozenCustomer, 250, "Completed service visit details are incomplete and cannot be reported.");
  const site = requiredText(frozenSite, 300, "Completed service visit details are incomplete and cannot be reported.");
  const reference = requiredText(job.reference, 250, "Completed service visit details are incomplete and cannot be reported.");
  const serviceDate = requiredText(job.service_date, 10, "Completed service visit details are incomplete and cannot be reported.");
  const rows = (await database.query<ReportInstanceRow>(`SELECT instance.id AS form_instance_id, inspection.system_key, instance.instance_key, instance.zone_id, instance.location_id, instance.display_sequence, instance.client_uuid,
      instance.master_template_version_id, instance.customer_configuration_revision_id,
      instance.evidence_policy_id, instance.evidence_policy_version, instance.evidence_policy_snapshot, instance.evidence_policy_sha256,
      true AS evidence_policy_matches, attachment.field_path AS attachment_field_path, attachment.evidence_policy_id AS attachment_evidence_policy_id,
      attachment.mime_type AS attachment_mime_type, attachment.source_sha256 AS attachment_source_sha256, attachment.stored_sha256 AS attachment_stored_sha256,
      attachment.source_size_bytes AS attachment_source_size_bytes, attachment.stored_size_bytes AS attachment_stored_size_bytes,
      attachment.source_width AS attachment_source_width, attachment.source_height AS attachment_source_height, attachment.width AS attachment_width, attachment.height AS attachment_height,
      instance.inspection_snapshot, instance.response_payload, attachment.stored_sha256, attachment.storage_relative_path, attachment.width, attachment.height
    FROM master_system_form_instances instance INNER JOIN master_system_inspections inspection ON inspection.id = instance.inspection_group_id
    LEFT JOIN inspection_attachments attachment ON attachment.form_instance_id = instance.id
    WHERE inspection.job_id = $1 AND instance.status = 'submitted'
    ORDER BY inspection.system_key, instance.display_sequence, attachment.field_path`, [jobId])).rows;
  const completion = buildJobCompletion(job, rows);
  if (!completion.eligible) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Required accepted inspection results are incomplete or invalid.");
  const sections: FinalReportSection[] = [];
  for (const completeSystem of completion.systems) {
    if (!supported.has(completeSystem.systemKey)) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "The completed service visit contains an unsupported system.");
    const system = expectedSystem(job.configuration_snapshot, completeSystem.systemKey);
    if (!system) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Frozen service configuration is unavailable.");
    for (const unit of completeSystem.units) {
      const matching = rows.filter((row) => row.system_key === completeSystem.systemKey && instanceMatches(row, system, unit.authorityKey));
      const clientUuids = new Set(matching.map((row) => row.client_uuid));
      if (clientUuids.size !== 1 || !validHistoricalUnit(matching[0]!, job, system)) {
        throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, `Required accepted inspection history is unavailable for ${completeSystem.systemLabel}.`);
      }
      const location = historicalLocation(system, unit, matching[0]!.instance_key);
      if (unit.authorityKey.startsWith("location:") && !location) throw new FinalReportError("FINAL_REPORT_DATA_INVALID", 409, "Frozen report location identity is unavailable.");
      const primaryRow = matching[0]!;
      const snapshotIsV7 = isRecord(primaryRow.inspection_snapshot) && primaryRow.inspection_snapshot.schemaVersion === 2;
      // Slice 1a-iv: per-customer display-label overrides + frozen definition
      // wording now reach the report. `undefined` for every out-of-scope system
      // and every non-V7 record -> `flatten` / captions are byte-identical.
      const displayLabels = v7DisplayLabelLookup(completeSystem.systemKey, primaryRow.inspection_snapshot, system);
      const fields = completeSystem.systemKey === "fire_alarm_detector" && snapshotIsV7
        ? fireAlarmV6Fields(primaryRow.inspection_snapshot, primaryRow.response_payload)
        : flatten(primaryRow.response_payload, "", 0, [], displayLabels?.display);
      const evidence = completeSystem.systemKey === "automatic_sprinkler"
        ? (snapshotIsV7 ? await validatedV7SuppressionEvidence(database, primaryRow) : await validatedEvidence(matching, system))
        : completeSystem.systemKey === "fire_alarm_detector" && snapshotIsV7
          ? (primaryRow.master_template_version_id === "00000000-0000-4000-8000-000000000807" ? await validatedV7SuppressionEvidence(database, primaryRow) : await validatedFireAlarmV6Evidence(database, primaryRow))
          : (completeSystem.systemKey === "co2_fire_extinguisher" || completeSystem.systemKey === "wet_chemical" || completeSystem.systemKey === "hydrant" || completeSystem.systemKey === "hose_reel" || completeSystem.systemKey === "smoke_ventilation" || completeSystem.systemKey === "fire_intercom") && snapshotIsV7
            ? await validatedV7SuppressionEvidence(database, primaryRow)
            : [];
      if (displayLabels) remapEvidenceCaptions(evidence, displayLabels);
      sections.push({ systemKey: completeSystem.systemKey, label: completeSystem.systemLabel, location, fields, evidence });
    }
  }
  return { customer, site, serviceDate, jobReference: reference,
    completedAt: job.completed_at instanceof Date ? job.completed_at.toISOString() : job.completed_at!, completedBy: job.completed_by_display_name!,
    systems: completion.systems.map((item) => {
      const { condition, conditionDetail } = deriveSystemCondition(sections.filter((section) => section.systemKey === item.systemKey));
      return { systemKey: item.systemKey, label: item.systemLabel, status: "Accepted" as const, condition, conditionDetail, locations: item.units.map((unit) => unit.label) };
    }), sections };
}

/**
 * PDFKit embeds this SFNT TrueType asset directly.  Do not substitute a
 * browser WOFF/WOFF2 subset here: it can produce PDFs that parse but render
 * as missing-glyph boxes in real viewers.
 */
export const finalReportFontAssetPath = fileURLToPath(new URL("./assets/DejaVuSans.ttf", import.meta.url));
const reportFont = readFileSync(finalReportFontAssetPath);

/** PDFKit embeds a Unicode-capable TrueType font and wraps all business text on A4 pages. */
export async function renderFinalServiceReportPdf(report: FinalServiceReport): Promise<Buffer> {
  const document = new PDFDocument({ size: "A4", margin: 46, autoFirstPage: true, info: { Title: `Service Report ${report.jobReference}`, Author: "MFE Services Sdn. Bhd." } });
  const chunks: Buffer[] = []; document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { document.on("end", () => resolve(Buffer.concat(chunks))); document.on("error", reject); });
  document.registerFont("DejaVuSans", reportFont); document.font("DejaVuSans");
  const header = () => { document.font("DejaVuSans").fontSize(15).text("MFE SERVICES SDN. BHD."); document.fontSize(11).text("Field Service Inspection Report"); document.moveDown(0.7); };
  const pageBreakFor = (height: number) => { if (document.y + height > document.page.height - document.page.margins.bottom) { document.addPage(); header(); } };
  const paragraph = (value: string, options: PDFKit.Mixins.TextOptions = {}) => { const height = document.heightOfString(value, { width: document.page.width - document.page.margins.left - document.page.margins.right, ...options }); pageBreakFor(height); document.text(value, options); };
  header();
  for (const [key, value] of [["Customer", report.customer], ["Site", report.site], ["Service Date", report.serviceDate], ["Job Reference", report.jobReference], ["Service Status", "Completed"], ["Completed Date", report.completedAt], ["Completed By", report.completedBy]]) paragraph(`${key}: ${value}`);
  document.moveDown(0.5); paragraph("Summary of Testing", { underline: true });
  report.systems.forEach((system, index) => {
    paragraph(`${index + 1}. ${system.label} — ${system.condition}`, { indent: 10 });
    if (system.conditionDetail !== "") paragraph(system.conditionDetail, { indent: 14 });
  });
  for (const section of report.sections) {
    document.moveDown(0.7); paragraph(`${section.label}${section.location ? ` - ${section.location.zoneLabel ? `${section.location.zoneLabel} / ` : ""}${section.location.locationLabel}` : ""}`, { underline: true });
    for (const field of section.fields) paragraph(`${field.label}: ${field.value}`, { indent: Math.min(field.depth, 3) * 14 });
    // Numbered defect list under a section that has >=1 finding field. Each
    // finding's own remark is located by label structure, not adjacency
    // (sectionRemarkLines / Sol P1-2).
    const remarkLines = sectionRemarkLines(section);
    if (remarkLines.length > 0) {
      document.moveDown(0.3); paragraph("Remarks:", { underline: true });
      for (const line of remarkLines) paragraph(line, { indent: 10 });
    }
    for (const evidence of section.evidence) { paragraph(`Final evidence included: ${evidence.caption ?? labelFor(evidence.field)}`); pageBreakFor(330); document.image(evidence.content, { fit: [500, 300], align: "center" }); document.moveDown(0.5); }
  }
  document.end(); return done;
}

export function finalReportFilename(report: FinalServiceReport) {
  const clean = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "Service-Report";
  return `Service-Report_${clean(report.jobReference)}_${clean(report.serviceDate)}.pdf`;
}
