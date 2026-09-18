import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { masterServiceReportV7 } from "../inspections/templates/masterServiceReportV7.js";
import { resolveHoseReelControls } from "../inspections/templates/definitionControls.js";
import { resolveAutomaticSprinklerControls } from "../inspections/templates/automaticSprinklerDefinitionControls.js";
import { v7EvidenceContractSha256 } from "../inspections/evidence/v7EvidenceContracts.js";
import { loadFinalServiceReport, type FinalReportSection, type FinalServiceReport } from "./finalServiceReport.js";
import { buildReportViewModel, companyProfile, defaultCompanyProfile, loadCompanyProfile, type ReportBlock, type ReportViewModel } from "./reportViewModel.js";

// Frozen JSON in PostgreSQL cannot carry `undefined` properties.
const v7 = (key: string) => JSON.parse(JSON.stringify(masterServiceReportV7.systems.find((system) => system.key === key)!)) as Record<string, unknown>;
const uuid = (n: number) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function v7Section(systemKey: string, label: string, response: unknown, options: { snapshotSchemaVersion?: 1 | 2; frozenSystem?: unknown; fields?: FinalReportSection["fields"] } = {}): FinalReportSection {
  return {
    systemKey, label, fields: options.fields ?? [], evidence: [],
    source: {
      snapshot: { schemaVersion: options.snapshotSchemaVersion ?? 2, template: { id: masterServiceReportV7.id, code: "MFE-FSSR", version: 7 }, system: { key: systemKey, systemKey, definition: v7(systemKey) } },
      response, frozenSystem: options.frozenSystem ?? { systemKey }
    }
  };
}

function reportOf(sections: FinalReportSection[]): FinalServiceReport {
  const keys = [...new Set(sections.map((section) => section.systemKey))];
  return {
    customer: "Hokuden (Malaysia) Sdn. Bhd.", site: "Zone 1", serviceDate: "2026-09-18", jobReference: "JOB-2026-0412",
    completedAt: "2026-09-18T08:40:00.000Z", completedBy: "Mohd Hafiz", telephone: "06-986 1234",
    systems: keys.map((systemKey) => ({ systemKey, label: sections.find((section) => section.systemKey === systemKey)!.label, status: "Accepted", condition: "GOOD CONDITIONS", conditionDetail: "", locations: ["Primary inspection"] })),
    sections
  };
}

const blockOf = <K extends ReportBlock["kind"]>(model: ReportViewModel, kind: K, key: string) => {
  const block = model.systemPages[0]!.blocks.find((candidate) => candidate.kind === kind && candidate.key === key);
  assert.ok(block, `${kind} block ${key} exists`);
  return block as Extract<ReportBlock, { kind: K }>;
};

/* ---------------------------------------------------------------- Hose Reel */

const hoseControls = resolveHoseReelControls(v7("hose_reel"), "MFE-FSSR", 7);
const hoseRow = (n: number, location: string, change: Record<string, unknown> = {}) => ({
  rowUuid: uuid(100 + n), source: "technician", configuredLocationId: null, zoneSnapshot: null, locationSnapshot: null, locationText: location,
  assetReference: null, sortOrder: n, drumType: "swing", drumResult: "good", hoseResult: "good", nozzleResult: "good", valveResult: "good", nozzleBoxResult: "good",
  remarks: "", fieldRemarks: {}, ...change
});
function hoseReelResponse() {
  const checklist = Object.fromEntries([...hoseControls.checklist.waterTank, ...hoseControls.checklist.pumpHouse, ...hoseControls.checklist.testRunFirePump]
    .map((item) => [item.key, { result: "good", remarks: "" }]));
  checklist.battery_serviceable = { result: "complete_repair", remarks: "Battery replaced on site" };
  checklist.trfp_standby_pump = { result: "na", remarks: "" };
  return {
    schemaVersion: 3, checklist,
    measurements: { jockey_pump_pressure: { values: { cut_in: 80, cut_out: 100 }, unit: "PSI", result: "good", remarks: "" }, standby_pump_cut_in: { values: { value: 70 }, unit: "PSI", result: "good", remarks: "" } },
    drumCount: 3,
    rows: [
      hoseRow(1, "G/F Main Entrance"),
      hoseRow(2, "1/F Office Corridor", { hoseResult: "not_good", nozzleResult: "not_good", remarks: "Replace soon", fieldRemarks: { hoseResult: "Hose leaking at coupling", nozzleResult: "Nozzle missing" } }),
      hoseRow(3, "2/F Canteen", { hoseResult: "not_good", nozzleBoxResult: "na", fieldRemarks: { hoseResult: "Hose perished" } })
    ],
    comments: "Pump room clean on departure."
  };
}

