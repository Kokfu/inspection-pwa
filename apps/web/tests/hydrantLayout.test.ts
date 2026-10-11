import assert from "node:assert/strict";
import test from "node:test";
import { configuredHydrantRows } from "../src/hydrant/hydrantRepository.js";
import { hasSavedHydrantLayout, hydrantLayoutLocation, hydrantLayoutLocationKey, hydrantLayoutRows, hydrantSetupStep, newHydrantTechnicianRow, savedHydrantLayout, startHydrantRows } from "../src/hydrant/hydrantLayout.js";
import type { HydrantInspectionRecord, HydrantResponses } from "../src/hydrant/hydrantTypes.js";

/** Phase 3 (Hydrant): which step a Draft needs, what the saved layout is, and what starting does to the rows. */

const location = (key: string, rows?: Array<{ assetReference: string; locationText: string }>, count?: number) => ({
  id: `l-${key}`, enabledSystemId: "e1", zoneId: null, key, displayName: key === "general" ? "General" : key, presetRowCount: count ?? (rows ? rows.length : 1), rowPreset: rows ? { rows } : {}, sortOrder: 1
});
const system = (locations: ReturnType<typeof location>[], zones: unknown[] = []) => ({ enabledSystemId: "e1", systemKey: "hydrant", displayName: "Hydrant", sortOrder: 1, definitionStatus: "confirmed", zones, locations }) as never;
const saved = [{ assetReference: "H-1", locationText: "Lobby" }, { assetReference: "H-2", locationText: "Roof" }];
const recordFor = (sys: ReturnType<typeof system>, patch: Partial<HydrantResponses> = {}, status = "Draft"): HydrantInspectionRecord => ({
  syncStatus: status, inspectionSnapshot: { system: sys }, responses: { schemaVersion: 1, hydrantType: null, comments: "", rows: configuredHydrantRows(sys, true), ...patch }
}) as never;

test("a customer with one location, or none, gets the automatic flow; several named locations keep the per-location buttons", () => {
  assert.equal(hydrantLayoutLocation(system([location("general")]))?.key, "general");
  assert.equal(hydrantLayoutLocation(system([])), undefined, "no location: nothing saved to pre-fill");
  assert.equal(hydrantLayoutLocation(system([location("general"), location("annex")])), undefined, "several named locations keep the per-location buttons");
  // The key the layout is saved under: the one location's own key, or "general" for a brand-new customer (no location, no zone).
  assert.equal(hydrantLayoutLocationKey(system([location("lobby")])), "lobby");
  assert.equal(hydrantLayoutLocationKey(system([])), "general");
  assert.equal(hydrantLayoutLocationKey(system([location("general"), location("annex")])), undefined);
  assert.equal(hydrantLayoutLocationKey(system([], [{ id: "z1", key: "z1", displayName: "Zone" }])), undefined, "zones without a location: the server would refuse a General location");
});

test("the saved layout is what the form pre-fills; a default location has none", () => {
  assert.deepEqual(savedHydrantLayout(system([location("general", saved)])), saved);
  assert.equal(hasSavedHydrantLayout(system([location("general", saved)])), true);
  assert.equal(hasSavedHydrantLayout(system([location("general")])), false, "a placeholder row is not a saved layout");
  assert.equal(hasSavedHydrantLayout(system([location("general", undefined, 3)])), true, "a configured count above one is a layout");
  assert.deepEqual(savedHydrantLayout(system([location("general"), location("annex")])), []);
});

test("the setup step follows the persisted content only", () => {
  assert.equal(hydrantSetupStep(recordFor(system([location("general")]))), "count");
  assert.equal(hydrantSetupStep(recordFor(system([location("general", saved)]))), "confirm");
  assert.equal(hydrantSetupStep(recordFor(system([location("general", saved), location("annex")]))), null, "several locations");
  assert.equal(hydrantSetupStep(recordFor(system([], [{ id: "z1", key: "z1", displayName: "Zone" }]))), null, "zones but no location");
  assert.equal(hydrantSetupStep(recordFor(system([location("general", saved)]), {}, "Pending")), null, "a submitted record");
  assert.equal(hydrantSetupStep(recordFor(system([location("general", saved)]), { hydrantType: "meter" })), null, "a type was chosen");
  assert.equal(hydrantSetupStep(recordFor(system([location("general", saved)]), { comments: "x" })), null, "a comment was typed");
  const touched = recordFor(system([location("general", saved)]));
  touched.responses.rows[0]!.canvasHose1Result = "good";
  assert.equal(hydrantSetupStep(touched), null, "a result was picked");
  const remarked = recordFor(system([location("general", saved)]));
  remarked.responses.rows[1]!.remarks = "loose";
  assert.equal(hydrantSetupStep(remarked), null, "a remark was typed");
  const added = recordFor(system([location("general", saved)]));
  added.responses.rows.push(newHydrantTechnicianRow(3, true));
  assert.equal(hydrantSetupStep(added), null, "a row was added");
});

