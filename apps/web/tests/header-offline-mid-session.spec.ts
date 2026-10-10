import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * I-42: the header chip must leave "Online" when the browser goes offline in the middle of a signed-in session.
 * Phone evidence: the `offline` event reached the page but the chip stayed "Online" in 2 of 4 trials. On the USB test
 * rig the tunnel (and proxy) can still answer for a moment after Wi-Fi drops, so the re-probe that follows the event
 * succeeds and used to put the auth state straight back to "verified" while navigator.onLine was false.
 */

type Mode = { authMe: "ok" | "abort" | "slow" };

async function signIn(page: Page, mode: Mode) {
  const handler = async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") {
      if (mode.authMe === "abort") return route.abort("connectionrefused");
      if (mode.authMe === "slow") await new Promise((resolve) => setTimeout(resolve, 700));
    }
    if (path === "/api/health" && mode.authMe === "abort") return route.abort("connectionrefused");
    let json: unknown = {};
    if (path === "/api/auth/me") json = { user: { id: 805, username: "tech", role: "inspector" } };
    else if (path === "/api/health") json = { status: "ok" };
    else if (path === "/api/customers/service-format-options") json = { systems: [] };
    else if (path === "/api/customers/upcoming-service") json = { customers: [], unscheduledCustomers: [] };
    else if (path === "/api/customers") json = { customers: [] };
    else if (path.endsWith("/inspection-jobs")) json = { jobs: [] };
    await route.fulfill({ json });
  };
  await page.route("**/api/**", handler);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tests/manager-dashboard-navigation.html#/jobs");
  await page.getByRole("button", { name: /^Technician/ }).click();
  await expect(page.locator(".connection-state")).toHaveText("Online");
}

test("I-42: really offline (requests fail): the chip leaves Online and offers Reconnect", async ({ page, context }) => {
  const mode: Mode = { authMe: "ok" };
  await signIn(page, mode);
  mode.authMe = "abort";
  await context.setOffline(true);
  await expect(page.locator(".connection-state")).toHaveText("Offline", { timeout: 5000 });
  await expect(page.getByRole("button", { name: "Reconnect" })).toBeVisible();
});

test("I-42: the browser reports offline while the server still answers (USB tunnel race): the chip still leaves Online", async ({ page, context }) => {
  const mode: Mode = { authMe: "ok" };
  await signIn(page, mode);
  await context.setOffline(true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(page.locator(".connection-state")).toHaveText("Offline", { timeout: 5000 });
  // Still Offline a moment later: a late successful probe must not flip it back.
  await page.waitForTimeout(1500);
  await expect(page.locator(".connection-state")).toHaveText("Offline");
});

test("I-42: a probe started before the offline event cannot win after it", async ({ page, context }) => {
  const mode: Mode = { authMe: "slow" };
  await signIn(page, mode);
  // Start a reconnect-style probe (slow answer), then go offline while it is in flight.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(150);
  await context.setOffline(true);
  await expect(page.locator(".connection-state")).toHaveText("Offline", { timeout: 5000 });
  await page.waitForTimeout(2000);
  await expect(page.locator(".connection-state")).toHaveText("Offline");
});

test("I-42: several offline/online cycles end on the right chip, and the page never blocks", async ({ page, context }) => {
  const mode: Mode = { authMe: "ok" };
  await signIn(page, mode);
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await context.setOffline(true);
    await expect(page.locator(".connection-state")).toHaveText("Offline", { timeout: 5000 });
    await context.setOffline(false);
    await expect(page.locator(".connection-state")).toHaveText("Online", { timeout: 8000 });
  }
  await context.setOffline(true);
  await expect(page.locator(".connection-state")).toHaveText("Offline", { timeout: 5000 });
  // Data safety: the signed-in page is still usable offline (nothing is disabled or signed out).
  await expect(page.getByRole("button", { name: "Sign out" })).toBeEnabled();
});
