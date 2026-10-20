import { expect, test, type Page } from "@playwright/test";

const id = "10000000-0000-4000-8000-000000000001";
const uuid = "20000000-0000-4000-8000-000000000001";
function proposal(over: Record<string, unknown> = {}) {
  return { id, customerId: uuid, customerDisplayName: "Customer North", siteId: uuid, jobId: null, jobReference: null,
    proposedDisplayName: "Technician's new site", proposedAddress: "22 Long Road, North District",
    submittedByUserId: 2, submittedBy: "Field Technician", submittedAt: "2026-10-19T00:00:00.000Z", status: "pending", decision: null, ...over };
}
type Options = { role?: string; failOnce?: boolean; refusal?: { code: string; message: string; status: number }; postMode?: "pending" | "wrong-id" | "wrong-request"; refreshFailure?: boolean; refreshPending?: boolean; decisionResponseGate?: Promise<void> };
async function api(page: Page, options: Options = {}, items = [proposal()]) {
  const writes: Record<string, unknown>[] = [], reads: string[] = [];
  let detailReads = 0;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ json: body, status });
    if (path === "/api/auth/me") return json({ user: { id: 4, username: "reviewer", role: options.role ?? "supervisor" } });
    if (path === "/api/manager/site-proposals") { reads.push("list"); return json({ proposals: items }); }
    if (path === `/api/manager/site-proposals/${id}/decision`) {
      const body = route.request().postDataJSON(); writes.push(body);
      await options.decisionResponseGate;
      if (options.refusal) return json({ error: options.refusal.code, message: options.refusal.message }, options.refusal.status);
      if (options.postMode === "pending") return json({ proposal: items[0] });
      Object.assign(items[0], { status: body.decision, decision: { id: uuid, decision: body.decision, note: body.note ?? null,
        decidedBy: "Reviewer", decidedByRole: options.role ?? "supervisor", decidedAt: "2026-10-20T01:00:00.000Z", sequence: 1, requestId: body.requestId } });
      if (options.failOnce && writes.length === 1) return route.abort("failed"); // committed, response lost
      const result = structuredClone(items[0]);
      if (options.postMode === "wrong-id") result.id = uuid;
      if (options.postMode === "wrong-request") (result.decision as Record<string, unknown>).requestId = uuid;
      return json({ proposal: result }, 201);
    }
    if (path === `/api/manager/site-proposals/${id}`) {
      detailReads++; reads.push("detail");
      if (options.refreshFailure && detailReads > 1) return json({ error: "UNAVAILABLE" }, 503);
      if (options.refreshPending && detailReads > 1) return json({ proposal: proposal() });
      return json({ proposal: items.find(item => item.id === id) });
    }
    if (path === "/api/manager/location-proposals") return json({ proposals: [], counts: { pending: 0, approved: 0, rejected: 0, withdrawn: 0 } });
    if (path === "/api/manager/dashboard/clients") return json({ totalClients: 0 });
    if (path === "/api/manager/dashboard/inspections-per-day") return json({ days: [] });
    if (path === "/api/manager/dashboard/inspection-status") return json({ passed: 0, notOk: 0, na: 0 });
    if (path === "/api/manager/service-visits") return json({ serviceVisits: [], totalCount: 0, nextCursor: null });
    if (path === "/api/manager/customers/compliance-reminders") return json({ overdue: [], dueSoon: [], dueSoonWindowDays: 7 });
    return json({});
  });
  return { writes, reads };
}
async function enter(page: Page, role = "supervisor", hash = "#/manager-site-proposals") {
  await page.goto(`/tests/manager-dashboard-navigation.html${hash}`);
  await page.getByRole("button", { name: role === "admin" ? /^Manager Monitor/ : role === "inspector" ? /^Technician/ : /^Admin/ }).click();
}
const review = (page: Page) => page.getByRole("region", { name: "Site request review", exact: true });
async function open(page: Page) {
  await page.getByRole("button", { name: /Customer North/ }).click();
  await expect(review(page).getByRole("heading", { name: "Customer North" })).toBeVisible();
}
test.beforeEach(({ page }) => { page.on("dialog", dialog => dialog.accept()); });

