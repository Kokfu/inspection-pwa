import { test, expect } from "@playwright/test";

test("v10 -> v11 offline: every store, index, pending record, old repair and Blob survives", async ({ page, context }) => {
  await page.goto("/tests/repair-visit-v11-upgrade.html");
  await page.waitForFunction(() => Reflect.get(window, "ready") === true);
  await page.evaluate(() => Reflect.get(window, "prepareUpgrade")());
  await context.setOffline(true);
  const result = await page.evaluate(() => Reflect.get(window, "runUpgrade")());
  expect(result).toEqual({ oldStores: 15, newStores: 6, status: "PASS" });
});
