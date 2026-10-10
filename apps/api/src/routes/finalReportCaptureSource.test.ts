import assert from "node:assert/strict";
import test from "node:test";
import { createFinalReportHandler } from "./inspectionJobs.js";

const jobId = "11111111-1111-4111-8111-111111111111";
const instanceKey = "location:22222222-2222-4222-8222-222222222222";
const charger = "charger_batteries.charger_battery_checks.main_supply";

test("completed report JSON includes each accepted photo's source without exposing photo bytes", async () => {
  const report = { customer: "Test", sections: [{ systemKey: "fm200_fire_suppression", label: "FM200", location: { instanceKey }, fields: [], evidence: [
    { field: charger, content: Buffer.from("private-photo"), width: 2, height: 2 },
    { field: "historical", content: Buffer.from("older-photo"), width: 2, height: 2 }
  ] }] };
  let queried = false;
  const database = { query: async (sql: string, values: unknown[]) => {
    queried = true;
    assert.match(sql, /staged_inspection_evidence/);
    assert.match(sql, /inspection_attachments/);
    assert.deepEqual(values, [jobId]);
    return { rows: [
      { systemKey: "fm200_fire_suppression", instanceKey, field: charger, captureSource: "gallery" },
      { systemKey: "fm200_fire_suppression", instanceKey, field: "historical", captureSource: null }
    ], rowCount: 2 };
  } };
  let body: unknown;
  const response = { setHeader: () => undefined, json: (value: unknown) => { body = value; } };
  const handler = createFinalReportHandler({ database: database as never, loadReport: async () => report as never });
  await handler({ params: { jobId }, currentUser: { role: "supervisor" } } as never, response as never, (error: unknown) => { throw error; });
  assert.equal(queried, true);
  const evidence = (body as { report: { sections: Array<{ evidence: unknown[] }> } }).report.sections[0]!.evidence;
  assert.deepEqual(evidence, [
    { field: charger, available: true, captureSource: "gallery" },
    { field: "historical", available: true, captureSource: null }
  ]);
  assert.doesNotMatch(JSON.stringify(body), /private-photo|older-photo|content/);
});

test("I-45: a Roller Shutter photo carries its caption (it names the shutter); every other system's evidence shape is unchanged", async () => {
  const rollerPath = "roller_shutter_schedule.roller_shutter_schedule_rows.rows.33333333-3333-4333-8333-333333333333.manual_mode";
  const report = { customer: "Test", sections: [
    { systemKey: "fire_rated_roller_shutter", label: "Roller", fields: [], evidence: [{ field: rollerPath, caption: "Roller Shutter Schedule - Manual Mode (Zone 1 — Roof)", content: Buffer.from("private-photo"), width: 2, height: 2 }] },
    { systemKey: "fm200_fire_suppression", label: "FM200", location: { instanceKey }, fields: [], evidence: [{ field: charger, caption: "Charger & Batteries - Main Supply", content: Buffer.from("other-photo"), width: 2, height: 2 }] }
  ] };
  const database = { query: async () => ({ rows: [
    { systemKey: "fire_rated_roller_shutter", instanceKey: "primary", field: rollerPath, captureSource: "camera" },
    { systemKey: "fm200_fire_suppression", instanceKey, field: charger, captureSource: "gallery" }
  ], rowCount: 2 }) };
  let body: unknown;
  const response = { setHeader: () => undefined, json: (value: unknown) => { body = value; } };
  const handler = createFinalReportHandler({ database: database as never, loadReport: async () => report as never });
  await handler({ params: { jobId }, currentUser: { role: "supervisor" } } as never, response as never, (error: unknown) => { throw error; });
  const sections = (body as { report: { sections: Array<{ evidence: unknown[] }> } }).report.sections;
  assert.deepEqual(sections[0]!.evidence, [{ field: rollerPath, caption: "Roller Shutter Schedule - Manual Mode (Zone 1 — Roof)", available: true, captureSource: "camera" }]);
  assert.deepEqual(sections[1]!.evidence, [{ field: charger, available: true, captureSource: "gallery" }]);
  assert.doesNotMatch(JSON.stringify(body), /private-photo|other-photo|content/);
});
