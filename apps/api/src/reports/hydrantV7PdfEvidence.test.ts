import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { renderFinalServiceReportPdf } from "./finalServiceReport.js";

test("Hydrant V7 final-report evidence is physically embedded as JPEG image streams", async () => {
  const first = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).jpeg().toBuffer();
  const second = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } }).jpeg().toBuffer();
  const pdf = await renderFinalServiceReportPdf({
    customer: "Hydrant Customer", site: "Hydrant Site", serviceDate: "2026-09-04", jobReference: "HYD-V7-PDF", completedAt: "2026-09-04T00:00:00.000Z", completedBy: "browser-tech",
    systems: [{ systemKey: "hydrant", label: "Hydrant System", status: "Accepted", condition: "FAILED", conditionDetail: "Canvas Hose 1: Not Good", locations: ["Hydrant Bank"] }],
    sections: [{ systemKey: "hydrant", label: "Hydrant System", fields: [{ label: "Canvas Hose 1", value: "Not Good", depth: 0 }, { label: "Canvas Hose 1 Remark", value: "Canvas hose damaged", depth: 1 }, { label: "Landing Valve", value: "Complete Repair", depth: 0 }, { label: "Landing Valve Remark", value: "Valve repaired", depth: 1 }], evidence: [{ field: "hydrant_set.hydrant_rows.rows.a.canvas_hose_1", caption: "Hydrant Set - Canvas Hose 1", content: first, width: 2, height: 2 }, { field: "hydrant_set.hydrant_rows.rows.b.landing_valve", caption: "Hydrant Set - Landing Valve", content: second, width: 2, height: 2 }] }]
  });
  const source = pdf.toString("latin1");
  assert.equal((source.match(/\/Subtype\s*\/Image/g) ?? []).length, 2, "PDF has one image XObject per Hydrant V7 finding");
  assert.equal((source.match(/\/DCTDecode/g) ?? []).length, 2, "each embedded Hydrant image stream is JPEG/DCT encoded");
});
