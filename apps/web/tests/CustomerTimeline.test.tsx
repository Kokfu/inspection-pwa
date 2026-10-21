import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerTimelineRows } from "../src/visits/CustomerTimeline";
import { canOpenTimelineVisit, filterTimeline, loadTimelineCustomers, parseTimelinePage, type TimelineVisit } from "../src/visits/customerTimelineData";
import { parseTimelineServiceJob } from "../src/visits/customerTimelineServiceJob";

const actor = { id: 1, username: "tech", role: "inspector" as const };
const id = "30000000-0000-4000-8000-000000000001";
const own: TimelineVisit = { id, kind: "service", date: "2026-10-21", status: "closed", siteId: id, siteName: "Site", technicianId: 1, technicianName: "Owner", ownedByCaller: true };
const other: TimelineVisit = { ...own, kind: "repair", date: "2026-10-20", status: "approved", technicianId: 2, technicianName: "Other", ownedByCaller: false };

test("reachable malformed customer catalogs and refusals fail closed", async () => {
  const original = globalThis.fetch;
  try {
    for (const data of [null, {}, { customers: null }, { customers: [{ id: "bad", displayName: "Name" }] },
      { customers: [{ id, displayName: "Name" }, { id, displayName: "Duplicate" }] }]) {
      globalThis.fetch = async () => new Response(JSON.stringify(data), { status: 200 });
      await assert.rejects(loadTimelineCustomers(actor), /invalid data/);
    }
    globalThis.fetch = async () => new Response("not JSON", { status: 200 });
    await assert.rejects(loadTimelineCustomers(actor), SyntaxError);
    for (const status of [401, 403, 409, 500, 503]) {
      globalThis.fetch = async () => new Response("{}", { status });
      await assert.rejects(loadTimelineCustomers(actor), new RegExp(String(status)));
    }
    globalThis.fetch = async (_url, options) => {
      assert.equal((options?.headers as Record<string, string>)["X-Expected-User-Id"], "1");
      return new Response(JSON.stringify({ customers: [{ id, displayName: "Current name" }] }));
    };
    assert.deepEqual(await loadTimelineCustomers(actor), [{ id, displayName: "Current name" }]);
  } finally { globalThis.fetch = original; }
});
test("technician gets one tappable owner row and one inert locked foreign row; manager can tap both", () => {
  const html = renderToStaticMarkup(createElement(CustomerTimelineRows, { visits: [own, other], actor, onOpen() {} }));
  assert.equal((html.match(/<button/g) ?? []).length, 1); assert.equal((html.match(/Summary only/g) ?? []).length, 1);
  const manager = renderToStaticMarkup(createElement(CustomerTimelineRows, { visits: [own, other], actor: { ...actor, role: "admin" }, onOpen() {} }));
  assert.equal((manager.match(/<button/g) ?? []).length, 2); assert.ok(!manager.includes("Summary only"));
  assert.equal(canOpenTimelineVisit(actor, { ...other, ownedByCaller: true }), false);
});
test("type, status, inclusive dates and site combine; results are newest first", () => {
  const f = { kind: "all" as const, status: "", dateFrom: "", dateTo: "", siteId: "" };
  assert.deepEqual(filterTimeline([other, own], f), [own, other]);
  assert.deepEqual(filterTimeline([own, other], { ...f, kind: "repair" }), [other]);
  assert.deepEqual(filterTimeline([own, other], { ...f, kind: "service", status: "closed", dateFrom: own.date, dateTo: own.date, siteId: id }), [own]);
  for (const patch of [{ status: "draft" }, { dateFrom: "2026-10-22" }, { dateTo: "2026-10-19" }, { siteId: "other" }]) assert.deepEqual(filterTimeline([own, other], { ...f, ...patch }), []);
});
test("Completed combines closed services and approved repairs with type/date/site filters", () => {
  const open = { ...own, status: "open" as const };
  const pending = { ...other, status: "awaiting_approval" as const };
  const f = { kind: "all" as const, status: "closed", dateFrom: "", dateTo: "", siteId: "" };
  assert.deepEqual(filterTimeline([pending, other, open, own], f), [own, other]);
  assert.deepEqual(filterTimeline([own, other], {...f,kind:"repair"}), [other]);
  assert.deepEqual(filterTimeline([own, other], {...f,kind:"service"}), [own]);
  assert.deepEqual(filterTimeline([own, other], {...f,dateFrom:own.date}), [own]);
  assert.deepEqual(filterTimeline([own, other], {...f,siteId:"missing"}), []);
  assert.deepEqual(filterTimeline([own, other], {...f,status:"approved"}), [other]);
});

test("summary parser rejects details, bad dates, unknown states, inconsistent ownership and duplicates", () => {
  assert.deepEqual(parseTimelinePage({ visits: [own, other], nextCursor: null }, actor).visits, [own, other]);
  for (const patch of [{ answers: {} }, { date: "2026-02-30" }, { status: "approved" }, { technicianId: 2 }, { ownedByCaller: false }, { siteId: "bad" }])
    assert.throws(() => parseTimelinePage({ visits: [{ ...own, ...patch }], nextCursor: null }, actor));
  assert.throws(() => parseTimelinePage({ visits: [own, own], nextCursor: null }, actor));
  assert.throws(() => parseTimelinePage({ visits: [own], nextCursor: null, report: {} }, actor));
});
test("canonical service opening checks the exact job/customer and rejects malformed detail instead of old data", () => {
  const job = { id, reference: "SV-20261021-1", title: "Visit", status: "open", createdAt: "2026-10-21T00:00:00.000Z", serviceDate: "2026-10-21", serviceTime: "08:00", site: null,
    configurationSnapshot: { schemaVersion: 1, customer: { id, code: "LIVE", displayName: "Live customer" }, configuration: { revisionId: id, revisionNumber: 1 },
      template: { id, code: "MFE-FSSR", name: "Service", version: 7 }, enabledSystems: [] },
    completion: { jobId: id, jobStatus: "open", eligible: false, checkedAt: "2026-10-21T00:00:00.000Z", requiredUnitCount: 0, acceptedUnitCount: 0, completedAt: null, completedBy: null, systems: [] } };
  assert.deepEqual(parseTimelineServiceJob({ job }, id, id), job);
  for (const patch of [{ id: "wrong" }, { status: "unknown" }, { configurationSnapshot: {} }, { completion: {} }, { serviceDate: "2026-02-30" }, { createdAt: "October 21 2026" }])
    assert.throws(() => parseTimelineServiceJob({ job: { ...job, ...patch } }, id, id));
  assert.throws(() => parseTimelineServiceJob({ job }, id, "another customer"));
});
