import { expect, test, type Page } from "@playwright/test";

/**
 * CR-06: tapping a result option (Good / Not Good / Complete Repair / N.A.) must not move the page. For every inspection
 * form the real App is opened on a phone viewport, a result option is scrolled part-way down and tapped, and the scroll
 * position of the window and of every scrolled container is compared before the tap, right after it, after the
 * remark/photo block for the new answer has mounted, and after the 1.5 s autosave has run and re-resolved the record.
 */
const systems = [
  "automatic_sprinkler", "hose_reel", "hydrant", "dry_wet_riser", "fire_alarm_detector", "fire_intercom", "co2_fire_extinguisher",
  "fm200_fire_suppression", "smoke_ventilation", "fire_rated_roller_shutter", "wet_chemical", "portable_fire_extinguisher"
] as const;
const options = ["Not Good", "Good", "Complete Repair", "N.A."] as const;
const TOLERANCE = 2;

const scrollState = (page: Page) => page.evaluate(() => {
  const scrolled: Record<string, number> = {};
  document.querySelectorAll<HTMLElement>("*").forEach((element) => {
    if (element.scrollTop > 0 && element !== document.documentElement && element !== document.body) scrolled[`${element.tagName.toLowerCase()}.${element.className}`] = Math.round(element.scrollTop);
  });
  return { y: Math.round(window.scrollY), scrolled, height: document.documentElement.scrollHeight };
});

async function open(page: Page, systemKey: string) {
  await page.goto("/tests/result-tap-scroll.html?online"); // a healthy server, like a phone on Wi-Fi
  await page.waitForFunction(() => typeof (window as unknown as { openSystem?: unknown }).openSystem === "function");
  const ok = await page.evaluate((key) => (window as unknown as { openSystem: (k: string) => Promise<boolean> }).openSystem(key), systemKey);
  expect(ok, await page.locator("#result").innerText()).toBe(true);
  // Roller Shutter asks "how many zones and locations?" before the form; answer it so the form has several rows.
  const start = page.getByRole("button", { name: "Start Inspection" });
  if (await start.count()) {
    if (await page.getByLabel("Locations in each zone").count()) await page.getByLabel("Locations in each zone").fill("4");
    await start.click();
    await expect(page.getByRole("button", { name: "Save Draft" })).toBeVisible();
  }
}

test.use({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true });
test.setTimeout(120_000);

