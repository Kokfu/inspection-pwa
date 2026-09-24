import { expect, test } from "@playwright/test";

/**
 * 2026-09-19: the per-service frame below was replaced by a "Services" area of
 * one card per service (each opening the per-service editor, covered by
 * manager-service-editor.spec.ts); the layout checks were updated to the cards.
 * The Assigned Services checks cover optional location presets and lone-zone state.
 *
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
 *  - 1a location presets do not block service assignment;
 *  - 1b an already-enabled `dry_wet_riser` with an unset `riserMode` still
 *    surfaces the inline Riser mode control (the save is otherwise safely
 *    rejected server-side with `RISER_MODE_REQUIRED` before any revision write);
 *  - 1c unticking a system that has saved per-service settings shows a
 *    display-only warning that re-adding it will NOT restore that config.
 *
 * DoD (STEP 3.1 final-polish P1 — chip/warning alignment): on a location-dependent
 * system with one zone and zero locations (a state the server permits), the
 * "Zones & locations" summary chip and the untick-drops-config warning must agree
 * that it is real, droppable config — the summary's "set" test was widened to the
 * same OR test `enabledSystemHasSavedSettings` uses.
 */
test("Manager customer configuration: Services cards, summary chips, Assigned Services checks", async ({ page }) => {
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
    "retired unassigned service is visible but cannot be selected",
    "retired unassigned service explains why",
    "already-enabled retired service stays selected and re-savable",
    "co2 remains assignable",
    "no service asks for location configuration before assignment",
    "already-enabled riser with unset riserMode surfaces the inline Riser mode control",
    "untick warning names the removed system",
    "untick warning enumerates the settings that are dropped",
    "no untick warning while co2 (unchanged) is still ticked",
    "re-ticking clears the untick warning without an authority failure",
    "lone-zone wet_chemical uses General while showing saved zone",
    "lone-zone wet_chemical: service card chip reports the saved zone before any untick",
    "lone-zone wet_chemical: unticking fires the drop-config warning naming it",
    "lone-zone wet_chemical: service card chip and untick warning agree (both 'has something')",
    "lone-zone wet_chemical: re-ticking clears the warning without an authority failure"
  ]) {
    expect(byName[name], name).toBe(true);
  }
});
