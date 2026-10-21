import { expect, test, type Page } from "@playwright/test";

type Customer = { id: string; code: string; displayName: string; nextServiceDueDate: string | null };
const TODAY = new Date(2026, 9, 21, 10, 0, 0); // Wed 21 Oct 2026, local

const seed = (): Customer[] => [
  { id: "late", code: "LATE", displayName: "Later Customer", nextServiceDueDate: "2026-12-31" },
  { id: "soon", code: "SOON", displayName: "Soon Customer", nextServiceDueDate: "2026-11-10" },
  { id: "old", code: "OLD", displayName: "Oldest Customer", nextServiceDueDate: "2026-09-15" },
  { id: "over", code: "OVER", displayName: "Overdue Customer", nextServiceDueDate: "2026-10-10" },
  { id: "gam", code: "GAM", displayName: "Gamma Court", nextServiceDueDate: "2026-10-28" },
  { id: "alp", code: "ALP", displayName: "Alpha Mall", nextServiceDueDate: "2026-10-28" },
  { id: "bet", code: "BET", displayName: "Beta Works", nextServiceDueDate: "2026-10-28" },
  { id: "unset", code: "UNSET", displayName: "Unscheduled Customer", nextServiceDueDate: null }
];

async function mockServer(page: Page, customers: Customer[], saved: Array<string | null> = []) {
  await page.clock.setFixedTime(TODAY);
  await page.route("**/api/manager/customers/**", async (route) => {
    if (route.request().method() === "PUT") {
      const id = route.request().url().split("/").at(-2);
      const customer = customers.find((c) => c.id === id)!;
      customer.nextServiceDueDate = route.request().postDataJSON().nextServiceDueDate;
      saved.push(customer.nextServiceDueDate);
      await route.fulfill({ json: { customer: { customer, sites: [], configuration: { id: "revision", revision: 1, enabledSystems: [] }, supportedSystems: [] } } });
    } else await route.fulfill({ json: { customers: customers.filter((c) => c.nextServiceDueDate), unscheduledCustomers: customers.filter((c) => !c.nextServiceDueDate) } });
  });
}

async function openCalendar(page: Page, customers = seed(), saved: Array<string | null> = []) {
  await mockServer(page, customers, saved);
  await page.goto("/tests/manager-upcoming-services.html");
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Calendar" }).click();
}
const chip = (page: Page, label: string) => page.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: new RegExp(`^${label}\\b`) });
const day = (page: Page, label: string) => page.getByRole("button", { name: label, exact: true });
const title = (page: Page) => page.getByRole("heading", { level: 3 }).first();
const dayHeading = (page: Page) => page.locator("#upcoming-day-title");
const dayNames = (page: Page) => page.locator(".upcoming-day-item .upcoming-customer strong");

