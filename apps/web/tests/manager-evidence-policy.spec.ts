import { expect, test } from "@playwright/test";

/**
 * DoD (Phase 8H STEP 3.1 slice 2): the Manager screen loads the
 * server-authoritative evidence-policy `field` descriptor + published policy list
 * + current value, picks a policy and saves, a reload shows it persisted, picking
 * "None" clears it, and a poisoned HTTP 200 body / `null` root / wrong
 * `systemKey` / an `evidencePolicyId` that is not one of the returned policy ids /
 * a poisoned `customer` echo all route to `onAuthorityFailure` (never `onSaved`)
 * rather than a render-time crash.
 */
test("Manager evidence-policy editor: load, pick, save, reload, clear, poisoned", async ({ page }) => {
  await page.goto("/tests/manager-evidence-policy.html");
  await page.getByRole("button", { name: "Run manager evidence policy checks", exact: true }).click();
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
