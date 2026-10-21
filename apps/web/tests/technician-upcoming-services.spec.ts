import { expect, test, type Page } from "@playwright/test";

type Row = { id: string; code: string; displayName: string; nextServiceDueDate: string | null };
const row = (n: number, displayName: string, nextServiceDueDate: string | null): Row => ({ id: `94000000-0000-4000-8000-${String(n).padStart(12, "0")}`, code: `C${n}`, displayName, nextServiceDueDate });

// Fixed "today" is 2026-10-21 (local); nothing here depends on the real date.
const scheduled = [
  row(1, "Zeta Hotel", "2026-09-30"), row(2, "Alpha Mall", "2026-10-10"), row(3, "Beta Works", "2026-10-21"),
  row(4, "Gamma Court", "2026-10-28"), row(5, "Delta Plaza", "2026-10-29"), row(6, "Epsilon Tower", "2027-01-15"),
  row(7, "Alpha Clinic", "2026-10-10")
];
const unscheduledRows = [row(8, "Nina Foods", null), row(9, "Mia Garage", null)];

async function open(page: Page, body: unknown, status = 200, abortFirst = false) {
  const requests: string[] = [];
  let loads = 0;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.clock.setFixedTime(new Date(2026, 9, 21, 10, 0, 0));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    let json: unknown = {};
    if (path === "/api/auth/me") json = { user: { id: 805, username: "tech", role: "inspector" } };
    else if (path === "/api/customers/service-format-options") json = { systems: [] };
    else if (path === "/api/customers/upcoming-service") return (abortFirst && loads++ === 0) ? route.abort("failed") : route.fulfill({ status, json: body });
    else if (path === "/api/customers") json = { customers: [] };
    else if (path.endsWith("/inspection-jobs")) json = { jobs: [] };
    await route.fulfill({ json });
  });
  await page.goto("/tests/manager-dashboard-navigation.html#/jobs");
  await page.getByRole("button", { name: /^Technician/ }).click();
  await page.getByText("Menu", { exact: true }).click();
  await page.getByLabel("Mobile navigation").getByRole("button", { name: "Upcoming Services", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Upcoming Services", exact: true })).toBeVisible();
  return requests;
}
const noHorizontalScroll = (page: Page) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const names = (page: Page, group: string) => page.getByRole("region", { name: group }).locator(".tech-upcoming-name").allTextContents();

test("groups, counts, order and status labels follow the fixed today", async ({ page }) => {
  await open(page, { customers: scheduled, unscheduledCustomers: unscheduledRows });
  const chips = page.getByRole("group", { name: "Filter by due status" }).getByRole("button");
  await expect(chips).toHaveText(["Overdue 3", "This week 2", "Later 2"]);
  await expect(page.locator("h3.tech-upcoming-heading")).toHaveText(["Overdue", "This week", "Later"]);
  expect(await names(page, "Overdue")).toEqual(["Zeta Hotel", "Alpha Clinic", "Alpha Mall"]);
  expect(await names(page, "This week")).toEqual(["Beta Works", "Gamma Court"]);
  expect(await names(page, "Later")).toEqual(["Delta Plaza", "Epsilon Tower"]);
  const zeta = page.locator(".tech-upcoming-card", { hasText: "Zeta Hotel" });
  await expect(zeta).toContainText("Due 30 Sep 2026");
  await expect(zeta.locator(".tech-upcoming-status")).toHaveText("21 days overdue");
  await expect(page.locator(".tech-upcoming-card", { hasText: "Beta Works" }).locator(".tech-upcoming-status")).toHaveText("Due today");
  await expect(page.locator(".tech-upcoming-card", { hasText: "Gamma Court" }).locator(".tech-upcoming-status")).toHaveText("In 7 days");
  await expect(page.locator(".tech-upcoming-card", { hasText: "Delta Plaza" }).locator(".tech-upcoming-status")).toHaveText("In 8 days");
  await noHorizontalScroll(page);
});

test("chip filter shows one group, toggles off, and empty groups are not rendered", async ({ page }) => {
  await open(page, { customers: [row(1, "Only Later", "2027-03-01")], unscheduledCustomers: [] });
  await expect(page.locator("h3.tech-upcoming-heading")).toHaveText(["Later"]);
  const chips = page.getByRole("group", { name: "Filter by due status" }).getByRole("button");
  await expect(chips).toHaveText(["Overdue 0", "This week 0", "Later 1"]);
});

test("selecting a chip filters to that group and pressing it again restores all", async ({ page }) => {
  await open(page, { customers: scheduled, unscheduledCustomers: unscheduledRows });
  const overdue = page.getByRole("button", { name: /^Overdue/ });
  await expect(overdue).toHaveAttribute("aria-pressed", "false");
  await overdue.click();
  await expect(overdue).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("h3.tech-upcoming-heading")).toHaveText(["Overdue"]);
  await page.getByRole("button", { name: /^Later/ }).click();
  await expect(page.locator("h3.tech-upcoming-heading")).toHaveText(["Later"]);
  await page.getByRole("button", { name: /^Later/ }).click();
  await expect(page.locator("h3.tech-upcoming-heading")).toHaveText(["Overdue", "This week", "Later"]);
  const box = await page.getByRole("button", { name: /^Overdue/ }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("Not scheduled is collapsed by default, expands to names only, and cards are not interactive", async ({ page }) => {
  await open(page, { customers: scheduled, unscheduledCustomers: unscheduledRows });
  const toggle = page.getByRole("button", { name: "Not scheduled (2)" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Nina Foods")).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#tech-upcoming-unscheduled-list .tech-upcoming-name")).toHaveText(["Mia Garage", "Nina Foods"]);
  await expect(page.locator("#tech-upcoming-unscheduled-list")).not.toContainText("Due");
  await expect(page.locator(".tech-upcoming-card a, .tech-upcoming-card button, .tech-upcoming-card [role='button'], .tech-upcoming-card [tabindex]")).toHaveCount(0);
  const hash = await page.evaluate(() => location.hash);
  await page.locator(".tech-upcoming-card", { hasText: "Zeta Hotel" }).click();
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  await noHorizontalScroll(page);
});

test("no serviced customers keeps the existing empty state", async ({ page }) => {
  await open(page, { customers: [], unscheduledCustomers: [] });
  await expect(page.getByText("No serviced customers yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Overdue/ })).toHaveCount(0);
});

test("a malformed due date fails closed with an alert and no rows", async ({ page }) => {
  await open(page, { customers: [row(1, "Bad Date Co", "2026-13-45")], unscheduledCustomers: [] });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Bad Date Co")).toHaveCount(0);
  await expect(page.locator(".tech-upcoming-card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Overdue/ })).toHaveCount(0);
});

test("a failed load shows the alert and no rows", async ({ page }) => {
  await open(page, { message: "down" }, 503);
  await expect(page.getByRole("alert")).toHaveText("Upcoming services are currently unavailable.");
  await expect(page.locator(".tech-upcoming-card")).toHaveCount(0);
});

test("a network failure shows friendly text and Retry reloads the rows", async ({ page }) => {
  await open(page, { customers: scheduled, unscheduledCustomers: unscheduledRows }, 200, true);
  await expect(page.getByRole("alert")).toHaveText("Upcoming services could not be loaded. Check your connection and try again.");
  await expect(page.locator(".tech-upcoming-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator(".tech-upcoming-card").first()).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