for (const role of ["admin", "supervisor"]) {
  test(`${role} Approvals hub badge, navigation and authoritative approval`, async ({ page }) => {
    const { writes, reads } = await api(page, { role }); await enter(page, role, "#/manager");
    await page.locator(".manager-dashboard-card").filter({ hasText: "Approvals" }).click();
    const card = page.locator(".manager-hub-card").filter({ hasText: "Site requests" });
    await expect(card.getByLabel("1 pending", { exact: true })).toBeVisible(); await card.click(); await open(page);
    await page.getByRole("button", { name: "Add to customer's sites", exact: true }).click();
    await expect(page.getByText("Server confirmed: Approved.", { exact: true })).toBeVisible();
    await expect(review(page)).toContainText("Approved by Reviewer");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({ requestId: expect.stringMatching(/^[0-9a-f-]{36}$/), decision: "approved" });
    expect(reads.filter(x => x === "detail")).toHaveLength(2);
    await page.getByRole("button", { name: "Back to requests" }).click();
    await expect(page.getByRole("heading", { name: "Requests · Pending: 0" })).toBeVisible();
    await page.reload(); await page.getByRole("tab", { name: "Approved (1)", exact: true }).click(); await open(page); await expect(review(page)).toContainText("Approved by Reviewer");
  });
}
for (const decision of ["approved", "rejected"] as const) {
  test(`rapid double-click sends only one ${decision} decision while the response is delayed`, async ({ page }) => {
    let releaseResponse!: () => void;
    const decisionResponseGate = new Promise<void>(resolve => { releaseResponse = resolve; });
    const { writes, reads } = await api(page, { decisionResponseGate });
    await enter(page); await open(page);
    await page.getByRole("textbox", { name: /Decision note/ }).fill("Reviewed submitted site");
    const action = page.getByRole("button", { name: decision === "approved" ? "Add to customer's sites" : "Do not add", exact: true });
    try {
      await action.dblclick();
      await expect.poll(() => writes.length).toBe(1);
      await expect(review(page)).toContainText("Verifying decision with the server…");
      await expect(page.getByText(/Server confirmed:/)).toHaveCount(0);
      await expect(review(page).getByRole("button", { name: "Add to customer's sites", exact: true })).toHaveCount(0);
      await expect(review(page).getByRole("button", { name: "Do not add", exact: true })).toHaveCount(0);
      expect(reads.filter(read => read === "detail")).toHaveLength(1);
    } finally {
      releaseResponse();
    }
    await expect(page.getByText(`Server confirmed: ${decision === "approved" ? "Approved" : "Rejected"}.`, { exact: true })).toBeVisible();
    expect(writes).toEqual([{ requestId: expect.stringMatching(/^[0-9a-f-]{36}$/), decision, note: "Reviewed submitted site" }]);
    expect(reads.filter(read => read === "detail")).toHaveLength(2);
  });
}

