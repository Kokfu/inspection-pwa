import { expect, test, type Page } from "@playwright/test";

// FR-18: a #/job/<id> link to a visit that is not on this device must say why, not land silently on Open Work.
const otherJob = "5aac930f-5118-4a2a-92e9-0a3ba6494cfd";
const wording = "You are not authorised to open this service visit. You can only open your own service visits.";

// Choose the Technician view once, then open the link with a full reload (the role is remembered, as on a phone).
async function openDeepLink(page: Page) {
  await page.goto("/tests/manager-dashboard-navigation.html#/jobs");
  await page.getByRole("button", { name: /^Technician/ }).click();
  await expect(page.getByRole("heading", { name: "Open Work", exact: true })).toBeVisible();
  await page.evaluate((id) => { window.location.hash = `#/job/${id}`; }, otherJob);
  await page.reload();
}

for (const width of [360, 1280]) {
  test(`deep link to another technician's visit shows not authorised at ${width}px`, async ({ page }) => {
    let jobCalls = 0;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === `/api/inspection-jobs/${otherJob}`) {
        jobCalls += 1;
        return route.fulfill({ status: 403, json: { error: "FORBIDDEN", message: wording } });
      }
      let json: unknown = {};
      if (path === "/api/auth/me") json = { user: { id: 805, username: "tech", role: "inspector" } };
      else if (path === "/api/customers/service-format-options") json = { systems: [] };
      else if (path === "/api/customers/upcoming-service") json = { customers: [], unscheduledCustomers: [] };
      else if (path === "/api/customers") json = { customers: [] };
      else if (path.endsWith("/inspection-jobs")) json = { jobs: [] };
      await route.fulfill({ json });
    });
    await page.setViewportSize({ width, height: 800 });
    await openDeepLink(page);
    await expect(page.getByRole("alert").filter({ hasText: wording })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Open Work", exact: true })).toHaveCount(0);
    // One check for the hash change and one for the reload that follows it in openDeepLink; never more.
    expect(jobCalls).toBeGreaterThanOrEqual(1);
    expect(jobCalls).toBeLessThanOrEqual(2);
    const back = page.getByRole("button", { name: "Back to My Jobs", exact: true });
    await expect.poll(async () => (await back.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await back.click();
    await expect(page).toHaveURL(/#\/jobs$/);
    await expect(page.getByRole("heading", { name: "Open Work", exact: true })).toBeVisible();
  });
}

test("deep link to a missing visit answers 404 calmly", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/api/inspection-jobs/${otherJob}`) return route.fulfill({ status: 404, json: { error: "NOT_FOUND" } });
    let json: unknown = {};
    if (path === "/api/auth/me") json = { user: { id: 805, username: "tech", role: "inspector" } };
    else if (path.endsWith("/inspection-jobs")) json = { jobs: [] };
    await route.fulfill({ json });
  });
  await openDeepLink(page);
  await expect(page.getByRole("heading", { name: "Service visit not found" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to My Jobs", exact: true })).toBeVisible();
});
