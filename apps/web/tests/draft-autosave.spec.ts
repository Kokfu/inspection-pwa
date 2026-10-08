import { expect, test, type Page } from "@playwright/test";

/**
 * I-04 in a real browser: a Draft form autosaves typed text, keeps text typed while a save is running, never writes an
 * untouched or non-Draft record, saves when the form is left, and warns before a reload while text is unsaved.
 * The harness stands in for App.tsx: a slow save, then the record prop is replaced by the saved snapshot.
 */
type Win = Window & { __mount: (o?: { delay?: number; status?: string }) => void; __unmount: () => void; __log: { saves: string[] } };

async function mount(page: Page, options?: { delay?: number; status?: string }) {
  await page.goto("/tests/draft-autosave.html");
  await page.evaluate((o) => (window as unknown as Win).__mount(o), options);
  await expect(page.locator("section.hose-reel-form")).toBeVisible();
}
const assetInput = (page: Page) => page.getByRole("textbox", { name: "Location" }).nth(1);
const saves = (page: Page) => page.evaluate(() => (window as unknown as Win).__log.saves);

test("typing autosaves after a pause, and an untouched Draft is never written", async ({ page }) => {
  await mount(page);
  await page.waitForTimeout(2200);
  expect(await saves(page)).toEqual([]);
  const input = assetInput(page);
  await input.click();
  await input.fill("Technician Hydrant typed on site");
  await expect.poll(() => saves(page), { timeout: 5000 }).toEqual(["Technician Hydrant typed on site"]);
});

test("text typed while a save is running is kept (not overwritten by the save echo) and saved next", async ({ page }) => {
  await mount(page, { delay: 1200 });
  const input = assetInput(page);
  await input.click();
  await input.fill("first");
  await expect.poll(async () => (await saves(page)).length === 0 && true, { timeout: 3000 }).toBe(true);
  await page.waitForTimeout(1700); // debounce elapsed, save (1.2 s) now running
  await input.pressSequentially(" and more", { delay: 20 });
  await expect.poll(() => saves(page), { timeout: 8000 }).toEqual(["first", "first and more"]);
  await expect(assetInput(page)).toHaveValue("first and more");
});

test("leaving the form saves what was typed", async ({ page }) => {
  await mount(page, { delay: 50 });
  const input = assetInput(page);
  await input.click();
  await input.fill("typed then left");
  await page.evaluate(() => (window as unknown as Win).__unmount());
  await expect.poll(() => saves(page), { timeout: 3000 }).toEqual(["typed then left"]);
});

test("reload/close is blocked only while text is unsaved", async ({ page }) => {
  await mount(page, { delay: 50 });
  const input = assetInput(page);
  await input.click();
  await input.fill("unsaved words");
  const whileDirty = await page.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  expect(whileDirty).toBe(true);
  await expect.poll(() => saves(page), { timeout: 4000 }).toEqual(["unsaved words"]);
  await page.waitForTimeout(300);
  const afterSave = await page.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  expect(afterSave).toBe(false);
});

test("a Pending (submitted) record is read-only and never autosaved", async ({ page }) => {
  await mount(page, { status: "Pending" });
  await page.locator("body").click();
  await page.keyboard.type("x");
  await page.waitForTimeout(2200);
  expect(await saves(page)).toEqual([]);
  const prevented = await page.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  expect(prevented).toBe(false);
});
