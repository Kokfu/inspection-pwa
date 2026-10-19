import { expect, test } from "@playwright/test";

/** P1-A: a visit created on this device and not yet confirmed opens its system form from the device in a verified session. */
test("unconfirmed offline visit open target (real IndexedDB, real resolver)", async ({ page }) => {
  await page.goto("/tests/offline-visit-open-target.html");
  await page.getByRole("button", { name: "Run unconfirmed visit open-target checks", exact: true }).click();
  await expect.poll(async () => {
    try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; }
  }, { timeout: 30_000 }).not.toBe("RUNNING");
  const result = JSON.parse(await page.locator("#result").innerText());
  const failed = (result.checks as Array<{ name: string; passed: boolean; detail: string }>).filter((item) => !item.passed);
  expect(failed, JSON.stringify(failed)).toEqual([]);
  expect(result.status, JSON.stringify(result)).toBe("PASS");
});
