import { expect, test } from "@playwright/test";

test("Supervisor can review and approve a new-system proposal after full navigation", async ({ page }) => {
  const requests: string[] = [];
  const pending = [
    { id: "p-smoke", systemKey: "smoke_ventilation", payload: { kind: "update-format", locationKey: "general", rows: [{ assetReference: "Fan 7" }] } },
    { id: "p-co2", systemKey: "co2_fire_extinguisher", payload: { kind: "update-format", locationKey: "loc-a", rows: [{ alarmZone: "A", location: "Lobby" }] } }
  ].map((item) => ({ ...item, customerId: "customer-1", customerDisplayName: `Customer ${item.id}`, jobId: "job-1",
    submittedByUserId: 1, submittedBy: "Technician", submittedByRole: "inspector", submittedAt: "2026-09-29T00:00:00.000Z",
    status: "pending", decision: null }));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()); requests.push(`${route.request().method()} ${url.pathname}`);
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: { id: 4, username: "supervisor", role: "supervisor" } } });
    if (url.pathname === "/api/inspection-jobs") return route.fulfill({ status: 403, json: { error: "FORBIDDEN" } });
    if (url.pathname === "/api/manager/location-proposals" && route.request().method() === "GET")
      return route.fulfill({ json: { proposals: url.searchParams.get("status") === "pending" ? pending : [] } });
    if (url.pathname.endsWith("/decision") && route.request().method() === "POST") {
      const index = pending.findIndex((item) => url.pathname.includes(item.id));
      const [approved] = pending.splice(index, 1);
      return route.fulfill({ status: 201, json: { proposal: { ...approved, status: "approved" } } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/tests/manager-dashboard-navigation.html#/manager-location-proposals");
  await page.getByRole("button", { name: /^Supervisor/ }).click();
  await page.getByLabel("Primary navigation").getByRole("button", { name: "Location Proposals" }).click();
  await expect(page.getByRole("heading", { name: "Location Proposals" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Customer p-smoke/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Customer p-smoke/ }).click();
  await expect(page.getByText("Fan 7")).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Customer p-co2")).toBeVisible();
  expect(requests).not.toContain("GET /api/inspection-jobs");
});
