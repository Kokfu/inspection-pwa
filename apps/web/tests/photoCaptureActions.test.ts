import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PhotoCaptureActions } from "../src/attachments/PhotoCaptureActions";
import { V7EvidenceField } from "../src/co2/V7EvidenceField";
import { FireAlarmV6EvidenceField } from "../src/fireAlarm/FireAlarmV6EvidenceField";
import { FireAlarmV7EvidenceField } from "../src/fireAlarm/FireAlarmV7EvidenceField";
import { AutomaticSprinklerV7EvidenceField } from "../src/automaticSprinkler/AutomaticSprinklerV7EvidenceField";
import { DryWetRiserV7EvidenceField } from "../src/dryWetRiser/DryWetRiserV7EvidenceField";
import { FireIntercomV7EvidenceField } from "../src/fireIntercom/FireIntercomV7EvidenceField";
import { FireRatedRollerShutterV7EvidenceField } from "../src/fireRatedRollerShutter/FireRatedRollerShutterV7EvidenceField";
import { Fm200EvidenceField } from "../src/fm200/Fm200EvidenceField";
import { HoseReelV7EvidenceField } from "../src/hoseReel/HoseReelV7EvidenceField";
import { HydrantV7EvidenceField } from "../src/hydrant/HydrantV7EvidenceField";
import { SmokeVentilationV7EvidenceField } from "../src/smokeVentilation/SmokeVentilationV7EvidenceField";
import { RepairItemCard } from "../src/repairVisits/RepairItemCard";

const noop = async () => {};
test("shared component initially offers only Take Photo; replacement uses camera", () => {
  for (const hasPhoto of [false, true]) {
    const html = renderToStaticMarkup(createElement(PhotoCaptureActions, { hasPhoto, onCapture: noop, onGallery: noop }));
    assert.match(html, hasPhoto ? /Replace with Camera/ : /Take Photo/);
    assert.equal((html.match(/<button/g) ?? []).length, 1);
    assert.match(html, /hidden="" type="file" accept="image\/\*"/);
    assert.doesNotMatch(html, /Camera not working|Choose Existing|Replace from Gallery/);
  }
});

const fields = [V7EvidenceField, FireAlarmV6EvidenceField, FireAlarmV7EvidenceField, AutomaticSprinklerV7EvidenceField,
  DryWetRiserV7EvidenceField, FireIntercomV7EvidenceField, FireRatedRollerShutterV7EvidenceField,
  Fm200EvidenceField, HoseReelV7EvidenceField, HydrantV7EvidenceField, SmokeVentilationV7EvidenceField];
for (const Field of fields) {
  test(`${Field.name}: gallery badge in Draft and read-only; camera and unknown have no badge`, () => {
    for (const syncStatus of ["Draft", "Pending", "Synced"]) for (const captureSource of ["camera", "gallery", "unknown"]) {
      const html = renderToStaticMarkup(createElement(Field as any, {
        record: { syncStatus }, fieldPath: "test", attachment: { captureSource, sizeBytes: 1024 }, onChanged: noop
      }));
      assert.equal(html.includes("Uploaded from gallery"), captureSource === "gallery");
    }
  });
}

test("repair After gallery badge in editable and read-only views; camera has no badge", () => {
  for (const editable of [true, false]) for (const captureSource of ["camera", "gallery", "unknown"]) {
    const html = renderToStaticMarkup(createElement(RepairItemCard, {
      visit: { previousVisit: null } as any,
      item: { clientUuid: "item", remark: "Repaired", outcome: "done_repair", fieldLabel: "Valve" } as any,
      photo: { captureSource, capturedAt: "2026-10-20T00:00:00Z" } as any,
      editable, canRemove: false, attempted: false, position: 1, total: 1, connected: false,
      registry: { register() {}, unregister() {} }
    }));
    assert.equal(html.includes("Uploaded from gallery"), captureSource === "gallery");
  }
});
