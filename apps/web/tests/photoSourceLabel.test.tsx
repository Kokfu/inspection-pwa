import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GalleryPhotoLabel, assertAcceptedPhotoSource } from "../src/attachments/photoSourceLabel.js";
import { loadFinalReport } from "../src/jobs/finalReportApi.js";
import { loadAutomaticSprinklerV7AcceptedEvidence } from "../src/automaticSprinkler/automaticSprinklerV7AcceptedEvidence.js";
import { loadV7AcceptedEvidence as loadCo2 } from "../src/co2/v7AcceptedEvidence.js";
import { loadDryWetRiserV7AcceptedEvidence } from "../src/dryWetRiser/dryWetRiserV7AcceptedEvidence.js";
import { loadFireIntercomV7AcceptedEvidence } from "../src/fireIntercom/fireIntercomV7AcceptedEvidence.js";
import { loadFireRatedRollerShutterV7AcceptedEvidence } from "../src/fireRatedRollerShutter/fireRatedRollerShutterV7AcceptedEvidence.js";
import { loadV7AcceptedEvidence as loadFm200 } from "../src/fm200/fm200AcceptedEvidence.js";
import { loadHoseReelV7AcceptedEvidence } from "../src/hoseReel/hoseReelV7AcceptedEvidence.js";
import { loadHydrantV7AcceptedEvidence } from "../src/hydrant/hydrantV7AcceptedEvidence.js";
import { loadSmokeVentilationV7AcceptedEvidence } from "../src/smokeVentilation/smokeVentilationV7AcceptedEvidence.js";
import { loadAcceptedFireAlarmV6Evidence } from "../src/fireAlarm/serverFireAlarmApi.js";

/** P2: internal photo-source label (Admin/Manager screens only) and its fail-closed parsers. */

const T = "2026-10-20T01:02:03.000Z";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const INSPECTION = uuid(1);
const html = (source: "camera" | "gallery" | "unknown" | null | undefined, at?: string | null) => renderToStaticMarkup(<GalleryPhotoLabel captureSource={source} capturedAt={at} />);

test("gallery photos show GALLERY with the Malaysia upload time; every other source shows nothing", () => {
  assert.match(html("gallery", T), /<strong>GALLERY<\/strong> · uploaded 20 Oct 2026, 9:02/);
  assert.equal(html("camera", T), "");
  assert.equal(html("unknown", T), "");
  assert.equal(html(null, T), "", "a pre-047 NULL source is never labelled and never shown as camera");
  assert.equal(html(undefined, T), "");
  assert.doesNotMatch(html("gallery", null), /uploaded/, "a gallery photo with no stored time (pre-058) shows only GALLERY");
  assert.match(html("gallery", null), /GALLERY/);
});

test("the shared parser accepts null/camera/gallery/unknown and fails closed on anything else", () => {
  for (const captureSource of [null, "camera", "gallery", "unknown"]) for (const capturedAt of [null, T]) assert.doesNotThrow(() => assertAcceptedPhotoSource({ captureSource, capturedAt }));
  for (const bad of [
    { captureSource: "Gallery", capturedAt: T }, { captureSource: "", capturedAt: null }, { captureSource: 1, capturedAt: null },
    { capturedAt: null }, { captureSource: "gallery" },
    { captureSource: "gallery", capturedAt: "today" }, { captureSource: "gallery", capturedAt: "2026-10-20T01:02:03Z" },
    { captureSource: "gallery", capturedAt: "2026-13-40T01:02:03.000Z" }, { captureSource: "gallery", capturedAt: 0 }
  ]) assert.throws(() => assertAcceptedPhotoSource(bad as Record<string, unknown>), /invalid/, JSON.stringify(bad));
});

const item = (systemKey: string, extra: Record<string, unknown>) => ({
  photoUuid: uuid(2), systemKey, fieldPath: "x.y", sourceSha256: "a".repeat(64), storedSha256: "b".repeat(64), mimeType: "image/jpeg",
  sizeBytes: 1, width: 1, height: 1, formInstanceId: uuid(3), ...extra
});
const loaders: Array<[string, () => Promise<Array<{ captureSource: unknown; capturedAt: unknown }>>]> = [
  ["automatic_sprinkler", () => loadAutomaticSprinklerV7AcceptedEvidence(INSPECTION)],
  ["co2_fire_extinguisher", () => loadCo2(INSPECTION, "co2_fire_extinguisher")],
  ["wet_chemical", () => loadCo2(INSPECTION, "wet_chemical")],
  ["dry_wet_riser", () => loadDryWetRiserV7AcceptedEvidence(INSPECTION)],
  ["fire_intercom", () => loadFireIntercomV7AcceptedEvidence(INSPECTION)],
  ["fire_rated_roller_shutter", () => loadFireRatedRollerShutterV7AcceptedEvidence(INSPECTION)],
  ["fm200_fire_suppression", () => loadFm200(INSPECTION, "fm200_fire_suppression")],
  ["hose_reel", () => loadHoseReelV7AcceptedEvidence(INSPECTION)],
  ["hydrant", () => loadHydrantV7AcceptedEvidence(INSPECTION)],
  ["smoke_ventilation", () => loadSmokeVentilationV7AcceptedEvidence(INSPECTION)],
  ["fire_alarm_detector", () => loadAcceptedFireAlarmV6Evidence(INSPECTION, 7)]
];

