import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { ResultSelector } from "../src/inspectionControls/ResultSelector.js";
import { TechnicianHome } from "../src/jobs/TechnicianHome.js";
import { serviceAvailabilityMessage } from "../src/jobs/NewServiceVisit.js";
import { FinalReportApiError, downloadFinalReport, loadFinalReport, type FinalReportPreview } from "../src/jobs/finalReportApi.js";
import { FinalReportPresentation } from "../src/jobs/FinalReportPresentation.js";
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

test("technician jobs retain every card while current work and completed history are grouped", () => {
  const completed: InspectionJob = { ...baseJob, id: "job-completed", reference: "SV-HISTORY", status: "closed", completion: { ...baseJob.completion!, jobId: "job-completed", jobStatus: "closed", acceptedUnitCount: 1, completedAt: "2026-08-19T05:04:00.000Z", completedBy: { id: 1, username: "mobiletest" }, systems: [{ ...baseJob.completion!.systems[0], status: "accepted", units: [{ authorityKey: "primary", label: "Primary inspection", status: "accepted" }] }] } };
  const html = renderToStaticMarkup(<TechnicianHome {...props} jobs={[baseJob, completed]} message="" />);
  assert.match(html, /Current Service Jobs/);
  assert.match(html, /Service History/);
  assert.ok(html.indexOf(baseJob.reference) < html.indexOf(completed.reference));
  assert.match(html, /SV-20260819-1/);
  assert.match(html, /SV-HISTORY/);
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

test("client-facing presentation removes the covered internal form and manager wording", () => {
  const riser = readFileSync(new URL("../src/dryWetRiser/DryWetRiserInspectionForm.tsx", import.meta.url), "utf8");
  const acceptedRiser = readFileSync(new URL("../src/dryWetRiser/ServerDryWetRiserView.tsx", import.meta.url), "utf8");
  const hoseReel = readFileSync(new URL("../src/hoseReel/HoseReelInspectionForm.tsx", import.meta.url), "utf8");
  const manager = readFileSync(new URL("../src/manager/ManagerCustomerConfiguration.tsx", import.meta.url), "utf8");
  assert.match(riser, /Riser Type/);
  assert.match(riser, /Jockey Pump Cut-In/);
  assert.match(riser, /Canvas Hose ×2/);
  assert.match(acceptedRiser, /Canvas Hose ×2/);
  assert.doesNotMatch(riser, /Frozen Riser Mode|jockeyCutIn PSI/);
  assert.doesNotMatch(riser, /Canvas Hose at Outlet 2/);
  assert.doesNotMatch(acceptedRiser, /Canvas hose@2|Canvas Hose at Outlet 2/);
  assert.doesNotMatch(hoseReel, /temporarily allowed while source cardinality is pending confirmation/);
  assert.match(hoseReel, /Select all applicable drum types/);
  assert.doesNotMatch(manager, /Online, server-authoritative customer service assignments|Active revision/);
  assert.match(manager, /Manage customer service assignments online/);
});

test("new service visit availability states are distinct and do not infer an empty assignment", () => {
  assert.equal(serviceAvailabilityMessage({ customerSelected: false, loading: false, configurationLoaded: false, systemCount: 0 }), "Select a customer to view available services.");
  assert.equal(serviceAvailabilityMessage({ customerSelected: true, loading: true, configurationLoaded: false, systemCount: 0 }), "Loading available services…");
  assert.equal(serviceAvailabilityMessage({ customerSelected: true, loading: false, configurationLoaded: false, systemCount: 0 }), "Customer service configuration is unavailable.");
  assert.equal(serviceAvailabilityMessage({ customerSelected: true, loading: false, configurationLoaded: true, systemCount: 0 }), "No services are currently assigned to this customer.");
  assert.equal(serviceAvailabilityMessage({ customerSelected: true, loading: false, configurationLoaded: true, systemCount: 1 }), undefined);
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
  assert.match(html, /Drafts stay saved on this device until you submit, and submitted changes sync when you reconnect/);
  assert.doesNotMatch(html, /drafts stay on this device and sync when you reconnect/i);
  assert.match(html, /manage customer service assignments/);
});

test("role-selection mismatches fail safely against the authenticated server role", () => {
  const inspector = { id: 1, username: "inspector", role: "inspector" as const };
  const admin = { id: 2, username: "admin", role: "admin" as const };
  assert.equal(productRoleMatches("technician", inspector), true);
  assert.equal(productRoleMatches("manager", admin), true);
  assert.equal(productRoleMatches("manager", inspector), false);
  assert.equal(productRoleMatches("technician", admin), false);
});

test("Manager Operations presents truthful Open, Completed, and Total summary counts", () => {
  const visit = (id: string, status: "open" | "closed") => ({ id, reference: `SV-${id}`, customer: "Operations Customer", site: "Operations Site", serviceDate: "2026-08-20", status, systems: ["Hose Reel"], inspectionProgress: { accepted: status === "closed" ? 1 : 0, required: 1 }, completion: { ...baseJob.completion!, jobId: id, jobStatus: status, acceptedUnitCount: status === "closed" ? 1 : 0, completedAt: status === "closed" ? "2026-08-20T10:00:00.000Z" : null, completedBy: status === "closed" ? { id: 2, username: "tech-one" } : null } });
  const html = renderToStaticMarkup(<ManagerHome visits={[visit("open-one", "open"), visit("open-two", "open"), visit("closed", "closed")]} loading={false} message="" onRefresh={noop} onSelect={() => undefined} onBack={() => undefined} onViewReport={() => undefined} onDownloadReport={noop} />);
  assert.match(html, /<dt>Open<\/dt><dd>2<\/dd>/);
  assert.match(html, /<dt>Completed<\/dt><dd>1<\/dd>/);
  assert.match(html, /<dt>Total<\/dt><dd>3<\/dd>/);
  assert.doesNotMatch(html, /Awaiting Completion/);
  assert.match(html, /Active Service Visits/);
  assert.match(html, /Completed Service Visits/);
  assert.match(html, /Service Completed/);
  assert.match(html, /View Final Report/);
  assert.match(html, /Download PDF/);
});

const detailedFinalReport: FinalReportPreview = {
  customer: "Report Customer", site: "Report Site", serviceDate: "2026-08-21", jobReference: "SV-REPORT-1", completedAt: "2026-08-21T10:00:00.000Z", completedBy: "technician-one",
  systems: [{ systemKey: "hydrant", label: "Hydrant System", status: "Accepted", locations: ["Zone North", "Gate A"] }],
  sections: [{ systemKey: "hydrant", label: "Hydrant System", location: { locationId: "location-1", locationLabel: "Gate A", zoneId: "zone-1", zoneLabel: "Zone North", instanceKey: "primary" }, fields: [{ label: "Canvas Hose", value: "Good", depth: 2 }], evidence: [{ field: "hosePhoto", available: true }] }]
};

test("shared final report presentation retains Phase 7 sections, location headings, fields, and evidence", () => {
  const html = renderToStaticMarkup(<FinalReportPresentation report={detailedFinalReport} />);
  assert.match(html, /Service Summary/);
  assert.match(html, /Hydrant System - Zone North \/ Gate A/);
  assert.match(html, /report-field--depth-2/);
  assert.match(html, /Canvas Hose/);
  assert.match(html, /Accepted inspection record/);
  assert.match(html, /Photo evidence is included in the downloaded PDF: hose Photo/);
  assert.doesNotMatch(html, /\bPASS\b|\bFAIL\b|\bPASSED\b|\bFAILED\b/);

  const managerView = readFileSync(new URL("../src/manager/ManagerFinalReportView.tsx", import.meta.url), "utf8");
  assert.match(managerView, /FinalReportPresentation/);
  assert.match(managerView, /<FinalReportPresentation report={report}/);
});

test("final report API classifies expected Manager report errors without discarding their safe messages", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ message: "Required accepted inspection history is unavailable for Hydrant System." }), { status: 409, headers: { "content-type": "application/json" } })) as typeof fetch;
    await assert.rejects(() => loadFinalReport("job-1", "/api/manager/service-visits"), (error: unknown) => error instanceof FinalReportApiError && error.kind === "domain" && error.message.includes("Hydrant System"));

    globalThis.fetch = (async () => new Response(JSON.stringify({ message: "Manager session expired." }), { status: 403, headers: { "content-type": "application/json" } })) as typeof fetch;
    await assert.rejects(() => loadFinalReport("job-1", "/api/manager/service-visits"), (error: unknown) => error instanceof FinalReportApiError && error.kind === "authorization" && error.message === "Manager session expired.");

    globalThis.fetch = (async () => new Response("server failure", { status: 503 })) as typeof fetch;
    await assert.rejects(() => loadFinalReport("job-1", "/api/manager/service-visits"), (error: unknown) => error instanceof FinalReportApiError && error.kind === "unavailable");

    globalThis.fetch = (async () => { throw new TypeError("offline"); }) as typeof fetch;
    await assert.rejects(() => loadFinalReport("job-1", "/api/manager/service-visits"), (error: unknown) => error instanceof FinalReportApiError && error.kind === "unavailable");

    globalThis.fetch = (async () => new Response(JSON.stringify({ message: "Final report is incomplete." }), { status: 409, headers: { "content-type": "application/json" } })) as typeof fetch;
    await assert.rejects(() => downloadFinalReport("job-1", "/api/manager/service-visits"), (error: unknown) => error instanceof FinalReportApiError && error.kind === "domain" && error.message === "Final report is incomplete.");

    globalThis.fetch = (async () => new Response("", { status: 401 })) as typeof fetch;
    await assert.rejects(() => downloadFinalReport("job-1", "/api/manager/service-visits"), (error: unknown) => error instanceof FinalReportApiError && error.kind === "authorization");
  } finally { globalThis.fetch = originalFetch; }
});

test("Manager report failures preserve domain errors but reserve fail-closed callbacks for authorization and unavailable states", () => {
  const managerView = readFileSync(new URL("../src/manager/ManagerFinalReportView.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(managerView, /if \(reportError\.kind === "domain"\) \{\s*setMessage\(reportError\.message\);\s*return;/);
  assert.match(managerView, /reportError\.kind === "authorization"\) onAuthorizationFailure/);
  assert.match(managerView, /else onServerUnavailable/);
  assert.match(app, /onServerUnavailable=\{\(message\) => failClosedManagerOperations\(message, false\)\}/);
  assert.match(app, /error\.kind === "domain"\) \{\s*setManagerMessage\(message\);\s*return;/);
});
