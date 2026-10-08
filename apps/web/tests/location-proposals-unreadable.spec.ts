import { expect, test } from "@playwright/test";

/**
 * I-24 in the real App: a pending proposal saved before the current payload shape (no `payload.kind`) must not make the
 * whole Location Proposals screen unavailable or throw the Manager back to the role chooser. The readable proposal is
 * shown and can be approved; the unreadable one is listed with a plain explanation and has no Approve / Reject.
 */
const proposal = (id: string, over: Record<string, unknown>) => ({
  id, customerId: "customer-1", customerDisplayName: `Customer ${id}`, systemKey: "smoke_ventilation", jobId: "job-1",
  submittedByUserId: 1, submittedBy: "Technician", submittedByRole: "inspector", submittedAt: "2026-09-29T00:00:00.000Z",
  payload: { kind: "update-format", locationKey: "general", rows: [{ assetReference: "Fan 7" }] }, status: "pending", decision: null, ...over
});

test("I-24: an unreadable legacy proposal is listed but never blocks or bounces the screen", async ({ page }) => {
  const pending = [
    proposal("p-legacy", { customerDisplayName: "28/9/2026 All Services", systemKey: "fm200_fire_suppression", payload: { zones: [{ key: "z", sortOrder: 1, displayName: "1" }], locations: [] } }),
    proposal("p-good", {})
  ];
  const decisions: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: { id: 4, username: "supervisor", role: "supervisor" } } });
    if (url.pathname === "/api/inspection-jobs") return route.fulfill({ status: 403, json: { error: "FORBIDDEN" } });
    if (url.pathname === "/api/manager/location-proposals" && route.request().method() === "GET")
      return route.fulfill({ json: { proposals: url.searchParams.get("status") === "pending" ? pending : [] } });
    if (url.pathname.endsWith("/decision") && route.request().method() === "POST") {
      decisions.push(url.pathname);
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
  await expect(page.getByRole("heading", { name: "1 proposal cannot be shown" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("alert").filter({ hasText: "28/9/2026 All Services" })).toContainText("fm200_fire_suppression");
  await expect(page.getByText("Choose how you are signing in")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Customer p-good/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /28\/9\/2026 All Services/ })).toHaveCount(0);

  // the readable proposal still works end to end
  await page.getByRole("button", { name: /Customer p-good/ }).click();
  await expect(page.getByText("Fan 7")).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => decisions.length).toBe(1);
  expect(decisions[0]).toContain("p-good");
  expect(decisions.some((path) => path.includes("p-legacy"))).toBe(false);
  await expect(page.getByRole("heading", { name: "1 proposal cannot be shown" })).toBeVisible();
});

test("I-24: a response that is not a list still fails closed", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: { id: 4, username: "supervisor", role: "supervisor" } } });
    if (url.pathname === "/api/inspection-jobs") return route.fulfill({ status: 403, json: { error: "FORBIDDEN" } });
    if (url.pathname === "/api/manager/location-proposals") return route.fulfill({ json: { proposals: "not a list" } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/tests/manager-dashboard-navigation.html#/manager-location-proposals");
  await page.getByRole("button", { name: /^Supervisor/ }).click();
  // a malformed response is not "unreadable rows": the screen fails closed exactly as before (back to the role chooser)
  await expect(page.getByText("Choose how you are signing in")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /cannot be shown/ })).toHaveCount(0);
});

test("a rejected legacy row stays isolated beside a readable rejected proposal", async ({ page }) => {
  const rejected = [
    proposal("678f1e17-34b2-42f5-9674-2bd8d0392524", { customerDisplayName: "28/9/2026 All Services", systemKey: "fm200_fire_suppression", payload: { zones: [], locations: [] }, status: "rejected", decision: null }),
    proposal("p-readable-rejected", { status: "rejected", decision: { id: "d1", decision: "rejected", note: "Disposable browser fixture", decidedBy: "admin", decidedByRole: "admin", decidedAt: "2026-10-08T12:00:00.000Z", sequence: 1, requestId: "r1", resultingRevisionId: null } })
  ];
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: { user: { id: 4, username: "supervisor", role: "supervisor" } } });
    if (url.pathname === "/api/inspection-jobs") return route.fulfill({ status: 403, json: { error: "FORBIDDEN" } });
    if (url.pathname === "/api/manager/location-proposals") return route.fulfill({ json: { proposals: url.searchParams.get("status") === "rejected" ? rejected : [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/tests/manager-dashboard-navigation.html#/manager-location-proposals");
  await page.getByRole("button", { name: /^Supervisor/ }).click();
  await page.getByLabel("Primary navigation").getByRole("button", { name: "Location Proposals" }).click();
  await expect(page.getByText("No pending location proposals.")).toBeVisible();
  await page.getByRole("tab", { name: "Rejected", exact: true }).click();
  await expect(page.getByRole("heading", { name: "1 proposal cannot be shown" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("678f1e17");
  await page.getByRole("button", { name: /Customer p-readable-rejected/ }).click();
  await expect(page.getByText("Fan 7")).toBeVisible();
  await expect(page.getByText("Disposable browser fixture")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);
  // Fixtures and request interception are disposed with this isolated browser context.
});
