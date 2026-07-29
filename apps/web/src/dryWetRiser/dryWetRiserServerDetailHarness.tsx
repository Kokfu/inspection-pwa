import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { localDatabase } from "../db/localDatabase";
import { ServerDryWetRiserView } from "./ServerDryWetRiserView";
import { parseServerDryWetRiserDetail } from "./serverDryWetRiserApi";

const uuid = (tail: string) => `41000000-0000-4000-8000-${tail}`;
const water = ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "drain_and_stop_valve_positions"];
const pump = ["pump_house_clean", "manual_start_pumps", "jockey_pump_pressure", "duty_pump_cut_in", "standby_pump_cut_in", "standby_pump_service_items", "battery_charging_alternator", "battery_charger_failure_alarm", "battery_charger_failure_alarm", "battery_serviceable", "pump_phase_failure_alarm", "pumps_auto_start", "test_and_gate_valve_positions"];
const fixed = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, { result: "good", remarks: `${key} remark` }]));

export function dryWetRiserServerDetailFixture() {
  return {
    clientUuid: uuid("000000000001"), serverFormInstanceId: uuid("000000000002"), jobId: uuid("000000000003"), jobReference: "RISER-SERVER-1", jobTitle: "Server Riser", customerId: uuid("000000000004"), customerCode: "CUSTOMER-1", customerName: "Server Customer", systemKey: "dry_wet_riser", systemLabel: "Dry / Wet Riser System", status: "submitted", performedAt: "2026-07-29T00:00:00.000Z", receivedAt: "2026-07-29T00:01:00.000Z", template: { id: uuid("000000000005"), code: "MFE-FSSR", version: 2 }, configuration: { revisionId: uuid("000000000006"), revisionNumber: 7 }, systemConfiguration: { riserMode: "dry" }, responses: { schemaVersion: 1, mode: "dry", waterTank: fixed(water), pumpHouse: fixed(pump.filter((key, index) => pump.indexOf(key) === index)), measurements: { jockeyCutIn: 10, jockeyCutOut: 11, dutyCutIn: 12, standbyCutIn: 13, unit: "PSI" }, riserOutlets: [{ rowUuid: uuid("000000000007"), source: "configured", configuredLocationId: uuid("000000000008"), configuredRowOrdinal: 1, zoneSnapshot: { id: uuid("000000000009"), displayName: "Zone A" }, locationSnapshot: { id: uuid("000000000008"), displayName: "Pump Room" }, assetReference: "R-1", locationText: "Pump Room", canvasHoseAt2Result: "good", diffuserNozzleResult: "poor", landingValveResult: "good", crandleResult: "poor", doorResult: "good", remarks: "Outlet remark", sortOrder: 1 }], comments: "Server comments" }, deviceReportedCreatorUsername: null, verifiedOriginalCreatorUsername: null, syncedByUsername: "validator"
  };
}