test("Hose Reel V7: register + checklist + units + measurement blocks come from the frozen definition", () => {
  const model = buildReportViewModel(reportOf([v7Section("hose_reel", "Hose Reel System", hoseReelResponse())]));
  const page = model.systemPages[0]!;
  assert.equal(page.structure, "v7");
  assert.deepEqual(page.blocks.map((block) => `${block.kind}:${block.key}`), [
    "checklist:water_tank_checks", "checklist:pump_house_checks", "checklist:pump_pressure_measurements",
    "units:test_run_fire_pump_checks", "checklist:drum_type", "register:hose_reel_rows", "comments:comments"
  ]);

  const waterTank = blockOf(model, "checklist", "water_tank_checks");
  assert.equal(waterTank.title, "Water Tank", "sole data block in its section takes the section title");
  assert.deepEqual(waterTank.rows[0], { no: 1, key: "saj_main_water_supply", label: "S.A.J Main Water Supply", unit: null, reading: null, result: { value: "good", display: "GOOD", tone: "good", finding: false }, remark: null });
  const battery = blockOf(model, "checklist", "pump_house_checks").rows.find((row) => row.key === "battery_serviceable")!;
  assert.equal(battery.result?.display, "COMPLETE REPAIR");
  assert.equal(battery.remark, "Battery replaced on site");

  const pressures = blockOf(model, "checklist", "pump_pressure_measurements").rows;
  assert.deepEqual(pressures.map((row) => [row.unit, row.reading]), [["PSI", "Cut In 80 / Cut Out 100"], ["PSI", "70"]]);

  const units = blockOf(model, "units", "test_run_fire_pump_checks");
  assert.equal(units.title, "Test Run Fire Pump 30 Minutes");
  assert.deepEqual(units.units.map((unit) => [unit.label, unit.result?.display]), [["Duty Pump", "GOOD"], ["Standby Pump", "N/A"]]);

  assert.equal(blockOf(model, "checklist", "drum_type").rows[0]!.reading, "Swing");

  const register = blockOf(model, "register", "hose_reel_rows");
  assert.deepEqual(register.columns.map((column) => `${column.label}:${column.kind}`), ["No.:text", "Location:text", "Drum:result", "Hose:result", "Nozzle:result", "Valve:result", "Nozzle Box:result", "Remarks:remarks"]);
  assert.equal(register.rows.length, 3);
  const row2 = register.rows[1]!;
  assert.deepEqual(row2.cells[1], { kind: "text", text: "1/F Office Corridor" });
  assert.deepEqual(row2.cells[3], { kind: "result", result: { value: "not_good", display: "NOT GOOD", tone: "bad", finding: true }, remark: "Hose leaking at coupling" });
  assert.deepEqual(row2.cells[7], { kind: "remarks", text: "Replace soon" });
  assert.equal((register.rows[2]!.cells[6] as { result: { display: string } }).result.display, "N/A");

  assert.deepEqual(page.remarks.map((remark) => remark.text), [
    "Pump House — Battery In Good Serviceable / Function: COMPLETE REPAIR — Battery replaced on site",
    "Hose Reel Drum — No. 2 (1/F Office Corridor) — Hose: NOT GOOD — Hose leaking at coupling",
    "Hose Reel Drum — No. 2 (1/F Office Corridor) — Nozzle: NOT GOOD — Nozzle missing",
    "Hose Reel Drum — No. 3 (2/F Canteen) — Hose: NOT GOOD — Hose perished"
  ]);
  assert.deepEqual(page.partsTally.map((line) => line.text), ["HOSE X 2", "NOZZLE X 1"]);
  assert.equal(page.comments, "Pump room clean on departure.");
  assert.equal(page.condition, "FAILED");
  assert.equal(model.summary[0]!.conditionDetail, page.remarks[1]!.text);
  assert.equal(model.summary[0]!.frequency, null);
});