for (const [systemKey, load] of loaders) {
  test(`${systemKey}: accepted-evidence loader keeps a valid source/time and rejects a missing or malformed one`, async () => {
    const original = globalThis.fetch;
    const serve = (evidence: unknown[]) => { globalThis.fetch = (async () => new Response(JSON.stringify({ evidence }), { status: 200, headers: { "content-type": "application/json" } })) as never; };
    try {
      serve([item(systemKey, { captureSource: "gallery", capturedAt: T })]);
      const [gallery] = await load();
      assert.equal(gallery!.captureSource, "gallery"); assert.equal(gallery!.capturedAt, T);
      serve([item(systemKey, { captureSource: null, capturedAt: null })]);
      const [legacy] = await load();
      assert.equal(legacy!.captureSource, null, "pre-047 rows stay null, never camera");
      for (const bad of [{}, { captureSource: "camera" }, { captureSource: "phone", capturedAt: null }, { captureSource: "gallery", capturedAt: "yesterday" }, { captureSource: "gallery", capturedAt: "2026-10-20T01:02:03Z" }]) {
        serve([item(systemKey, bad)]);
        await assert.rejects(load(), undefined, JSON.stringify(bad));
      }
    } finally { globalThis.fetch = original; }
  });
}

test("Final Report preview: capturedAt is required (null or canonical UTC) and malformed values fail closed", async () => {
  const original = globalThis.fetch;
  const body = (evidence: unknown) => ({ report: { customer: "C", site: "S", systems: [], sections: [{ systemKey: "hydrant", label: "H", fields: [], evidence: [evidence] }] } });
  const run = async (evidence: unknown) => {
    globalThis.fetch = (async () => new Response(JSON.stringify(body(evidence)), { status: 200, headers: { "content-type": "application/json" } })) as never;
    try { return await loadFinalReport("11111111-1111-4111-8111-111111111111"); } catch (error) { return error as Error; }
  };
  try {
    for (const ok of [{ captureSource: "gallery", capturedAt: T }, { captureSource: "camera", capturedAt: null }, { captureSource: null, capturedAt: null }]) {
      assert.ok(!((await run({ field: "f", available: true, ...ok })) instanceof Error), JSON.stringify(ok));
    }
    for (const bad of [{ captureSource: "gallery" }, { captureSource: "gallery", capturedAt: "today" }, { captureSource: "gallery", capturedAt: 5 }, { captureSource: "gallery", capturedAt: "2026-10-20T01:02:03Z" }]) {
      assert.ok((await run({ field: "f", available: true, ...bad })) instanceof Error, JSON.stringify(bad));
    }
  } finally { globalThis.fetch = original; }
});

test("Final Report web page: gallery wording is the visible label; camera, unknown and unavailable are unchanged", async () => {
  const { FinalReportPresentation } = await import("../src/jobs/FinalReportPresentation.js");
  const render = (evidence: Array<{ field: string; available: true; captureSource: "camera" | "gallery" | "unknown" | null; capturedAt: string | null }>) => renderToStaticMarkup(
    <FinalReportPresentation report={{ customer: "C", site: "S", serviceDate: "2026-10-20", jobReference: "J", completedAt: T, completedBy: "t", systems: [],
      sections: [{ systemKey: "hydrant", label: "Hydrant", fields: [], evidence }] }} />);
  const gallery = render([{ field: "f", available: true, captureSource: "gallery", capturedAt: T }]);
  assert.match(gallery, /GALLERY<\/strong> · uploaded 20 Oct 2026, 9:02/);
  assert.doesNotMatch(gallery, /Uploaded from Gallery/);
  const others = render([
    { field: "a", available: true, captureSource: "camera", capturedAt: T },
    { field: "b", available: true, captureSource: "unknown", capturedAt: null },
    { field: "c", available: true, captureSource: null, capturedAt: null }
  ]);
  assert.doesNotMatch(others, /GALLERY|gallery/);
  assert.match(others, /Captured by Camera/);
  assert.equal((others.match(/Source unavailable/g) ?? []).length, 2);
});
