import { createHash } from "node:crypto";
import {
  validateAcceptedAutomaticSprinklerV7Detail, validateAcceptedCo2Detail, validateAcceptedDryWetRiserV7Detail,
  validateAcceptedFireIntercomV7Detail, validateAcceptedHoseReelV7Detail, validateAcceptedHydrantV7Detail,
  validateAcceptedSmokeVentilationV7Detail, validateAcceptedWetChemicalDetail
} from "../inspections/acceptedMasterSystemDetail.js";
import { resolveV7EvidenceContract } from "../inspections/evidence/v7EvidenceContracts.js";

/**
 * T5 corrections to Accepted V7 inspections (docs/autopilot/designs/T5.md).
 *
 * An Accepted form instance is immutable: a correction is an append-only row that names one field of the
 * accepted `response_payload` by a path, the value it replaces and the new value. The *effective* payload is
 * the accepted payload with each path's latest correction applied. Nothing here writes the accepted row.
 *
 * Paths are dot-separated. An object segment is a property name; inside an array, a segment is the
 * `rowUuid` of the row it addresses (arrays without row identity — e.g. Normal/Test/Isolation detector
 * states — are never traversable, so they are never correctable). A correctable field is a string, number
 * or null value whose key and ancestors are not identity or metadata. Every change is re-validated with
 * the record's own frozen-contract validator (the same one Accepted Detail uses).
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type CorrectionKind = "result" | "text" | "reading";
export type CorrectableField = { fieldPath: string; label: string; kind: CorrectionKind; value: Json; options?: readonly string[] };
export type StoredCorrection = { fieldPath: string; sequence: number; newValue: Json };

/** The V7 four-state result model. */
export const v7Results = ["good", "not_good", "complete_repair", "na"] as const;

type DetailValidator = (row: Record<string, unknown>) => unknown;

/** V7 systems whose accepted records share the `acceptedDetailRow` shape and a frozen-contract validator. */
export const correctableSystems: ReadonlyMap<string, DetailValidator> = new Map<string, DetailValidator>([
  ["hose_reel", validateAcceptedHoseReelV7Detail],
  ["co2_fire_extinguisher", validateAcceptedCo2Detail],
  ["wet_chemical", validateAcceptedWetChemicalDetail],
  ["hydrant", validateAcceptedHydrantV7Detail],
  ["automatic_sprinkler", validateAcceptedAutomaticSprinklerV7Detail],
  ["dry_wet_riser", validateAcceptedDryWetRiserV7Detail],
  ["smoke_ventilation", validateAcceptedSmokeVentilationV7Detail],
  ["fire_intercom", validateAcceptedFireIntercomV7Detail]
]);

const segmentPattern = /^[A-Za-z0-9_-]{1,100}$/;
const deniedKeys = new Set(["rowUuid", "source", "sortOrder", "displaySequence", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "schemaVersion", "unit",
  // Never reachable anyway (every step needs an own property), refused explicitly so it stays that way.
  "__proto__", "constructor", "prototype"]);
const deniedKeyPattern = /(Id|Uuid|Sha256|At)$/;
const maxSegments = 12;

const isObject = (value: unknown): value is Record<string, Json> => typeof value === "object" && value !== null && !Array.isArray(value);
const deniedKey = (key: string) => deniedKeys.has(key) || deniedKeyPattern.test(key);

export function parseFieldPath(path: unknown): string[] | undefined {
  if (typeof path !== "string" || path.length < 1 || path.length > 300) return undefined;
  const segments = path.split(".");
  if (segments.length > maxSegments || segments.some((segment) => !segmentPattern.test(segment) || deniedKey(segment))) return undefined;
  return segments;
}

/** The parent container and key a path addresses, or undefined when the path does not resolve. */
function locate(root: Json, segments: readonly string[]): { parent: Record<string, Json>; key: string } | undefined {
  let node: Json = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    if (Array.isArray(node)) {
      node = node.find((row) => isObject(row) && row.rowUuid === segment) ?? null;
      if (node === null) return undefined;
    } else if (isObject(node) && Object.hasOwn(node, segment)) {
      node = node[segment]!;
    } else return undefined;
  }
  const key = segments[segments.length - 1]!;
  return isObject(node) && Object.hasOwn(node, key) ? { parent: node, key } : undefined;
}

function kindOf(value: Json): CorrectionKind | undefined {
  if (typeof value === "string") return (v7Results as readonly string[]).includes(value) ? "result" : "text";
  if (typeof value === "number" || value === null) return "reading";
  return undefined;
}

/** The value at `path` (effective payload) when the path addresses a correctable field. */
export function correctableValue(payload: Json, path: string): { value: Json; kind: CorrectionKind } | undefined {
  const segments = parseFieldPath(path);
  const found = segments && locate(payload, segments);
  if (!found) return undefined;
  const value = found.parent[found.key]!;
  const kind = kindOf(value);
  return kind ? { value, kind } : undefined;
}

/**
 * Whether `next` may replace a value of `kind` — shape only. The enum and length rules live in the frozen
 * contract, which `effectivePayloadIsValid` re-checks; `kind` is derived from the value as accepted, so a
 * result field that is empty or null is treated as text/reading here and the contract does the refusing.
 */
export function acceptableNewValue(kind: CorrectionKind, next: unknown): next is Json {
  if (kind === "result") return typeof next === "string" && (v7Results as readonly string[]).includes(next);
  if (kind === "text") return typeof next === "string" && next.length <= 4000;
  return next === null || (typeof next === "string" && next.length <= 200) || (typeof next === "number" && Number.isFinite(next));
}

