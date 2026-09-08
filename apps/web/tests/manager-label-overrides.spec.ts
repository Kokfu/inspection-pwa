import { expect, test } from "@playwright/test";

/**
 * DoD (slice 1a-ii): the Manager screen loads the render-path label tree
 * (definitionLabel + effectiveLabel + overridden), edits one label and saves,
 * a reload shows the effectiveLabel persisted, clearing restores the
 * definitionLabel, and a server validation rejection (UNKNOWN_LABEL_PATH /
 * INVALID_LABEL_OVERRIDE / LABEL_OVERRIDES_TOO_LARGE) surfaces as a visible
 * message without tripping the authority-failure path.
 */
test("Manager label-override editor: load, edit, save, reload, clear, rejected", async ({ page }) => {
  await page.goto("/tests/manager-label-overrides.html");
  await page.getByRole("button", { name: "Run manager label overrides checks", exact: true }).click();
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
