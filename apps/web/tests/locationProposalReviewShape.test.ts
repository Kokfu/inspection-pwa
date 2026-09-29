import assert from "node:assert/strict";
import test from "node:test";
import { loadLocationProposals, ManagerApiError } from "../src/manager/managerApi.js";

const examples = [
  ["co2_fire_extinguisher", "loc-a", { alarmZone: "A", location: "Lobby" }],
  ["fm200_fire_suppression", "loc-a", { alarmZone: "A", location: "Lobby" }],
  ["wet_chemical", "loc-a", { alarmZone: "A", location: "Lobby" }],
  ["fire_rated_roller_shutter", "general", { assetReference: "RS-01", locationText: "Lobby" }],
  ["hose_reel", "general", { assetReference: "HR-01", locationText: "Lobby", drumType: "swing" }],
  ["hydrant", "loc-a", { assetReference: "HY-01", locationText: "Yard" }],
  ["dry_wet_riser", "loc-a", { assetReference: "R-01", locationText: "Level 1" }],
  ["fire_alarm_detector", "general-primary", { assetReference: "FA-01", alarmZone: "A", location: "Lobby" }],
  ["fire_alarm_detector", "general-secondary", { assetReference: "FA-02", location: "Guard House" }],
  ["smoke_ventilation", "general", { assetReference: "Fan 01" }],
  ["fire_intercom", "general", { assetReference: "Station 01" }]
] as const;

function proposal(systemKey: string, locationKey: string, row: Record<string, string>) {
  return {
    id: crypto.randomUUID(), customerId: crypto.randomUUID(), customerDisplayName: "Test Customer",
    systemKey, jobId: crypto.randomUUID(), submittedByUserId: 1, submittedBy: "Technician",
    submittedByRole: "inspector", submittedAt: "2026-09-29T00:00:00.000Z",
    payload: { kind: "update-format", locationKey, rows: [row] }, status: "pending", decision: null
  };
}

test("Supervisor inbox accepts every supported proposal row shape together", async () => {
  const oldFetch = globalThis.fetch;
  const proposals = examples.map(([systemKey, locationKey, row]) => proposal(systemKey, locationKey, row));
  globalThis.fetch = async () => new Response(JSON.stringify({ proposals }), { status: 200 });
  try { assert.deepEqual(await loadLocationProposals("pending"), proposals); }
  finally { globalThis.fetch = oldFetch; }
});

test("Supervisor inbox rejects a row submitted for the wrong Fire Alarm table", async () => {
  const oldFetch = globalThis.fetch;
  const proposals = [proposal("fire_alarm_detector", "general-primary", { assetReference: "FA-02", location: "Guard House" })];
  globalThis.fetch = async () => new Response(JSON.stringify({ proposals }), { status: 200 });
  try { await assert.rejects(loadLocationProposals("pending"), (error) => error instanceof ManagerApiError && error.kind === "unavailable"); }
  finally { globalThis.fetch = oldFetch; }
});

test("Supervisor inbox rejects an unknown system instead of treating it as CO2", async () => {
  const oldFetch = globalThis.fetch;
  try {
    for (const systemKey of ["unknown_system", "__proto__"]) {
      const proposals = [proposal(systemKey, "loc-a", { alarmZone: "A", location: "Lobby" })];
      globalThis.fetch = async () => new Response(JSON.stringify({ proposals }), { status: 200 });
      await assert.rejects(loadLocationProposals("pending"), (error) => error instanceof ManagerApiError && error.kind === "unavailable");
    }
  }
  finally { globalThis.fetch = oldFetch; }
});
