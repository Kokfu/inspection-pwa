import { expect, test, type Page } from "@playwright/test";

type Row = { id: string; code: string; displayName: string; nextServiceDueDate: string | null };
const row = (n: number, displayName: string, nextServiceDueDate: string | null): Row => ({ id: `94000000-0000-4000-8000-${String(n).padStart(12, "0")}`, code: `C${n}`, displayName, nextServiceDueDate });

// Fixed "today" is Wed 2026-10-21 (local); nothing here depends on the real date.
const scheduled = [
  row(1, "Zeta Hotel", "2026-09-30"), row(2, "Alpha Mall", "2026-10-10"), row(3, "Beta Works", "2026-10-21"),
  row(4, "Gamma Court", "2026-10-28"), row(5, "Delta Plaza", "2026-10-29"), row(6, "Epsilon Tower", "2027-01-15"),
  row(7, "Alpha Clinic", "2026-10-10")
];
const unscheduledRows = [row(8, "Nina Foods", null)];

async function open(page: Page, body: unknown, width = 360) {
  const requests: string[] = [];
  await page.setViewportSize({ width, height: 800 });
  await page.clock.setFixedTime(new Date(2026, 9, 21, 10, 0, 0));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(`${route.request().method()} ${path}`);
    let json: unknown = {};
    if (path === "/api/auth/me") json = { user: { id: 805, username: "tech", role: "inspector" } };
    else if (path === "/api/customers/service-format-options") json = { systems: [] };
    else if (path === "/api/customers/upcoming-service") json = body;
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
const calendarButton = (page: Page) => page.getByRole("group", { name: "View" }).getByRole("button", { name: "Calendar" });
const day = (page: Page, label: string) => page.getByRole("button", { name: label, exact: true });
const title = (page: Page) => page.locator(".due-cal-title");
const noHorizontalScroll = (page: Page) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

test("Cards is the default; the toggle switches to a compact read-only calendar and back", async ({ page }) => {
  await open(page, { customers: scheduled, unscheduledCustomers: unscheduledRows });
  const view = page.getByRole("group", { name: "View" });
  await expect(view.getByRole("button", { name: "Cards" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("h3.tech-upcoming-heading")).toHaveText(["Overdue", "This week", "Later"]);
  await expect(page.getByRole("grid")).toHaveCount(0);
  await calendarButton(page).click();
  await expect(calendarButton(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("grid", { name: "Service calendar, October 2026" })).toBeVisible();
  await expect(title(page)).toHaveText("October 2026");
  await expect(page.locator("h3.tech-upcoming-heading")).toHaveCount(0);
  await expect(page.locator(".due-cal-chip")).toHaveCount(0);
  await expect(day(page, "21 Oct 2026, 1 service")).toHaveAttribute("aria-current", "date");
  await expect(day(page, "21 Oct 2026, 1 service")).toHaveClass(/due-cal-day--selected/);
  await expect(page.locator("#tech-upcoming-day-title")).toHaveText("Wed 21 Oct 2026, 1 customer");
  await view.getByRole("button", { name: "Cards" }).click();
  await expect(page.locator("h3.tech-upcoming-heading")).toHaveText(["Overdue", "This week", "Later"]);
  await expect(page.getByRole("grid")).toHaveCount(0);
});

test("selecting a day lists its customers with a status chip and no card action", async ({ page }) => {
  const requests = await open(page, { customers: scheduled, unscheduledCustomers: unscheduledRows });
  await calendarButton(page).click();
  await day(page, "10 Oct 2026, 2 services").click();
  await expect(page.locator("#tech-upcoming-day-title")).toHaveText("Sat 10 Oct 2026, 2 customers");
  await expect(page.locator(".tech-upcoming-card .tech-upcoming-name")).toHaveText(["Alpha Clinic", "Alpha Mall"]);
  await expect(page.locator(".tech-upcoming-card .tech-upcoming-status")).toHaveText(["11 days overdue", "11 days overdue"]);
  await expect(page.locator(".tech-upcoming-card .tech-upcoming-status").first()).toHaveClass(/tech-upcoming-status--overdue/);
  await day(page, "28 Oct 2026, 1 service").click();
  await expect(page.locator(".tech-upcoming-card .tech-upcoming-status")).toHaveText("In 7 days");
  await expect(page.locator(".tech-upcoming-card .tech-upcoming-status")).toHaveClass(/tech-upcoming-status--this_week/);
  await expect(page.locator(".tech-upcoming-card a, .tech-upcoming-card button, .tech-upcoming-card [role='button'], .tech-upcoming-card [tabindex]")).toHaveCount(0);
  const hash = await page.evaluate(() => location.hash);
  const before = requests.length;
  await page.locator(".tech-upcoming-card").click();
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  expect(requests.slice(before).filter((entry) => !entry.startsWith("GET"))).toEqual([]);
  // Unscheduled customers are not on the calendar.
  await expect(page.getByText("Nina Foods")).toHaveCount(0);
  await noHorizontalScroll(page);
});

test("prev / next / Today move between months and keep a valid selection", async ({ page }) => {
  await open(page, { customers: scheduled, unscheduledCustomers: [] });
  await calendarButton(page).click();
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(title(page)).toHaveText("November 2026");
  await expect(page.locator("#tech-upcoming-day-title")).toHaveText("No day selected");
  await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(title(page)).toHaveText("January 2027");
  await expect(day(page, "15 Jan 2027, 1 service").locator(".due-cal-dot")).toHaveClass(/due-cal-tone--later/);
  await day(page, "15 Jan 2027, 1 service").click();
  await expect(page.locator(".tech-upcoming-card .tech-upcoming-name")).toHaveText("Epsilon Tower");
  await page.getByRole("button", { name: "Today" }).click();
  await expect(title(page)).toHaveText("October 2026");
  await expect(page.locator("#tech-upcoming-day-title")).toHaveText("Wed 21 Oct 2026, 1 customer");
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(title(page)).toHaveText("September 2026");
  await expect(day(page, "30 Sep 2026, 1 service").locator(".due-cal-dot")).toHaveClass(/due-cal-tone--overdue/);
});

test("keyboard: roving tabindex, arrows, Home/End, PageUp/PageDown, Enter and Space", async ({ page }) => {
  await open(page, { customers: scheduled, unscheduledCustomers: [] });
  await calendarButton(page).click();
  const today = day(page, "21 Oct 2026, 1 service");
  await expect(page.locator('.due-cal-day[tabindex="0"]')).toHaveCount(1);
  await expect(today).toHaveAttribute("tabindex", "0");
  await today.focus();
  await page.keyboard.press("ArrowRight");
  await expect(day(page, "22 Oct 2026, no services")).toBeFocused();
  await expect(page.locator('.due-cal-day[tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expect(day(page, "29 Oct 2026, 1 service")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowLeft");
  await expect(day(page, "21 Oct 2026, 1 service")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(day(page, "19 Oct 2026, no services")).toBeFocused();
  await page.keyboard.press("End");
  await expect(day(page, "25 Oct 2026, no services")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(title(page)).toHaveText("November 2026");
  await expect(day(page, "1 Nov 2026, no services")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(title(page)).toHaveText("October 2026");
  await expect(day(page, "31 Oct 2026, no services")).toBeFocused();
  await page.keyboard.press("PageDown");
  await expect(title(page)).toHaveText("November 2026");
  await expect(day(page, "30 Nov 2026, no services")).toBeFocused();
  await page.keyboard.press("PageUp");
  await expect(title(page)).toHaveText("October 2026");
  await expect(day(page, "30 Oct 2026, no services")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#tech-upcoming-day-title")).toHaveText("Fri 30 Oct 2026, no customers");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Space");
  await expect(page.locator("#tech-upcoming-day-title")).toHaveText("Thu 29 Oct 2026, 1 customer");
  await expect(day(page, "29 Oct 2026, 1 service")).toHaveClass(/due-cal-day--selected/);
  // Home / End stay inside the displayed month.
  await day(page, "1 Oct 2026, no services").focus();
  await page.keyboard.press("Home");
  await expect(day(page, "1 Oct 2026, no services")).toBeFocused();
  await expect(title(page)).toHaveText("October 2026");
});

test("a day button announces its date and the number of services; out-of-month cells are not buttons", async ({ page }) => {
  await open(page, { customers: scheduled, unscheduledCustomers: [] });
  await calendarButton(page).click();
  await expect(day(page, "10 Oct 2026, 2 services")).toBeVisible();
  await expect(day(page, "11 Oct 2026, no services")).toBeVisible();
  await expect(page.locator(".due-cal-day")).toHaveCount(31);
  await expect(page.getByRole("gridcell", { name: /^28$/ })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("columnheader")).toHaveText(["M", "T", "W", "T", "F", "S", "S"]);
});

test("360 px: no horizontal scroll and 44 px targets in the calendar view", async ({ page }) => {
  await open(page, { customers: scheduled, unscheduledCustomers: unscheduledRows });
  await calendarButton(page).click();
  await noHorizontalScroll(page);
  for (const box of await page.locator(".due-cal-day").evaluateAll((nodes) => nodes.map((node) => { const r = node.getBoundingClientRect(); return { w: r.width, h: r.height }; }))) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  for (const name of ["Previous month", "Next month", "Today", "Cards", "Calendar"]) {
    const target = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(target.width).toBeGreaterThanOrEqual(44);
  }
});

test("a malformed due date fails closed with the existing alert and no calendar", async ({ page }) => {
  await open(page, { customers: [row(1, "Bad Date Co", "2026-13-45")], unscheduledCustomers: [] });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("group", { name: "View" })).toHaveCount(0);
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expect(page.getByText("Bad Date Co")).toHaveCount(0);
});

test("the calendar stays compact when the window is widened", async ({ page }) => {
  await open(page, { customers: scheduled, unscheduledCustomers: [] });
  await calendarButton(page).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator(".due-calendar--compact")).toHaveCount(1);
  await expect(page.locator(".due-cal-chip")).toHaveCount(0);
});
