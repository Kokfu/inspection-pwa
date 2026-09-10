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
});
