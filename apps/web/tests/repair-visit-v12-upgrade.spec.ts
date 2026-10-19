import { test, expect } from "@playwright/test";

test("v11 -> v12 offline: old repair stores and outbox items go; every other store, pending visit, repair visit and Blob survives", async ({ page, context }) => {
  await page.goto("/tests/repair-visit-v12-upgrade.html");
  await page.waitForFunction(() => Reflect.get(window, "ready") === true);
  await page.evaluate(() => Reflect.get(window, "prepareUpgrade")());
  await context.setOffline(true);
  const result = await page.evaluate(() => Reflect.get(window, "runUpgrade")());
  expect(result).toEqual({ keptStores: 16, removedStores: 5, outboxKept: 5, status: "PASS" });
});
