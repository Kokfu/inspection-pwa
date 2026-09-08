import assert from "node:assert/strict";
import test from "node:test";
import {
  applyLabelOverrides as webApply,
  collectResolvedLabelPaths as webCollect,
  overriddenLabel as webOverriddenLabel,
  resolvedLabelPathSet as webPathSet
} from "../src/inspections/labelOverrides.ts";
import {
  applyLabelOverrides as apiApply,
  collectResolvedLabelPaths as apiCollect,
  overriddenLabel as apiOverriddenLabel,
  resolvedLabelPathSet as apiPathSet
} from "../../api/src/inspections/labelOverrides";

/**
 * The web copy of `applyLabelOverrides` (apps/web/src/inspections/labelOverrides.ts)
 * MUST behave byte-for-byte like the API authority (apps/api/src/inspections/labelOverrides.ts):
 * same canonical dotted-path grammar, same no-op / clone / blank-fallback rules.
 * The web copy exists only so label rendering works fully offline from the
 * cached job snapshot. Any divergence here means a technician would see a
 * different label than the accepted report and the PDF.
 */

// A resolved-controls tree shaped like the real ones: object steps contribute
// the property name, array steps contribute each element's own `key`. Includes a
// nested repeatable-row path and a `{ value, label }` option list that must NOT
// be treated as overridable.
const tree = () => ({
  checklist: {
    pumpHouse: [
      { key: "pumps_auto_start", label: "Jockey And Stand-By Pump In Auto Start Position", sortOrder: 1, result: {
        type: "single_select", required: true, options: [{ value: "good", label: "Good" }, { value: "poor", label: "Poor" }]
      } }
    ]
  },
  measurements: {
    jockey_pump_pressure: {
      key: "jockey_pump_pressure",
      label: "Jockey Pump Pressure",
      values: [{ key: "cut_in", label: "Cut In", unit: "bar" }, { key: "cut_out", label: "Cut Out", unit: "bar" }]
    }
  },
  repeatableRows: { resultColumns: [{ key: "drumResult", label: "Drum", sortOrder: 1 }] },
  primaryDeviceRows: { location: { key: "location", label: "Location", required: true, maxLength: 300 } }
});

/** An override map whose one entry is an OWN but non-enumerable property —
 *  `Object.entries` (applyLabelOverrides) and `propertyIsEnumerable`
 *  (overriddenLabel) must both skip it. */
const nonEnumerable = (path: string, value: string): Record<string, string> => {
  const map: Record<string, string> = {};
  Object.defineProperty(map, path, { value, enumerable: false, configurable: true, writable: true });
  return map;
};

const cases: Array<{ name: string; overrides: unknown }> = [
  { name: "override hit (checklist item)", overrides: { "checklist.pumpHouse.pumps_auto_start": "Auto Start OK" } },
  { name: "nested repeatable-row path", overrides: { "repeatableRows.resultColumns.drumResult": "Reel Result" } },
  { name: "nested measurement value path", overrides: { "measurements.jockey_pump_pressure.values.cut_in": "Start Pressure" } },
  { name: "blank value falls back to definition", overrides: { "primaryDeviceRows.location": "   " } },
  { name: "padded value is trimmed on both sides", overrides: { "primaryDeviceRows.location": "  Site Position  " } },
  { name: "prototype-inherited value is ignored (own props only)", overrides: Object.create({ "primaryDeviceRows.location": "Inherited" }) as Record<string, string> },
  { name: "own non-enumerable value is ignored (own + enumerable only)", overrides: nonEnumerable("primaryDeviceRows.location", "Hidden") },
  { name: "absent path is a fallback (unknown key ignored)", overrides: { "checklist.pumpHouse.does_not_exist": "X" } },
  { name: "unknown + real path mixed", overrides: { "nope.nope": "A", "primaryDeviceRows.location": "Where" } },
  { name: "empty-map no-op", overrides: {} },
  { name: "non-object no-op (null)", overrides: null },
  { name: "non-object no-op (string)", overrides: "not-a-map" },
  { name: "option label is NOT overridable", overrides: { "checklist.pumpHouse.pumps_auto_start.result.options.good": "Fine" } }
];

