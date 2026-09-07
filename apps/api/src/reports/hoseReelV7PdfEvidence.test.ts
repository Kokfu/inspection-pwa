import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { renderFinalServiceReportPdf } from "./finalServiceReport.js";

test("Hose Reel V7 final-report evidence is physically embedded as JPEG image streams", async () => {
  const checklist = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).jpeg().toBuffer();
  const testRun = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).jpeg().toBuffer();
  const row = await sharp({ create: { width: 2, height: 2, channels: 3, background: "green" } }).jpeg().toBuffer();
  const pdf = await renderFinalServiceReportPdf({ customer: "Hose Reel Customer", site: "Hose Reel Site", serviceDate: "2026-09-04", jobReference: "HR-V7-PDF", completedAt: "2026-09-04T00:00:00.000Z", completedBy: "browser-tech", systems: [{ systemKey: "hose_reel", label: "Hose Reel System", status: "Accepted", locations: ["Primary inspection"] }], sections: [{ systemKey: "hose_reel", label: "Hose Reel System", fields: [{ label: "Drums Inspected", value: "2", depth: 0 }, { label: "Drum 1 Type", value: "Swing", depth: 0 }, { label: "Drum 2 Type", value: "Fixed", depth: 0 }, { label: "Water Level", value: "Not Good", depth: 0 }, { label: "Water Level Remark", value: "Water low", depth: 1 }, { label: "Duty Pump", value: "Complete Repair", depth: 0 }, { label: "Duty Pump Remark", value: "Pump repaired", depth: 1 }, { label: "Hose", value: "Not Good", depth: 0 }, { label: "Hose Remark", value: "Hose damaged", depth: 1 }], evidence: [{ field: "hose_reel_checks.water_level", caption: "Water Tank - Water Level", content: checklist, width: 2, height: 2 }, { field: "hose_reel_checks.trfp_duty_pump", caption: "Test Run Fire Pump - Duty Pump", content: testRun, width: 2, height: 2 }, { field: "hose_reel_drum.hose_reel_rows.rows.a.hose", caption: "Hose Reel Drum - Hose", content: row, width: 2, height: 2 }] }] });
  const source = pdf.toString("latin1");
  assert.equal((source.match(/\/Subtype\s*\/Image/g) ?? []).length, 3, "PDF has one image XObject per Hose Reel V7 finding");
  assert.equal((source.match(/\/DCTDecode/g) ?? []).length, 3, "each embedded Hose Reel image stream is JPEG/DCT encoded");
});
