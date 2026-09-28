import { expect, test } from "@playwright/test";

test("technician deletion requires a clean online unfinished visit and confirmation", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/tests/technician-delete-visit.html");
  const button = page.getByRole("button", { name: "Delete unfinished visit" });
  await expect(button).toBeEnabled();
  page.once("dialog", dialog => dialog.dismiss());
  await button.click();
  expect(await page.evaluate(() => (window as any).deleted)).toEqual([]);
  page.once("dialog", dialog => dialog.accept());
  await button.click();
  expect(await page.evaluate(() => (window as any).deleted)).toEqual(["30000000-0000-4000-8000-000000000101"]);
  for (const options of [{ localDraft: true }, { offline: true }, { progressFailed: true }]) {
    await page.evaluate(value => (window as any).renderVisit(value), options);
    await expect(button).toBeDisabled();
  }
  await page.evaluate(() => (window as any).renderVisit({ closed: true }));
  await expect(button).toHaveCount(0);
});
