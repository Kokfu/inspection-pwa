import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { renderFinalServiceReportPdf } from "./finalServiceReport.js";

test("Automatic Sprinkler V7 final-report evidence is physically embedded as JPEG image streams", async () => {
  // One finding per shape the V7 Automatic Sprinkler contract can carry:
  // a flat checklist field, a Test Run Fire Pump 30 Minutes row, and a PSI
  // measurement row's result.  V7 Automatic Sprinkler drops the legacy PSI
  // photo lifecycle, so every embedded image is a V7 finding photo.
  const checklistPhoto = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).jpeg().toBuffer();
  const testRunPhoto = await sharp({ create: { width: 2, height: 2, channels: 3, background: "green" } }).jpeg().toBuffer();
  const measurementPhoto = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).jpeg().toBuffer();
  const pdf = await renderFinalServiceReportPdf({
    customer: "Sprinkler Customer", site: "Sprinkler Site", serviceDate: "2026-09-04",
    jobReference: "ASP-V7-PDF", completedAt: "2026-09-04T00:00:00.000Z", completedBy: "browser-tech",
    systems: [{ systemKey: "automatic_sprinkler", label: "Automatic Sprinkler System", status: "Accepted", locations: ["Primary inspection"] }],
    sections: [{
      systemKey: "automatic_sprinkler", label: "Automatic Sprinkler System",
      fields: [
        { label: "Water Tank - S.A.J Main Water Supply", value: "Not Good", depth: 0 },
        { label: "Water Tank - S.A.J Main Water Supply Remark", value: "Supply valve seized", depth: 1 },
        { label: "Test Run Fire Pump 30 Minutes - Jockey Pump", value: "Complete Repair", depth: 0 },
        { label: "Test Run Fire Pump 30 Minutes - Jockey Pump Remark", value: "Jockey pump serviced", depth: 1 },
        { label: "Pump House - Jockey Pump", value: "Not Good", depth: 0 },
        { label: "Pump House - Jockey Pump Remark", value: "Cut-in pressure out of range", depth: 1 }
      ],
      evidence: [
        { field: "automatic_sprinkler_checks.saj_main_water_supply", caption: "Water Tank - S.A.J Main Water Supply", content: checklistPhoto, width: 2, height: 2 },
        { field: "automatic_sprinkler_checks.trfp_jockey_pump", caption: "Test Run Fire Pump 30 Minutes - Jockey Pump", content: testRunPhoto, width: 2, height: 2 },
        { field: "automatic_sprinkler_measurements.jockey_pump_pressure", caption: "Pump House - Jockey Pump", content: measurementPhoto, width: 2, height: 2 }
      ]
    }]
  });
  const source = pdf.toString("latin1");
  assert.equal((source.match(/\/Subtype\s*\/Image/g) ?? []).length, 3, "PDF has one image XObject per Automatic Sprinkler V7 finding");
  assert.equal((source.match(/\/DCTDecode/g) ?? []).length, 3, "each embedded Automatic Sprinkler image stream is JPEG/DCT encoded");
});
