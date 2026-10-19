import assert from "node:assert/strict";
import test from "node:test";
import { diffLocationProposalRows } from "../src/manager/locationProposalDiff.js";
const a = { assetReference: "A" }, b = { assetReference: "B" }, c = { assetReference: "C" };
test("diff identifies added, removed, edited and unchanged rows without mutating inputs", () => {
  const before = Object.freeze([Object.freeze(a), Object.freeze(b)]);
  assert.deepEqual(diffLocationProposalRows(before, [a, c]).map(x => x.kind), ["Unchanged", "Changed"]);
  assert.deepEqual(diffLocationProposalRows([a, b, c], [a, c]).map(x => x.kind), ["Unchanged", "Removed", "Unchanged"]);
  assert.deepEqual(diffLocationProposalRows([a, c], [a, b, c]).map(x => x.kind), ["Unchanged", "Added", "Unchanged"]);
  assert.deepEqual(diffLocationProposalRows([], [a])[0], { kind: "Added", after: a, afterIndex: 0 });
  assert.deepEqual(diffLocationProposalRows([a], [])[0], { kind: "Removed", before: a, beforeIndex: 0 });
  assert.deepEqual(diffLocationProposalRows([], []), []);
  assert.deepEqual(before, [a, b]);
});
test("diff compares fields independent of property order and handles duplicate rows deterministically", () => {
  assert.equal(diffLocationProposalRows([{ location: "Lobby", alarmZone: "1" }], [{ alarmZone: "1", location: "Lobby" }])[0].kind, "Unchanged");
  assert.deepEqual(diffLocationProposalRows([a, a, b], [a, b]).map(x => x.kind), ["Unchanged", "Removed", "Unchanged"]);
  const result = diffLocationProposalRows([a, b, c], [{ assetReference: "Edited" }, c]);
  assert.deepEqual(result.map(x => x.kind), ["Changed", "Removed", "Unchanged"]);
  assert.equal(result[1].beforeIndex, 1);
  assert.equal(result[2].afterIndex, 1);
});
test("diff preserves all positions at the 500-row contract bound", () => {
  const before = Array.from({ length: 500 }, (_, i) => ({ assetReference: `Asset ${i}` }));
  const after = before.filter((_, i) => i !== 200).map((row, i) => i === 10 ? { ...row, assetReference: "Edited" } : row);
  const result = diffLocationProposalRows(before, after);
  assert.deepEqual(result.filter(row => row.before).map(row => row.before), before);
  assert.deepEqual(result.filter(row => row.after).map(row => row.after), after);
  assert.equal(result.filter(row => row.kind === "Changed").length, 1);
  assert.equal(result.filter(row => row.kind === "Removed").length, 1);
});
