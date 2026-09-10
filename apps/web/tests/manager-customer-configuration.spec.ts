import { expect, test } from "@playwright/test";

/**
 * DoD (Phase 8H STEP 3.1 slice 3b): the Manager customer-configuration screen
 * wraps the four per-system editors (label overrides, system configuration,
 * evidence policy, zones & locations) in one "Per-service settings" frame with a
 * single configuration-version indicator, an at-a-glance per-system summary of
 * which settings are set (read from `customer.configuration.enabledSystems`, no
 * extra fetch), and one shared per-system collapsible affordance
 * (`Edit … — <system>` toggle + `aria-expanded`, flipping to `Hide …` and a
 * unified "No unsaved changes." line on expand).
 *
 * DoD (STEP 3.1 final polish — the "Assigned Services" tick-list itself):
 *  - 1a an unassignable location-dependent system keeps its server
 *    `unavailableReason` AND gains an actionable pointer to the "Zones &
 *    locations" editor below (copy only — no scroll hijack, no new route);
 *  - 1b an already-enabled `dry_wet_riser` with an unset `riserMode` still
 *    surfaces the inline Riser mode control (the save is otherwise safely
 *    rejected server-side with `RISER_MODE_REQUIRED` before any revision write);
 *  - 1c unticking a system that has saved per-service settings shows a
 *    display-only warning that re-adding it will NOT restore that config.
 */
test("Manager customer configuration: consolidated per-service frame, summary badges, unified collapsible", async ({ page }) => {
  await page.goto("/tests/manager-customer-configuration.html");
  await page.getByRole("button", { name: "Run manager customer configuration checks", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await page.locator("#result").innerText()).status;
      } catch {
        return "RUNNING";
      }
    }, { timeout: 30_000 })
    .toBe("PASS");

  // Pin the STEP 3.1 final-polish checks by name so a regression in the picker
  // copy/aria fails here explicitly, not just as an aggregate FAIL.
  const checks: Array<{ name: string; value: boolean }> = JSON.parse(await page.locator("#result").innerText()).checks;
  const byName = Object.fromEntries(checks.map((check) => [check.name, check.value]));
  for (const name of [
    "unassignable co2 still shows the server reason",
    "unassignable co2 points the Manager at the Zones & locations editor below",
    "the actionable pointer is scoped to location-dependent systems only",
    "already-enabled riser with unset riserMode surfaces the inline Riser mode control",
    "untick warning names the removed system",
    "untick warning enumerates the settings that are dropped",
    "no untick warning while co2 (unchanged) is still ticked",
    "re-ticking clears the untick warning without an authority failure"
  ]) {
    expect(byName[name], name).toBe(true);
  }
});
