import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import type { Page, Route } from "@playwright/test";

/** A fake API for the repair visit browser specs. Fingerprints are computed here, in Node, exactly as apps/api does. */
export const actorId = 9301;
export const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const ids = {
  customer: u(9301), site: u(9302), revision: u(9303), template: u(9304), enabled: u(9305), zone: u(9306), location: u(9307), catalog: u(9308),
  previousSv: u(9310), previousRv: u(9311), beforePhoto: u(9320), beforePhotoRv: u(9321)
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  return value;
}
export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

// ---- A tiny valid PNG so the browser can decode, stamp and compress a real image. ----
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes: Buffer) => { let c = 0xffffffff; for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
export function pngBytes(red: number, green: number, blue: number, width = 96, height = 72) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, (_, x) => [red, (green + x) % 256, blue]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))), chunk("IEND", Buffer.alloc(0))]);
}
const beforeBytes = pngBytes(200, 30, 30);
const beforeSha = createHash("sha256").update(beforeBytes).digest("hex");
const photoMeta = (photoUuid: string) => ({ photoUuid, sourceSha256: "1".repeat(64), storedSha256: beforeSha, sizeBytes: beforeBytes.length, width: 96, height: 72 });

type Before = { previousVisit: { kind: "service" | "repair"; visitId: string }; visitNumber: string; visitDate: string; result: string; remark: string; photo: ReturnType<typeof photoMeta> | null } | null;
export type Field = { identity: Record<string, unknown>; systemLabel: string; unitLabel: string; sectionLabel: string; fieldLabel: string; before: Before };
const identity = (systemKey: string, n: number, field: string) => ({ systemKey, rowUuid: u(9400 + n), locationId: null, zoneId: null, sectionKey: "sec", fieldKey: field });
const svBefore = (result: string, remark: string, photo: ReturnType<typeof photoMeta> | null): Before => ({
  previousVisit: { kind: "service", visitId: ids.previousSv }, visitNumber: "SV-20261011-94", visitDate: "2026-10-11", result, remark, photo
});
const rvBefore = (result: string, remark: string, photo: ReturnType<typeof photoMeta> | null): Before => ({
  previousVisit: { kind: "repair", visitId: ids.previousRv }, visitNumber: "RV-20261012-2", visitDate: "2026-10-12", result, remark, photo
});
export const fields = {
  service: [
    { identity: identity("automatic_sprinkler", 1, "main_water_supply"), systemLabel: "Automatic Sprinkler", unitLabel: "Pump Room", sectionLabel: "Water Tank", fieldLabel: "S.A.J Main Water Supply", before: svBefore("not_good", "Valve leaking", photoMeta(ids.beforePhoto)) },
    { identity: identity("automatic_sprinkler", 2, "pressure_gauge"), systemLabel: "Automatic Sprinkler", unitLabel: "Pump Room", sectionLabel: "Water Tank", fieldLabel: "Pressure Gauge", before: svBefore("not_good", "Gauge cracked", null) },
    { identity: identity("fire_alarm_detector", 3, "smoke_detector"), systemLabel: "Fire Alarm", unitLabel: "Zone 3, Level 2", sectionLabel: "Detectors", fieldLabel: "Smoke Detector", before: svBefore("good", "", null) }
  ] as Field[],
  repair: [
    { identity: identity("automatic_sprinkler", 1, "main_water_supply"), systemLabel: "Automatic Sprinkler", unitLabel: "Pump Room", sectionLabel: "Water Tank", fieldLabel: "S.A.J Main Water Supply", before: rvBefore("not_done", "No access to the tank", photoMeta(ids.beforePhotoRv)) },
    { identity: identity("automatic_sprinkler", 2, "pressure_gauge"), systemLabel: "Automatic Sprinkler", unitLabel: "Pump Room", sectionLabel: "Water Tank", fieldLabel: "Pressure Gauge", before: rvBefore("done_repair", "Replaced", null) }
  ] as Field[],
  none: [
    { identity: identity("automatic_sprinkler", 1, "main_water_supply"), systemLabel: "Automatic Sprinkler", unitLabel: "Pump Room", sectionLabel: "Water Tank", fieldLabel: "S.A.J Main Water Supply", before: null },
    { identity: identity("hose_reel", 4, "hose_condition"), systemLabel: "Hose Reel", unitLabel: "Level 1", sectionLabel: "Hose", fieldLabel: "Hose Condition", before: null }
  ] as Field[]
};
const allFields = [...fields.service, ...fields.repair, ...fields.none];
const keyOf = (value: unknown) => JSON.stringify(canonical(value));

