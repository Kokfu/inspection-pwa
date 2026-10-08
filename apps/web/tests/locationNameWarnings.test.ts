import assert from "node:assert/strict";
import test from "node:test";
import { locationNameWarnings } from "../src/referenceData/locationNameWarnings";

test("name warnings ignore casing and surrounding spaces, and report each duplicate once", () => {
  assert.deepEqual(locationNameWarnings(
    [{ displayName: " Ground Floor " }, { displayName: "ground FLOOR" }, { displayName: "Ground Floor" }],
    [{ zoneId: "a", displayName: "Server Room" }, { zoneId: "a", displayName: " server ROOM " }]
  ), ["Duplicate zone names: ground floor.", "Duplicate location names within a zone: server room."]);
});

test("location names may repeat in different zones; blank names are left to required-name validation", () => {
  assert.deepEqual(locationNameWarnings([{ displayName: "" }, { displayName: " " }], [
    { zoneId: "a", displayName: "Room" }, { zoneId: "b", displayName: "ROOM" },
    { zoneId: "a", displayName: "" }, { zoneId: "a", displayName: " " }
  ]), []);
});

test("warnings leave names and identities intact, including punctuation and Unicode", () => {
  const zones = [{ displayName: "日本 & <room>" }, { displayName: " 日本 & <room> " }];
  const before = structuredClone(zones);
  assert.deepEqual(locationNameWarnings(zones, []), ["Duplicate zone names: 日本 & <room>."]);
  assert.deepEqual(zones, before);
});