export async function runDryWetRiserServerDetailHarness(mount: HTMLElement) {
  const outcomes: { name: string; passed: boolean; detail?: string }[] = [];
  const check = (name: string, passed: boolean, detail = "") => outcomes.push({ name, passed, detail });
  const valid = dryWetRiserServerDetailFixture();
  const parsed = parseServerDryWetRiserDetail(valid);
  check("complete canonical response parses", !!parsed);
  const mutations: [string, (value: any) => void][] = [
    ["missing clientUuid", (v) => delete v.clientUuid], ["malformed clientUuid", (v) => v.clientUuid = "bad"], ["wrong systemKey", (v) => v.systemKey = "hose_reel"], ["wrong template version", (v) => v.template.version = 1], ["missing systemConfiguration", (v) => delete v.systemConfiguration], ["invalid riserMode", (v) => v.systemConfiguration.riserMode = "other"], ["extra systemConfiguration key", (v) => v.systemConfiguration.extra = true], ["missing Water Tank member", (v) => delete v.responses.waterTank.water_level], ["extra Water Tank member", (v) => v.responses.waterTank.extra = { result: "good", remarks: "" }], ["incorrect Water Tank membership", (v) => { delete v.responses.waterTank.water_level; v.responses.waterTank.other = { result: "good", remarks: "" }; }], ["missing Pump House member", (v) => delete v.responses.pumpHouse.pump_house_clean], ["extra Pump House member", (v) => v.responses.pumpHouse.extra = { result: "good", remarks: "" }], ["incorrect Pump House membership", (v) => { delete v.responses.pumpHouse.pump_house_clean; v.responses.pumpHouse.other = { result: "good", remarks: "" }; }], ["missing PSI value", (v) => delete v.responses.measurements.jockeyCutIn], ["non-finite PSI", (v) => v.responses.measurements.jockeyCutIn = Infinity], ["wrong PSI unit", (v) => v.responses.measurements.unit = "BAR"], ["malformed outlet UUID", (v) => v.responses.riserOutlets[0].rowUuid = "bad"], ["duplicate outlet UUID", (v) => v.responses.riserOutlets.push({ ...v.responses.riserOutlets[0], sortOrder: 2 })], ["duplicate sortOrder", (v) => v.responses.riserOutlets.push({ ...v.responses.riserOutlets[0], rowUuid: uuid("000000000010"), sortOrder: 1 })], ["non-contiguous sortOrder", (v) => v.responses.riserOutlets[0].sortOrder = 2], ["malformed configured provenance", (v) => v.responses.riserOutlets[0].locationSnapshot.id = uuid("000000000011")], ["missing outlet location", (v) => v.responses.riserOutlets[0].locationText = ""], ["missing outlet result", (v) => delete v.responses.riserOutlets[0].doorResult], ["invalid Good/Poor result", (v) => v.responses.riserOutlets[0].doorResult = "unknown"], ["malformed remarks", (v) => v.responses.riserOutlets[0].remarks = 42], ["malformed comments", (v) => v.responses.comments = 42], ["unsupported top-level key", (v) => v.extra = true]
  ];
  for (const [name, mutate] of mutations) { const candidate = structuredClone(valid); mutate(candidate); check(`parser fails closed: ${name}`, parseServerDryWetRiserDetail(candidate) === undefined); }
  if (parsed) {
    const before = { inspections: await localDatabase.masterSystemInspections.count(), outbox: await localDatabase.syncOutbox.count() };
    const root = createRoot(mount); flushSync(() => root.render(<ServerDryWetRiserView inspection={parsed} onBack={() => undefined} />));
    const visible = mount.textContent || "";
    const visibleDetails = ["Completed", parsed.clientUuid, "RISER-SERVER-1", "Server Riser", "Server Customer", "MFE-FSSR v2", "Dry", "Jockey Cut In", "Canvas hose@2", "Diffuser Nozzle", "Landing Valve", "Crandle", "Door", "Server comments"];
    const missingDetails = visibleDetails.filter((value) => !visible.includes(value));
    check("read-only view renders canonical details", missingDetails.length === 0, missingDetails.join(", "));
    check("read-only view contains no editing controls", mount.querySelectorAll("input, textarea, select").length === 0 && !/Save Draft|Submit Local|Add Row|Remove Row|Camera|Photo/.test(visible));
    flushSync(() => root.render(<ServerDryWetRiserView inspection={parsed} onBack={() => undefined} />)); root.unmount();
    const after = { inspections: await localDatabase.masterSystemInspections.count(), outbox: await localDatabase.syncOutbox.count() };
    check("server rendering does not write IndexedDB", before.inspections === after.inspections, `${before.inspections} -> ${after.inspections}`);
    check("server rendering does not write sync outbox", before.outbox === after.outbox, `${before.outbox} -> ${after.outbox}`);
  }
  return { status: outcomes.every((outcome) => outcome.passed) ? "PASS" : "FAIL", outcomes };
}
