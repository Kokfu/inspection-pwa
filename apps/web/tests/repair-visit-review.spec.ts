import { expect, test, type Page, type Route } from "@playwright/test";

/* Mocked-API browser tests for the Admin/Manager repair visit review (step 4B). Run through Vite. */

const VISIT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const SITE = "22222222-2222-4222-8222-222222222222";
const PREV = "33333333-3333-4333-8333-333333333333";
const hex = (c: string) => c.repeat(64);
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");

type Mock = {
  status: "draft" | "awaiting_approval" | "returned" | "approved";
  revision: number;
  failVisitGet: boolean;
  approveStatus: number;
  requests: Array<{ method: string; path: string; body: unknown }>;
};

function detail(mock: Mock) {
  const approved = mock.status === "approved";
  const visit = {
    clientUuid: VISIT, visitNumber: "RV-20261019-3", customerId: CUSTOMER, siteId: SITE, createdByUserId: 7,
    configurationRevisionId: "44444444-4444-4444-8444-444444444444", serviceCallNumber: "SC-1042", arrivalTime: "10:05",
    visitDate: "2026-10-19", deviceCreatedAt: "2026-10-19T02:05:00.000Z", previousVisit: { kind: "service", visitId: PREV },
    status: mock.status, revision: mock.revision, reportNumber: approved ? "MFE/RR/2026/0001" : null,
    approvedByUserId: approved ? 3 : null, approvedAt: approved ? "2026-10-19T04:00:00.000Z" : null,
    createdAt: "2026-10-19T02:05:00.000Z", updatedAt: "2026-10-19T03:00:00.000Z"
  };
  const identity = (fieldKey: string) => ({ systemKey: "automatic_sprinkler", rowUuid: null, locationId: "55555555-5555-4555-8555-555555555555", zoneId: null, sectionKey: "water_tank", fieldKey });
  const item = (n: number, withPhoto: boolean, outcome: "done_repair" | "not_done") => ({
    clientUuid: `66666666-6666-4666-8666-66666666666${n}`, visitUuid: VISIT, identity: identity(`field_${n}`),
    systemLabel: "Automatic Sprinkler", unitLabel: "Pump Room", sectionLabel: "Water Tank", fieldLabel: n === 1 ? "S.A.J Main Water Supply" : "Float Valve",
    before: {
      previousVisit: { kind: "service", visitId: PREV }, visitNumber: "SV-20261011-94", visitDate: "2026-10-11", result: "not_good",
      remark: "Valve leaking.", photo: withPhoto ? { photoUuid: `77777777-7777-4777-8777-77777777777${n}`, sourceSha256: hex("a"), storedSha256: hex("b"), sizeBytes: 1000, width: 40, height: 30 } : null
    },
    outcome, remark: n === 1 ? "Replaced the gate valve." : "Could not reach the valve.", photoUuid: `88888888-8888-4888-8888-88888888888${n}`, sortOrder: n
  });
  const events: unknown[] = [{ clientUuid: "99999999-9999-4999-8999-999999999991", visitUuid: VISIT, revision: 1, type: "submitted", actorUserId: 7, reason: null, occurredAt: "2026-10-19T03:00:00.000Z", requestFingerprint: hex("c") }];
  if (mock.status === "returned") events.push({ clientUuid: "99999999-9999-4999-8999-999999999992", visitUuid: VISIT, revision: 1, type: "returned", actorUserId: 3, reason: "Photo is blurry.", occurredAt: "2026-10-19T03:30:00.000Z", requestFingerprint: hex("d") });
  return { visit, items: [item(1, true, "done_repair"), item(2, false, "not_done")], events };
}