/**
 * Accepted payload + corrections (latest `sequence` per path wins). Never mutates its input.
 *
 * A correction may turn a field into a finding (`not_good` / `complete_repair`) that has no accepted photo,
 * or clear one that has: the stored evidence manifest is frozen and stays as accepted (owner decision,
 * T5 §9 Q3). Anything rendering the effective payload must therefore pair it with a manifest derived from
 * that payload, as `effectivePayloadIsValid` does — never with the stored manifest.
 */
export function applyCorrections(payload: Json, corrections: readonly StoredCorrection[]): Json {
  const effective = structuredClone(payload);
  const latest = new Map<string, StoredCorrection>();
  for (const correction of corrections) {
    const current = latest.get(correction.fieldPath);
    if (!current || correction.sequence > current.sequence) latest.set(correction.fieldPath, correction);
  }
  for (const correction of latest.values()) {
    const segments = parseFieldPath(correction.fieldPath);
    const found = segments && locate(effective, segments);
    if (!found) throw new Error(`Stored correction path no longer resolves: ${correction.fieldPath}`);
    found.parent[found.key] = structuredClone(correction.newValue);
  }
  return effective;
}

function humanize(segment: string) {
  return segment.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

/**
 * First `label` of an object whose `key` equals `key`, searched through the frozen snapshot. Display only:
 * a definition that reuses one control key under two sections labels both with the first section's caption.
 */
function frozenLabel(snapshot: unknown, key: string, seen = new Set<unknown>()): string | undefined {
  if (typeof snapshot !== "object" || snapshot === null || seen.has(snapshot)) return undefined;
  seen.add(snapshot);
  if (!Array.isArray(snapshot) && (snapshot as Record<string, unknown>).key === key && typeof (snapshot as Record<string, unknown>).label === "string") {
    return (snapshot as Record<string, unknown>).label as string;
  }
  for (const child of Object.values(snapshot as Record<string, unknown>)) {
    const found = frozenLabel(child, key, seen);
    if (found) return found;
  }
  return undefined;
}

/** Every correctable field of an (effective) payload, with a readable label from the frozen snapshot. */
export function listCorrectableFields(payload: Json, snapshot: unknown): CorrectableField[] {
  const fields: CorrectableField[] = [];
  const walk = (node: Json, path: string[], labels: string[]) => {
    if (path.length >= maxSegments) return;
    if (Array.isArray(node)) {
      node.forEach((row, index) => {
        if (isObject(row) && typeof row.rowUuid === "string" && segmentPattern.test(row.rowUuid)) walk(row, [...path, row.rowUuid], [...labels, `Row ${index + 1}`]);
      });
      return;
    }
    if (!isObject(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (!segmentPattern.test(key) || deniedKey(key)) continue;
      const label = frozenLabel(snapshot, key) ?? humanize(key);
      if (isObject(value) || Array.isArray(value)) { walk(value, [...path, key], [...labels, label]); continue; }
      const kind = kindOf(value);
      if (!kind) continue;
      fields.push({ fieldPath: [...path, key].join("."), label: [...labels, label].join(" › "), kind, value, ...(kind === "result" ? { options: v7Results } : {}) });
    }
  };
  walk(payload, [], []);
  return fields;
}

/**
 * Frozen-contract check of an effective payload: the record's own Accepted Detail validator, run on the
 * accepted row with `responses` replaced. A V7 evidence manifest must list exactly the payload's findings;
 * corrections may change which fields are findings without new photos (owner decision, T5 §9 Q3), so the
 * check pairs the effective payload with a manifest derived from it. The stored manifest is never changed.
 */
/**
 * Whether the record is readable exactly as accepted — the same check Accepted Detail makes. A record that
 * fails here is corrupt in store (not something a correction caused), and the synthetic manifest below
 * would otherwise hide that.
 */
export function acceptedRowIsValid(systemKey: string, acceptedRow: Record<string, unknown>): boolean {
  const validate = correctableSystems.get(systemKey);
  if (!validate) return false;
  try { return Boolean(validate({ ...acceptedRow })); } catch { return false; }
}

export function effectivePayloadIsValid(systemKey: string, acceptedRow: Record<string, unknown>, effective: Json): boolean {
  if (!correctableSystems.has(systemKey)) return false;
  const snapshot = acceptedRow.inspectionSnapshot;
  const validate = correctableSystems.get(systemKey)!;
  let checkedSnapshot: unknown = snapshot;
  try {
    if (isObject(snapshot as Json) && Array.isArray((snapshot as Record<string, Json>).evidenceManifest)) {
      const frozen = snapshot as Record<string, Json>;
      const template = frozen.template as Record<string, Json> | undefined;
      const system = frozen.system as Record<string, Json> | undefined;
      const adapter = resolveV7EvidenceContract({ systemKey, templateId: template?.id, templateVersion: template?.version, definition: system?.definition, contractSha256: frozen.contractSha256 });
      const findings = adapter?.derivePoorFieldPaths(effective);
      if (!findings) return false;
      checkedSnapshot = {
        ...frozen,
        evidenceManifest: findings.map((fieldPath, index) => ({
          photoUuid: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          fieldPath,
          sourceSha256: createHash("sha256").update(`correction-check:${index}`).digest("hex")
        }))
      };
    }
    return Boolean(correctableSystems.get(systemKey)!({ ...acceptedRow, inspectionSnapshot: checkedSnapshot, responses: effective }));
  } catch {
    return false;
  }
}

/** Canonical JSON (sorted keys) for request fingerprints and value comparison. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