test("Table is the default; the toggle switches to Calendar and back with aria-pressed", async ({ page }) => {
  await mockServer(page, seed());
  await page.goto("/tests/manager-upcoming-services.html");
  const view = page.getByRole("group", { name: "View" });
  await expect(view.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
  await expect(view.getByRole("button", { name: "Calendar" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("grid")).toHaveCount(0);
  await view.getByRole("button", { name: "Calendar" }).click();
  await expect(view.getByRole("button", { name: "Calendar" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("grid", { name: "Service calendar, October 2026" })).toBeVisible();
  await expect(title(page)).toHaveText("October 2026");
  await view.getByRole("button", { name: "Table" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("grid")).toHaveCount(0);
});

test("switching to Calendar selects the All chip; a chip chosen inside the calendar is kept until the next switch", async ({ page }) => {
  await mockServer(page, seed());
  await page.goto("/tests/manager-upcoming-services.html");
  const view = page.getByRole("group", { name: "View" });
  await expect(chip(page, "Overdue")).toHaveAttribute("aria-pressed", "true");
  await view.getByRole("button", { name: "Calendar" }).click();
  await expect(chip(page, "All")).toHaveAttribute("aria-pressed", "true");
  await expect(day(page, "28 Oct 2026, 3 services")).toBeVisible();
  await chip(page, "Overdue").click();
  await view.getByRole("button", { name: "Calendar" }).click();
  await expect(chip(page, "Overdue")).toHaveAttribute("aria-pressed", "true");
  await expect(day(page, "28 Oct 2026, no services")).toBeVisible();
  await view.getByRole("button", { name: "Table" }).click();
  await view.getByRole("button", { name: "Calendar" }).click();
  await expect(chip(page, "All")).toHaveAttribute("aria-pressed", "true");
});

test("opens on the current month with today marked and selected", async ({ page }) => {
  await openCalendar(page);
  const today = day(page, "21 Oct 2026, no services");
  await expect(today).toHaveAttribute("aria-current", "date");
  await expect(today).toHaveClass(/due-cal-day--selected/);
  await expect(today).toHaveClass(/due-cal-day--today/);
  await expect(dayHeading(page)).toHaveText("Wed 21 Oct 2026, no customers");
  await expect(page.getByRole("columnheader")).toHaveCount(7);
  await expect(page.getByRole("columnheader").first()).toHaveAttribute("aria-label", "Monday");
  // Monday-first: 1 Oct 2026 is a Thursday, so three muted cells lead the month.
  await expect(page.locator('[role="gridcell"][aria-disabled="true"]').first()).toHaveText("28");
  await expect(page.locator('.due-cal-cell--muted button')).toHaveCount(0);
});

test("month navigation, Today, and day selection", async ({ page }) => {
  await openCalendar(page);
  await chip(page, "All").click();
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(title(page)).toHaveText("November 2026");
  await expect(dayHeading(page)).toHaveText("No day selected");
  await expect(day(page, "10 Nov 2026, 1 service")).toBeVisible();
  await page.getByRole("button", { name: "Previous month" }).click();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(title(page)).toHaveText("September 2026");
  await expect(day(page, "15 Sep 2026, 1 service")).toBeVisible();
  await page.getByRole("button", { name: "Today" }).click();
  await expect(title(page)).toHaveText("October 2026");
  await expect(dayHeading(page)).toHaveText("Wed 21 Oct 2026, no customers");
  await day(page, "28 Oct 2026, 3 services").click();
  await expect(day(page, "28 Oct 2026, 3 services")).toHaveClass(/due-cal-day--selected/);
  await expect(dayHeading(page)).toHaveText("Wed 28 Oct 2026, 3 customers");
  await expect(dayNames(page)).toHaveText(["Alpha Mall", "Beta Works", "Gamma Court"]);
  await day(page, "10 Oct 2026, 1 service").click();
  await expect(dayHeading(page)).toHaveText("Sat 10 Oct 2026, 1 customer");
  await expect(page.locator(".upcoming-day-item .upcoming-status")).toHaveText("11 days overdue");
});

test("wide cells show two status chips and +n more; December rolls over to January", async ({ page }) => {
  await openCalendar(page);
  await chip(page, "All").click();
  const cell = day(page, "28 Oct 2026, 3 services");
  await expect(cell.locator(".due-cal-chip")).toHaveText(["Alpha Mall", "Beta Works"]);
  await expect(cell.locator(".due-cal-more")).toHaveText("+1 more");
  await expect(cell.locator(".due-cal-chip").first()).toHaveClass(/due-cal-tone--soon/);
  await expect(day(page, "10 Oct 2026, 1 service").locator(".due-cal-chip")).toHaveClass(/due-cal-tone--overdue/);
  await expect(cell.locator(".due-cal-dot")).toHaveCount(0);
  await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(title(page)).toHaveText("December 2026");
  await expect(day(page, "31 Dec 2026, 1 service").locator(".due-cal-chip")).toHaveClass(/due-cal-tone--later/);
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(title(page)).toHaveText("January 2027");
});

test("the day list reuses Reschedule: it saves, reloads and the calendar re-derives", async ({ page }) => {
  const saved: Array<string | null> = [];
  await openCalendar(page, seed(), saved);
  await day(page, "10 Oct 2026, 1 service").click();
  await page.getByRole("button", { name: "Reschedule for Overdue Customer" }).click();
  const input = page.getByLabel("Next service due for Overdue Customer");
  await expect(input).toBeFocused();
  await input.fill("2026-10-15");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(saved).toEqual(["2026-10-15"]);
  await expect(page.getByRole("status").filter({ hasText: "Next service date saved for Overdue Customer: 15 Oct 2026." })).toBeVisible();
  await expect(day(page, "10 Oct 2026, no services")).toBeVisible();
  await expect(day(page, "15 Oct 2026, 1 service")).toBeVisible();
  await expect(dayHeading(page)).toHaveText("Sat 10 Oct 2026, no customers");
});

test("the day list row menu opens the Reminder recipients drawer and Escape returns focus", async ({ page }) => {
  await mockServer(page, seed());
  await page.route("**/api/manager/reminders/staff", (route) => route.fulfill({ json: { staff: [] } }));
  await page.route("**/api/manager/reminders/plans/over", (route) => route.fulfill({ json: { plan: { customerId: "over", dueDate: "2026-10-10", reviewRequired: false, recipients: [], effective: [], blocked: true, plannedSendDate: null, priorSentCount: 0 } } }));
  await page.goto("/tests/manager-upcoming-services.html");
  await page.getByRole("button", { name: "Calendar" }).click();
  await day(page, "10 Oct 2026, 1 service").click();
  const more = page.getByRole("button", { name: "More actions for Overdue Customer" });
  await more.click();
  await page.getByRole("menuitem", { name: "Reminder recipients" }).click();
  const drawer = page.getByRole("dialog", { name: /Overdue Customer/ });
  await expect(drawer.getByText("Reminder blocked: add recipients.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(more).toBeFocused();
  await more.click();
  await expect(page.getByRole("menuitem", { name: "Service routine" })).toBeVisible();
});

test("the calendar shares the search text and the status chip with the table", async ({ page }) => {
  await openCalendar(page);
  await chip(page, "All").click();
  await expect(day(page, "28 Oct 2026, 3 services")).toBeVisible();
  await page.getByLabel("Filter by customer name or code").fill("alpha");
  await expect(chip(page, "All")).toHaveText("All 1");
  await expect(day(page, "28 Oct 2026, 1 service")).toBeVisible();
  await expect(day(page, "10 Oct 2026, no services")).toBeVisible();
  await page.getByLabel("Filter by customer name or code").fill("");
  await chip(page, "Overdue").click();
  await expect(chip(page, "Overdue")).toHaveText("Overdue 2");
  await expect(day(page, "28 Oct 2026, no services")).toBeVisible();
  await expect(day(page, "10 Oct 2026, 1 service")).toBeVisible();
  await chip(page, "Later").click();
  await expect(day(page, "10 Oct 2026, no services")).toBeVisible();
  await page.getByLabel("Filter by customer name or code").fill("no-such-customer");
  await expect(page.getByText('No customer matches "no-such-customer".')).toBeVisible();
  await expect(page.getByRole("grid")).toHaveCount(0);
  // The chosen view survives the filter; no storage is used for it.
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("grid")).toBeVisible();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test("overdue customers from earlier months show a banner whose button opens the table on Overdue", async ({ page }) => {
  await openCalendar(page);
  await chip(page, "All").click();
  const banner = page.locator(".upcoming-cal-banner");
  await expect(banner).toContainText("1 customer overdue from earlier months");
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(banner).toContainText("2 customers overdue from earlier months");
  await page.getByRole("button", { name: "Previous month" }).click();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(title(page)).toHaveText("September 2026");
  await expect(banner).toHaveCount(0);
  await page.getByRole("button", { name: "Next month" }).click();
  await chip(page, "Later").click();
  await banner.getByRole("button", { name: "Show in table" }).click();
  await expect(page.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "Overdue")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("tbody td.upcoming-customer strong")).toHaveText(["Oldest Customer", "Overdue Customer"]);
});

test("Not scheduled chip explains that unscheduled customers are not on the calendar", async ({ page }) => {
  await openCalendar(page);
  await chip(page, "Not scheduled").click();
  await expect(page.locator(".empty-state")).toHaveText("Unscheduled customers are not on the calendar. Switch to Table to see them.");
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expect(page.getByText("Unscheduled Customer", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Table" }).click();
  await expect(page.locator("tbody td.upcoming-customer strong")).toHaveText(["Unscheduled Customer"]);
  // Unscheduled customers never land on a day.
  await chip(page, "All").click();
  await page.getByRole("button", { name: "Calendar" }).click();
  await expect(page.locator(".due-cal-chip", { hasText: "Unscheduled" })).toHaveCount(0);
});

test("a malformed due date fails closed: no toggle and no calendar", async ({ page }) => {
  await mockServer(page, [{ id: "bad", code: "BAD", displayName: "Bad Date Co", nextServiceDueDate: "2026-02-30" }]);
  await page.goto("/tests/manager-upcoming-services.html");
  await expect(page.locator("#failure")).not.toBeEmpty();
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "View" })).toHaveCount(0);
  await expect(page.getByText("Bad Date Co")).toHaveCount(0);
});

test("360 px: compact dot calendar, no horizontal scroll, 44 px targets, aria-labels carry the counts", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openCalendar(page);
  await chip(page, "All").click();
  const cell = day(page, "28 Oct 2026, 3 services");
  await expect(cell.locator(".due-cal-chip")).toHaveCount(0);
  await expect(cell.locator(".due-cal-dot")).toHaveCount(1);
  await expect(day(page, "10 Oct 2026, 1 service").locator(".due-cal-dot")).toHaveClass(/due-cal-tone--overdue/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const days = page.locator(".due-cal-day");
  expect(await days.count()).toBe(31);
  for (const box of await days.evaluateAll((nodes) => nodes.map((node) => { const r = node.getBoundingClientRect(); return { w: r.width, h: r.height }; }))) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  for (const name of ["Previous month", "Next month", "Today", "Table", "Calendar"]) {
    const target = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(target.width).toBeGreaterThanOrEqual(44);
  }
  await cell.click();
  await expect(page.getByRole("button", { name: "Reschedule for Alpha Mall" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
