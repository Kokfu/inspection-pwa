import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { ResultSelector } from "../src/inspectionControls/ResultSelector.js";
import { TechnicianHome } from "../src/jobs/TechnicianHome.js";
import { downloadFinalReport } from "../src/jobs/finalReportApi.js";
import type { InspectionJob } from "../src/jobs/jobTypes.js";
import { ManagerHome } from "../src/manager/ManagerHome.js";
import { RoleSelection } from "../src/manager/RoleSelection.js";
import { productRoleMatches } from "../src/manager/roleAccess.js";

const system = { enabledSystemId: "system-1", systemKey: "automatic_sprinkler", displayName: "Automatic Sprinkler System", sortOrder: 1, definitionStatus: "confirmed" as const, zones: [], locations: [] };
const baseJob: InspectionJob = {
  id: "job-1", reference: "SV-20260819-1", title: "Primary Service Site", status: "open",
  createdAt: "2026-08-19T00:00:00.000Z", serviceDate: "2026-08-19", site: { id: "site-1", displayName: "Primary Service Site" },
  configurationSnapshot: { schemaVersion: 1, customer: { id: "customer-1", code: "C1", displayName: "Demo Customer" }, configuration: { revisionId: "revision-1", revisionNumber: 1 }, template: { id: "template-1", code: "MFE-FSSR", name: "Master", version: 1 }, enabledSystems: [system] },
  completion: { jobId: "job-1", jobStatus: "open", eligible: false, checkedAt: "2026-08-19T01:00:00.000Z", requiredUnitCount: 1, acceptedUnitCount: 0, completedAt: null, completedBy: null, systems: [{ systemKey: system.systemKey, systemLabel: system.displayName, status: "incomplete", units: [{ authorityKey: "primary", label: "Primary inspection", status: "incomplete", reason: "ACCEPTED_INSPECTION_MISSING" }] }] }
};

const noop = async () => undefined;
const props = {
  authState: { status: "verified" as const, user: { id: 1, username: "mobiletest", role: "inspector" as const }, lastVerifiedAt: "2026-08-19T00:00:00.000Z" },
  inspections: [], masterSystemInspections: [], masterSystemInspectionGroups: [], masterSystemFormInstances: [], inspectionAttachments: [], serverMasterSystemInspections: [], serverMasterSystemProgressState: "loaded" as const,
  loading: false, onRefresh: noop, onSync: noop, onCloseJob: noop, onViewFinalReport: () => undefined, onNewServiceVisit: () => undefined, onSelectJob: () => undefined, onSelectSystem: () => undefined, onBackToJobs: () => undefined, onBackToSystems: () => undefined, onOpenHoseReel: () => undefined, onOpenCo2: () => undefined, onOpenAutomaticSprinkler: () => undefined, onOpenDryWetRiser: () => undefined, onOpenFireAlarm: () => undefined, onOpenHydrant: () => undefined, onOpenPortableFireExtinguisher: () => undefined
};

test("normal job count appears once and routine refresh text is not rendered as a banner", () => {
  const jobs = Array.from({ length: 6 }, (_, index) => ({ ...baseJob, id: `job-${index + 1}`, reference: `SV-${index + 1}` }));
  const html = renderToStaticMarkup(<TechnicianHome {...props} jobs={jobs} message="6 jobs available on this device" />);
  assert.equal(html.match(/6 jobs available on this device/g)?.length, 1);
  assert.doesNotMatch(html, /operational-message[^>]*>6 jobs available on this device/);
});

test("incomplete completion requirements have separate semantic elements and no completion action", () => {
  const html = renderToStaticMarkup(<TechnicianHome {...props} jobs={[baseJob]} message="" selectedJobId={baseJob.id} />);
  assert.match(html, /class="completion-requirement"/);
  assert.match(html, /<strong>Automatic Sprinkler System<\/strong><span>Primary inspection<\/span><small>Inspection is not complete<\/small>/);
  assert.doesNotMatch(html, />Complete Service<\/button>/);
});

test("completed metadata uses label/value markup and a time element", () => {
  const closed: InspectionJob = { ...baseJob, status: "closed", completion: { ...baseJob.completion!, jobStatus: "closed", eligible: false, acceptedUnitCount: 1, completedAt: "2026-08-19T05:04:00.000Z", completedBy: { id: 1, username: "mobiletest" }, systems: [{ ...baseJob.completion!.systems[0], status: "accepted", units: [{ authorityKey: "primary", label: "Primary inspection", status: "accepted" }] }] } };
  const html = renderToStaticMarkup(<TechnicianHome {...props} jobs={[closed]} message="" selectedJobId={closed.id} />);
  assert.match(html, /class="completion-metadata"/);
  assert.match(html, /<dt>Completed on<\/dt><dd><time dateTime="2026-08-19T05:04:00.000Z">/);
  assert.match(html, /<dt>Completed by<\/dt><dd>mobiletest<\/dd>/);
  assert.match(html, />View Final Report<\/button>/);
});

