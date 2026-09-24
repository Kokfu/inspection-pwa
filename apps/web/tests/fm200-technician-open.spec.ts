import { expect, test } from "@playwright/test";

test("selecting FM200 calls the initializer path instead of navigating to an uninitialized location page", async ({ page }) => {
  await page.goto("/tests/fm200TechnicianOpen.html");
  await page.getByRole("button", { name: /FM200 System/ }).click();
  await expect(page.locator("body")).toHaveAttribute("data-opened", "fm200");
});

test("FM200 initialization creates its location group from the frozen job", async ({ page }) => {
  await page.goto("/tests/fm200-concurrent-initialization.html");
  await page.getByRole("button", { name: "Run FM200 checks" }).click();
  await expect(page.locator("#result")).toContainText('"status": "PASS"');
});
