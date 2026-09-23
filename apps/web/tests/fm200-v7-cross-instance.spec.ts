import { expect, test } from "@playwright/test";

// G9.  The Job+systemKey scoping of the widened duplicate guard is a property of
// the Dexie join, not of the pure decision function, so it needs real IndexedDB.
// Mirrors co2-v7-cross-instance.spec.ts against the FM200 module.
test("FM200 V7 duplicate photos are refused across locations of one Job but allowed across system keys and Jobs", async ({ page }) => {
  await page.goto("/tests/fm200-v7-cross-instance.html");
  await page.locator("#run").click();
  await expect.poll(
    async () => { try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; } },
    { timeout: 60_000 }
  ).toBe("PASS");
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.checks.every((item: { passed: boolean }) => item.passed)).toBe(true);
});
