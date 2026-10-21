import { expect, test } from "@playwright/test";

test("I-79: a local save that stalls past 10 s tells the technician, and the notice clears when it finishes", async ({ page }) => {
  await page.clock.install();
  await page.goto("/tests/slow-local-save.html");
  await page.waitForFunction(() => typeof (window as unknown as { __begin?: unknown }).__begin === "function");
  await expect(page.getByText("Saving is slow")).toHaveCount(0);

  await page.evaluate(() => (window as unknown as { __begin: () => void }).__begin());
  await page.clock.fastForward(6_000);
  await expect(page.getByText("Saving is slow")).toHaveCount(0);
  await page.clock.fastForward(8_000);
  await expect(page.getByText("Saving is slow")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("close other tabs");

  await page.evaluate(() => (window as unknown as { __end: () => void }).__end());
  await page.clock.fastForward(3_000);
  await expect(page.getByText("Saving is slow")).toHaveCount(0);
});
