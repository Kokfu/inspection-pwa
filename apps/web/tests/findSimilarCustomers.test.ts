import assert from "node:assert/strict";
import test from "node:test";
import { findSimilarCustomers } from "../src/referenceData/findSimilarCustomers";

for (const [name, existing, match] of [
  ["  ABC   SDN. BHD. ", "ABC Sdn Bhd", true],
  ["ABC, Sdn Bhd", "ABC Berhad", true],
  ["ABC Bhd", "ABC Sdn. Bhd.", true],
  ["Acme Safety", "Acme Saftey", true],
  ["Alphaa", "Alpha", true],
  ["Alpha", "Alpha Engineering", true],
  ["Safety", "Acme Safety Services", true],
  ["Orchid Services", "Zenith Engineering", false],
  ["ABC", "XYZ Sdn Bhd", false],
  ["", "ABC", false],
  ["Sdn. Bhd.", "ABC Sdn Bhd", false],
  ["A", "Acme", false]
] as const) test(`${name} / ${existing}`, () => {
  const customer = { id: "one", displayName: existing };
  assert.deepEqual(findSimilarCustomers(name, [customer]), match ? [customer] : []);
});

test("ranks equality first, returns top three original objects without mutating input", () => {
  const customers = ["Alpha Engineering", "Alpha Services", "Alpha Sdn Bhd", "Alpha Works"].map((displayName, i) => ({ id: String(i), displayName }));
  const before = structuredClone(customers);
  assert.deepEqual(findSimilarCustomers("Alpha", customers).map((c) => c.id), ["2", "0", "1"]);
  assert.equal(findSimilarCustomers("Alpha", customers)[0], customers[2]);
  assert.deepEqual(customers, before);
});
