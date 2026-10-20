import assert from "node:assert/strict";
import test from "node:test";
import { proposalCustomers, proposalMatches } from "../src/manager/proposalFilters";
import type { SiteProposal, LocationProposal } from "../src/manager/managerApi";

const common = { id: "request", customerId: "customer-a", customerDisplayName: "Customer North", jobId: "job", jobReference: "SV-77", submittedByUserId: 1, submittedBy: "Field Technician", submittedAt: "2026-10-20T00:00:00.000Z", status: "pending" as const, decision: null };
const site: SiteProposal = { ...common, siteId: "site", proposedDisplayName: "New Depot", proposedAddress: "22 Long Road" };
const location: LocationProposal = { ...common, submittedByRole: "inspector", systemKey: "co2_fire_extinguisher", systemDisplayName: "Carbon Dioxide", edited: false,
  payload: { kind: "add-location", locationKey: "room", displayName: "Pump Room", zoneKey: null, newZone: { key: "east", displayName: "East Wing" } } };
for (const query of ["Customer North", "New Depot", "22 Long Road", "Field Technician", "SV-77"]) {
  test(`site field matches: ${query}`, () => assert.equal(proposalMatches(site, "", query), true));
}
for (const query of ["Customer North", "Carbon Dioxide", "Pump Room", "East Wing", "Field Technician", "SV-77"]) {
  test(`location field matches: ${query}`, () => assert.equal(proposalMatches(location, "", query), true));
}
for (const key of ["locationText", "location", "zoneText", "alarmZone", "assetReference"]) {
  test(`update-format matches ${key}`, () => assert.equal(proposalMatches({ ...location, payload: { kind: "update-format", locationKey: "general", rows: [{ [key]: "Unique row text" }] } }, "", "row text"), true));
}
test("trimmed locale-insensitive substring and empty queries", () => {
  assert.equal(proposalMatches(site, "", "  nEw deP  "), true);
  assert.equal(proposalMatches(site, "", "   "), true);
  assert.equal(proposalMatches({ ...site, proposedAddress: null, jobReference: null }, "", "missing"), false);
  assert.equal(proposalMatches({ ...location, systemDisplayName: null, jobReference: null, payload: { kind: "add-location", locationKey: "room", displayName: "Room", newZone: null, zoneKey: null } }, "", "missing"), false);
});
test("customer AND text, with distinct same-name customer identities", () => {
  const other = { ...site, customerId: "customer-b" };
  assert.equal(proposalMatches(site, "customer-a", "depot"), true);
  assert.equal(proposalMatches(site, "customer-a", "missing"), false);
  assert.equal(proposalMatches(other, "customer-a", "depot"), false);
  assert.equal(proposalMatches(other, "customer-b", "depot"), true);
  assert.deepEqual(proposalCustomers([other, site, site, { ...site, customerId: "first", customerDisplayName: "Alpha" }]).map(item => item.customerId), ["first", "customer-a", "customer-b"]);
});
test("unlisted fields do not match", () => {
  assert.equal(proposalMatches(site, "", "request"), false);
  assert.equal(proposalMatches({ ...location, payload: { kind: "update-format", locationKey: "hidden-key", rows: [{ drumType: "hidden-type" }] } }, "", "hidden"), false);
});