test("label override: the frozen per-customer override renames the register column, its REMARK lines and parts tally", () => {
  const frozenSystem = { systemKey: "hose_reel", labelOverrides: { "repeatableRows.resultColumns.hose": "Flexible Hose" } };
  const model = buildReportViewModel(reportOf([v7Section("hose_reel", "Hose Reel System", hoseReelResponse(), { frozenSystem })]));
  const register = blockOf(model, "register", "hose_reel_rows");
  assert.deepEqual(register.columns.map((column) => column.label), ["No.", "Location", "Drum", "Flexible Hose", "Nozzle", "Valve", "Nozzle Box", "Remarks"]);
  assert.ok(model.systemPages[0]!.remarks.some((remark) => remark.text === "Hose Reel Drum — No. 2 (1/F Office Corridor) — Flexible Hose: NOT GOOD — Hose leaking at coupling"));
  assert.deepEqual(model.systemPages[0]!.partsTally.map((line) => line.text), ["FLEXIBLE HOSE X 2", "NOZZLE X 1"]);
  // Nothing else moves.
  const base = buildReportViewModel(reportOf([v7Section("hose_reel", "Hose Reel System", hoseReelResponse())]));
  assert.deepEqual(blockOf(model, "checklist", "water_tank_checks"), blockOf(base, "checklist", "water_tank_checks"));
});

/* ---------------------------------------------------------------- Fire Alarm V7 */

test("Fire Alarm V7: N/T/I register with sub-columns, 4-state checklist, alarm-device register", () => {
  const result = (value: string, remarks = "") => ({ result: value, remarks });
  const response = {
    schemaVersion: 2, controlPanelLocation: "Guard House",
    primaryDeviceRows: [{ rowUuid: uuid(1), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, displaySequence: 1, assetReference: "", alarmZone: "Z-1", location: "Guard House", manualCallPoint: ["normal", "test"], flowSwitch: ["test"], heatDetector: ["isolation"], smokeDetector: ["normal"], remarks: "" }],
    chargerAndBatteries: { main_supply: result("good"), battery: result("not_good", "Battery requires replacement"), charger: result("na") },
    mainFunctionKeys: { main_alarm_reset: result("good"), lamp_test: result("good"), evacuate: result("good"), ac_supply: result("good"), dc_supply: result("good"), spka_system: result("na"), alarm_lift_trip: result("good"), signal_gas_discharge: result("na") },
    secondaryAlarmDeviceRows: [{ rowUuid: uuid(2), source: "technician", configuredLocationId: null, configuredRowOrdinal: null, zoneSnapshot: null, locationSnapshot: null, displaySequence: 1, assetReference: "", location: "Lobby", alarmBell: "complete_repair", manualCallPoint: "good", remarks: "", fieldRemarks: { alarmBell: "Bell striker refitted" } }],
    comments: "Panel normal on departure."
  };
  const model = buildReportViewModel(reportOf([v7Section("fire_alarm_detector", "Fire Alarm / Detector System", response)]));
  assert.equal(blockOf(model, "checklist", "control_panel_location").rows[0]!.reading, "Guard House");
  const devices = blockOf(model, "register", "device_rows");
  assert.deepEqual(devices.columns.map((column) => [column.key, column.kind, column.subColumns]), [
    ["asset_reference", "text", null], ["alarm_zone", "text", null], ["location", "text", null],
    ["manual_call_point", "nti", ["N", "T", "I"]], ["flow_switch", "nti", ["N", "T", "I"]], ["heat_detector", "nti", ["N", "T", "I"]], ["smoke_detector", "nti", ["N", "T", "I"]],
    ["remarks", "remarks", null]
  ]);
  assert.deepEqual(devices.rows[0]!.cells.slice(1, 7), [
    { kind: "text", text: "Z-1" }, { kind: "text", text: "Guard House" },
    { kind: "nti", state: { normal: true, test: true, isolation: false } }, { kind: "nti", state: { normal: false, test: true, isolation: false } },
    { kind: "nti", state: { normal: false, test: false, isolation: true } }, { kind: "nti", state: { normal: true, test: false, isolation: false } }
  ]);
  assert.deepEqual(blockOf(model, "checklist", "charger_battery_checks").rows.map((row) => row.result?.display), ["GOOD", "NOT GOOD", "N/A"]);
  const bells = blockOf(model, "register", "alarm_device_rows");
  assert.deepEqual(bells.rows[0]!.cells[2], { kind: "result", result: { value: "complete_repair", display: "COMPLETE REPAIR", tone: "repair", finding: true }, remark: "Bell striker refitted" });
  assert.deepEqual(model.systemPages[0]!.remarks.map((remark) => remark.text), [
    "Charger & Batteries — Battery: NOT GOOD — Battery requires replacement",
    "Alarm Devices — No. 1 (Lobby) — Alarm Bell: COMPLETE REPAIR — Bell striker refitted"
  ]);
  assert.deepEqual(model.systemPages[0]!.partsTally, [], "only NOT GOOD register cells are tallied");
  assert.equal(model.systemPages[0]!.condition, "FAILED");
});