test("lost approval response retries the exact request ID and note", async ({ page }) => {
  const { writes } = await api(page, { failOnce: true }); await enter(page); await open(page);
  await page.getByRole("textbox", { name: /Decision note/ }).fill("  Keep submitted text  ");
  await page.getByRole("button", { name: "Add to customer's sites", exact: true }).click();
  await page.getByRole("button", { name: "Retry decision" }).click();
  await expect(page.getByText("Server confirmed: Approved.", { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2); expect(writes[0]).toEqual(writes[1]);
  expect(writes[0].note).toBe("Keep submitted text");
});
test("reject validates note locally then sends trimmed reason", async ({ page }) => {
  const { writes } = await api(page); await enter(page); await open(page);
  const note = page.getByRole("textbox", { name: /Decision note/ });
  await expect(note).toHaveAttribute("maxlength", "500");
  for (const value of ["", "  ", "ab"]) {
    await note.fill(value); await page.getByRole("button", { name: "Do not add", exact: true }).click();
    await expect(note).toBeFocused(); await expect(note).toHaveAttribute("aria-invalid", "true");
    expect(writes).toHaveLength(0);
  }
  await note.fill("  Duplicate site  "); await page.getByRole("button", { name: "Do not add", exact: true }).click();
  await expect(page.getByText("Server confirmed: Rejected.", { exact: true })).toBeVisible();
  await expect(review(page)).toContainText("Duplicate site");
  expect(writes[0]).toEqual({ requestId: expect.any(String), decision: "rejected", note: "Duplicate site" });
});
for (const refusal of [
  { code: "SITE_PROPOSAL_ALREADY_DECIDED", message: "This site proposal has already been decided.", status: 409 },
  { code: "SITE_NAME_CONFLICT", message: "An active site already uses this name. Reject this proposal instead.", status: 409 },
  { code: "SITE_PROPOSAL_NOT_FOUND", message: "Site proposal was not found.", status: 404 }
]) {
  test(`server refusal: ${refusal.code}`, async ({ page }) => {
    await api(page, { refusal }); await enter(page); await open(page);
    await page.getByRole("button", { name: "Add to customer's sites", exact: true }).click();
    await expect(review(page).getByRole("alert")).toContainText(refusal.message);
    await expect(page.getByText(/Server confirmed:/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reload proposal" })).toBeVisible();
  });
}
for (const postMode of ["pending", "wrong-id", "wrong-request"] as const) {
  test(`HTTP success with ${postMode} cannot confirm decision`, async ({ page }) => {
    await api(page, { postMode }); await enter(page); await open(page);
    await page.getByRole("button", { name: "Add to customer's sites", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry decision" })).toBeVisible();
    await expect(page.getByText(/Server confirmed:/)).toHaveCount(0);
    await expect(review(page).getByRole("button", { name: "Do not add", exact: true })).toHaveCount(0);
  });
}
test("failed authoritative refresh hides decision and permits exact replay", async ({ page }) => {
  const { writes } = await api(page, { refreshFailure: true }); await enter(page); await open(page);
  await page.getByRole("button", { name: "Add to customer's sites", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry decision" })).toBeVisible();
  await expect(review(page).getByText(/Approved by/)).toHaveCount(0);
  await page.getByRole("button", { name: "Retry decision" }).click();
  await expect.poll(() => writes.length).toBe(2); expect(writes[0]).toEqual(writes[1]);
  await expect(page.getByText(/Server confirmed:/)).toHaveCount(0);
});
test("inspector deep link cannot render page or call review API", async ({ page }) => {
  const { reads } = await api(page, { role: "inspector" }); await enter(page, "inspector");
  await expect(page.getByRole("heading", { name: "Site Requests", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Site Requests", exact: true })).toHaveCount(0);
  expect(reads).toEqual([]);
});
test("fresh pending detail cannot confirm a successful decision response", async ({ page }) => {
  await api(page, { refreshPending: true }); await enter(page); await open(page);
  await page.getByRole("button", { name: "Add to customer's sites", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry decision" })).toBeVisible();
  await expect(page.getByText(/Server confirmed:/)).toHaveCount(0);
});
test("optional approval note has the same minimum and accepts the 500 character bound", async ({ page }) => {
  const { writes } = await api(page); await enter(page); await open(page);
  const note = page.getByRole("textbox", { name: /Decision note/ });
  await note.fill("ab"); await page.getByRole("button", { name: "Add to customer's sites", exact: true }).click();
  await expect(note).toHaveAttribute("aria-invalid", "true"); expect(writes).toHaveLength(0);
  await note.fill("a".repeat(500)); await page.getByRole("button", { name: "Add to customer's sites", exact: true }).click();
  await expect(page.getByText("Server confirmed: Approved.", { exact: true })).toBeVisible();
  expect(writes[0].note).toBe("a".repeat(500));
});
test("review authorization failure removes decision controls", async ({ page }) => {
  await api(page); await enter(page); await open(page);
  await page.route(`**/api/manager/site-proposals/${id}/decision`, route => route.fulfill({ status: 403, json: { error: "FORBIDDEN" } }));
  await page.getByRole("button", { name: "Add to customer's sites", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Site Requests", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Do not add", exact: true })).toHaveCount(0);
});
for (const mode of ["empty", "unavailable", "malformed", "unknown-status", "bad-time", "bad-decision"] as const) {
  test(`list ${mode} state`, async ({ page }) => {
    await api(page);
    const bad = mode === "unknown-status" ? proposal({ status: "withdrawn" }) : mode === "bad-time" ? proposal({ submittedAt: "2026-02-30T00:00:00.000Z" }) : mode === "bad-decision" ? proposal({ status: "approved" }) : { ...proposal(), unexpected: true };
    await page.route("**/api/manager/site-proposals", route => route.fulfill({ status: mode === "unavailable" ? 503 : 200, json: mode === "empty" ? { proposals: [] } : mode === "unavailable" ? {} : { proposals: [bad] } }));
    await enter(page);
    if (mode === "empty") await expect(page.getByText("No pending site requests.", { exact: true })).toBeVisible();
    else { await expect(page.getByRole("button", { name: "Retry list" })).toBeVisible(); await expect(page.getByRole("button", { name: /Customer North/ })).toHaveCount(0); }
  });
}
test("detail not found leaves no decision controls", async ({ page }) => {
  await api(page);
  await page.route(`**/api/manager/site-proposals/${id}`, route => route.fulfill({ status: 404, json: { error: "SITE_PROPOSAL_NOT_FOUND", message: "Site proposal was not found." } }));
  await enter(page); await page.getByRole("button", { name: /Customer North/ }).click();
  await expect(review(page).getByRole("alert")).toContainText("Site proposal was not found.");
  await expect(page.getByRole("button", { name: "Do not add", exact: true })).toHaveCount(0);
});
for (const size of [{ width: 360, height: 800 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`list fields, pending first, layout and focus at ${size.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    const approved = proposal({ id: uuid, status: "approved", decision: { id: uuid, decision: "approved", note: null, decidedBy: "Admin", decidedByRole: "admin", decidedAt: "2026-10-20T00:00:00.000Z", sequence: 1, requestId: uuid } });
    await api(page, {}, [approved, proposal()]); await enter(page);
    const cards = page.locator(".manager-site-proposals .proposal-card");
    await expect(cards.first()).toContainText("Pending"); await expect(cards.first()).toContainText("Customer North");
    await expect(cards.first()).toContainText("Technician's new site"); await expect(cards.first()).toContainText("22 Long Road");
    await expect(cards.first()).toContainText("Submitted by Field Technician"); await expect(cards.first()).toContainText("Submitted at");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const customerFilter = page.getByRole("combobox", { name: "Customer", exact: true });
    await customerFilter.focus(); await page.keyboard.press("Tab");
    const searchFilter = page.getByRole("searchbox", { name: "Search requests", exact: true });
    await expect(searchFilter).toBeFocused();
    expect(await searchFilter.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await page.screenshot({ path: testInfo.outputPath(`site-inbox-${size.width}.png`), fullPage: true });
    await cards.first().click(); await expect(review(page).getByRole("heading", { name: "Customer North" })).toBeFocused();
    await expect(page.getByText("Rejecting a request does not change the technician's visit.", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const boxes = await page.locator(".manager-site-proposals button:visible").evaluateAll(elements => elements.map(element => { const r = element.getBoundingClientRect(); return [r.width, r.height]; }));
    for (const [width, height] of boxes) { expect(width).toBeGreaterThanOrEqual(44); expect(height).toBeGreaterThanOrEqual(44); }
    const add = page.getByRole("button", { name: "Add to customer's sites", exact: true });
    await add.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
    await expect(add).toBeFocused();
    expect(await add.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
    const noteBox = await page.getByRole("textbox", { name: /Decision note/ }).boundingBox();
    const actionBox = await add.boundingBox();
    expect(actionBox!.y).toBeGreaterThanOrEqual(noteBox!.y + noteBox!.height);
    await page.screenshot({ path: testInfo.outputPath(`site-review-${size.width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Back to requests" }).click();
    await expect(page.getByRole("heading", { name: /Requests · Pending/ })).toBeFocused();
  });
}

function decided(status: "approved" | "rejected", customerId = uuid) {
  return proposal({ id: status === "approved" ? uuid : "30000000-0000-4000-8000-000000000001", customerId,
    customerDisplayName: status === "approved" ? "Customer North" : "Rejected Customer", status,
    decision: { id: uuid, decision: status, note: "Reviewed request", decidedBy: "Reviewer", decidedByRole: "supervisor", decidedAt: "2026-10-20T00:00:00.000Z", sequence: 1, requestId: uuid } });
}
test("site tabs, submitted search, immediate customer AND filter, resets and detail persistence", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const sameNameId = "40000000-0000-4000-8000-000000000001";
  const { reads } = await api(page, {}, [proposal({ jobId: uuid, jobReference: "SV-VISIT-77" }),
    proposal({ id: sameNameId, customerId: sameNameId, proposedDisplayName: "Second site" }),
    decided("approved"), decided("rejected")]);
  await enter(page);
  const cards = page.locator(".manager-site-proposals .proposal-card");
  await expect(page.getByRole("tab", { name: "Pending (2)" })).toHaveAttribute("aria-selected", "true");
  await expect(cards).toHaveCount(2);
  const customer = page.getByLabel("Customer", { exact: true });
  await expect(customer.locator("option")).toHaveText(["All customers", "Customer North", "Customer North"]);
  const search = page.getByLabel("Search requests", { exact: true });
  await expect(search).toHaveAttribute("maxlength", "200");
  await search.fill("  sv-visit-77  "); await expect(cards).toHaveCount(2);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(cards).toHaveCount(1); await expect(cards).toContainText("SV-VISIT-77");
  await expect(page.getByRole("status")).toHaveText("Showing 1 of 2 requests");
  await expect(page.getByRole("tab", { name: "Pending (2)" })).toBeVisible();
  await customer.selectOption(sameNameId); await expect(cards).toHaveCount(0);
  await expect(page.getByText("No requests match this filter.")).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(customer).toHaveValue(sameNameId); await expect(search).toHaveValue(""); await expect(cards).toHaveCount(1);
  await page.getByRole("tab", { name: "Approved (1)" }).click();
  await expect(customer).toHaveValue("");
  await expect(page.getByRole("status")).toContainText("Customer filter cleared: no approved requests for Customer North.");
  await customer.selectOption(uuid); await search.fill("Customer"); await search.press("Enter");
  await page.getByRole("tab", { name: "Pending (2)" }).click();
  await expect(customer).toHaveValue(uuid); await expect(search).toHaveValue("Customer"); await expect(cards).toHaveCount(1);
  await open(page); await search.fill("no match"); await search.press("Enter");
  await expect(cards).toHaveCount(0); await expect(review(page).getByRole("heading", { name: "Customer North" })).toBeVisible();
  await page.getByRole("button", { name: "Back to requests" }).click();
  await expect(search).toHaveValue("no match");
  await page.getByRole("tab", { name: "Pending (2)" }).focus(); await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Rejected (1)" })).toBeFocused();
  await page.getByRole("button", { name: "Clear", exact: true }).click(); await expect(cards).toContainText("Rejected Customer");
  await page.keyboard.press("Tab");
  const rejected = page.getByRole("tab", { name: "Rejected (1)" });
  await rejected.focus(); await rejected.press("Home");
  await expect(page.getByRole("tab", { name: "Pending (2)" })).toBeFocused();
  await page.keyboard.press("ArrowRight"); await expect(page.getByRole("tab", { name: "Approved (1)" })).toBeFocused();
  await page.keyboard.press("ArrowLeft"); await expect(page.getByRole("tab", { name: "Pending (2)" })).toBeFocused();
  expect(reads.filter(read => read === "list")).toHaveLength(1);
});

test("site tab changes use the unsaved-note leave confirmation", async ({ page }) => {
  await api(page); await enter(page); await open(page);
  await page.getByLabel(/Decision note/).fill("Unsaved review");
  page.removeAllListeners("dialog");
  page.once("dialog", dialog => { expect(dialog.message()).toBe("Discard your unsaved review note?"); void dialog.dismiss(); });
  await page.getByRole("tab", { name: "Approved (0)" }).click();
  await expect(page.getByRole("tab", { name: "Pending (1)" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel(/Decision note/)).toHaveValue("Unsaved review");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("tab", { name: "Approved (0)" }).click();
  await expect(page.getByText("No approved site requests.")).toBeVisible();
});

for (const width of [360, 1280]) {
  test(`site tab focus survives an open review and cancelled navigation at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const { writes } = await api(page); await enter(page); await open(page);
    const pending = page.getByRole("tab", { name: "Pending (1)", exact: true });
    const approved = page.getByRole("tab", { name: "Approved (0)", exact: true });
    const rejected = page.getByRole("tab", { name: "Rejected (0)", exact: true });
    const note = page.getByLabel(/Decision note/);
    await note.fill("Unsaved review");
    page.removeAllListeners("dialog");
    page.once("dialog", dialog => { expect(dialog.message()).toBe("Discard your unsaved review note?"); void dialog.dismiss(); });
    await pending.focus(); await page.keyboard.press("ArrowRight");
    await expect(pending).toBeFocused();
    await expect(pending).toHaveAttribute("aria-selected", "true");
    await expect(pending).toHaveAttribute("tabindex", "0");
    await expect(approved).toHaveAttribute("tabindex", "-1");
    await expect(note).toHaveValue("Unsaved review");

    page.once("dialog", dialog => dialog.accept());
    await page.keyboard.press("ArrowRight");
    await expect(approved).toBeFocused();
    await expect(approved).toHaveAttribute("aria-selected", "true");
    await expect(approved).toHaveAttribute("tabindex", "0");
    await expect(note).toHaveCount(0);
    await page.keyboard.press("End"); await expect(rejected).toBeFocused();
    await page.keyboard.press("Home"); await expect(pending).toBeFocused();
    await page.keyboard.press("ArrowLeft"); await expect(rejected).toBeFocused();
    await page.keyboard.press("ArrowRight"); await expect(pending).toBeFocused();

    // A review without an unsaved note must also leave focus on the new tab.
    await open(page); await pending.focus(); await page.keyboard.press("ArrowRight");
    await expect(approved).toBeFocused();
    await expect(approved).toHaveAttribute("aria-selected", "true");
    expect(writes).toHaveLength(0);
  });
}