test("a brand-new customer (no location) gets the count step from zero rows, until something is entered", () => {
  const fresh = recordFor(system([]));
  assert.equal(fresh.responses.rows.length, 0, "nothing is configured");
  assert.equal(hydrantSetupStep(fresh), "count");
  assert.equal(hydrantSetupStep(recordFor(system([]), { hydrantType: "meter" })), null, "a type was chosen");
  assert.equal(hydrantSetupStep(recordFor(system([]), { comments: "x" })), null, "a comment was typed");
  assert.equal(hydrantSetupStep(recordFor(system([]), {}, "Pending")), null, "a submitted record");
  const worked = recordFor(system([]));
  worked.responses.rows.push(newHydrantTechnicianRow(1, true));
  assert.equal(hydrantSetupStep(worked), null, "a row was added by the technician");
  // Starting makes every row a technician row; nothing is configured, nothing is frozen.
  const started = startHydrantRows(fresh.responses, { total: 3 }, true);
  assert.deepEqual(started.rows.map((row) => row.source), ["technician", "technician", "technician"]);
  assert.deepEqual(started.rows.map((row) => row.sortOrder), [1, 2, 3]);
  assert.equal(startHydrantRows(fresh.responses, { total: 1 }, true).rows.length, 1);
  assert.equal(fresh.responses.rows.length, 0, "the input is not modified");
  // The layout proposed on submit is saved under "general" with every row the technician filled in.
  started.rows[0]!.locationText = "Lobby"; started.rows[1]!.locationText = "Roof"; started.rows[2]!.locationText = "Car park";
  assert.deepEqual(hydrantLayoutRows(started).map((row) => row.locationText), ["Lobby", "Roof", "Car park"]);
  assert.equal(hasSavedHydrantLayout(system([])), false, "nothing saved yet, so the whole layout is proposed");
  assert.deepEqual(savedHydrantLayout(system([])), []);
});

test("starting a first visit keeps the configured row and adds blank rows up to the count", () => {
  const responses = recordFor(system([location("general")])).responses;
  const started = startHydrantRows(responses, { total: 4 }, true);
  assert.deepEqual(started.rows.map((row) => row.source), ["configured", "technician", "technician", "technician"]);
  assert.deepEqual(started.rows.map((row) => row.sortOrder), [1, 2, 3, 4]);
  assert.deepEqual(started.rows[0], responses.rows[0], "the configured row is untouched (the server requires it exactly as frozen)");
  assert.deepEqual(started.rows.slice(1).map((row) => [row.configuredLocationId, row.locationText, row.assetReference]), [[null, "", ""], [null, "", ""], [null, "", ""]]);
  assert.equal(startHydrantRows(responses, { total: 1 }, true).rows.length, 1);
  assert.equal(startHydrantRows(responses, { total: 0 }, true).rows.length, 1, "configured rows can never be removed");
  assert.equal(responses.rows.length, 1, "the input is not modified");
});

test("starting with a saved layout appends the extra rows after the pre-filled ones", () => {
  const responses = recordFor(system([location("general", saved)])).responses;
  const started = startHydrantRows(responses, { extra: 2 }, true);
  assert.deepEqual(started.rows.map((row) => [row.source, row.locationText]), [["configured", "Lobby"], ["configured", "Roof"], ["technician", ""], ["technician", ""]]);
  assert.deepEqual(started.rows.map((row) => row.sortOrder), [1, 2, 3, 4]);
  assert.equal(startHydrantRows(responses, { extra: 0 }, true).rows.length, 2);
});

test("a technician row carries every result column, and field remarks only on a V7 record", () => {
  const v7 = newHydrantTechnicianRow(5, true), legacy = newHydrantTechnicianRow(5, false);
  assert.deepEqual(v7.fieldRemarks, {});
  assert.equal("fieldRemarks" in legacy, false);
  for (const field of ["canvasHose1Result", "canvasHose2Result", "diffuserNozzleResult", "landingValveResult", "landingValveHandleResult", "hoseCabinetResult", "keyLockResult"] as const) assert.equal(v7[field], null);
});

test("the layout proposed is every row, including the ones added during the visit", () => {
  const responses = startHydrantRows(recordFor(system([location("general", saved)])).responses, { extra: 1 }, true);
  responses.rows[2]!.locationText = "Basement";
  assert.deepEqual(hydrantLayoutRows(responses), [...saved, { assetReference: "", locationText: "Basement" }]);
});
