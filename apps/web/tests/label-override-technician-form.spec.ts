import { expect, test } from "@playwright/test";

/**
 * DoD (slice 1a-ii): the technician form renders an overridden field label from
 * the FROZEN job snapshot, and a snapshot without the key renders the definition
 * label. Also proves the labels resolve with the network cut — they come from
 * the cached snapshot, never a live Manager edit or the mutable template.
 */
test("technician form renders frozen label overrides, and falls back with no key — offline", async ({ page, context }) => {
  await page.goto("/tests/label-override-technician-form.html");
  // Wait until the full module graph is loaded (harness sets this only after all
  // its imports resolve), THEN cut the network, so nothing below can race a lazy
  // Vite chunk fetch. The checks then prove labels come from the cached frozen
  // snapshot, not a live request.
  await page.locator("body[data-harness-ready='1']").waitFor({ timeout: 60_000 });
  await context.setOffline(true);
  await page.getByRole("button", { name: "Run label override technician form checks", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await page.locator("#result").innerText()).status;
      } catch {
        return "RUNNING";
      }
    }, { timeout: 30_000 })
    .toBe("PASS");
  const outcome = JSON.parse(await page.locator("#result").innerText()) as { navigatorOnLine: boolean };
  expect(outcome.navigatorOnLine).toBe(false);
});