export const customer = { id: ids.customer, code: "C-9301", displayName: "Phone Test Customer", isDemo: false };
const configuration = {
  customer,
  configuration: {
    configurationId: ids.revision, revision: 3, templateId: ids.template, templateCode: "MFE-FSSR", templateName: "Service Report", templateVersion: 7, selectionPolicy: "preset_only",
    enabledSystems: [{ id: ids.enabled, key: "hose_reel", displayName: "Hose Reel", sortOrder: 1, definitionStatus: "confirmed",
      zones: [{ id: ids.zone, enabledSystemId: ids.enabled, key: "z1", displayName: "Zone 1", sortOrder: 1 }],
      locations: [{ id: ids.location, enabledSystemId: ids.enabled, zoneId: ids.zone, key: "l1", displayName: "Level 1", presetRowCount: 2, rowPreset: {}, sortOrder: 1 }] }]
  }
};
const catalogTemplate = { id: ids.catalog, code: "MFE-FSSR", name: "Service Report", version: 1, selectionPolicy: "preset_only", headerDefinition: {}, reportBoilerplate: {}, systems: [] };
const previousVisits = [
  { kind: "service", visitId: ids.previousSv, visitNumber: "SV-20261011-94", visitDate: "2026-10-11", createdAt: "2026-10-11T03:00:00.000Z", createdByUserId: actorId },
  { kind: "repair", visitId: ids.previousRv, visitNumber: "RV-20261012-2", visitDate: "2026-10-12", createdAt: "2026-10-12T03:00:00.000Z", createdByUserId: actorId }
];

export type ServerVisit = {
  body: Record<string, any>; fingerprint: string; number: string; status: "draft" | "awaiting_approval" | "returned" | "approved"; revision: number;
  instant: string; items: Array<{ clientUuid: string; identity: Record<string, unknown> }>; outcomes: Map<string, any>; events: Array<{ operation: string; type: string; revision: number; reason: string | null }>;
  report?: string;
};
export type RvServer = {
  reachable: boolean; createMode: "ok" | "refuse"; sequence: number; visits: Map<string, ServerVisit>; photos: Map<string, { visit: string; metadata: any }>;
  calls: Array<Record<string, any>>; serverJobs: unknown[];
};
export const newServer = (): RvServer => ({ reachable: true, createMode: "ok", sequence: 0, visits: new Map(), photos: new Map(), calls: [], serverJobs: [] });

function multipartField(buffer: Buffer, contentType: string, name: string) {
  const boundary = /boundary=(.+)$/.exec(contentType)?.[1];
  if (!boundary) return undefined;
  for (const part of buffer.toString("latin1").split(`--${boundary}`)) {
    if (part.includes(`name="${name}"`)) return part.slice(part.indexOf("\r\n\r\n") + 4).replace(/\r\n$/, "");
  }
  return undefined;
}
const wire = (id: string, v: ServerVisit) => ({
  clientUuid: id, visitNumber: v.number, customerId: v.body.customerId, siteId: v.body.siteId, createdByUserId: actorId, configurationRevisionId: v.body.configurationRevisionId,
  serviceCallNumber: v.body.serviceCallNumber, arrivalTime: v.body.arrivalTime, visitDate: v.body.visitDate, deviceCreatedAt: v.instant, previousVisit: v.body.previousVisit,
  status: v.status, revision: v.revision, reportNumber: v.report ?? null, approvedByUserId: v.report ? 77 : null, approvedAt: v.report ? new Date().toISOString() : null,
  createdAt: v.instant, updatedAt: new Date().toISOString()
});

