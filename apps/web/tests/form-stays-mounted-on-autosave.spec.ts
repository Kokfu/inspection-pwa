import { expect, test } from "@playwright/test";

/**
 * I-23 in the real App: the route effect re-resolves the open inspection after every save. That used to unmount and
 * recreate the form, so an autosave in the middle of typing dropped focus and scroll position (on a phone: the keyboard
 * closed). The form element must survive the autosave, keep focus, and keep text typed while the save ran.
 */
test("I-23: an autosave does not re-create the open form, drop focus or lose newer typing", async ({ page }) => {
  await page.goto("/tests/form-stays-mounted-on-autosave.html");
  await page.locator("#run").click();
  await expect.poll(async () => { try { return JSON.parse(await page.locator("#result").innerText()).status; } catch { return "RUNNING"; } }, { timeout: 30_000 }).not.toBe("RUNNING");
  expect(JSON.parse(await page.locator("#result").innerText()).status).toBe("READY");
  // Phase 3: a fresh Draft of this system asks how many / shows the saved layout first; answer it with the default.
  const start = page.getByRole("button", { name: "Start Inspection" });
  if (await start.count()) await start.click();

  // I-59: a configured row's Location and Reference are frozen (the server requires them as configured), so type into a row the technician adds.
  await page.getByRole("button", { name: "Add Row" }).click();
  const field = page.getByRole("textbox", { name: "No. / Reference" }).last();
  await field.click();
  await field.evaluate((element) => { (element as HTMLElement & { __mark?: number }).__mark = 1; });
  await field.fill("typed before the autosave");
  await expect.poll(() => page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    const name = dbs.map((d) => d.name).find((n) => n?.startsWith("inspection-pwa:user:"));
    if (!name) return false;
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(name); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const rows = await new Promise<unknown[]>((resolve, reject) => { const r = db.transaction("masterSystemInspections").objectStore("masterSystemInspections").getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    db.close();
    return JSON.stringify(rows).includes("typed before the autosave");
  }), { timeout: 8000 }).toBe(true);

  await page.waitForTimeout(1200); // let the list refresh and the route effect re-resolve
  expect(await page.evaluate(() => (window as unknown as { __removed: number }).__removed), "the form was not unmounted and re-mounted").toBe(0);
  expect(await field.evaluate((element) => (element as HTMLElement & { __mark?: number }).__mark), "same DOM element").toBe(1);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("typed before the autosave");

  // typing continues in the same element and is saved by the next autosave
  await page.keyboard.type(" and more");
  await expect(field).toHaveValue("typed before the autosave and more");
  await expect.poll(() => page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    const name = dbs.map((d) => d.name).find((n) => n?.startsWith("inspection-pwa:user:"));
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(name!); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const rows = await new Promise<unknown[]>((resolve, reject) => { const r = db.transaction("masterSystemInspections").objectStore("masterSystemInspections").getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    db.close();
    return JSON.stringify(rows).includes("typed before the autosave and more");
  }), { timeout: 8000 }).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __removed: number }).__removed)).toBe(0);
  await expect(field).toBeFocused();
});
