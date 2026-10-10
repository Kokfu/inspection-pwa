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
  await page.getByRole("button", { name: /^Admin/ }).click();
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

test("Supervisor review shows each saved row as separate labelled lines, with its zone, at phone width", async ({ page }) => {
  const proposal = { id: "p-roller", systemKey: "fire_rated_roller_shutter", customerId: "customer-1", customerDisplayName: "Customer p-roller", jobId: "job-1",
    submittedByUserId: 1, submittedBy: "Technician", submittedByRole: "inspector", submittedAt: "2026-10-09T00:00:00.000Z", status: "pending", decision: null,
    payload: { kind: "update-format", locationKey: "general", rows: [
      { assetReference: "RS-A1", locationText: "Admin Office", zoneText: "North Wing" },
      { assetReference: "", locationText: "Loading bay with a very long descriptive name that must wrap inside the card", zoneText: "Zone 2" }
    ] } };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: { id: 4, username: "supervisor", role: "supervisor" } } });
    if (url.pathname === "/api/inspection-jobs") return route.fulfill({ status: 403, json: { error: "FORBIDDEN" } });
    if (url.pathname === "/api/manager/location-proposals") return route.fulfill({ json: { proposals: url.searchParams.get("status") === "pending" ? [proposal] : [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/tests/manager-dashboard-navigation.html#/manager-location-proposals");
  await page.getByRole("button", { name: /^Admin/ }).click();
  await page.getByLabel("Primary navigation").getByRole("button", { name: "Location Proposals" }).click();
  await page.getByRole("button", { name: /Customer p-roller/ }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  const rows = page.getByRole("listitem").filter({ hasText: /^Row \d/ });
  await expect(rows).toHaveCount(2);
  // innerText follows layout: separate blocks are separate lines, so labels never run into the next value.
  expect((await rows.nth(0).innerText()).split("\n").map((line) => line.trim()).filter(Boolean)).toEqual(["Row 1", "Asset: RS-A1", "Zone: North Wing", "Location: Admin Office"]);
  expect((await rows.nth(1).innerText()).split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3)).toEqual(["Row 2", "Asset: (no reference)", "Zone: Zone 2"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const width of [768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
