import { expect, test } from "@playwright/test";

test("Manager presents the server creation timestamp in Malaysia time", async ({ page }) => {
  await page.goto("/tests/manager-created-time.html");
  await page.getByRole("button", { name: "Run Manager creation-time display check", exact: true }).click();
  await expect.poll(async () => JSON.parse(await page.locator("#result").innerText()).status).toBe("PASS");
});
