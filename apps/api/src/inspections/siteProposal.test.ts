import assert from "node:assert/strict";
import test from "node:test";
import { parseCreateServiceVisit } from "../routes/inspectionJobs.js";
import { createServiceVisit, ServiceVisitError } from "../jobs/serviceVisits.js";
import {
  deriveSiteProposalState, normaliseSiteAddress, normaliseSiteDisplayName, siteApprovalFor, siteNameKey, siteNameKeySql,
  type SiteProposalDecisionEvent
} from "./siteProposal.js";

/** CR-02 Phase 1: pure rules, no database. */
const event = (sequence: number, decision: "approved" | "rejected", note: string | null = null): SiteProposalDecisionEvent => ({
  id: `d${sequence}`, decision, note, decidedBy: "admin", decidedByRole: "admin", decidedAt: "2026-10-11T00:00:00.000Z", sequence, requestId: `r${sequence}`
});

test("derivation: no decision is pending; otherwise the highest sequence wins, never array position", () => {
  assert.deepEqual(deriveSiteProposalState([]), { status: "pending", decision: null });
  assert.equal(deriveSiteProposalState([event(1, "approved")]).status, "approved");
  assert.equal(deriveSiteProposalState([event(1, "rejected", "no")]).status, "rejected");
  assert.equal(deriveSiteProposalState([event(2, "rejected", "later"), event(1, "approved")]).decision?.sequence, 2);
});

test("a visit shows the status, and only a rejection carries the Admin's note", () => {
  assert.deepEqual(siteApprovalFor(deriveSiteProposalState([])), { status: "pending" });
  assert.deepEqual(siteApprovalFor(deriveSiteProposalState([event(1, "approved", "internal approval note")])), { status: "approved" });
  assert.deepEqual(siteApprovalFor(deriveSiteProposalState([event(1, "rejected", "Not our site")])), { status: "rejected", note: "Not our site" });
});

test("site text rules: trim, collapse, 1..160 / 0..500, no control or hidden characters", () => {
  assert.equal(normaliseSiteDisplayName("  Warehouse    Annex  "), "Warehouse Annex");
  assert.equal(normaliseSiteDisplayName("n".repeat(160))?.length, 160);
  for (const bad of ["", "   ", "n".repeat(161), 5, null, undefined, "a\nb", "a\tb", `a${String.fromCodePoint(0x200b)}b`, `a${String.fromCodePoint(0x202e)}b`, `a${String.fromCodePoint(0xfeff)}b`]) {
    assert.equal(normaliseSiteDisplayName(bad), undefined, String(bad));
  }
  assert.equal(normaliseSiteAddress(undefined), null);
  assert.equal(normaliseSiteAddress(null), null);
  assert.equal(normaliseSiteAddress("   "), null, "blank means not provided");
  assert.equal(normaliseSiteAddress(" 12  Jalan   Contoh "), "12 Jalan Contoh");
  assert.equal(normaliseSiteAddress("a".repeat(500))?.length, 500);
  for (const bad of ["a".repeat(501), 7, "line\nbreak", `x${String.fromCodePoint(0x2066)}y`]) assert.equal(normaliseSiteAddress(bad), undefined, String(bad));
});

test("the site-name key is case-insensitive on collapsed text, in JS and in the SQL expression", () => {
  assert.equal(siteNameKey("  Main   WAREHOUSE "), "main warehouse");
  assert.equal(siteNameKey("Main Warehouse"), siteNameKey("main  warehouse"));
  assert.match(siteNameKeySql("display_name"), /lower\(regexp_replace\(btrim\(display_name\), '\\s\+', ' ', 'g'\)\)/);
});

const ids = { request: "10000000-0000-4000-8000-000000000001", customer: "10000000-0000-4000-8000-000000000002", site: "10000000-0000-4000-8000-000000000003" };
const base = { requestId: ids.request, customerId: ids.customer, systemKeys: ["hose_reel"] };

test("parseCreateServiceVisit: exactly one of siteId / newSite; the siteId result is unchanged", () => {
  const withSite = parseCreateServiceVisit({ ...base, siteId: ids.site });
  assert.deepEqual(withSite, { requestId: ids.request, customerId: ids.customer, siteId: ids.site, systemKeys: ["hose_reel"], serviceCallNumber: null, arrivalTime: null, departureTime: null });
  assert.ok(!("newSite" in withSite!));
  const typed = parseCreateServiceVisit({ ...base, newSite: { displayName: "  New   Site ", address: " Road 1 " } });
  assert.deepEqual(typed, { requestId: ids.request, customerId: ids.customer, newSite: { displayName: "New Site", address: "Road 1" }, systemKeys: ["hose_reel"], serviceCallNumber: null, arrivalTime: null, departureTime: null });
  assert.ok(!("siteId" in typed!));
  assert.equal(parseCreateServiceVisit({ ...base, newSite: { displayName: "Only Name" } })?.newSite?.address, null);
  for (const bad of [
    base, { ...base, siteId: ids.site, newSite: { displayName: "Both" } }, { ...base, newSite: "text" }, { ...base, newSite: [] }, { ...base, newSite: null },
    { ...base, newSite: { displayName: "X", extra: 1 } }, { ...base, newSite: { displayName: "" } }, { ...base, newSite: {} }, { ...base, siteId: "nope" }, { ...base, siteId: null },
    { ...base, siteId: ids.site, siteCode: "X" }
  ]) assert.equal(parseCreateServiceVisit(bad), undefined, JSON.stringify(bad));
});

test("createServiceVisit refuses a typed site from anything but a technician before touching the database", async () => {
  let touched = 0;
  const client = { async query() { touched += 1; return { rows: [], rowCount: 0 }; } };
  for (const role of ["admin", "supervisor", undefined, "bogus"]) {
    await assert.rejects(
      () => createServiceVisit(client as never, { requestId: ids.request, customerId: ids.customer, systemKeys: ["hose_reel"], newSite: { displayName: "Typed", address: null } }, 7, role),
      (error: unknown) => error instanceof ServiceVisitError && error.code === "NEW_SITE_NOT_ALLOWED" && error.status === 403
    );
  }
  assert.equal(touched, 0);
});
