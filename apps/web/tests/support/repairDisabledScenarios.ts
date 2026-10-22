import { expect, test } from "@playwright/test";
// The CR-09 scenarios live here so repair-disabled.spec.ts and the healthy-online wrapper
// (repair-c1-inspection-regressions.spec.ts) each register them; Playwright forbids a spec importing a spec.
export function registerRepairDisabledScenarios() {
  const systems = ["automatic_sprinkler", "hose_reel", "hydrant", "dry_wet_riser", "fire_alarm_detector", "fire_intercom", "co2_fire_extinguisher", "fm200_fire_suppression", "smoke_ventilation", "fire_rated_roller_shutter", "wet_chemical", "portable_fire_extinguisher"];
  for (const system of systems) {
    test("CR-09 " + system + ": new form has no Complete Repair choice", async ({ page }) => {
      await page.goto("/tests/result-tap-scroll.html");
      await page.waitForFunction(() => typeof (window as any).openSystem === "function");
      expect(await page.evaluate((key) => (window as any).openSystem(key), system)).toBe(true);
      const start = page.getByRole("button", { name: "Start Inspection" });
      // A fresh Hose Reel fixture requires row setup. Startup reconciliation can
      // briefly unmount it; an immediate count must not skip this required step.
      if (system === "hose_reel") {
        await expect(start).toBeVisible();
        await start.click();
      } else if (await start.count()) {
        if (await page.getByLabel("Locations in each zone").count()) await page.getByLabel("Locations in each zone").fill("2");
        await start.click();
      }
      await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Complete Repair", exact: true })).toHaveCount(0);
      await expect(page.locator('option[value="complete_repair"]')).toHaveCount(0);
      if (system !== "portable_fire_extinguisher") expect(await page.locator(".result-option, select option[value='good']").count()).toBeGreaterThan(0);
    });
    if (!["portable_fire_extinguisher", "fire_rated_roller_shutter"].includes(system)) test("CR-09 " + system + ": saved retired draft is preserved and can change offline", async ({ page }) => {
      await page.goto("/tests/result-tap-scroll.html?cr09");
      await page.waitForFunction(() => typeof (window as any).openSystem === "function");
      expect(await page.evaluate((key) => (window as any).openSystem(key), system)).toBe(true);
      await expect(page.getByText("Complete Repair (no longer selectable)", {exact:true})).toBeVisible();
      const saved = () => page.evaluate(async () => {
        const {localDatabase} = await import(/* @vite-ignore */ "/src/db/localDatabase.ts" as string);
        const w = window as any;
        const r = await localDatabase.masterSystemInspections.get(w.__clientUuid) ?? await localDatabase.masterSystemFormInstances.get(w.__clientUuid);
        return w.__repairPath.reduce((obj:any,key:string) => obj[key], r.responses);
      });
      expect(await saved()).toBe("complete_repair");
      await page.context().setOffline(true);
      const retired = page.getByText("Complete Repair (no longer selectable)", {exact:true});
      // Going offline makes the app re-verify its session and re-mount the ordinary form, which re-reads the saved
      // draft. A choice made during that transition is discarded by the re-mount (an unsaved edit, not a saved one),
      // so make the choice and save it as one retryable unit and require the saved draft to carry it.
      await expect(async () => {
        await expect(retired).toBeVisible();
        const group = retired.locator('xpath=..');
        if (system === "fire_alarm_detector") await group.locator("select").selectOption("good");
        else await group.getByRole("button", {name:"Good",exact:true}).click();
        await page.getByRole("button", {name:"Save Draft",exact:true}).click();
        expect(await saved()).toBe("good");
      }).toPass({ timeout: 15_000 });
      await expect(retired).toHaveCount(0);
    });
  }
  test("CR-09 Roller Shutter retired draft can change", async ({page}) => {
    await page.goto("/tests/fire-rated-roller-shutter-form.html?configured&cr09");
    const retired=page.getByText("Complete Repair (no longer selectable)",{exact:true});
    await expect(retired).toBeVisible();
    expect(await page.evaluate(async()=> (await (window as any).inspect()).stored.responses.rows[0].autoAlarmModeResult)).toBe("complete_repair");
    await page.context().setOffline(true);
    await retired.locator('xpath=..').getByRole("button",{name:"Good",exact:true}).click();
    await page.getByRole("button",{name:"Save Draft",exact:true}).click();
    await expect.poll(()=>page.evaluate(async()=> (await (window as any).inspect()).stored.responses.rows[0].autoAlarmModeResult)).toBe("good");
  });
  test("CR-09 accepted view and final report retain Complete Repair", async ({page}) => {
    await page.goto("/tests/repair-disabled-display.html");
    await expect(page.locator("#accepted .accepted-results")).toContainText("Complete Repair");
    await expect(page.locator("#report .report-section")).toContainText("Complete Repair");
    await expect(page.getByText("Complete Repair (no longer selectable)",{exact:true})).toHaveCount(0);
  });
}
