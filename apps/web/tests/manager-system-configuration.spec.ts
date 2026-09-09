import { expect, test } from "@playwright/test";

/**
 * DoD (Phase 8H STEP 3.1 slice 1): the Manager screen loads the
 * server-authoritative system-configuration schema + stored value, edits it and
 * saves, a reload shows it persisted, an invalid value surfaces the server
 * validation message inline WITHOUT tripping the authority-failure path, and a
 * poisoned HTTP 200 body / `null` root / poisoned `customer` echo all route to
 * `onAuthorityFailure` rather than a render-time crash.
 */
test("Manager system-configuration editor: load, edit, save, reload, invalid, poisoned", async ({ page }) => {
  await page.goto("/tests/manager-system-configuration.html");
  await page.getByRole("button", { name: "Run manager system configuration checks", exact: true }).click();
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
