import { expect, test, type Page } from "@playwright/test";
const id = "10000000-0000-4000-8000-000000000001", legacyId = "678f1e17-34b2-42f5-9674-2bd8d0392524";
const uuid = "20000000-0000-4000-8000-000000000001";
const rows = [{ assetReference: "Fan 7" }];
const proposal = (over: Record<string, unknown> = {}) => ({
  id, customerId: uuid, customerDisplayName: "Readable Customer", systemKey: "smoke_ventilation", systemDisplayName: "Smoke Ventilation", jobId: uuid, jobReference: "SV-1",
  submittedByUserId: 1, submittedBy: "Technician", submittedByRole: "inspector", submittedAt: "2026-09-29T00:00:00.000Z",
  payload: { kind: "update-format", locationKey: "general", rows }, status: "pending", decision: null, edited: false, ...over
});
async function enter(page: Page) {
  await page.goto("/tests/manager-dashboard-navigation.html#/manager-location-proposals");
  await page.getByRole("button", { name: /^Admin/ }).click();
  await page.getByLabel("Primary navigation").getByRole("button", { name: "Location Proposals" }).click();
}
async function install(page: Page, items: ReturnType<typeof proposal>[]) {
  const decisions: string[] = [];
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: { id: 4, username: "supervisor", role: "supervisor" } } });
    if (url.pathname === "/api/inspection-jobs") return route.fulfill({ status: 403, json: { error: "FORBIDDEN" } });
    if (url.pathname === "/api/manager/location-proposals") {
      const counts = { pending: 0, approved: 0, rejected: 0, withdrawn: 0 };
      items.forEach(item => counts[item.status as keyof typeof counts]++);
      return route.fulfill({ json: { proposals: items.filter(item => item.status === url.searchParams.get("status")), counts } });
    }
    const item = items.find(item => url.pathname.includes(item.id));
    if (item && url.pathname.endsWith("/decision")) {
      decisions.push(url.pathname);
      const body = route.request().postDataJSON();
      Object.assign(item, { status: "approved", decision: { id: uuid, decision: "approved", note: null, decidedBy: "Reviewer", decidedByRole: "supervisor", decidedAt: "2026-10-19T01:00:00.000Z", sequence: 1, requestId: body.requestId, resultingRevisionId: uuid, appliedPatch: null } });
      return route.fulfill({ status: 201, json: { proposal: item } });
    }
    if (item) return route.fulfill({ json: { proposal: { ...item, currentLocation: { key: "general", displayName: "Fans", zoneId: null, presetRowCount: 1, rowPreset: { rows }, sortOrder: 1 }, currentRows: rows, availableZones: [], mergeable: item.status === "pending" ? true : { reason: "Already decided." } } } });
    return route.fulfill({ json: {} });
  });
  return decisions;
}

test("I-24: unreadable legacy proposal remains isolated while a readable proposal can be approved", async ({ page }) => {
  const decisions = await install(page, [proposal({ id: legacyId, customerDisplayName: "28/9/2026 All Services", systemKey: "fm200_fire_suppression", payload: { zones: [], locations: [] } }), proposal()]);
  page.on("dialog", dialog => dialog.accept());
  await enter(page);
  await expect(page.getByRole("heading", { name: "1 proposal cannot be shown" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("28/9/2026 All Services");
  await expect(page.getByText("Choose how you are signing in")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /28\/9\/2026 All Services/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Readable Customer/ }).click();
  await expect(page.getByRole("region", { name: "Proposal review", exact: true })).toContainText("Fan 7");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => decisions.length).toBe(1); expect(decisions[0]).toContain(id);
  expect(decisions.some(path => path.includes(legacyId))).toBe(false);
  await page.getByRole("button", { name: "Back to requests" }).click();
  await expect(page.getByRole("heading", { name: "1 proposal cannot be shown" })).toBeVisible();
});

test("I-24: a response that is not a list still fails closed", async ({ page }) => {
  await install(page, []);
  await page.route("**/api/manager/location-proposals?*", route => route.fulfill({ json: { proposals: "not a list", counts: { pending: 0, approved: 0, rejected: 0, withdrawn: 0 } } }));
  await page.goto("/tests/manager-dashboard-navigation.html#/manager-location-proposals");
  await page.getByRole("button", { name: /^Admin/ }).click();
  await expect(page.getByText("Choose how you are signing in")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /cannot be shown/ })).toHaveCount(0);
});

test("a rejected legacy row stays isolated beside a readable rejected proposal", async ({ page }) => {
  await install(page, [
    proposal({ id: legacyId, customerDisplayName: "28/9/2026 All Services", payload: { zones: [], locations: [] }, status: "rejected" }),
    proposal({ status: "rejected", decision: { id: uuid, decision: "rejected", note: "Disposable browser fixture", decidedBy: "admin", decidedByRole: "admin", decidedAt: "2026-10-08T12:00:00.000Z", sequence: 1, requestId: uuid, resultingRevisionId: null, appliedPatch: null } })
  ]);
  await enter(page); await expect(page.getByText("No pending location proposals.")).toBeVisible();
  await page.getByRole("tab", { name: "Rejected (2)", exact: true }).click();
  await expect(page.getByRole("heading", { name: "1 proposal cannot be shown" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("678f1e17");
  await page.getByRole("button", { name: /Readable Customer/ }).click();
  await expect(page.getByRole("region", { name: "Proposal review", exact: true })).toContainText("Fan 7");
  await expect(page.getByText("Disposable browser fixture")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);
});
