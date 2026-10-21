import { expect, test, type Page } from "@playwright/test";

type Customer = { id: string; code: string; displayName: string; nextServiceDueDate: string | null };
const TODAY = new Date(2026, 9, 21, 10, 0, 0); // 21 Oct 2026, local

const seed = (): Customer[] => [
  { id: "late", code: "LATE", displayName: "Later Customer", nextServiceDueDate: "2026-12-31" },
  { id: "soon", code: "SOON", displayName: "Soon Customer", nextServiceDueDate: "2026-11-10" },
  { id: "old", code: "OLD", displayName: "Oldest Customer", nextServiceDueDate: "2026-09-15" },
  { id: "over", code: "OVER", displayName: "Overdue Customer", nextServiceDueDate: "2026-10-10" },
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

const names = (page: Page) => page.locator("tbody td.upcoming-customer strong");
const row = (page: Page, name: string) => page.locator("tbody tr").filter({ hasText: name });
const chip = (page: Page, label: string) => page.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: new RegExp(`^${label}\\b`) });

test("defaults to Overdue, shows counts, filters by chip and sorts most overdue first", async ({ page }) => {
  await mockServer(page, seed());
  await page.goto("/tests/manager-upcoming-services.html");
  await expect(chip(page, "Overdue")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "Overdue")).toHaveText("Overdue 2");
  await expect(chip(page, "Due in 30 days")).toHaveText("Due in 30 days 1");
  await expect(chip(page, "Later")).toHaveText("Later 1");
  await expect(chip(page, "Not scheduled")).toHaveText("Not scheduled 1");
  await expect(chip(page, "All")).toHaveText("All 5");
  await expect(names(page)).toHaveText(["Oldest Customer", "Overdue Customer"]);
  await expect(row(page, "Oldest Customer").getByText("36 days overdue")).toBeVisible();
  await chip(page, "All").click();
  await expect(chip(page, "All")).toHaveAttribute("aria-pressed", "true");
  await expect(names(page)).toHaveText(["Oldest Customer", "Overdue Customer", "Soon Customer", "Later Customer", "Unscheduled Customer"]);
  await chip(page, "Not scheduled").click();
  await expect(names(page)).toHaveText(["Unscheduled Customer"]);
  await expect(row(page, "Unscheduled Customer").getByText("Not scheduled")).toBeVisible();
});

test("opens on All when nothing is overdue", async ({ page }) => {
  await mockServer(page, seed().filter((c) => c.id !== "old" && c.id !== "over"));
  await page.goto("/tests/manager-upcoming-services.html");
  await expect(chip(page, "All")).toHaveAttribute("aria-pressed", "true");
  await expect(names(page)).toHaveText(["Soon Customer", "Later Customer", "Unscheduled Customer"]);
  await chip(page, "Overdue").click();
  await expect(page.locator(".empty-state")).toHaveText("No overdue services.");
});

test("sort buttons toggle with aria-sort; not scheduled stays last", async ({ page }) => {
  await mockServer(page, seed());
  await page.goto("/tests/manager-upcoming-services.html");
  await chip(page, "All").click();
  const due = page.getByRole("columnheader", { name: /Next due/ });
  const customer = page.getByRole("columnheader", { name: /Customer/ });
  await expect(due).toHaveAttribute("aria-sort", "ascending");
  await due.getByRole("button").click();
  await expect(due).toHaveAttribute("aria-sort", "descending");
  await expect(names(page)).toHaveText(["Later Customer", "Soon Customer", "Overdue Customer", "Oldest Customer", "Unscheduled Customer"]);
  await customer.getByRole("button").click();
  await expect(customer).toHaveAttribute("aria-sort", "ascending");
  await expect(due).not.toHaveAttribute("aria-sort", /.+/);
  await expect(names(page)).toHaveText(["Later Customer", "Oldest Customer", "Overdue Customer", "Soon Customer", "Unscheduled Customer"]);
  await customer.getByRole("button").click();
  await expect(customer).toHaveAttribute("aria-sort", "descending");
  await expect(names(page)).toHaveText(["Unscheduled Customer", "Soon Customer", "Overdue Customer", "Oldest Customer", "Later Customer"]);
});

