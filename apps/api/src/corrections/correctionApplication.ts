/** Pure correction application shared by accepted-detail review, dashboard, and Final Report. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type StoredCorrection = { fieldPath: string; sequence: number; newValue: Json };

export const segmentPattern = /^[A-Za-z0-9_-]{1,100}$/;
const deniedKeys = new Set(["rowUuid", "source", "sortOrder", "displaySequence", "configuredRowOrdinal", "zoneSnapshot", "locationSnapshot", "schemaVersion", "unit",
  "__proto__", "constructor", "prototype"]);
const deniedKeyPattern = /(Id|Uuid|Sha256|At)$/;
export const maxSegments = 12;
export const isObject = (value: unknown): value is Record<string, Json> => typeof value === "object" && value !== null && !Array.isArray(value);
export const deniedKey = (key: string) => deniedKeys.has(key) || deniedKeyPattern.test(key);

export function parseFieldPath(path: unknown): string[] | undefined {
  if (typeof path !== "string" || path.length < 1 || path.length > 300) return undefined;
  const segments = path.split(".");
  if (segments.length > maxSegments || segments.some((segment) => !segmentPattern.test(segment) || deniedKey(segment))) return undefined;
  return segments;
}

export function locate(root: Json, segments: readonly string[]): { parent: Record<string, Json>; key: string } | undefined {
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

/** Latest sequence per field wins; the accepted payload is never mutated. */
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
