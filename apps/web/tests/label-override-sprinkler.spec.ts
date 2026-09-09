import { expect, test } from "@playwright/test";

/**
 * DoD (slice 1a-iii): the Automatic Sprinkler technician form renders an
 * overridden checklist / measurement-value label from the FROZEN job snapshot,
 * a record without the key renders the definition label, and the accepted view
 * renders the server-applied override exactly once (never twice). Runs with the
 * network cut, so the technician labels are proven to come from the cached frozen
 * record, never a live Manager edit.
 */
test("Automatic Sprinkler renders frozen label overrides in the form and accepted view — offline", async ({ page, context }) => {
  await page.goto("/tests/label-override-sprinkler.html");
  await page.locator("body[data-harness-ready='1']").waitFor({ timeout: 60_000 });
  await context.setOffline(true);
  await page.getByRole("button", { name: "Run Automatic Sprinkler label override checks", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await page.locator("#result").innerText()).status;
      } catch {
        return "RUNNING";
      }
    }, { timeout: 30_000 })
    .toBe("PASS");
  const outcome = JSON.parse(await page.locator("#result").innerText()) as {
    navigatorOnLine: boolean;
    checks: Array<{ name: string; value: boolean }>;
  };
  expect(outcome.checks.every((check) => check.value), JSON.stringify(outcome.checks)).toBe(true);
  expect(outcome.navigatorOnLine).toBe(false);
});
