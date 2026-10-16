import { expect, test } from "@playwright/test";

test("repair header never claims synced while startup or switched-account reads are unresolved", async ({ page }) => {
  await page.goto("/tests/header-repair-sync-summary.html");
  await page.getByRole("button", { name: "Run repair header loading checks", exact: true }).click();
  await expect.poll(async () => {
    try {
      const result = JSON.parse(await page.locator("#result").innerText());
      return result.status === "PASS" ? "PASS" : JSON.stringify(result);
    } catch { return "RUNNING"; }
  }, { timeout: 60_000 }).toBe("PASS");
});

test("repair header follows real IndexedDB evidence and parent states across workspace changes", async ({ page }) => {
  await page.goto("/tests/header-repair-sync-summary.html");
  await page.getByRole("button", { name: "Run repair header checks", exact: true }).click();
  await expect.poll(async () => {
    try {
      const result = JSON.parse(await page.locator("#result").innerText());
      return result.status === "PASS" ? "PASS" : JSON.stringify(result);
    } catch { return "RUNNING"; }
  }, { timeout: 60_000 }).toBe("PASS");
});