test("read-only selected results retain explicit selected markup and icon", () => {
  const html = renderToStaticMarkup(<fieldset disabled><ResultSelector definition={{ type: "single_select", required: true, options: [{ value: "good", label: "Good" }, { value: "poor", label: "Poor" }] }} value="good" readOnly onChange={() => undefined} label="Result" /></fieldset>);
  assert.match(html, /result-option result-option--selected/);
  assert.match(html, /aria-pressed="true" disabled=""><span aria-hidden="true">✓<\/span>Good/);
});

test("final report fields use a readable report stack rather than a collapsible desktop value column", () => {
  const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
  assert.match(css, /\.report-field \{ display: block; min-width: 0;/);
  assert.doesNotMatch(css, /\.report-field \{ display: grid; grid-template-columns:/);
});

test("final report PDF uses authenticated Blob download without navigating away", async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const clicked: string[] = [], revoked: string[] = [];
  try {
    globalThis.fetch = (async (_input, init) => {
      assert.deepEqual(init, { credentials: "same-origin", cache: "no-store" });
      return new Response(new Blob(["%PDF-test"]), { status: 200, headers: { "content-disposition": "attachment; filename=\"Service-Report_Test.pdf\"" } });
    }) as typeof fetch;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:final-report" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: (url: string) => revoked.push(url) });
    globalThis.document = { body: { append: () => undefined }, createElement: () => ({ href: "", download: "", style: {}, click() { clicked.push(this.download); }, remove() { return undefined; } }) } as unknown as Document;
    await downloadFinalReport("job/one");
    assert.deepEqual(clicked, ["Service-Report_Test.pdf"]);
    assert.deepEqual(revoked, ["blob:final-report"]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreate });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevoke });
  }
});

test("failed final report download surfaces the API message without creating a browser download", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ message: "Final report is not ready." }), { status: 409, headers: { "content-type": "application/json" } })) as typeof fetch;
    await assert.rejects(() => downloadFinalReport("job-1"), /Final report is not ready\./);
  } finally { globalThis.fetch = originalFetch; }
});

test("role selection exposes Technician and Manager without using persisted backend role labels", () => {
  const html = renderToStaticMarkup(<RoleSelection onSelect={() => undefined} />);
  assert.match(html, /Choose how you are signing in/);
  assert.match(html, />Technician</);
  assert.match(html, />Manager</);
  assert.doesNotMatch(html, /inspector|admin/);
});

test("role-selection mismatches fail safely against the authenticated server role", () => {
  const inspector = { id: 1, username: "inspector", role: "inspector" as const };
  const admin = { id: 2, username: "admin", role: "admin" as const };
  assert.equal(productRoleMatches("technician", inspector), true);
  assert.equal(productRoleMatches("manager", admin), true);
  assert.equal(productRoleMatches("manager", inspector), false);
  assert.equal(productRoleMatches("technician", admin), false);
});

test("Manager Operations presents server-backed open and completed service visits with report actions", () => {
  const visit = (id: string, status: "open" | "closed") => ({ id, reference: `SV-${id}`, customer: "Operations Customer", site: "Operations Site", serviceDate: "2026-08-20", status, systems: ["Hose Reel"], inspectionProgress: { accepted: status === "closed" ? 1 : 0, required: 1 }, completion: { ...baseJob.completion!, jobId: id, jobStatus: status, acceptedUnitCount: status === "closed" ? 1 : 0, completedAt: status === "closed" ? "2026-08-20T10:00:00.000Z" : null, completedBy: status === "closed" ? { id: 2, username: "tech-one" } : null } });
  const html = renderToStaticMarkup(<ManagerHome visits={[visit("open", "open"), visit("closed", "closed")]} loading={false} message="" onRefresh={noop} onSelect={() => undefined} onBack={() => undefined} onViewReport={() => undefined} onDownloadReport={noop} />);
  assert.match(html, /Active Service Visits/);
  assert.match(html, /Completed Service Visits/);
  assert.match(html, /Service Completed/);
  assert.match(html, /View Final Report/);
  assert.match(html, /Download PDF/);
});
