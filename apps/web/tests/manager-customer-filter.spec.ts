import { expect, test } from "@playwright/test";

test("Customer Configuration filters active customers by name and code on submit", async ({ page }) => {
  await page.goto("/tests/manager-customer-filter.html");
  const activeList = page.locator('section[aria-labelledby="manager-customers-title"] > ul.job-card-list');
  const search = page.getByRole("searchbox", { name: "Customer name or code" });
  await expect(activeList.locator("li")).toHaveCount(2);

  await search.fill("alpha");
  await expect(activeList.locator("li")).toHaveCount(2);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(activeList.locator("li")).toHaveCount(1);
  await expect(activeList).toContainText("Alpha Fire");

  await search.fill("c-202");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(activeList.locator("li")).toHaveCount(1);
  await expect(activeList).toContainText("Bravo Safety");

  await search.fill("missing");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("No customers match “missing”.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show archived customers" })).toBeVisible();

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(search).toHaveValue("");
  await expect(activeList.locator("li")).toHaveCount(2);
});