/* ---------------------------------------------------------------- Automatic Sprinkler */

test("Automatic Sprinkler V7: measurement rows carry the PSI unit and reading; pumps become a units block", () => {
  const controls = resolveAutomaticSprinklerControls(v7("automatic_sprinkler"), "MFE-FSSR", 7);
  const response = {
    schemaVersion: 2,
    checklist: Object.fromEntries([...controls.checklist.waterTank, ...controls.checklist.pumpHouse, ...controls.checklist.mainAlarmValve, ...(controls.checklist.testRunFirePump ?? [])].map((item) => [item.key, { result: "good", remarks: "" }])),
    measurements: Object.fromEntries(controls.measurements.map((row) => [row.key, { values: Object.fromEntries(row.values.map((value) => [value.key, 120])), unit: "PSI", result: "good", remarks: "" }])),
    comments: ""
  };
  const model = buildReportViewModel(reportOf([v7Section("automatic_sprinkler", "Automatic Sprinkler System", response)]));
  const gauges = blockOf(model, "checklist", "alarm_valve_measurements");
  assert.equal(gauges.title, "Alarm Valve Measurements", "a section with several data blocks keeps each block title");
  assert.deepEqual(gauges.rows.map((row) => [row.label, row.unit, row.reading, row.result?.display]), [
    ["Water Supply Gauge At", "PSI", "120", "GOOD"], ["Installation Gauge At", "PSI", "120", "GOOD"]
  ]);
  assert.deepEqual(blockOf(model, "units", "test_run_fire_pump_checks").units.map((unit) => unit.label), ["Jockey Pump", "Duty Pump", "Standby Pump"]);
  assert.equal(blockOf(model, "comments", "comments").text, null);
  assert.equal(model.systemPages[0]!.comments, null);
  assert.deepEqual(model.systemPages[0]!.remarks, []);
  assert.equal(model.systemPages[0]!.condition, "GOOD CONDITIONS");
});

/* ---------------------------------------------------------------- Portable Fire Extinguisher */

test("Portable Fire Extinguisher (V7 template, schema-1 snapshot): quantity block with total and text rows", () => {
  const response = { schemaVersion: 1, total: 24, dryPowder9kg: 18, co2_2kg: 6, others: "", comments: "All gauges green." };
  const model = buildReportViewModel(reportOf([v7Section("portable_fire_extinguisher", "Portable Fire Extinguisher", response, { snapshotSchemaVersion: 1 })]));
  const quantity = blockOf(model, "quantity", "quantity_summary");
  assert.deepEqual(quantity.rows, [
    { key: "total", label: "Total Fire Extinguisher", kind: "count", value: 24, isTotal: true },
    { key: "dry_powder_9kg", label: "9KG Dry Powder Fire Extinguisher", kind: "count", value: 18, isTotal: false },
    { key: "co2_2kg", label: "2KG CO2 Portable Fire Extinguisher", kind: "count", value: 6, isTotal: false },
    { key: "others", label: "Others", kind: "text", value: null, isTotal: false }
  ]);
  assert.equal(model.systemPages[0]!.comments, "All gauges green.");
});

