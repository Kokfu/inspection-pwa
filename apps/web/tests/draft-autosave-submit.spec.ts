import { expect, test, type Page } from "@playwright/test";

/**
 * I-17 in a real browser: Submit tapped while an autosave is running (or about to run) must not fail with
 * "changed elsewhere". `?direct=1` bypasses the hook's submit() and reproduces the original race, so the harness is
 * proven able to see the bug.
 */
type Log = { saves: string[]; submits: string[]; saveErrors: number; submitErrors: number };
const message = (page: Page) => page.locator("p[role=status]:not(.autosave-status)");
const autosaveLine = (page: Page) => page.locator(".autosave-status");
const readLog = (page: Page) => page.evaluate(() => (window as unknown as { __log: Log }).__log);

async function typeAndSubmitDuringSave(page: Page, query: string) {
  await page.goto(`/tests/draft-autosave-submit.html${query}`);
  await page.evaluate(() => (window as unknown as { __mount: (o: object) => void }).__mount({ saveDelay: 700 }));
  const input = page.getByRole("textbox", { name: "Remarks" });
  await input.click();
  await input.fill("typed then submitted");
  await page.waitForTimeout(1750); // debounce (1.5 s) elapsed, the 0.7 s save is now running
  await page.getByRole("button", { name: "Submit" }).click();
}

test("I-17 control: submitting straight from the click closure loses the race to the running autosave", async ({ page }) => {
  await typeAndSubmitDuringSave(page, "?direct=1");
  await expect(message(page)).toContainText("changed elsewhere", { timeout: 5000 });
  expect((await readLog(page)).submits).toEqual([]);
});

test("I-17: Submit waits for the running autosave, then submits once with the refreshed record", async ({ page }) => {
  await typeAndSubmitDuringSave(page, "");
  await expect.poll(async () => (await readLog(page)).submits, { timeout: 8000 }).toEqual(["typed then submitted"]);
  const log = await readLog(page);
  expect(log.saves).toEqual(["typed then submitted"]);
  expect(log.submitErrors).toBe(0);
  expect(log.saveErrors).toBe(0);
  await expect(message(page)).toHaveText("");
});

test("I-17: Submit tapped before the debounce fires saves once, then submits", async ({ page }) => {
  await page.goto("/tests/draft-autosave-submit.html");
  await page.evaluate(() => (window as unknown as { __mount: (o: object) => void }).__mount({ saveDelay: 200 }));
  const input = page.getByRole("textbox", { name: "Remarks" });
  await input.click();
  await input.fill("quick");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect.poll(async () => (await readLog(page)).submits, { timeout: 8000 }).toEqual(["quick"]);
  const log = await readLog(page);
  expect(log.submitErrors + log.saveErrors).toBe(0);
  expect(log.saves).toEqual(["quick"]);
});

test("I-17: Submit with nothing typed (no autosave involved) still submits", async ({ page }) => {
  await page.goto("/tests/draft-autosave-submit.html");
  await page.evaluate(() => (window as unknown as { __mount: (o: object) => void }).__mount({}));
  await page.getByRole("button", { name: "Submit" }).click();
  await expect.poll(async () => (await readLog(page)).submits, { timeout: 5000 }).toEqual([""]);
  expect((await readLog(page)).saves).toEqual([]);
});

test("I-18: the status line says Unsaved -> Saving -> Autosaved while typing, and disappears once the record is submitted", async ({ page }) => {
  await page.goto("/tests/draft-autosave-submit.html");
  await page.evaluate(() => (window as unknown as { __mount: (o: object) => void }).__mount({ saveDelay: 900 }));
  await expect(autosaveLine(page)).toHaveText(""); // open and untouched: nothing to say, space already reserved
  const input = page.getByRole("textbox", { name: "Remarks" });
  await input.click();
  await input.fill("hello");
  await expect(autosaveLine(page)).toContainText("Unsaved changes");
  await expect(autosaveLine(page)).toContainText("Saving on this device", { timeout: 4000 });
  await expect(autosaveLine(page)).toContainText("Autosaved on this device", { timeout: 4000 });
  await page.waitForTimeout(500);
  await expect(autosaveLine(page)).toContainText("Autosaved on this device"); // stays after the record echo
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(autosaveLine(page)).toHaveCount(0); // Pending = read-only, no autosave line
});
