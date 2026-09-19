import { expect, test } from "@playwright/test";

/**
 * DoD (slice 1a-ii, ported 2026-09-19 to the form-shaped editor): the Manager
 * "Form wording" tab loads the render-path label tree (definitionLabel +
 * effectiveLabel + overridden), edits one label inline and saves, a reload shows
 * the effectiveLabel persisted, Reset to default restores the definitionLabel,
 * and a server validation rejection (UNKNOWN_LABEL_PATH / INVALID_LABEL_OVERRIDE /
 * LABEL_OVERRIDES_TOO_LARGE) surfaces as a visible message without tripping the
 * authority-failure path. Malformed HTTP 200 GET bodies (labels:[null], a null
 * root, a formLayout that disagrees with the labels) and every poisoned PUT
 * `customer` echo route to onAuthorityFailure, never onSaved.
 */
test("Manager label-override editor: load, edit, save, reload, clear, rejected, poisoned", async ({ page }) => {
  await page.goto("/tests/manager-label-overrides.html");
  await page.getByRole("button", { name: "Run manager label overrides checks", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await page.locator("#result").innerText()).status;
      } catch {
        return "RUNNING";
      }
    }, { timeout: 60_000 })
    .not.toBe("RUNNING");
  const outcome: { status: string; checks: Array<{ name: string; value: boolean }> } = JSON.parse(await page.locator("#result").innerText());
  expect(outcome.checks.filter((check) => !check.value).map((check) => check.name)).toEqual([]);
  // 40 checks carried over from the flat-editor harness + 4 new (no initial Custom badge, Custom+Unsaved before save, default-wording line, formLayout mismatch).
  expect(outcome.checks).toHaveLength(44);
  expect(outcome.status).toBe("PASS");
});
