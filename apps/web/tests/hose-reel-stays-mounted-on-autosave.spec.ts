import { expect, test } from "@playwright/test";

/**
 * I-77 in the real App: the Hose Reel route effect re-resolved the inspection after every save and put the route back
 * into "loading", which unmounted the open form (the phone keyboard closed ~1.5 s after the technician stopped typing).
 * A same-authority refresh must keep the form element, focus and newer typing, exactly as I-23 did for Hydrant.
 */
test("I-77: an autosave does not re-create the open Hose Reel form, drop focus or lose newer typing", async ({ page }) => {
  await page.goto("/tests/hose-reel-stays-mounted-on-autosave.html");
  await page.locator("#run").click();
  await expect.poll(async () => { try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; } }, { timeout: 30_000 }).not.toBe("RUNNING");
  expect(JSON.parse(await page.locator("#result").innerText()).status).toBe("READY");
  const start = page.getByRole("button", { name: "Start Inspection" });
  if (await start.count()) await start.click();
  await page.waitForTimeout(300);
  await page.evaluate(() => { (window as unknown as { __removed: number }).__removed = 0; }); // the Start Inspection step itself replaces the prompt

  const field = page.getByRole("textbox", { name: "Location" }).first();
  await field.click();
  await field.evaluate((element) => { (element as HTMLElement & { __mark?: number }).__mark = 1; });
  await field.fill("Pump room");
  const saved = (needle: string) => page.evaluate(async (text) => {
    const dbs = await indexedDB.databases();
    const name = dbs.map((d) => d.name).find((n) => n?.startsWith("inspection-pwa:user:"));
    if (!name) return false;
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(name); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const rows = await new Promise<unknown[]>((resolve, reject) => { const r = db.transaction("masterSystemInspections").objectStore("masterSystemInspections").getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    db.close();
    return JSON.stringify(rows).includes(text);
  }, needle);
  await expect.poll(() => saved('"locationText":"Pump room"'), { timeout: 8000 }).toBe(true);

  await page.waitForTimeout(1200); // let the list refresh and the route effect re-resolve
  expect(await page.evaluate(() => (window as unknown as { __removed: number }).__removed), "the form was not unmounted and re-mounted").toBe(0);
  expect(await field.evaluate((element) => (element as HTMLElement & { __mark?: number }).__mark), "same DOM element").toBe(1);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Pump room");

  await page.keyboard.type(" 2");
  await expect(field).toHaveValue("Pump room 2");
  await expect.poll(() => saved('"locationText":"Pump room 2"'), { timeout: 8000 }).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __removed: number }).__removed)).toBe(0);
  await expect(field).toBeFocused();
});
