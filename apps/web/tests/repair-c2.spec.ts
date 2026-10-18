import { expect, test, type Page } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { fingerprint } from "../../api/src/repairs/acceptedSource";
const id = () => randomUUID(), at = "2026-10-13T04:00:00.123Z";
const digest = (b: Buffer) => createHash("sha256").update(b).digest("hex");
test.afterEach(async ({ page }) => { await page.evaluate(() => { window.fetch = async () => { throw new Error("C2 fixture ended"); }; }); await page.unrouteAll({ behavior: "wait" }); });
function fixture() {
  const jobId = id(), customerId = id(), systemKey = "co2_fire_extinguisher", orderId = id();
  const findings = [0, 1].map(i => ({ findingId: id(), sourceFingerprint: String(i + 1).repeat(64), sourceRevision: "a".repeat(64), eligibility: "eligible", reviewSequence: 0, reviews: [] as any[], history: [] as any[],
    original: { jobId, systemKey, fieldPath: `checks.part${i}`, responsePath: `checks.part${i}.result`, result: "poor", remark: `ORIGINAL immutable remark ${i}`, template: { id: id(), code: "MFE-FSSR", version: 1 }, contractSha256: "b".repeat(64),
      beforePhotoMissing: true, beforePhoto: null as any, beforePhotoLabel: "Historical finding: no original Before photo", formInstanceId: id(), sourceClientUuid: id(), rowUuid: null,
      caption: `Failed part ${i}`, sectionLabel: "Cylinder Checks", fieldLabel: `Failed Part ${i}`, unit: { label: "Unit A" }, sourceJob: { id: jobId, reference: "SV-C2-ORIGINAL", title: "Original accepted visit" },
      instanceKey: "primary", locationId: null, zoneId: null, configuration: { revisionId: id(), revisionNumber: 1 }, customer: { id: customerId, code: "C2", displayName: "C2 Customer" }, site: null, system: "CO2", instance: null } }));
  return { jobId, systemKey, findings, workOrders: [{ workOrderId: orderId, jobId, systemKey, assignedToUserId: 71, revision: 1, status: "active" }] };
}
type Service = ReturnType<typeof fixture>;
async function jpeg(page: Page, color: string) {
  return Buffer.from(await page.evaluate(color => { const c = document.createElement("canvas"); c.width = 80; c.height = 60; const x = c.getContext("2d")!; x.fillStyle = color; x.fillRect(0, 0, 80, 60); return c.toDataURL("image/jpeg").split(",")[1]; }, color), "base64");
}
async function boot(page: Page, role = "admin", deep = true, s = fixture()) {
  const photo = await jpeg(page, "#157944"), beforePhoto = await jpeg(page, "#995511");
  const details = new Map<string, any>();
  for (const [i, f] of s.findings.entries()) {
    // One approved old cycle plus a submitted repeat; the other part is independent.
    const count = i === 0 ? 2 : 1;
    for (let sequence = 1; sequence <= count; sequence++) {
      const clientUuid = id(), previous = f.history.at(-1)?.client_uuid ?? null, state = sequence < count ? "approved" : "awaiting_approval";
      const h = { client_uuid: clientUuid, cycle_sequence: sequence, predecessor_uuid: previous, remark: `Immutable After remark ${i} cycle ${sequence}`, performed_at: at, submitted_by_user_id: 71, review_state: state };
      f.history.push(h);
      const photoUuid = id(), receipt = { clientUuid, findingId: f.findingId, workOrderId: s.workOrders[0].workOrderId, jobId: s.jobId, systemKey: s.systemKey, cycleSequence: sequence, predecessorUuid: previous, requestFingerprint: "d".repeat(64), sourceRevision: f.sourceRevision };
      const decisions = state === "approved" ? [{ clientUuid, decisionId: id(), requestId: id(), requestFingerprint: "e".repeat(64), sequence: 1, decision: "approved", reason: null, decidedAt: at, decidedByUserId: 81, decidedByRole: "supervisor" }] : [];
      details.set(clientUuid, { receipt, remark: h.remark, performedAt: h.performed_at, submittedAt: at, submittedByUserId: 71, manifest: [{ photoUuid, fieldPath: f.original.fieldPath, sourceSha256: digest(photo) }],
        evidence: { photoUuid, repairUuid: clientUuid, findingId: f.findingId, workOrderId: receipt.workOrderId, jobId: s.jobId, systemKey: s.systemKey, requestFingerprint: "f".repeat(64), sourceSha256: digest(photo), storedSha256: digest(photo) }, reviewState: state, decisions });
    }
  }
  const calls: Array<{ path: string; body: any }> = [], receipts = new Map<string, any>();
  let responseLoss = "", failure = "", actor = 81, actorRole = role;
  const controls = { lose: (kind: string) => { responseLoss = kind; }, fail: (code: string) => { failure = code; }, actor: (n: number, r = role) => { actor = n; actorRole = r; } };
  await page.route("**/api/**", async r => {
    const path = new URL(r.request().url()).pathname;
    if (path === "/api/auth/me") return r.fulfill({ json: { user: { id: actor, username: `c2-${actor}`, role: actorRole } } });
    if (path === "/api/health") return r.fulfill({ json: { status: "ok" } });
    if (path === "/api/repairs/services") return r.fulfill({ json: { services: [{ jobId: s.jobId, systemKey: s.systemKey, sourceJob: s.findings[0].original.sourceJob, customer: s.findings[0].original.customer, site: null, systemLabel: "CO2" }] } });
    if (path === `/api/repairs/services/${s.jobId}/${s.systemKey}`) return failure ? r.fulfill({ status: 503, json: { error: failure } }) : r.fulfill({ json: s });
    if (path === "/api/manager/technicians") return r.fulfill({ json: { technicians: [71, 72, 73, 74].map(n => ({ id: n, username: `tech-${n}`, displayName: `Technician ${n}`, role: n === 74 ? "supervisor" : "inspector", isActive: n !== 73, createdAt: at, supervisorIds: [] })) } });
    if (r.request().method() === "POST" && path.startsWith("/api/repairs/")) {
      const body = r.request().postDataJSON(); calls.push({ path, body });
      // Every mutation must already exist in IndexedDB before it reaches fetch.
      const persisted = await page.evaluate(requestId => (window as any).c2.db.localDatabase.referenceData.toArray().then((v: any[]) => v.some(x => x.payload?.body?.requestId === requestId)), body.requestId);
      expect(persisted).toBe(true); expect(r.request().headers()["x-expected-user-id"]).toBe(String(actor));
      const kind = path.endsWith("/decisions") ? "decision" : path.endsWith("/source-review") ? "source" : "assignment", target = path.split("/").at(-2)!;
      const requestFingerprint = fingerprint(kind === "decision" ? { actorId: actor, repairUuid: target, ...body } : kind === "source" ? { actorId: actor, findingId: target, ...body } : { actorId: actor, mode: "manager", ...body });
      const prior = receipts.get(body.requestId);
      if (prior) return prior.requestFingerprint !== requestFingerprint ? r.fulfill({ status: 409, json: { error: "IDEMPOTENCY_CONFLICT" } }) : r.fulfill({ json: prior });
      let receipt: any;
      if (kind === "decision") {
        const d = details.get(target), f = s.findings.find(f => f.history.some(h => h.client_uuid === target))!;
        if (d.decisions.length !== body.expectedSequence || d.reviewState !== "awaiting_approval") return r.fulfill({ status: 409, json: { error: "STALE_REPAIR_DECISION" } });
        if (f.sourceRevision !== body.expectedSourceRevision) return r.fulfill({ status: 409, json: { error: "STALE_SOURCE_REVIEW" } });
        receipt = { requestId: body.requestId, requestFingerprint, decisionId: id(), clientUuid: target, sequence: body.expectedSequence + 1, decision: body.decision };
        d.decisions.push({ ...receipt, reason: body.reason, decidedAt: at, decidedByUserId: actor, decidedByRole: actorRole }); d.reviewState = body.decision;
        f.history.find(h => h.client_uuid === target)!.review_state = body.decision;
      } else if (kind === "source") {
        const f = s.findings.find(f => f.findingId === target)!;
        if (f.sourceRevision !== body.expectedSourceRevision || f.reviewSequence !== body.expectedReviewSequence) return r.fulfill({ status: 409, json: { error: "STALE_SOURCE_REVIEW" } });
        receipt = { requestId: body.requestId, requestFingerprint, reviewId: id(), findingId: target, sequence: body.expectedReviewSequence + 1, sourceRevision: body.expectedSourceRevision, decision: body.decision };
        f.reviews.push({ id: receipt.reviewId, sequence: receipt.sequence, source_revision: f.sourceRevision, decision: body.decision, reason: body.reason, decided_at: at, decided_by_user_id: actor }); f.reviewSequence++; f.eligibility = body.decision;
      } else {
        const w = s.workOrders.find(w => w.workOrderId === body.workOrderId);
        if ((w?.revision ?? 0) !== body.expectedRevision) return r.fulfill({ status: 409, json: { error: "STALE_WORK_ORDER" } });
        receipt = { requestId: body.requestId, requestFingerprint, workOrderId: body.workOrderId, jobId: s.jobId, systemKey: s.systemKey, assignedToUserId: body.assignedToUserId, revision: body.expectedRevision + 1, status: body.status };
        const next = { workOrderId: receipt.workOrderId, jobId: s.jobId, systemKey: s.systemKey, assignedToUserId: receipt.assignedToUserId, revision: receipt.revision, status: receipt.status };
        if (w) Object.assign(w, next); else s.workOrders.push(next);
      }
      receipts.set(body.requestId, receipt);
      if (responseLoss === kind) { responseLoss = ""; return r.abort("failed"); }
      return r.fulfill({ json: receipt });
    }
    const recordMatch = path.match(/\/repairs\/records\/([^/]+)(\/after\/content)?$/);
    if (recordMatch && details.has(recordMatch[1])) return recordMatch[2] ? r.fulfill({ body: photo, contentType: "image/jpeg" }) : r.fulfill({ json: details.get(recordMatch[1]) });
    if (/\/before\/content$/.test(path)) return r.fulfill({ body: beforePhoto, contentType: "image/jpeg" });
    return r.fulfill({ status: 503, json: { error: "C2_FIXTURE_UNAVAILABLE" } });
  });
  await page.goto(`/tests/repair-c2.html${deep ? `#/manager-repairs/${s.jobId}/${s.systemKey}` : ""}`);
  await page.waitForFunction(() => (window as any).c2Ready);
  await page.getByRole("button", { name: new RegExp(`^${role === "admin" ? "Manager" : role === "supervisor" ? "Admin" : "Technician"}`) }).click();
  if (role !== "inspector" && deep) await expect(page.getByRole("heading", { name: "C2 Customer", exact: true })).toBeVisible();
  return { s, details, calls, receipts, photo, beforePhoto, controls };
}
const part = (page: Page, i = 0) => page.getByRole("article", { name: `Review part: Failed Part ${i}`, exact: true });
const currentCycle = (page: Page, i = 0) => part(page, i).getByRole("region", { name: `Repair cycle ${i === 0 ? 2 : 1}`, exact: true });
async function ready(page: Page) { await expect(page.getByRole("button", { name: "Refresh Review Authority" })).toBeEnabled(); await expect(page.getByRole("heading", { name: "C2 Customer", exact: true })).toBeVisible(); }
async function saved(page: Page) { return page.evaluate(() => (window as any).c2.db.localDatabase.referenceData.where("key").startsWith("repair-review:request:").toArray()); }

test("C2 Manager assignment and source-review forms fit all three viewports with accessible errors", async ({ page }) => {
  const f = await boot(page); f.s.findings[0].sourceRevision = "c".repeat(64); f.s.findings[0].eligibility = "needs_review";
  await page.getByRole("button", { name: "Refresh Review Authority" }).click(); await ready(page);
  for (const size of [{ width: 360, height: 800 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size);
    await page.getByRole("button", { name: "Assign Repair Work" }).click(); await expect(page.getByRole("region", { name: "New Repair Work Order" }).getByLabel("Active Technician")).toBeFocused();
    await expect(page.getByText("Choose an active Technician.", { exact: true })).toBeVisible();
    await part(page).getByRole("button", { name: "Continue Repair" }).click(); await expect(part(page).getByLabel("Source Review Reason (Required)")).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const targets = await page.locator(".repair-page button,.repair-page select,.repair-page textarea,.repair-page summary,.repair-page a").evaluateAll(els => els.filter(e => (e as HTMLElement).offsetParent !== null).map(e => e.getBoundingClientRect().toJSON()));
    expect(targets.every(t => t.width >= 44 && t.height >= 44)).toBe(true);
    await page.screenshot({ path: `../../logs/cr09-c2-manager-${size.width}.png`, fullPage: true });
  }
  expect(f.calls).toHaveLength(0);
});

for (const size of [{ width: 360, height: 800 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) test(`C2 Admin navigation, deep links, accessibility and comparisons ${size.width}x${size.height}`, async ({ page }) => {
  await page.setViewportSize(size); await boot(page, "supervisor");
  await expect(page.getByRole("region", { name: "Repair Assignments" })).toHaveCount(0);
  await expect(part(page).getByText("ORIGINAL immutable remark 0", { exact: true })).toBeVisible();
  await expect(part(page).getByAltText("Immutable After photo for cycle 1")).toBeVisible();
  await currentCycle(page, 1).getByRole("button", { name: "Reject Part" }).click();
  await expect(currentCycle(page, 1).getByText("Enter a rejection reason (at least 3 characters).", { exact: true })).toBeVisible();
  const input = currentCycle(page, 1).getByLabel("Rejection Reason (Required for Reject)"); await expect(input).toBeFocused();
  expect(await input.evaluate(el => getComputedStyle(el).fontSize)).toBe("16px"); expect(await input.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const targets = await page.locator(".repair-page button,.repair-page summary,.repair-page a").evaluateAll(els => els.filter(e => (e as HTMLElement).offsetParent !== null).map(e => e.getBoundingClientRect().toJSON()));
  expect(targets.every(t => t.width >= 44 && t.height >= 44)).toBe(true);
  expect(await page.locator(".repair-comparison").first().evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(size.width >= 768 ? 2 : 1);
  await page.screenshot({ path: `../../logs/cr09-c2-${size.width}.png`, fullPage: true });
  await part(page, 1).getByRole("link", { name: "Failed Part 1", exact: true }).click(); await expect(part(page)).toHaveCount(0); await expect(part(page, 1)).toBeVisible();
  await page.reload(); await expect(part(page, 1)).toBeVisible();
  await page.getByRole("link", { name: "All Repair Services" }).click(); await expect(page.getByRole("link", { name: "Review CO2 Repairs" })).toBeVisible();
  if (size.width < 768) await page.locator(".app-mobile-navigation summary").click();
  await expect(page.locator(size.width < 768 ? ".app-mobile-navigation" : ".app-sidebar").getByRole("button", { name: "Repair Review", exact: true })).toHaveAttribute("aria-current", "page");
});
test("C2 independent approve/reject and immutable repeat history; exact receipt replay", async ({ page }) => {
  const f = await boot(page, "supervisor"), original = JSON.stringify(f.s.findings[0].original), older = JSON.stringify(f.details.get(f.s.findings[0].history[0].client_uuid));
  await currentCycle(page).getByRole("button", { name: "Approve Part" }).click(); await ready(page);
  await expect(currentCycle(page).getByRole("heading", { name: "Cycle 2 · Approved" })).toBeVisible();
  await currentCycle(page, 1).getByLabel("Rejection Reason (Required for Reject)").fill("Still leaking; replace seal"); await currentCycle(page, 1).getByRole("button", { name: "Reject Part" }).click(); await ready(page);
  await expect(currentCycle(page, 1).getByRole("heading", { name: "Cycle 1 · Rejected" })).toBeVisible();
  expect(JSON.stringify(f.s.findings[0].original)).toBe(original); expect(JSON.stringify(f.details.get(f.s.findings[0].history[0].client_uuid))).toBe(older);
  expect(f.calls.every(c => !/report-approval|submissions/.test(c.path))).toBe(true);
  await page.getByText("Saved Review Requests (2)", { exact: true }).click(); await page.getByRole("button", { name: "Replay Exact Request" }).first().click(); await ready(page);
  expect(f.calls[2].body).toEqual(f.calls.slice(0, 2).find(c => c.body.requestId === f.calls[2].body.requestId)!.body); expect(f.receipts.size).toBe(2);
  const entries = await saved(page); expect(entries.length).toBe(2); expect(entries.every((e: any) => e.payload.receipt)).toBe(true);
});
test("C2 source revision reason, continue / not-required, stale correction versus decision", async ({ page }) => {
  const f = await boot(page); f.s.findings[0].sourceRevision = "c".repeat(64); f.s.findings[0].eligibility = "needs_review";
  await page.getByRole("button", { name: "Refresh Review Authority" }).click(); await ready(page);
  await expect(currentCycle(page).getByRole("button", { name: "Approve Part" })).toBeDisabled();
  await part(page).getByRole("button", { name: "Continue Repair" }).click(); await expect(part(page).getByLabel("Source Review Reason (Required)")).toBeFocused();
  await part(page).getByLabel("Source Review Reason (Required)").fill("Correction checked; original finding still needs repair"); await part(page).getByRole("button", { name: "Continue Repair" }).click(); await ready(page);
  await expect(currentCycle(page).getByRole("button", { name: "Approve Part" })).toBeEnabled();
  f.s.findings[0].sourceRevision = "d".repeat(64); f.s.findings[0].eligibility = "needs_review";
  await currentCycle(page).getByRole("button", { name: "Approve Part" }).click(); await expect(page.getByRole("alert")).toContainText("STALE_SOURCE_REVIEW"); await expect(part(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh Review Authority" }).click(); await ready(page);
  await part(page).getByLabel("Source Review Reason (Required)").fill("Reviewed correction; repair no longer required"); page.once("dialog", d => d.accept()); await part(page).getByRole("button", { name: "Not Required", exact: true }).click(); await ready(page);
  await expect(part(page).getByText("Source eligibility: Not Required", { exact: true })).toBeVisible();
  expect(f.s.findings[0].reviews).toHaveLength(2); expect(f.s.findings[0].original.remark).toBe("ORIGINAL immutable remark 0");
});
test("C2 assignment / reassignment / revoke, active-technician filter, exact durable response-loss retry", async ({ page }) => {
  const f = await boot(page), assignment = page.getByRole("region", { name: `Work Order ${f.s.workOrders[0].workOrderId}`, exact: true });
  expect(await assignment.getByLabel("Active Technician").locator("option").allTextContents()).toEqual(["Choose a Technician", "Technician 71 · #71", "Technician 72 · #72"]);
  await assignment.getByLabel("Active Technician").selectOption("72"); f.controls.lose("assignment"); await assignment.getByRole("button", { name: "Assign / Reassign" }).click(); await expect(page.getByRole("alert")).toContainText("Review authority unavailable");
  expect(f.s.workOrders[0].assignedToUserId).toBe(72);
  await page.reload(); await ready(page); await page.getByText("Saved Review Requests (1)", { exact: true }).click(); await page.getByRole("button", { name: "Replay Exact Request" }).click(); await ready(page);
  expect(f.calls[1].body).toEqual(f.calls[0].body); expect(f.s.workOrders[0].revision).toBe(2);
  page.once("dialog", d => d.accept()); await assignment.getByRole("button", { name: "Revoke Assignment" }).click(); await ready(page); expect(f.s.workOrders[0].status).toBe("revoked");
  await assignment.getByLabel("Active Technician").selectOption("71"); await assignment.getByRole("button", { name: "Assign / Reassign" }).click(); await ready(page); expect(f.s.workOrders[0].revision).toBe(4);
  f.controls.lose("assignment"); await page.getByRole("region", { name: "New Repair Work Order", exact: true }).getByLabel("Active Technician").selectOption("72"); await page.getByRole("button", { name: "Assign Repair Work" }).click(); await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Refresh Review Authority" }).click(); await ready(page); await expect(page.getByRole("button", { name: "Assign Repair Work" })).toBeDisabled();
  await page.getByText("Saved Review Requests (4)", { exact: true }).click(); await page.getByRole("button", { name: "Replay Exact Request" }).last().click(); await ready(page); expect(f.s.workOrders.length).toBe(2);
});
test("C2 decision response loss keeps identity and content; different-content caller cannot reuse revision", async ({ page }) => {
  const f = await boot(page); f.controls.lose("decision"); await currentCycle(page).getByRole("button", { name: "Approve Part" }).click(); await expect(page.getByRole("alert")).toBeVisible();
  const entry = (await saved(page))[0]; expect(entry.payload.receipt).toBeUndefined();
  const conflict = await page.evaluate(async ({ f, detail }) => {
    const api = (window as any).c2.review, ctx = await api.reviewContext({ id: 81, username: "c2-81", role: "admin" }, () => true);
    try { await api.decidePart(ctx, f, f.history.at(-1), detail, "rejected", "Changed caller content"); return "unexpected"; } catch(e: any) { return e.message; }
  }, { f: { ...f.s.findings[0], history: f.s.findings[0].history.map(h => ({ ...h, review_state: h.cycle_sequence === 2 ? "awaiting_approval" : h.review_state })) }, detail: { ...f.details.get(f.s.findings[0].history[1].client_uuid), reviewState: "awaiting_approval", decisions: [] } });
  expect(conflict).toBe("REPAIR_REQUEST_CONTENT_CONFLICT"); expect(f.calls).toHaveLength(1);
  await page.reload(); await ready(page); await page.getByText("Saved Review Requests (1)", { exact: true }).click(); await page.getByRole("button", { name: "Replay Exact Request" }).click(); await ready(page); expect(f.calls[1].body).toEqual(f.calls[0].body); expect(f.receipts.size).toBe(1);
});
test("C2 stale review / source / assignment revisions fail closed; competing decisions retain requests", async ({ page }) => {
  const f = await boot(page); const h = f.s.findings[1].history[0]; f.details.get(h.client_uuid).reviewState = "rejected"; f.details.get(h.client_uuid).decisions.push({});
  await currentCycle(page, 1).getByRole("button", { name: "Approve Part" }).click(); await expect(page.getByRole("alert")).toContainText("STALE_REPAIR_DECISION"); expect((await saved(page))).toHaveLength(1);
  f.details.get(h.client_uuid).decisions = []; f.details.get(h.client_uuid).reviewState = "awaiting_approval";
  f.s.findings[0].eligibility = "needs_review"; await page.getByRole("button", { name: "Refresh Review Authority" }).click(); await ready(page);
  f.s.findings[0].sourceRevision = "c".repeat(64); await part(page).getByLabel("Source Review Reason (Required)").fill("Checked source"); await part(page).getByRole("button", { name: "Continue Repair" }).click(); await expect(page.getByRole("alert")).toContainText("STALE_SOURCE_REVIEW");
  await page.getByRole("button", { name: "Refresh Review Authority" }).click(); await ready(page); f.s.workOrders[0].revision++;
  await page.getByRole("button", { name: "Assign / Reassign" }).click(); await expect(page.getByRole("alert")).toContainText("STALE_WORK_ORDER"); expect((await saved(page))).toHaveLength(3);
});
test("C2 unavailable / malformed authority, Before absence / corruption / download failure stay distinct", async ({ page }) => {
  const f = await boot(page); f.controls.fail("SOURCE_UNAVAILABLE"); await page.getByRole("button", { name: "Refresh Review Authority" }).click(); await expect(page.getByRole("alert")).toContainText("SOURCE_UNAVAILABLE"); await expect(part(page)).toHaveCount(0);
  f.controls.fail(""); f.s.findings[0].original.beforePhotoMissing = false; f.s.findings[0].original.beforePhoto = { photoUuid: id(), fieldPath: f.s.findings[0].original.fieldPath, sourceSha256: digest(f.beforePhoto), storedSha256: digest(f.beforePhoto), sizeBytes: f.beforePhoto.length, width: 80, height: 60 };
  await page.getByRole("button", { name: "Refresh Review Authority" }).click(); await ready(page); await expect(part(page).getByAltText("Original accepted Before photo")).toBeVisible(); await expect(part(page, 1).getByText("Historical finding: no original Before photo.", { exact: true })).toBeVisible();
  await page.route("**/before/content", r => r.fulfill({ body: "corrupt jpeg", contentType: "image/jpeg" })); await page.getByRole("button", { name: "Refresh Review Authority" }).click(); await ready(page); await expect(part(page).getByRole("alert")).toContainText("Integrity failure"); await expect(currentCycle(page).getByRole("button", { name: "Approve Part" })).toBeDisabled();
  await page.route("**/after/content", r => r.fulfill({ status: 503, json: { error: "PHOTO_UNAVAILABLE" } })); await page.getByRole("button", { name: "Refresh Review Authority" }).click(); await ready(page); await expect(part(page, 1).getByRole("alert")).toContainText("Download unavailable"); await expect(currentCycle(page, 1).getByRole("button", { name: "Approve Part" })).toHaveCount(0);
  await page.route(`**/api/repairs/services/${f.s.jobId}/${f.s.systemKey}`, r => r.fulfill({ json: { ...f.s, unexpected: true } })); await page.getByRole("button", { name: "Refresh Review Authority" }).click(); await expect(page.getByRole("alert")).toContainText("INVALID_REPAIR_AUTHORITY"); await expect(part(page)).toHaveCount(0);
});
test("C2 technician / cached identity cannot unlock review", async ({ page }) => {
  await boot(page, "inspector"); await expect(page.getByRole("heading", { name: "Repair Review", exact: true })).toHaveCount(0);
  expect(await page.locator(".app-sidebar").getByRole("button", { name: "Repair Review", exact: true }).count()).toBe(0);
  await page.goto("/tests/repair-c2.html"); await page.waitForFunction(() => (window as any).c2Ready);
  const denied = await page.evaluate(async () => { const x = (window as any).c2; try { await x.review.reviewContext({ id: 81, username: "cached", role: "supervisor" }, () => false); return "unexpected"; } catch(e: any) { return e.message; } });
  expect(denied).toBe("REPAIR_REVIEW_AUTHORITY_REQUIRED");
});
// I-71 (review path): re-verification by another tab only rewrites the timestamps; a real identity change still aborts.
test("C2 review context survives a timestamp-only re-verification but not a real identity change", async ({ page }) => {
  await page.goto("/tests/review-context.html"); await page.waitForFunction(() => (window as any).rcReady);
  const outcomes = await page.evaluate(async () => {
    const x = (window as any).rc, auth = x.db.deviceDatabase.authState;
    const admin = { key: "device-auth", schemaVersion: 1, userId: 81, username: "reviewer", role: "admin", lastVerifiedAt: "2026-10-18T10:00:00.000Z", cachedAt: "2026-10-18T10:00:00.000Z", explicitLogout: false, serverLogoutPending: false };
    const attempt = async (change: Record<string, unknown> | "delete") => {
      await x.db.deviceDatabase.open(); await auth.put(admin); await x.db.activateUserWorkspace(81);
      const ctx = await x.review.reviewContext({ id: 81, username: "reviewer", role: "admin" }, () => true);
      if (change === "delete") await auth.delete("device-auth"); else await auth.update("device-auth", change);
      try { await ctx.assert(); return "continued"; } catch (e: any) { return e.message; }
    };
    return {
      timestamps: await attempt({ lastVerifiedAt: "2026-10-18T10:07:00.000Z", cachedAt: "2026-10-18T10:07:00.000Z" }),
      username: await attempt({ username: "renamed" }), role: await attempt({ role: "supervisor" }),
      pendingLogout: await attempt({ serverLogoutPending: true }), explicitLogout: await attempt({ explicitLogout: true }),
      deleted: await attempt("delete")
    };
  });
  expect(outcomes.timestamps).toBe("continued");
  for (const key of ["username", "role", "pendingLogout", "explicitLogout", "deleted"] as const) expect(outcomes[key], key).toBe("REPAIR_REVIEW_AUTHORITY_CHANGED");
});
test("C2 Admin cannot assign, self-start or use technician repositories", async ({ page }) => {
  const f = await boot(page, "supervisor");
  const refusals = await page.evaluate(async service => {
    const api = (window as any).c2.review, ctx = await api.reviewContext({ id: 81, username: "c2-81", role: "supervisor" }, () => true);
    const failures: string[] = [];
    try { await api.assignRepair(ctx, service, service.workOrders[0], 72, "active"); } catch(e: any) { failures.push(e.message); }
    const technician = await import("/src/repairs/repairRepository.ts" as string);
    try { await technician.repairContext(); } catch(e: any) { failures.push(e.message); }
    // A formerly Manager account may retain assignment requests after downgrade.
    // Reading that history cannot grant an Admin the power to replay the write.
    const contract = await import("/src/repairs/repairContract.ts" as string), workOrderId = service.workOrders[0].workOrderId;
    const body = { requestId: crypto.randomUUID(), workOrderId, jobId: service.jobId, systemKey: service.systemKey, assignedToUserId: 72, expectedRevision: 1, status: "active" };
    const op = { kind: "assignment", target: workOrderId, body, actorId: 81, jobId: service.jobId, systemKey: service.systemKey, requestFingerprint: await contract.fingerprint({ actorId: 81, mode: "manager", ...body }) };
    await ctx.db.referenceData.add({ key: `repair-review:request:assignment:${workOrderId}:1:order`, payload: op, version: "1", fetchedAt: "2026-10-13T04:00:00.123Z", expiresAt: "2026-10-13T04:00:00.123Z" });
    const retained = await api.reviewOperations(ctx, service.jobId, service.systemKey);
    try { await api.replayReviewOperation(ctx, retained[0]); } catch(e: any) { failures.push(e.message); }
    return failures;
  }, f.s);
  expect(refusals).toEqual(["FORBIDDEN", "REPAIR_IDENTITY_CHANGED", "FORBIDDEN"]); expect(f.calls).toHaveLength(0);
  await page.getByRole("button", { name: "Refresh Review Authority" }).click(); await ready(page);
  await page.getByText("Saved Review Requests (1)", { exact: true }).click(); await expect(page.getByRole("button", { name: "Replay Exact Request" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Assign Repair Work" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit Locally" })).toHaveCount(0);
});
test("C2 source response-loss replay retains reason / UUID and completed correction history", async ({ page }) => {
  const f = await boot(page, "supervisor"); f.s.findings[0].eligibility = "needs_review"; f.s.findings[0].sourceRevision = "c".repeat(64);
  await page.getByRole("button", { name: "Refresh Review Authority" }).click(); await ready(page); f.controls.lose("source");
  await part(page).getByLabel("Source Review Reason (Required)").fill("Reviewed administrative correction; continue repair");
  await part(page).getByRole("button", { name: "Continue Repair" }).click(); await expect(page.getByRole("alert")).toBeVisible();
  await page.reload(); await ready(page); await page.getByText("Saved Review Requests (1)", { exact: true }).click(); await page.getByRole("button", { name: "Replay Exact Request" }).click(); await ready(page);
  expect(f.calls[1].body).toEqual(f.calls[0].body); expect(f.s.findings[0].reviews).toHaveLength(1);
  await part(page).getByText("Source Eligibility History (1)", { exact: true }).click(); await expect(part(page)).toContainText("Reviewed administrative correction; continue repair");
});
test("C2 request persistence failure prevents API writes and mismatched HTTP 200 never confirms", async ({ page }) => {
  const f = await boot(page);
  await page.evaluate(() => { const table = (window as any).c2.db.localDatabase.referenceData, add = table.add.bind(table); table.add = (...args: any[]) => { table.add = add; throw new Error("INJECTED_REQUEST_SAVE_FAILURE"); }; });
  await currentCycle(page).getByRole("button", { name: "Approve Part" }).click(); await expect(page.getByRole("alert")).toContainText("INJECTED_REQUEST_SAVE_FAILURE");
  expect(f.calls).toHaveLength(0); expect(await saved(page)).toHaveLength(0);
  await page.getByRole("button", { name: "Refresh Review Authority" }).click(); await ready(page);
  await page.route("**/decisions", async r => { const b = r.request().postDataJSON(); await r.fulfill({ json: { requestId: id(), requestFingerprint: "a".repeat(64), decisionId: id(), clientUuid: f.s.findings[0].history[1].client_uuid, sequence: 1, decision: b.decision } }); });
  await currentCycle(page).getByRole("button", { name: "Approve Part" }).click(); await expect(page.getByRole("alert")).toContainText("INVALID_REPAIR_RECEIPT");
  expect((await saved(page))[0].payload.receipt).toBeUndefined(); expect(f.s.findings[0].history[1].review_state).toBe("awaiting_approval");
});
test("C2 changed persisted caller during late receipt and superseded navigation cannot confirm", async ({ page }) => {
  const f = await boot(page);
  let release!: () => void, arrived!: () => void; const held = new Promise<void>(r => release = r), started = new Promise<void>(r => arrived = r);
  await page.route("**/decisions", async r => { const b = r.request().postDataJSON(); arrived(); await held;
    await r.fulfill({ json: { requestId: b.requestId, requestFingerprint: fingerprint({ actorId: 81, repairUuid: f.s.findings[0].history[1].client_uuid, ...b }), decisionId: id(), clientUuid: f.s.findings[0].history[1].client_uuid, sequence: 1, decision: b.decision } }); });
  await currentCycle(page).getByRole("button", { name: "Approve Part" }).click(); await started;
  await page.evaluate(async () => { const db = (window as any).c2.db.localDatabase, entry = (await db.referenceData.where("key").startsWith("repair-review:request:").toArray())[0]; await db.referenceData.update(entry.key, { payload: { ...entry.payload, changed: true } }); });
  release(); await expect(page.getByRole("alert")).toContainText("REPAIR_REQUEST_CHANGED"); expect((await saved(page))[0].payload.receipt).toBeUndefined();
});
test("C2 late service refresh cannot repopulate a different route", async ({ page }) => {
  const f = await boot(page);
  let release!: () => void, arrived!: () => void; const held = new Promise<void>(r => release = r), started = new Promise<void>(r => arrived = r);
  await page.route(`**/api/repairs/services/${f.s.jobId}/${f.s.systemKey}`, async r => { arrived(); await held; await r.fulfill({ json: f.s }); });
  await page.getByRole("button", { name: "Refresh Review Authority" }).click(); await started; await page.getByRole("link", { name: "All Repair Services" }).click();
  release(); await expect(page.getByRole("link", { name: "Review CO2 Repairs" })).toBeVisible(); await expect(part(page)).toHaveCount(0);
});
test("C2 authority failures/offline/late actor and workspace responses preserve technician local work", async ({ page, context }) => {
  const f = await boot(page); const local = await page.evaluate(async () => { const db = (window as any).c2.db.localDatabase, id = crypto.randomUUID();
    await db.repairRecords.put({ clientUuid: id, findingId: crypto.randomUUID(), workOrderId: crypto.randomUUID(), jobId: crypto.randomUUID(), systemKey: "co2_fire_extinguisher", actorId: 81, cycleSequence: 1, predecessorUuid: null, remark: "Retained technician draft", performedAt: "2026-10-13T04:00:00.123Z", localCreatedAt: "2026-10-13T04:00:00.123Z", localUpdatedAt: "2026-10-13T04:00:00.123Z", syncStatus: "Draft", reviewState: "unsubmitted" });
    const photoId = crypto.randomUUID(); await db.repairAttachments.put({ photoUuid: photoId, repairUuid: id, blob: new Blob(["retained bytes"]), captureSource: "gallery", capturedAt: "2026-10-13T04:00:00.123Z", sourceSha256: "f".repeat(64), sizeBytes: 14, width: 1, height: 1, syncStatus: "Draft" });
    await db.syncOutbox.put({ operationId: id, entityType: "repairRecord", entityId: id, action: "create", payload: { retained: true }, createdAt: "2026-10-13T04:00:00.123Z", attempts: 0, status: "Failed" }); return { id, photoId }; });
  await context.setOffline(true); await expect(part(page)).toHaveCount(0); await context.setOffline(false); await page.getByRole("button", { name: "Refresh Review Authority" }).click(); await ready(page);
  let resolve!: () => void; const barrier = new Promise<void>(r => resolve = r); let arrived!: () => void; const started = new Promise<void>(r => arrived = r);
  await page.route("**/decisions", async r => { arrived(); await barrier; const b = r.request().postDataJSON(); await r.fulfill({ json: { requestId: b.requestId, requestFingerprint: fingerprint({ actorId: 81, repairUuid: f.s.findings[0].history[1].client_uuid, ...b }), decisionId: id(), clientUuid: f.s.findings[0].history[1].client_uuid, sequence: 1, decision: b.decision } }); });
  await currentCycle(page).getByRole("button", { name: "Approve Part" }).click(); await started;
  await page.evaluate(async () => { const d = (window as any).c2.db; await d.activateUserWorkspace(82); await d.deviceDatabase.authState.update("device-auth", { userId: 82 }); }); resolve();
  await expect(page.getByRole("heading", { name: "Repair Review", exact: true })).toHaveCount(0);
  const kept = await page.evaluate(async ({ id, photoId }) => { const d = (window as any).c2.db; await d.activateUserWorkspace(81); return { record: await d.localDatabase.repairRecords.get(id), bytes: await (await d.localDatabase.repairAttachments.get(photoId)).blob.text(), operation: await d.localDatabase.syncOutbox.get(id), requests: await d.localDatabase.referenceData.where("key").startsWith("repair-review:request:").toArray() }; }, local);
  expect(kept.record.remark).toBe("Retained technician draft"); expect(kept.bytes).toBe("retained bytes"); expect(kept.operation.payload).toEqual({ retained: true }); expect(kept.requests[0].payload.receipt).toBeUndefined();
});

test("Self-service: Manager Review lists every technician work order for a service and can still revoke one without touching the other", async ({ page }) => {
  const s = fixture(), selfOrder = id();
  s.workOrders.push({ workOrderId: selfOrder, jobId: s.jobId, systemKey: s.systemKey, assignedToUserId: 72, revision: 1, status: "active" });
  const f = await boot(page, "admin", true, s);
  const first = page.getByRole("region", { name: `Work Order ${s.workOrders[0].workOrderId}`, exact: true });
  const second = page.getByRole("region", { name: `Work Order ${selfOrder}`, exact: true });
  await expect(first).toBeVisible(); await expect(second).toBeVisible();
  page.once("dialog", d => d.accept());
  await second.getByRole("button", { name: "Revoke Assignment" }).click(); await ready(page);
  expect(f.s.workOrders.find(w => w.workOrderId === selfOrder)!.status).toBe("revoked");
  expect(f.s.workOrders[0].status).toBe("active"); expect(f.s.workOrders[0].assignedToUserId).toBe(71);
  await expect(first).toBeVisible();
});