test("collectResolvedLabelPaths parity", () => {
  assert.deepEqual(webCollect(tree()), apiCollect(tree()));
  assert.deepEqual([...webPathSet(tree())].sort(), [...apiPathSet(tree())].sort());
  // Sanity: it finds the labelled nodes and excludes the { value, label } option.
  const paths = webCollect(tree()).map((entry) => entry.path).sort();
  assert.deepEqual(paths, [
    "checklist.pumpHouse.pumps_auto_start",
    "measurements.jockey_pump_pressure",
    "measurements.jockey_pump_pressure.values.cut_in",
    "measurements.jockey_pump_pressure.values.cut_out",
    "primaryDeviceRows.location",
    "repeatableRows.resultColumns.drumResult"
  ]);
});

for (const scenario of cases) {
  test(`applyLabelOverrides parity — ${scenario.name}`, () => {
    const web = webApply(tree(), scenario.overrides);
    const api = apiApply(tree(), scenario.overrides);
    assert.deepEqual(web, api, "web and api output must be identical");
    // And identical to what the definition tree would render when no usable
    // override applies (no-op / blank / unknown cases return the input untouched).
    const usable = scenario.overrides && typeof scenario.overrides === "object"
      && Object.entries(scenario.overrides as Record<string, unknown>).some(([path, value]) =>
        typeof value === "string" && value.trim().length > 0 && webPathSet(tree()).has(path));
    if (!usable) assert.deepEqual(web, tree(), "no usable override must be a pure no-op");
  });
}

// `overriddenLabel` is what the technician forms actually call at a JSX label
// site (so the canonical `resolvedControls` tree is never cloned/shadowed).
// It MUST agree with `applyLabelOverrides` at every path, or a technician would
// see a label the accepted report / PDF (server-side `applyLabelOverrides`) does
// not.
test("overriddenLabel is byte-equivalent to applyLabelOverrides at every path", () => {
  const maps: unknown[] = [
    {},
    null,
    "nope",
    { "checklist.pumpHouse.pumps_auto_start": "Auto Start OK" },
    { "primaryDeviceRows.location": "   " },
    { "primaryDeviceRows.location": "  Padded  " },
    Object.create({ "primaryDeviceRows.location": "Inherited" }) as Record<string, string>,
    nonEnumerable("primaryDeviceRows.location", "Hidden"),
    { "repeatableRows.resultColumns.drumResult": "Reel Result", "measurements.jockey_pump_pressure.values.cut_in": "Start" },
    { "checklist.pumpHouse.pumps_auto_start.result.options.good": "Fine" },
    { "unknown.path": "x" },
    { "primaryDeviceRows.location": 42 as unknown as string }
  ];
  for (const map of maps) {
    const applied = webApply(tree(), map);
    for (const node of webCollect(tree())) {
      // What the display tree renders at this path:
      const appliedLabel = webCollect(applied).find((entry) => entry.path === node.path)!.definitionLabel;
      assert.equal(webOverriddenLabel(map, node.path, node.definitionLabel), appliedLabel, `web ${node.path}`);
      assert.equal(apiOverriddenLabel(map, node.path, node.definitionLabel), appliedLabel, `api ${node.path}`);
    }
    // And a path with no label node just echoes the fallback on both sides.
    assert.equal(webOverriddenLabel(map, "no.such.path", "Fallback"), apiOverriddenLabel(map, "no.such.path", "Fallback"));
    assert.equal(webOverriddenLabel(map, "no.such.path", "Fallback"), "Fallback");
  }
});

test("applyLabelOverrides never mutates its input and swaps only labels", () => {
  const input = tree();
  const frozen = JSON.stringify(input);
  const out = webApply(input, { "primaryDeviceRows.location": "Site Position" });
  assert.equal(JSON.stringify(input), frozen, "input tree must be untouched");
  assert.equal(out.primaryDeviceRows.location.label, "Site Position");
  assert.equal(out.primaryDeviceRows.location.key, "location", "key is never touched");
  assert.equal(out.primaryDeviceRows.location.maxLength, 300, "sibling fields are never touched");
  assert.equal(
    out.checklist.pumpHouse[0].result.options[0].label,
    "Good",
    "Good/Poor option vocabulary is never touched"
  );
});