/* ---------------------------------------------------------------- legacy */

test("legacy (pre-V7) record falls back to one checklist block from the flattened fields, legacy result words", () => {
  const section: FinalReportSection = {
    systemKey: "co2_fire_extinguisher", label: "CO2 Fire Extinguisher System",
    location: { locationId: uuid(9), locationLabel: "CO2 Room", zoneId: null, zoneLabel: "Block A", instanceKey: `location:${uuid(9)}` },
    fields: [
      { label: "Control Panel Location", value: "Control Room", depth: 0 },
      { label: "Charger And Batteries - Battery - Result", value: "Poor", depth: 1 },
      { label: "Charger And Batteries - Battery - Remarks", value: "Weak cell", depth: 1 },
      { label: "Main Function Keys - Lamp Test - Result", value: "Not Relevant", depth: 1 },
      { label: "Comments", value: "Room locked.", depth: 0 }
    ],
    evidence: [],
    source: { snapshot: { schemaVersion: 1, template: { version: 1 }, system: { definition: {} } }, response: {}, frozenSystem: {} }
  };
  const model = buildReportViewModel(reportOf([section]));
  const page = model.systemPages[0]!;
  assert.equal(page.structure, "legacy");
  assert.equal(page.location, "Block A / CO2 Room");
  assert.deepEqual(page.blocks.map((block) => block.kind), ["checklist", "comments"]);
  const rows = (page.blocks[0] as Extract<ReportBlock, { kind: "checklist" }>).rows;
  assert.deepEqual(rows.map((row) => [row.label, row.reading, row.result?.display ?? null]), [
    ["Control Panel Location", "Control Room", null],
    ["Charger And Batteries - Battery - Result", null, "POOR"],
    ["Charger And Batteries - Battery - Remarks", "Weak cell", null],
    ["Main Function Keys - Lamp Test - Result", null, "NOT RELEVANT"]
  ]);
  assert.deepEqual(page.remarks, [{ no: 1, text: "Charger And Batteries - Battery - Result: Poor — Weak cell", result: { value: "poor", display: "POOR", tone: "bad", finding: true } }]);
  assert.equal(page.comments, "Room locked.");
  assert.equal(page.condition, "FAILED");
  // A section with no raw source at all (e.g. built by hand) also falls back.
  const bare = buildReportViewModel(reportOf([{ ...section, source: undefined }]));
  assert.equal(bare.systemPages[0]!.structure, "legacy");
});

/* ---------------------------------------------------------------- company profile + cover */

