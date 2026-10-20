import assert from "node:assert/strict";
import test from "node:test";
import { loadFinalReport } from "../src/jobs/finalReportApi.js";

/** I-54: the evidence caption is optional, but when it is sent it must be text; anything else fails closed. */

const report = (caption: unknown) => ({ report: { customer: "C", site: "S", systems: [], sections: [{ systemKey: "fire_rated_roller_shutter", label: "Roller", fields: [],
  evidence: [{ field: "roller_shutter_schedule.roller_shutter_schedule_rows.rows.x.manual_mode", ...(caption === undefined ? {} : { caption }), available: true, captureSource: "camera", capturedAt: null }] }] } });
async function load(body: unknown) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as never;
  try { return await loadFinalReport("11111111-1111-4111-8111-111111111111"); } catch (error) { return error as Error; } finally { globalThis.fetch = original; }
}

test("I-54: a text caption, and no caption, are accepted", async () => {
  const withCaption = await load(report("Roller Shutter Schedule - Manual Mode (Zone 1 — Roof)")) as { sections: Array<{ evidence: Array<{ caption?: string }> }> };
  assert.equal(withCaption.sections[0]!.evidence[0]!.caption, "Roller Shutter Schedule - Manual Mode (Zone 1 — Roof)");
  const without = await load(report(undefined)) as { sections: unknown[] };
  assert.equal(without.sections.length, 1);
});

test("I-54: a caption that is not text fails closed instead of reaching the page", async () => {
  for (const bad of [{ nested: true }, 42, ["a"], null, true]) {
    const result = await load(report(bad));
    assert.ok(result instanceof Error, `caption ${JSON.stringify(bad)} is rejected`);
    assert.match(result.message, /currently unavailable/);
  }
});
