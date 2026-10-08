import { expect, test } from "@playwright/test";

async function mountManagerHome(page: import("@playwright/test").Page, complianceReminders: unknown) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let json: unknown = {};
    if (url.pathname === "/api/auth/me") json = { user: { id: 804, username: "mobiletest", role: "admin" } };
    else if (url.pathname.endsWith("/compliance-reminders")) json = complianceReminders;
    await route.fulfill({ json });
  });
  await page.goto("/tests/manager-dashboard-navigation.html#/manager");
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await expect(page.locator("#manager-dashboard-title")).toBeVisible();
}

test("T7: Overdue and Due soon sections show counts and the customers, ordered as the server sent them", async ({ page }) => {
  await mountManagerHome(page, {
    overdue: [
      { id: "a", code: "A", displayName: "Alpha Customer", nextServiceDueDate: "2026-09-01" },
      { id: "b", code: "B", displayName: "Beta Customer", nextServiceDueDate: "2026-09-20" }
    ],
    dueSoon: [
      { id: "c", code: "C", displayName: "Gamma Customer", nextServiceDueDate: "2026-09-28" }
    ],
    dueSoonWindowDays: 7
  });
  await expect(page.getByRole("heading", { name: "Overdue (2)", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Due soon (1)", exact: true })).toBeVisible();
  const overdue = page.getByRole("region", { name: "Overdue", exact: true });
  await expect(overdue.locator("li")).toHaveCount(2);
  await expect(overdue.locator("li").first()).toContainText("Alpha Customer");
  await expect(overdue.locator("li").first()).toContainText("2026-09-01");
  const dueSoon = page.getByRole("region", { name: "Due soon", exact: true });
  await expect(dueSoon.locator("li")).toHaveCount(1);
  await expect(dueSoon.locator("li").first()).toContainText("Gamma Customer");
});

test("T7: a customer due tomorrow shows under Due soon (the owner-check scenario)", async ({ page }) => {
  await mountManagerHome(page, {
    overdue: [],
    dueSoon: [{ id: "t", code: "T", displayName: "Tomorrow Customer", nextServiceDueDate: "2026-09-28" }],
    dueSoonWindowDays: 7
  });
  await expect(page.getByRole("heading", { name: "Due soon (1)", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Due soon", exact: true }).getByText("Tomorrow Customer")).toBeVisible();
  await expect(page.getByRole("region", { name: "Overdue" })).toHaveCount(0);
});

test("T7: nothing overdue or due soon renders neither section (no empty scaffolding on a normal Home)", async ({ page }) => {
  await mountManagerHome(page, { overdue: [], dueSoon: [], dueSoonWindowDays: 7 });
  await expect(page.locator(".manager-dashboard-card").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Overdue" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Due soon" })).toHaveCount(0);
});

test("T7: a malformed compliance-reminders response degrades gracefully -- Home stays usable, no forced sign-out", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") { await route.fulfill({ json: { user: { id: 804, username: "mobiletest", role: "admin" } } }); return; }
    if (url.pathname.endsWith("/compliance-reminders")) { await route.fulfill({ json: { overdue: "not-an-array", dueSoon: [], dueSoonWindowDays: 7 } }); return; }
    await route.fulfill({ json: {} });
  });
  await page.goto("/tests/manager-dashboard-navigation.html#/manager");
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await expect(page.locator("#manager-dashboard-title")).toBeVisible();
  await expect(page.getByRole("region", { name: "Overdue" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Due soon" })).toHaveCount(0);
  await expect(page.getByText("Choose how you are signing in")).toHaveCount(0);
  // The Home card and (since the persistent sidebar) the sidebar link share this label; the card is what proves Home rendered.
  await expect(page.locator(".manager-dashboard-card").filter({ hasText: "Next Upcoming Service" })).toBeVisible();
  await expect(page.getByLabel("Primary navigation").getByRole("button", { name: "Next Upcoming Service", exact: true })).toBeVisible();
});

test("T7: a real 401/403 on compliance-reminders IS an authorization failure and falls back to the role chooser, matching every other Manager screen", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") { await route.fulfill({ json: { user: { id: 804, username: "mobiletest", role: "admin" } } }); return; }
    if (url.pathname.endsWith("/compliance-reminders")) { await route.fulfill({ status: 403, json: { error: "FORBIDDEN" } }); return; }
    await route.fulfill({ json: {} });
  });
  await page.goto("/tests/manager-dashboard-navigation.html#/manager");
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await expect(page.getByText("Choose how you are signing in")).toBeVisible();
});