test("company profile: shipped asset loads unconfirmed; missing / invalid file -> blank defaults, never a crash", async () => {
  assert.equal(companyProfile.source, "file");
  assert.equal(companyProfile.confirmed, false);
  assert.equal(companyProfile.legalName, "MFE SERVICES SDN. BHD.");
  assert.equal(companyProfile.reportNumberFormat, "MFE/SR/{YYYY}/{SEQ4}");

  const directory = await mkdtemp(path.join(tmpdir(), "r1-company-"));
  try {
    const missing = loadCompanyProfile(path.join(directory, "absent.json"));
    assert.deepEqual(missing, defaultCompanyProfile());
    await writeFile(path.join(directory, "broken.json"), "{ not json");
    assert.deepEqual(loadCompanyProfile(path.join(directory, "broken.json")), defaultCompanyProfile());
    await writeFile(path.join(directory, "partial.json"), JSON.stringify({ confirmed: "yes", legalName: "MFE", tel: 42, logoFile: "../secret.png" }));
    const partial = loadCompanyProfile(path.join(directory, "partial.json"));
    assert.equal(partial.confirmed, false);
    assert.equal(partial.legalName, "MFE");
    assert.equal(partial.tel, "");
    assert.equal(partial.logoFile, "", "logo must be a bare file name");

    const model = buildReportViewModel(reportOf([v7Section("hose_reel", "Hose Reel System", hoseReelResponse())]), { company: missing });
    assert.equal(model.company.legalName, "");
    assert.equal(model.cover.verifiedBy, null);
    // Not stored yet -> null, never invented.
    assert.deepEqual([model.cover.reportNumber, model.cover.issuedAt, model.cover.siteAddress, model.cover.fax, model.cover.contractNumber, model.cover.frequency, model.cover.contactPerson, model.cover.arrival],
      [null, null, null, null, null, null, null, null]);
    assert.equal(model.cover.telephone, "06-986 1234");
    assert.deepEqual(model.cover.technicians, ["Mohd Hafiz"]);
    assert.equal(model.cover.systemsServiced.length, 12);
    assert.deepEqual(model.cover.systemsServiced.filter((system) => system.serviced).map((system) => system.systemKey), ["hose_reel"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

/* ---------------------------------------------------------------- loader wiring */

test("loadFinalServiceReport carries the raw authority on each section non-enumerably, and the view model reads it", async () => {
  const definition = v7("hose_reel");
  const revisionId = uuid(25); const jobId = uuid(1);
  const configuration = {
    schemaVersion: 1, customer: { id: uuid(2), code: "ACME", displayName: "Acme Fire Safety" }, site: { id: uuid(3), displayName: "Main Tower" },
    configuration: { revisionId, revisionNumber: 1 }, template: { id: masterServiceReportV7.id, code: "MFE-FSSR", name: "Master", version: 7 },
    enabledSystems: [{ enabledSystemId: uuid(4), systemKey: "hose_reel", displayName: "Hose Reel System", definitionStatus: "confirmed", sortOrder: 1, zones: [], locations: [] }]
  };
  const response = hoseReelResponse();
  response.rows = [hoseRow(1, "Lobby")]; response.drumCount = 1;
  response.checklist.battery_serviceable = { result: "good", remarks: "" };
  const snapshot = {
    schemaVersion: 2, acceptedAt: "2026-08-19T08:00:00.000Z", job: { id: jobId, reference: "SV/2026:08", title: "Main Tower" },
    customer: configuration.customer, configuration: configuration.configuration, template: { id: masterServiceReportV7.id, code: "MFE-FSSR", version: 7 },
    instance: { instanceKey: "primary", displaySequence: 1, zone: null, location: null },
    system: { key: "hose_reel", systemKey: "hose_reel", displayName: "Hose Reel System", definition, repetitionMode: "single_with_repeatable_rows" },
    contractSha256: v7EvidenceContractSha256(definition), evidenceManifest: []
  };
  const row = {
    system_key: "hose_reel", instance_key: "primary", zone_id: null, location_id: null, display_sequence: 1, client_uuid: uuid(10), form_instance_id: uuid(24),
    master_template_version_id: masterServiceReportV7.id, customer_configuration_revision_id: revisionId,
    evidence_policy_id: null, evidence_policy_version: null, evidence_policy_snapshot: null, evidence_policy_sha256: null, evidence_policy_matches: true,
    attachment_field_path: null, inspection_snapshot: snapshot, response_payload: response, stored_sha256: null, storage_relative_path: null, width: null, height: null
  };
  const database = {
    async query(sql: string) {
      if (sql.includes("FROM inspection_jobs job")) return { rowCount: 1, rows: [{ id: jobId, status: "closed", configuration_snapshot: configuration, completed_at: "2026-08-19T08:00:00.000Z", completed_by_user_id: 7, completed_by_username: null, completed_by_display_name: "inspector-one", reference: "SV/2026:08", title: "Main Tower", service_date: "2026-08-19" }] };
      if (sql.includes("FROM master_system_form_instances instance")) return { rowCount: 1, rows: [row] };
      if (sql.includes("staged_inspection_evidence")) return { rowCount: 0, rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const report = await loadFinalServiceReport(jobId, database as never);
  const section = report.sections[0]!;
  assert.ok(section.source, "source is attached");
  assert.equal(section.source!.response, response);
  assert.equal(Object.getOwnPropertyDescriptor(section, "source")?.enumerable, false);
  assert.ok(!JSON.stringify(report.sections).includes("\"source\""), "pinned section digests are unaffected");
  const model = buildReportViewModel(report);
  assert.equal(model.systemPages[0]!.structure, "v7");
  assert.equal(blockOf(model, "register", "hose_reel_rows").rows.length, 1);
  assert.equal(model.summary[0]!.condition, report.systems[0]!.condition);
});
