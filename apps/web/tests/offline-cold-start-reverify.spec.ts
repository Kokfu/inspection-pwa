import { expect, test } from "@playwright/test";

/**
 * I-78: a cold start while the server is unreachable (Wi-Fi up, so no browser "online" event ever fires) stayed
 * "Offline" until the technician tapped Reconnect. The app now asks again quietly and recovers by itself, without
 * touching the open screen while the server is still down.
 */
test("I-78: an unverified cold start re-verifies by itself once the server answers", async ({ page }) => {
  await page.clock.install();
  await page.goto("/tests/offline-cold-start-reverify.html");
  await page.locator("#run").click();
  await expect(page.locator("#result")).toContainText("READY");
  const reconnect = page.getByRole("button", { name: "Reconnect" });
  await expect(reconnect).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /^Technician/ }).click().catch(() => undefined);

  // Server still down: quiet probes only, the header stays offline and the Reconnect button stays.
  const before = await page.evaluate(() => (window as unknown as { __meCalls: number }).__meCalls);
  await page.clock.fastForward(50_000);
  await expect(reconnect).toBeVisible();
  const during = await page.evaluate(() => (window as unknown as { __meCalls: number }).__meCalls);
  expect(during, "it keeps asking while unverified").toBeGreaterThan(before);

  // Server back: the next tick verifies the session with no tap.
  await page.evaluate(() => { (window as unknown as { __serverUp: boolean }).__serverUp = true; });
  await page.clock.fastForward(20_000);
  await expect(reconnect).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByText("Offline", { exact: true })).toHaveCount(0);
});
