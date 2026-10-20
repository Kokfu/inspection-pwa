import { expect, test, type Page } from "@playwright/test";

/**
 * I-75: no empty bands in the proposal filter bar at 360 px. Gaps are measured between the visible edges of the
 * tab row, the Customer label, the Search/Clear row and the "Showing n of m requests" line.
 */
const uuid = "20000000-0000-4000-8000-000000000001";
const maxGap = 24; // css px: 1.5rem, the largest vertical gap token used between sibling controls (--space-6)
const instant = "2026-10-19T00:00:00.000Z";
const site = (n: number) => ({ id: `10000000-0000-4000-8000-00000000000${n}`, customerId: uuid, customerDisplayName: "Customer North", siteId: uuid, jobId: null, jobReference: null,
  proposedDisplayName: `Site ${n}`, proposedAddress: "22 Long Road", submittedByUserId: 2, submittedBy: "Field Technician", submittedAt: instant, status: "pending", decision: null });
const location = (n: number) => ({ id: `30000000-0000-4000-8000-00000000000${n}`, customerId: uuid, customerDisplayName: "Customer North", systemKey: "fire_rated_roller_shutter",
  systemDisplayName: "Fire Rated Roller Shutter", jobId: uuid, jobReference: "SV-20261019-7", submittedByUserId: 1, submittedBy: "Technician", submittedByRole: "inspector",
  submittedAt: instant, payload: { kind: "update-format", locationKey: "general", rows: [{ assetReference: "RS-A1", locationText: "Office", zoneText: "North" }] }, status: "pending", decision: null, edited: false });

async function api(page: Page) {
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/api/auth/me") return json({ user: { id: 4, username: "reviewer", role: "admin" } });
    if (path === "/api/manager/site-proposals") return json({ proposals: [site(1), site(2)] });
    if (path === "/api/manager/location-proposals") return json({ proposals: [location(1), location(2)], counts: { pending: 2, approved: 0, rejected: 0, withdrawn: 0 } });
    if (path === "/api/manager/dashboard/clients") return json({ totalClients: 0 });
    if (path === "/api/manager/dashboard/inspections-per-day") return json({ days: [] });
    if (path === "/api/manager/dashboard/inspection-status") return json({ passed: 0, notOk: 0, na: 0 });
    if (path === "/api/manager/service-visits") return json({ serviceVisits: [], totalCount: 0, nextCursor: null });
    return json({});
  });
}

async function gaps(page: Page, root: string) {
  return page.evaluate((selector) => {
    const section = document.querySelector(selector)!;
    const bottom = (element: Element) => element.getBoundingClientRect().bottom;
    const top = (element: Element) => element.getBoundingClientRect().top;
    const tabs = section.querySelector(".job-tabs")!;
    const customerLabel = section.querySelector(".proposal-filters label")!;
    const searchRow = section.querySelector(".manager-search-row")!;
    const status = section.querySelector(".proposal-filter-result");
    return { tabsToLabel: top(customerLabel) - bottom(tabs), statusToRow: status ? top(status) - bottom(searchRow) : null, scrollWidth: document.documentElement.scrollWidth };
  }, root);
}

for (const [name, hash, root] of [["Site requests", "#/manager-site-proposals", ".manager-site-proposals"], ["Location proposals", "#/manager-location-proposals", ".manager-location-proposals"]] as const) {
  test(`${name} filter bar has no empty bands at 360 px (I-75)`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await api(page);
    await page.goto(`/tests/manager-dashboard-navigation.html${hash}`);
    await page.getByRole("button", { name: /^Manager Monitor/ }).click();
    await expect(page.getByLabel("Customer")).toBeVisible();
    await page.getByLabel("Customer").selectOption(uuid);
    await expect(page.locator(".proposal-filter-result")).toContainText("Showing 2 of 2");
    const measured = await gaps(page, root);
    expect(measured.tabsToLabel, "tab row to Customer label").toBeLessThanOrEqual(maxGap);
    expect(measured.statusToRow, "Search row to status line").toBeLessThanOrEqual(maxGap);
    expect(measured.scrollWidth).toBe(360);
  });
}
