/**
 * Per-customer display-label overrides for a resolved-controls tree.
 *
 * VERBATIM PORT of `apps/api/src/inspections/labelOverrides.ts` (slice 1a-i).
 * Keep byte-for-byte in sync with the API copy: same path grammar, same
 * no-op / clone / blank-fallback semantics. `labelOverrides.parity.test.ts`
 * asserts the two behave identically. The web copy exists so label rendering
 * works fully offline from the cached job snapshot with no API round-trip.
 *
 * LABEL STRINGS ONLY. This never touches field keys, response shape,
 * `validResponses()` lists, evidence `fieldPath`s, the frozen attachment
 * manifest, or `contractSha256 = sha256(canonical(definition))`. It is applied
 * at RENDER time, on a clone, AFTER the frozen `resolvedControls` equality gate
 * — the un-overridden tree is what acceptance froze and what re-derivation
 * compares against.
 *
 * ## Canonical path grammar
 *
 * A label-bearing node is any plain object carrying BOTH a string `key` and a
 * string `label` (checklist item, measurement row, measurement value,
 * repeatable-row result column, a named text slot such as
 * `controlPanelLocation`). Result *option* labels (`{ value, label }`, no `key`)
 * are deliberately NOT overridable — they are the Good/Poor/N.A. vocabulary, not
 * a customer field name.
 *
 * The canonical path is the resolved-controls tree's own dotted object path to
 * that node: object steps contribute the property name, array steps contribute
 * the element's own `key` (falling back to the numeric index when an element has
 * no string `key`). Examples:
 *   checklist.pumpHouse.pumps_auto_start
 *   measurements.jockey_pump_pressure.values.cut_in
 *   repeatableRows.resultColumns.drumResult
 *   primaryDeviceRows.location
 */

type UnknownRecord = Record<string, unknown>;

export type LabelOverrideMap = Readonly<Record<string, string>>;

export type ResolvedLabelPath = {
  /** Canonical dotted path into the resolved-controls tree. */
  path: string;
  /** The node's `key`. */
  key: string;
  /** The definition-derived label (before any override). */
  definitionLabel: string;
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLabelledFieldNode = (value: unknown): value is UnknownRecord & { key: string; label: string } =>
  isRecord(value) && typeof value.key === "string" && typeof value.label === "string";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const joinPath = (base: string, segment: string) => (base ? `${base}.${segment}` : segment);

/**
 * Walk `node`, invoking `visit(path, fieldNode)` for every label-bearing node.
 * `visit` mutates `fieldNode` in place when it wants to; traversal continues
 * into the (possibly mutated) node either way.
 */
function walkLabelNodes(
  node: unknown,
  path: string,
  visit: (path: string, fieldNode: UnknownRecord & { key: string; label: string }) => void
): void {
  if (isLabelledFieldNode(node)) {
    visit(path, node);
  }
  if (Array.isArray(node)) {
    node.forEach((element, index) => {
      const segment = isRecord(element) && typeof element.key === "string" ? element.key : String(index);
      walkLabelNodes(element, joinPath(path, segment), visit);
    });
    return;
  }
  if (isRecord(node)) {
    for (const [childKey, childValue] of Object.entries(node)) {
      if (isRecord(childValue) || Array.isArray(childValue)) {
        walkLabelNodes(childValue, joinPath(path, childKey), visit);
      }
    }
  }
}

/** Every label-bearing path in a resolved-controls tree, with its definition label. */
export function collectResolvedLabelPaths(resolvedControls: unknown): ResolvedLabelPath[] {
  const paths: ResolvedLabelPath[] = [];
  walkLabelNodes(resolvedControls, "", (path, fieldNode) => {
    paths.push({ path, key: fieldNode.key, definitionLabel: fieldNode.label });
  });
  return paths;
}

/** The set of label-bearing paths that a resolved-controls tree exposes. */
export function resolvedLabelPathSet(resolvedControls: unknown): Set<string> {
  return new Set(collectResolvedLabelPaths(resolvedControls).map((entry) => entry.path));
}

/**
 * Return `resolvedControls` with each label-bearing node's `label` replaced by
 * `overrides[canonicalPath]` when that entry is a non-empty string (trimmed).
 * Pure:
 * a no-op (returns the input reference untouched) when `overrides` is
 * missing, not an object, or carries no usable string; otherwise returns a deep
 * clone with the labels swapped and the input left untouched.
 */
export function applyLabelOverrides<T>(resolvedControls: T, overrides: unknown): T {
  if (!isRecord(overrides)) return resolvedControls;
  const usable = Object.entries(overrides).filter(([, value]) => isNonEmptyString(value));
  if (usable.length === 0) return resolvedControls;
  const map = new Map<string, string>(usable.map(([key, value]) => [key, (value as string).trim()]));
  const clone = structuredClone(resolvedControls);
  walkLabelNodes(clone, "", (path, fieldNode) => {
    const replacement = map.get(path);
    if (replacement !== undefined) fieldNode.label = replacement;
  });
  return clone;
}

/**
 * Display-only single-node lookup for one canonical resolved-controls `path`:
 * the customer override when it is a usable (non-empty, trimmed) string,
 * otherwise `definitionLabel`. Per-node semantics are IDENTICAL to
 * `applyLabelOverrides`. Prefer this at a render site that wants one label
 * string without cloning / shadowing the canonical `resolvedControls` tree, so
 * its keys / dotted paths / result-option vocabulary stay the single authority
 * for every response-key, evidence-path and gate decision.
 */
export function overriddenLabel(overrides: unknown, path: string, definitionLabel: string): string {
  // `propertyIsEnumerable` matches `applyLabelOverrides`' `Object.entries` exactly
  // — own AND enumerable only — so an own non-enumerable key that the cloned
  // display tree would ignore is ignored here too (Sol P2).
  if (isRecord(overrides) && Object.prototype.propertyIsEnumerable.call(overrides, path)) {
    const value = overrides[path];
    if (isNonEmptyString(value)) return value.trim();
  }
  return definitionLabel;
}