export async function installServer(page: Page, server: RvServer) {
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (!server.reachable) return route.abort("connectionrefused");
    if (path.startsWith("/api/repair-visits")) return handleRepair(route, server, path.replace("/api/repair-visits", ""), method);
    let json: unknown = {};
    if (path === "/api/auth/me") json = { user: { id: actorId, username: "tech", role: "inspector" } };
    else if (path === "/api/health") json = { status: "ok" };
    else if (path === "/api/inspection-catalog") json = { template: catalogTemplate, templates: [catalogTemplate] };
    else if (path === "/api/customers") json = { customers: [customer] };
    else if (path === `/api/customers/${ids.customer}/sites`) json = { sites: [{ id: ids.site, customerId: ids.customer, code: "S-1", displayName: "Main Site" }] };
    else if (path === `/api/customers/${ids.customer}/configuration`) json = configuration;
    else if (path === "/api/customers/service-format-options") json = { systems: [] };
    else if (path === "/api/customers/upcoming-service") json = { customers: [], unscheduledCustomers: [] };
    else if (path === "/api/inspection-jobs" && method === "GET") json = { jobs: server.serverJobs };
    await route.fulfill({ json });
  });
}

async function handleRepair(route: Route, server: RvServer, rest: string, method: string) {
  const request = route.request();
  const header = request.headers()["x-expected-user-id"];
  if (header !== String(actorId)) return route.fulfill({ status: 409, json: { error: "IDENTITY_MISMATCH" } });
  const site = `/customers/${ids.customer}/sites/${ids.site}`;
  if (rest === `${site}/previous-visits`) return route.fulfill({ json: { visits: previousVisits } });
  if (rest === `${site}/catalog`) return route.fulfill({ json: { configurationRevisionId: ids.revision, fields: fields.none } });
  if (rest === `${site}/previous-visits/service/${ids.previousSv}/catalog`) return route.fulfill({ json: { fields: fields.service } });
  if (rest === `${site}/previous-visits/repair/${ids.previousRv}/catalog`) return route.fulfill({ json: { fields: fields.repair } });
  for (const [kind, visit, photo] of [["service", ids.previousSv, ids.beforePhoto], ["repair", ids.previousRv, ids.beforePhotoRv]] as const) {
    if (rest === `${site}/previous-visits/${kind}/${visit}/photos/${photo}/content`) return route.fulfill({ status: 200, contentType: "image/png", body: beforeBytes });
  }
  if (method === "POST" && rest === "") {
    const body = request.postDataJSON() as Record<string, any>;
    server.calls.push({ kind: "create", uuid: body.clientUuid, deviceCreatedAt: body.deviceCreatedAt, previousVisit: body.previousVisit, items: body.items.length, serviceCallNumber: body.serviceCallNumber });
    if (server.createMode === "refuse") return route.fulfill({ status: 409, json: { error: "CONFIGURATION_CHANGED", message: "Customer configuration has changed." } });
    const fp = fingerprint({ actorId, ...body });
    let visit = server.visits.get(body.clientUuid);
    if (visit && visit.fingerprint !== fp) return route.fulfill({ status: 409, json: { error: "IDEMPOTENCY_CONFLICT" } });
    if (!visit) {
      server.sequence += 1;
      const instant = body.deviceCreatedAt ?? new Date().toISOString();
      visit = { body, fingerprint: fp, number: `RV-${String(body.visitDate).replaceAll("-", "")}-${server.sequence}`, status: "draft", revision: 1, instant, items: body.items, outcomes: new Map(), events: [] };
      server.visits.set(body.clientUuid, visit);
    }
    return route.fulfill({ status: 201, json: { clientUuid: body.clientUuid, visitNumber: visit.number, configurationRevisionId: body.configurationRevisionId, deviceCreatedAt: visit.instant, visitDate: body.visitDate, arrivalTime: body.arrivalTime, requestFingerprint: fp } });
  }
  const photo = /^\/([0-9a-f-]{36})\/photos$/.exec(rest);
  if (method === "POST" && photo) {
    const metadata = JSON.parse(multipartField(request.postDataBuffer()!, request.headers()["content-type"] ?? "", "metadata")!);
    server.calls.push({ kind: "photo", visit: photo[1], photo: metadata.photoUuid, revision: metadata.revision });
    if (!server.visits.has(photo[1]!)) return route.fulfill({ status: 404, json: { error: "VISIT_NOT_YET_CREATED" } });
    server.photos.set(metadata.photoUuid, { visit: photo[1]!, metadata });
    return route.fulfill({ status: 201, json: { photoUuid: metadata.photoUuid, clientUuid: photo[1], itemUuid: metadata.itemUuid, revision: metadata.revision,
      requestFingerprint: fingerprint({ actorId, clientUuid: photo[1], ...metadata }), sourceSha256: metadata.sourceSha256, storedSha256: "5".repeat(64) } });
  }
  const submit = /^\/([0-9a-f-]{36})\/submit$/.exec(rest);
  if (method === "POST" && submit) {
    const body = request.postDataJSON() as Record<string, any>;
    server.calls.push({ kind: "submit", visit: submit[1], revision: body.revision, expected: body.expectedRevision, photos: body.items.map((item: any) => item.photoUuid), outcomes: body.items.map((item: any) => item.outcome) });
    const visit = server.visits.get(submit[1]!);
    if (!visit) return route.fulfill({ status: 404, json: { error: "VISIT_NOT_YET_CREATED" } });
    for (const item of body.items) {
      const staged = server.photos.get(item.photoUuid);
      if (visit.outcomes.get(item.clientUuid)?.photoUuid !== item.photoUuid && (!staged || staged.metadata.sourceSha256 !== item.sourceSha256)) return route.fulfill({ status: 409, json: { error: "EVIDENCE_NOT_STAGED" } });
    }
    const type = visit.status === "returned" ? "resubmitted" : "submitted";
    visit.status = "awaiting_approval"; visit.revision = body.revision; visit.items = body.items.map((item: any) => ({ clientUuid: item.clientUuid, identity: item.identity }));
    visit.outcomes = new Map(body.items.map((item: any) => [item.clientUuid, item]));
    visit.events.push({ operation: body.operationUuid, type, revision: body.revision, reason: null });
    return route.fulfill({ json: { operationUuid: body.operationUuid, clientUuid: submit[1], revision: body.revision, event: type, requestFingerprint: fingerprint({ action: "submit", actorId, clientUuid: submit[1], ...body }), occurredAt: new Date().toISOString() } });
  }
  if (method === "GET" && rest === "") return route.fulfill({ json: { visits: [...server.visits.entries()].map(([id, v]) => wire(id, v)) } });
  const detail = /^\/([0-9a-f-]{36})$/.exec(rest);
  if (method === "GET" && detail) {
    const visit = server.visits.get(detail[1]!);
    if (!visit) return route.fulfill({ status: 404, json: { error: "REPAIR_VISIT_NOT_FOUND" } });
    const items = visit.items.map((item, index) => {
      const field = allFields.find(candidate => keyOf(candidate.identity) === keyOf(item.identity))!;
      const outcome = visit.outcomes.get(item.clientUuid);
      return { clientUuid: item.clientUuid, visitUuid: detail[1], identity: item.identity, systemLabel: field.systemLabel, unitLabel: field.unitLabel, sectionLabel: field.sectionLabel, fieldLabel: field.fieldLabel,
        before: field.before, outcome: outcome?.outcome ?? null, remark: outcome?.remark ?? "", photoUuid: outcome?.photoUuid ?? null, sortOrder: index };
    });
    const events = visit.events.map((event, index) => ({ clientUuid: u(7000 + index), visitUuid: detail[1], revision: event.revision, type: event.type, actorUserId: event.type === "returned" ? 77 : actorId,
      reason: event.reason, occurredAt: new Date().toISOString(), requestFingerprint: "e".repeat(64) }));
    return route.fulfill({ json: { visit: wire(detail[1]!, visit), items, events } });
  }
  if (method === "DELETE" && detail) { server.calls.push({ kind: "delete", visit: detail[1] }); server.visits.delete(detail[1]!); return route.fulfill({ json: { clientUuid: detail[1], deleted: true } }); }
  const report = /^\/([0-9a-f-]{36})\/revisions\/(\d+)\/report\.pdf$/.exec(rest);
  if (method === "GET" && report) { server.calls.push({ kind: "report", visit: report[1], revision: Number(report[2]) }); }
  if (method === "GET" && report) return route.fulfill({ status: 200, contentType: "application/pdf", body: Buffer.from("%PDF-1.4\n%%EOF") });
  return route.fulfill({ status: 404, json: { error: "NOT_FOUND" } });
}

export const returnVisit = (server: RvServer, id: string, reason: string) => {
  const visit = server.visits.get(id)!;
  visit.status = "returned";
  visit.events.push({ operation: u(8000 + visit.events.length), type: "returned", revision: visit.revision, reason });
};
export const approveVisit = (server: RvServer, id: string, report = "MFE/RR/2026/0001") => {
  const visit = server.visits.get(id)!;
  visit.status = "approved"; visit.report = report;
  visit.events.push({ operation: u(8100 + visit.events.length), type: "approved", revision: visit.revision, reason: null });
};
