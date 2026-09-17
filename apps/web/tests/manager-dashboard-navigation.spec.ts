import { expect, test } from "@playwright/test";

test("dashboard has five working App hash routes and no dashboard data fetch", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()); requests.push(url.pathname + url.search);
    let json: unknown = {};
    if (url.pathname === "/api/auth/me") json = { user: { id: 804, username: "mobiletest", role: "admin" } };
    else if (url.pathname.endsWith("/technicians")) json = { technicians: [] };
    else if (url.pathname.endsWith("/upcoming-service")) json = { customers: [], unscheduledCustomers: [] };
    else if (url.pathname.endsWith("/customers")) json = { customers: [] };
    else if (url.pathname.endsWith("/service-visits")) json = { serviceVisits: [], nextCursor: null, totalCount: 0 };
    else if (url.pathname.endsWith("/inspection-jobs")) json = { jobs: [] };
    await route.fulfill({ json });
  });
  await page.goto("/tests/manager-dashboard-navigation.html#/manager");
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await expect(page.locator("#manager-dashboard-title")).toBeVisible();
  expect(requests.filter((r) => r.startsWith("/api/manager/"))).toEqual([]);
  for (const [label, hash, heading] of [
    ["Technician List", "manager-technicians", "Technician List"],
    ["Services", "manager-operations", "Operations"],
    ["Add Customer", "manager-customers", "Customer Configuration"],
    ["Current Services Done", "manager-services-done", "Current Services Done"],
    ["Next Upcoming Service", "manager-upcoming-services", "Next Upcoming Service"]
  ]) {
    await page.getByRole("button", { name: label!, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/${hash}$`));
    await expect(page.getByRole("heading", { name: heading!, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back to Home", exact: true }).click();
    await expect(page).toHaveURL(/#\/manager$/);
  }
  expect(requests).toContain("/api/manager/service-visits?status=closed");
});