for (const systemKey of systems) {
  test(`CR-06 ${systemKey}: tapping a result option does not move the page`, async ({ page }) => {
    await open(page, systemKey);
    const findings: string[] = [];
    let tapped = 0;
    for (const label of options) {
      // REPAIR-DISABLED (CR-09): retired option tap is skipped; separate test.skip below records it.
      if (label === "Complete Repair") continue;
      const buttons = page.locator(".result-option", { hasText: new RegExp(`^\\s*✓?\\s*${label.replace(".", "\\.")}$`) });
      const count = await buttons.count();
      if (count === 0) { findings.push(`${label}: not present`); continue; }
      // Part-way down the form: the middle button, and the last one, so a jump is measurable (not already at scrollY 0).
      for (const index of Array.from(new Set([Math.floor(count / 2), count - 1]))) {
        const button = buttons.nth(index);
        await button.evaluate((element) => element.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(150);
        const before = await scrollState(page);
        const box = await button.boundingBox();
        if (!box) continue;
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        tapped += 1;
        await page.waitForTimeout(60);
        const soon = await scrollState(page);
        await page.waitForTimeout(2800); // past the 1.5 s autosave + the record refresh that follows it
        const after = await scrollState(page);
        const moved = [soon, after].some((state) => Math.abs(state.y - before.y) > TOLERANCE || JSON.stringify(state.scrolled) !== JSON.stringify(before.scrolled));
        if (moved) findings.push(`${label}#${index}/${count}: before ${JSON.stringify(before)} soon ${JSON.stringify(soon)} after-autosave ${JSON.stringify(after)}`);
        // Put the answer back so each tap starts from the same form.
      }
    }
    // Fire Alarm answers its charger / function / alarm-device checks with a native <select>, not the button selector.
    const selects = page.locator("select").filter({ has: page.locator("option", { hasText: /^Not Good$/ }) });
    const selectCount = await selects.count();
    for (const label of ["Not Good", "Good", "Complete Repair"]) {
      // REPAIR-DISABLED (CR-09): retired native-select tap is skipped; separate test.skip below records it.
      if (label === "Complete Repair") continue;
      for (const index of Array.from(new Set([Math.floor(selectCount / 2), selectCount - 1])).filter((i) => i >= 0 && i < selectCount)) {
        const select = selects.nth(index);
        await select.evaluate((element) => { element.scrollIntoView({ block: "center" }); (element as HTMLSelectElement).focus(); });
        await page.waitForTimeout(150);
        const before = await scrollState(page);
        await select.selectOption({ label });
        tapped += 1;
        await page.waitForTimeout(60);
        const soon = await scrollState(page);
        await page.waitForTimeout(2800);
        const after = await scrollState(page);
        const moved = [soon, after].some((state) => Math.abs(state.y - before.y) > TOLERANCE || JSON.stringify(state.scrolled) !== JSON.stringify(before.scrolled));
        if (moved) findings.push(`select ${label}#${index}/${selectCount}: before ${JSON.stringify(before)} soon ${JSON.stringify(soon)} after-autosave ${JSON.stringify(after)}`);
      }
    }
    console.log(`RESULT ${systemKey}: tapped ${tapped}, ${findings.length ? findings.join(" | ") : "no scroll change"}`);
    if (systemKey !== "portable_fire_extinguisher") expect(tapped, "the form has result options to tap").toBeGreaterThan(0);
    expect(findings.filter((finding) => !finding.endsWith("not present")), `${systemKey}: scroll position changed`).toEqual([]);
  });
}

// REPAIR-DISABLED (CR-09): owner retired this option; original tap paths remain above for restoration.
for (const systemKey of systems) test.skip(`CR-06 ${systemKey}: Complete Repair tap`, () => {});

/**
 * CR-06 root cause: a phone's Wi-Fi / mobile-data hand-over fires `offline` then `online`. The App re-verifies the session
 * ("verifying") and, by design (fail-closed authority, routeRefresh.ts), every route replaces the open form with an
 * "Opening … inspection" placeholder until its authority is re-resolved. The page collapsed to a few hundred px and the
 * browser clamped the scroll position to the top, so the form came back at the top. The hiding stays; the form must come
 * back exactly where the technician was. Same scenario for every form, against a healthy server (the phone is online),
 * part-way down the form, right after a result was tapped.
 */
test.describe("CR-06 network hand-over while a form is open", () => {
  for (const systemKey of systems) {
    test(`${systemKey}: the form comes back at the scroll position the technician was at`, async ({ page }) => {
      await page.goto("/tests/result-tap-scroll.html?online");
      await page.waitForFunction(() => typeof (window as unknown as { openSystem?: unknown }).openSystem === "function");
      const ok = await page.evaluate((key) => (window as unknown as { openSystem: (k: string) => Promise<boolean> }).openSystem(key), systemKey);
      expect(ok, await page.locator("#result").innerText()).toBe(true);
      const start = page.getByRole("button", { name: "Start Inspection" });
      if (await start.count()) { if (await page.getByLabel("Locations in each zone").count()) await page.getByLabel("Locations in each zone").fill("4"); await start.click(); await expect(page.getByRole("button", { name: "Save Draft" })).toBeVisible(); }
      const control = page.locator(".result-option, select:has(option)").nth(14);
      if (!(await control.count())) test.skip(true, "this form has no result controls");
      await control.evaluate((element) => element.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(300);
      // A real tap on a result, then the hand-over before the autosave has even run.
      const box = (await control.boundingBox())!;
      if ((await control.evaluate((element) => element.tagName)) === "BUTTON") await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await page.evaluate(() => {
        const mount = document.querySelector("#mount")!;
        (window as unknown as { __gone: string[] }).__gone = [];
        new MutationObserver(() => { if (!mount.querySelector(".result-option, select")) (window as unknown as { __gone: string[] }).__gone.push(`@${Math.round(window.scrollY)}`); }).observe(mount, { subtree: true, childList: true });
      });
      const before = await scrollState(page);
      await page.evaluate(() => (window as unknown as { flapNetwork: () => void }).flapNetwork());
      await page.waitForTimeout(3500);
      const after = await scrollState(page);
      const gone = await page.evaluate(() => (window as unknown as { __gone: string[] }).__gone);
      console.log(`FLAP ${systemKey}: before ${before.y} after ${after.y} formUnmounted ${gone.length ? gone.join(",") : "never"}`);
      await expect(page.locator(".result-option, select").first(), `${systemKey}: the form came back`).toBeVisible();
      expect(Math.abs(after.y - before.y), `${systemKey}: scroll moved ${before.y} -> ${after.y}`).toBeLessThanOrEqual(TOLERANCE);
    });
  }
});
