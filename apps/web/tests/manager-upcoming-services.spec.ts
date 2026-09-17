import { expect, test } from "@playwright/test";

test("sort unsorted due dates, separate unscheduled and save/clear dates", async ({ page }) => {
  const customers = [
    { id: "late", code: "L", displayName: "Later Customer", nextServiceDueDate: "2026-12-01" as string | null },
    { id: "early", code: "E", displayName: "Earlier Customer", nextServiceDueDate: "2026-09-15" as string | null },
    { id: "unset", code: "U", displayName: "Unscheduled Customer", nextServiceDueDate: null as string | null }
  ];
  await page.route("**/api/manager/customers/**", async (route) => {
    if (route.request().method() === "PUT") {
      const id = route.request().url().split("/").at(-2);
      const customer = customers.find((c) => c.id === id)!;
      customer.nextServiceDueDate = route.request().postDataJSON().nextServiceDueDate;
      await route.fulfill({ json: { customer: { customer, sites: [], configuration: { id: "revision", revision: 1, enabledSystems: [] }, supportedSystems: [] } } });
    } else await route.fulfill({ json: { customers: customers.filter((c) => c.nextServiceDueDate), unscheduledCustomers: customers.filter((c) => !c.nextServiceDueDate) } });
  });
  await page.goto("/tests/manager-upcoming-services.html");
  const scheduled = page.getByRole("region", { name: "Scheduled customers", exact: true });
  await expect(scheduled.locator("li > strong")).toHaveText(["Earlier Customer", "Later Customer"]);
  await expect(page.getByRole("region", { name: "Not yet scheduled", exact: true }).locator("li > strong")).toHaveText(["Unscheduled Customer"]);
  await page.getByLabel("Next service due for Unscheduled Customer", { exact: true }).fill("2026-09-01");
  await expect(scheduled.locator("li > strong")).toHaveText(["Unscheduled Customer", "Earlier Customer", "Later Customer"]);
  await page.getByLabel("Next service due for Earlier Customer", { exact: true }).fill("");
  await expect(page.getByRole("region", { name: "Not yet scheduled", exact: true }).locator("li > strong")).toHaveText(["Earlier Customer"]);
});

test("empty schedule uses the empty state", async ({ page }) => {
  await page.route("**/api/manager/customers/upcoming-service", (route) => route.fulfill({ json: { customers: [], unscheduledCustomers: [] } }));
  await page.goto("/tests/manager-upcoming-services.html");
  await expect(page.locator(".empty-state")).toHaveText("No customers.");
});