test("search counts follow the text; no match and clear", async ({ page }) => {
  await mockServer(page, seed());
  await page.goto("/tests/manager-upcoming-services.html");
  await page.getByLabel("Filter by customer name or code").fill("over");
  await expect(chip(page, "Overdue")).toHaveText("Overdue 1");
  await expect(chip(page, "Later")).toHaveText("Later 0");
  await expect(chip(page, "All")).toHaveText("All 1");
  await expect(names(page)).toHaveText(["Overdue Customer"]);
  await page.getByLabel("Filter by customer name or code").fill("SOON");
  await expect(names(page)).toHaveCount(0);
  await expect(page.locator(".empty-state")).toHaveText("No overdue services.");
  await chip(page, "All").click();
  await expect(names(page)).toHaveText(["Soon Customer"]);
  await page.getByLabel("Filter by customer name or code").fill("no-such-customer");
  await expect(page.getByText('No customer matches "no-such-customer".')).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(names(page)).toHaveCount(5);
  await expect(chip(page, "All")).toHaveText("All 5");
});

test("empty schedule uses the empty state", async ({ page }) => {
  await mockServer(page, []);
  await page.goto("/tests/manager-upcoming-services.html");
  await expect(page.locator(".empty-state")).toHaveText("No customers.");
  await expect(page.getByRole("group", { name: "Filter by status" })).toHaveCount(0);
});

test("Reschedule and Set date save through the popover, reload, and return focus; clearing saves null", async ({ page }) => {
  const saved: Array<string | null> = [];
  await mockServer(page, seed(), saved);
  await page.goto("/tests/manager-upcoming-services.html");
  await chip(page, "All").click();
  await row(page, "Unscheduled Customer").getByRole("button", { name: "Set date" }).click();
  const dialog = page.getByRole("dialog", { name: "Service date for Unscheduled Customer" });
  await expect(dialog.getByLabel("Next service due for Unscheduled Customer")).toBeFocused();
  await dialog.getByLabel("Next service due for Unscheduled Customer").fill("2026-10-01");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  expect(saved).toEqual(["2026-10-01"]);
  await expect(row(page, "Unscheduled Customer").getByText("20 days overdue")).toBeVisible();
  await expect(row(page, "Unscheduled Customer").getByRole("button", { name: /Reschedule/ })).toBeFocused();
  // Reschedule an overdue row to a later date: it leaves the Overdue list, focus falls back to the page title.
  await chip(page, "Overdue").click();
  await row(page, "Oldest Customer").getByRole("button", { name: /Reschedule/ }).click();
  await page.getByLabel("Next service due for Oldest Customer").fill("2027-02-01");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(saved).toEqual(["2026-10-01", "2027-02-01"]);
  await expect(names(page)).toHaveText(["Unscheduled Customer", "Overdue Customer"]);
  await expect(page.getByRole("heading", { name: "Next Upcoming Service" })).toBeFocused();
  // Clearing the date saves null.
  await row(page, "Overdue Customer").getByRole("button", { name: /Reschedule/ }).click();
  await page.getByLabel("Next service due for Overdue Customer").fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(saved.at(-1)).toBeNull();
  await expect(chip(page, "Not scheduled")).toHaveText("Not scheduled 1");
});

test("Cancel and Escape close the date popover without saving and return focus", async ({ page }) => {
  const saved: Array<string | null> = [];
  await mockServer(page, seed(), saved);
  await page.goto("/tests/manager-upcoming-services.html");
  const button = row(page, "Oldest Customer").getByRole("button", { name: /Reschedule/ });
  await button.click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(button).toBeFocused();
  await button.click();
  await page.getByLabel("Next service due for Oldest Customer").fill("2027-01-01");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(button).toBeFocused();
  expect(saved).toEqual([]);
});