async function install(page: Page, initial: Partial<Mock> = {}) {
  const mock: Mock = { status: "awaiting_approval", revision: 1, failVisitGet: false, approveStatus: 200, requests: [], ...initial };
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    let body: unknown = null;
    try { body = request.postDataJSON(); } catch { body = null; }
    if (!path.endsWith(".jpg")) mock.requests.push({ method, path, body });
    const json = (status: number, value: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path === "/api/manager/customers") return json(200, { customers: [{ customer: { id: CUSTOMER, code: "C1", displayName: "Sample Customer Sdn Bhd" }, sites: [{ id: SITE, code: "S1", displayName: "Head Office" }], supportedSystems: [] }] });
    if (path === "/api/manager/technicians") return json(200, { technicians: [{ id: 7, username: "tech", displayName: "Tech Demo", role: "inspector", isActive: true, createdAt: "2026-01-01T00:00:00.000Z", supervisorIds: [] }] });
    if (path === "/api/repair-visits" && method === "GET") return json(200, { visits: [detail(mock).visit, { ...detail(mock).visit, clientUuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", visitNumber: "RV-20261019-4", status: "draft" }] });
    if (path === `/api/repair-visits/${VISIT}` && method === "GET") return mock.failVisitGet ? json(500, { error: "BOOM" }) : json(200, detail(mock));
    if (path === `/api/repair-visits/${VISIT}/approve`) {
      if (mock.approveStatus !== 200) return json(mock.approveStatus, { error: "STALE_REVISION", message: "stale" });
      mock.status = "approved";
      return json(200, { operationUuid: (body as { operationUuid: string }).operationUuid, clientUuid: VISIT, revision: mock.revision, event: "approved", requestFingerprint: hex("e"), occurredAt: "2026-10-19T04:00:00.000Z", reportNumber: "MFE/RR/2026/0001" });
    }
    if (path === `/api/repair-visits/${VISIT}/return`) {
      mock.status = "returned";
      return json(200, { operationUuid: (body as { operationUuid: string }).operationUuid, clientUuid: VISIT, revision: mock.revision, event: "returned", requestFingerprint: hex("f"), occurredAt: "2026-10-19T03:30:00.000Z" });
    }
    if (path.endsWith("preview.pdf") || path.endsWith("report.pdf")) return route.fulfill({ status: 200, contentType: "application/pdf", body: PDF });
    if (path.endsWith("/content")) return route.fulfill({ status: 200, contentType: "image/jpeg", body: JPEG });
    return json(404, { error: "NOT_MOCKED" });
  });
  return mock;
}

const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
const open = (page: Page, query = "") => page.goto(`/tests/repair-visit-review.html?visit=${VISIT}${query}`);
const eventsLog = (page: Page) => page.locator("#events li").allTextContents();

for (const viewport of [{ name: "360", width: 360, height: 800 }, { name: "768", width: 768, height: 1024 }, { name: "1280", width: 1280, height: 800 }]) {
  test.describe(`repair visit review @${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("header, per-field Before/After and layout", async ({ page }) => {
      await install(page);
      await open(page);
      await expect(page.getByRole("heading", { level: 2, name: "Repair visit RV-20261019-3" })).toBeFocused();
      const facts = page.locator(".rv-facts");
      await expect(facts).toContainText("Sample Customer Sdn Bhd");
      await expect(facts).toContainText("Head Office");
      await expect(facts).toContainText("Tech Demo");
      await expect(facts).toContainText("19 Oct 2026, arrived 10:05");
      await expect(facts).toContainText("SV-20261011-94, 11 Oct 2026");
      const cards = page.getByRole("list", { name: "Repair fields" }).getByRole("listitem");
      await expect(cards).toHaveCount(2);
      await expect(cards.first().getByRole("region", { name: /^Before/ })).toContainText("NOT GOOD");
      await expect(cards.first().getByRole("region", { name: /^After repair/ })).toContainText("DONE REPAIR");
      await expect(cards.first().getByRole("region", { name: /^After repair/ })).toContainText("Replaced the gate valve.");
      await expect(cards.nth(1).getByRole("region", { name: /^Before/ })).toContainText("No photo recorded at previous visit");
      await expect(cards.nth(1).getByRole("region", { name: /^After repair/ })).toContainText("NOT DONE");
      await expect(page.getByRole("img", { name: "Before photo, S.A.J Main Water Supply" })).toBeVisible();
      await expect(page.getByRole("img", { name: "After photo, S.A.J Main Water Supply" })).toBeVisible();
      // Before above After on a phone, side by side from 768 px.
      const before = await cards.first().getByRole("region", { name: /^Before/ }).boundingBox();
      const after = await cards.first().getByRole("region", { name: /^After repair/ }).boundingBox();
      if (viewport.width >= 768) expect(Math.abs(before!.y - after!.y)).toBeLessThan(2);
      else expect(after!.y).toBeGreaterThan(before!.y + before!.height - 2);
      await noOverflow(page);
      for (const button of await page.getByRole("button").all()) {
        const box = await button.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(43.5);
      }
    });

    test("approve is confirmed, sends the exact revision and locks the visit", async ({ page }) => {
      const mock = await install(page);
      await open(page);
      await page.getByRole("button", { name: "Approve", exact: true }).click();
      const confirm = page.getByRole("button", { name: "Confirm approval" });
      await expect(confirm).toBeFocused();
      expect(mock.requests.some(r => r.path.endsWith("/approve"))).toBe(false);
      await confirm.click();
      await expect(page.getByText("Approved as MFE/RR/2026/0001", { exact: false })).toBeVisible();
      const approve = mock.requests.find(r => r.path.endsWith("/approve"))!;
      expect(approve.body).toMatchObject({ expectedRevision: 1 });
      expect(Object.keys(approve.body as object).sort()).toEqual(["expectedRevision", "operationUuid"]);
      await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Return to technician" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Download final PDF" })).toBeVisible();
      await expect.poll(() => eventsLog(page)).toEqual(["decided:approved"]);
      await noOverflow(page);
    });

    test("return needs a reason: error is announced and focused, nothing is sent", async ({ page }) => {
      const mock = await install(page);
      await open(page);
      await page.getByRole("button", { name: "Return to technician" }).click();
      const reason = page.getByRole("textbox", { name: /Reason for returning/ });
      await expect(page.getByRole("alert").filter({ hasText: "Enter the reason" })).toBeVisible();
      await expect(reason).toBeFocused();
      await expect(reason).toHaveAttribute("aria-invalid", "true");
      await page.getByRole("textbox", { name: /Reason for returning/ }).fill("   ");
      await page.getByRole("button", { name: "Return to technician" }).click();
      await expect(reason).toBeFocused();
      expect(mock.requests.some(r => r.path.endsWith("/return"))).toBe(false);
      await reason.fill("Photo is blurry.");
      await expect(page.getByText("Enter the reason")).toHaveCount(0);
      await page.getByRole("button", { name: "Return to technician" }).click();
      await expect(page.getByText("Returned to the technician.", { exact: true })).toBeVisible();
      await expect(page.getByText("Reason: Photo is blurry.")).toBeVisible();
      const sent = mock.requests.find(r => r.path.endsWith("/return"))!;
      expect(sent.body).toMatchObject({ expectedRevision: 1, reason: "Photo is blurry." });
      await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
      await expect.poll(() => eventsLog(page)).toEqual(["decided:returned"]);
      await noOverflow(page);
    });

    test("preview PDF before approval, final PDF only after", async ({ page }) => {
      const mock = await install(page);
      await open(page);
      await expect(page.getByRole("button", { name: "Download final PDF" })).toHaveCount(0);
      const popup = page.waitForEvent("popup");
      await page.getByRole("button", { name: "Preview PDF" }).click();
      await (await popup).close();
      await expect(page.getByText("marked PREVIEW — NOT APPROVED").first()).toBeVisible();
      expect(mock.requests.filter(r => r.path.endsWith("/revisions/1/preview.pdf"))).toHaveLength(1);
      expect(mock.requests.some(r => r.path.endsWith("report.pdf"))).toBe(false);

      await page.getByRole("button", { name: "Approve", exact: true }).click();
      await page.getByRole("button", { name: "Confirm approval" }).click();
      await expect(page.getByRole("button", { name: "Preview PDF" })).toHaveCount(0);
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download final PDF" }).click();
      expect((await download).suggestedFilename()).toBe("repair-visit-report.pdf");
      expect(mock.requests.filter(r => r.path.endsWith("/revisions/1/report.pdf"))).toHaveLength(1);
    });

    test("a failed refresh shows the failure and never old data as current", async ({ page }) => {
      const mock = await install(page, { failVisitGet: true });
      await open(page);
      const failure = page.getByRole("alert").filter({ hasText: "could not be refreshed" });
      await expect(failure).toBeFocused();
      await expect(page.getByRole("list", { name: "Repair fields" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Return to technician" })).toHaveCount(0);
      mock.failVisitGet = false;
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
      // Refresh after a decision fails: the screen must not keep showing "Awaiting approval".
      await page.getByRole("button", { name: "Approve", exact: true }).click();
      mock.failVisitGet = true;
      await page.getByRole("button", { name: "Confirm approval" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "could not be refreshed" })).toBeVisible();
      await expect(page.getByText("Awaiting approval")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
      await noOverflow(page);
    });

    test("a stale revision is refused with a focused message and no local change", async ({ page }) => {
      await install(page, { approveStatus: 409 });
      await open(page);
      await page.getByRole("button", { name: "Approve", exact: true }).click();
      await page.getByRole("button", { name: "Confirm approval" }).click();
      const alert = page.getByRole("alert").filter({ hasText: "changed since you opened it" });
      await expect(alert).toBeFocused();
      await expect(page.getByText("Awaiting approval")).toBeVisible();
      expect(await eventsLog(page)).toEqual([]);
    });

    test("technician role gets no access and makes no request", async ({ page }) => {
      const mock = await install(page);
      await open(page, "&role=inspector");
      const alert = page.getByRole("alert");
      await expect(alert).toContainText("only available to Admin and Manager");
      await expect(alert).toBeFocused();
      await expect(page.getByRole("button", { name: /Approve|Return to technician/ })).toHaveCount(0);
      expect(mock.requests).toEqual([]);
    });

    test("Services Done / awaiting-approval entries label Repair, hide drafts and show list failure", async ({ page }) => {
      const mock = await install(page);
      await page.goto("/tests/repair-visit-review.html?mode=entries");
      const customerList = page.getByRole("region", { name: "Repair visits", exact: true });
      await expect(customerList.getByRole("listitem")).toHaveCount(1);
      await expect(customerList.getByText("Repair", { exact: true }).first()).toBeVisible();
      await expect(customerList).toContainText("RV-20261019-3");
      await expect(customerList).toContainText("Awaiting approval");
      await expect(customerList).not.toContainText("RV-20261019-4");
      const awaiting = page.getByRole("region", { name: "Repair visits awaiting approval" });
      await expect(awaiting).toContainText("Sample Customer Sdn Bhd — Head Office");
      await awaiting.getByRole("button", { name: "Review repair visit RV-20261019-3" }).click();
      expect(await eventsLog(page)).toEqual([`open:${VISIT}`]);
      await noOverflow(page);

      await page.unroute("**/api/**");
      mock.failVisitGet = true;
      await page.route("**/api/repair-visits", route => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
      await page.reload();
      await expect(page.getByRole("alert").first()).toContainText("could not be refreshed");
      await expect(page.getByRole("button", { name: "Review repair visit RV-20261019-3" })).toHaveCount(0);

      await page.goto("/tests/repair-visit-review.html?mode=entries&role=inspector");
      await expect(page.getByRole("region", { name: "Repair visits", exact: true }).getByRole("alert")).toHaveCount(0);
    });
  });
}