test("row menu opens Reminder recipients and Service routine in a drawer; Escape returns focus", async ({ page }) => {
  const customers = seed();
  let recurrence = { dueDate: "2026-10-10", kind: null as string | null, interval: null as number | null, day: null as number | null };
  await mockServer(page, customers);
  await page.route("**/api/manager/reminders/staff", (route) => route.fulfill({ json: { staff: [] } }));
  await page.route("**/api/manager/reminders/plans/over", (route) => route.fulfill({ json: { plan: { customerId: "over", dueDate: "2026-10-10", reviewRequired: false, recipients: [], effective: [], blocked: true, plannedSendDate: null, priorSentCount: 0 } } }));
  await page.route("**/api/manager/reminders/recurrence/over", async (route) => {
    if (route.request().method() === "PUT") recurrence = route.request().postDataJSON();
    await route.fulfill({ json: { recurrence } });
  });
  await page.goto("/tests/manager-upcoming-services.html");
  const more = page.getByRole("button", { name: "More actions for Overdue Customer" });
  await expect(more).toHaveAttribute("aria-haspopup", "menu");
  await more.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Actions for Overdue Customer" });
  await expect(menu.getByRole("menuitem", { name: "Reminder recipients" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Service routine" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();

  await more.click();
  await page.getByRole("menuitem", { name: "Reminder recipients" }).click();
  const drawer = page.getByRole("dialog", { name: /Overdue Customer/ });
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  await expect(drawer.getByText("Reminder blocked: add recipients.")).toBeVisible();
  // Tab never leaves the drawer.
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(more).toBeFocused();

  await more.click();
  await page.getByRole("menuitem", { name: "Service routine" }).click();
  await expect(page.getByRole("dialog", { name: /Service routine: Overdue Customer/ })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByLabel("Cadence").selectOption("monthly");
  await page.getByRole("button", { name: "Save routine" }).click();
  await expect(page.getByText("Service routine saved.")).toBeVisible();
  expect(recurrence.kind).toBe("monthly");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(more).toBeFocused();
});

test("unscheduled rows offer Service routine but not Reminder recipients", async ({ page }) => {
  await mockServer(page, seed());
  await page.goto("/tests/manager-upcoming-services.html");
  await chip(page, "Not scheduled").click();
  await page.getByRole("button", { name: "More actions for Unscheduled Customer" }).click();
  await expect(page.getByRole("menuitem", { name: "Service routine" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Reminder recipients" })).toHaveCount(0);
});

test("360 px shows stacked cards with no horizontal scroll and 44 px targets", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockServer(page, seed());
  await page.goto("/tests/manager-upcoming-services.html");
  await chip(page, "All").click();
  await expect(names(page)).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const sizes = await page.locator("tbody button, .upcoming-chip, .upcoming-sort").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(44);
  await row(page, "Oldest Customer").getByRole("button", { name: /Reschedule/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "More actions for Oldest Customer" }).click();
  await page.getByRole("menuitem", { name: "Service routine" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a failed reload after save shows no stale rows and reports the failure", async ({ page }) => {
  const customers = seed();
  let failLoad = false;
  await page.clock.setFixedTime(TODAY);
  await page.route("**/api/manager/customers/**", async (route) => {
    if (route.request().method() === "PUT") {
      const customer = customers.find((c) => c.id === route.request().url().split("/").at(-2))!;
      customer.nextServiceDueDate = route.request().postDataJSON().nextServiceDueDate;
      failLoad = true;
      await route.fulfill({ json: { customer: { customer, sites: [], configuration: { id: "revision", revision: 1, enabledSystems: [] }, supportedSystems: [] } } });
    } else if (failLoad) await route.fulfill({ status: 500, json: {} });
    else await route.fulfill({ json: { customers: customers.filter((c) => c.nextServiceDueDate), unscheduledCustomers: customers.filter((c) => !c.nextServiceDueDate) } });
  });
  await page.goto("/tests/manager-upcoming-services.html");
  await expect(names(page)).toHaveCount(2);
  await row(page, "Oldest Customer").getByRole("button", { name: /Reschedule/ }).click();
  await page.getByLabel("Next service due for Oldest Customer").fill("2026-10-01");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("#failure")).not.toBeEmpty();
  await expect(names(page)).toHaveCount(0);
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(page.getByText("Loading upcoming services…")).toBeVisible();
});

test("a malformed due date from the server fails closed and shows no rows", async ({ page }) => {
  await page.clock.setFixedTime(TODAY);
  await page.route("**/api/manager/customers/upcoming-service", (route) => route.fulfill({ json: { customers: [{ id: "x", code: "X", displayName: "Bad Date", nextServiceDueDate: "2026-02-31" }], unscheduledCustomers: [] } }));
  await page.goto("/tests/manager-upcoming-services.html");
  await expect(page.locator("#failure")).not.toBeEmpty();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Filter by status" })).toHaveCount(0);
});
