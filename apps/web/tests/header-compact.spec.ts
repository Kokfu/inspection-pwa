import { expect, test, type Page } from "@playwright/test";

/** I-28: compact phone header. The header + Menu bar must leave the content above ~40 % of the viewport, every control stays >= 44 px and named. */

async function signIn(page: Page, width: number, health: { status: number } | "abort" = { status: 200 }, auth: "ok" | "offline" = "ok") {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/health") return health === "abort" ? route.abort("connectionrefused") : route.fulfill({ status: health.status, json: { status: "ok" } });
    if (path === "/api/auth/me" && auth === "offline") return route.abort("connectionrefused");
    let json: unknown = {};
    if (path === "/api/auth/me") json = { user: { id: 805, username: "tech", role: "inspector" } };
    else if (path === "/api/customers/service-format-options") json = { systems: [] };
    else if (path === "/api/customers/upcoming-service") json = { customers: [], unscheduledCustomers: [] };
    else if (path === "/api/customers") json = { customers: [] };
    else if (path.endsWith("/inspection-jobs")) json = { jobs: [] };
    await route.fulfill({ json });
  });
  await page.setViewportSize({ width, height: 721 });
  await page.goto("/tests/manager-dashboard-navigation.html#/jobs");
  await page.getByRole("button", { name: /^Technician/ }).click();
  await expect(page.locator(".connection-state")).toBeVisible();
}

const measure = (page: Page) => page.evaluate(() => {
  const box = (selector: string) => { const e = document.querySelector(selector); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
  return {
    header: box(".app-header")!, menu: box(".app-mobile-navigation")!, content: box(".app-shell-content > *")!,
    controls: [...document.querySelectorAll(".app-header button, .app-mobile-navigation summary")].map((e) => { const r = e.getBoundingClientRect(); return { name: (e.textContent || "").trim(), w: r.width, h: r.height, right: r.right }; }),
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    viewport: window.innerHeight
  };
});

for (const width of [360, 320]) {
  test(`I-28: at ${width}px the header and Menu leave the content above 40 % of the viewport`, async ({ page }) => {
    await signIn(page, width);
    await page.waitForTimeout(300);
    const m = await measure(page);
    expect(m.menu.bottom, "Menu bar bottom").toBeLessThan(m.viewport * 0.4);
    expect(m.content.top, "content start").toBeLessThan(m.viewport * 0.4);
    expect(m.menu.height).toBeGreaterThanOrEqual(44);
    expect(m.menu.height).toBeLessThan(52);
    expect(m.overflowX).toBe(false);
    for (const control of m.controls) {
      expect(control.h, control.name).toBeGreaterThanOrEqual(44);
      expect(control.w, control.name).toBeGreaterThanOrEqual(44);
      expect(control.right, control.name).toBeLessThanOrEqual(width);
    }
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(page.getByText("Menu", { exact: true })).toBeVisible();
    await expect(page.locator(".sync-summary")).toHaveText("All submitted changes synced");
    // at 360 px the connection chip, Sign out and the title share one row (below 360 px the chip gets its own row)
    if (width < 360) return;
    const rows = await page.evaluate(() => ["#app-title", ".connection-state", ".app-account button"].map((s) => { const r = document.querySelector(s)!.getBoundingClientRect(); return [r.top, r.bottom]; }));
    for (const [top, bottom] of rows) expect(top).toBeLessThan(rows[2][1]), expect(bottom).toBeGreaterThan(rows[2][0]);
  });
}

for (const width of [360, 320]) test(`I-28: at ${width}px Server unreachable stays visible and the build id is hidden, nothing overflows, controls keep 44 px`, async ({ page }) => {
  await signIn(page, width, "abort");
  await expect(page.locator(".connection-state")).toHaveText("Server unreachable");
  const m = await measure(page);
  expect(m.overflowX).toBe(false);
  expect(m.menu.bottom).toBeLessThan(m.viewport * 0.4);
  for (const control of m.controls) { expect(control.h, control.name).toBeGreaterThanOrEqual(44); expect(control.right).toBeLessThanOrEqual(width); }
  await expect(page.locator(".app-build")).toHaveCount(0);
  const chip = (await page.locator(".connection-state").boundingBox())!;
  const signOut = (await page.getByRole("button", { name: "Sign out" }).boundingBox())!;
  expect(chip.x + chip.width, "chip does not overlap Sign out").toBeLessThanOrEqual(signOut.x);
});

test("I-28: the connection chip and the sync text are separate live regions", async ({ page }) => {
  await signIn(page, 360);
  const live = await page.locator(".app-header [aria-live=polite]").evaluateAll((els) => els.map((e) => e.textContent));
  expect(live.length).toBe(2);
  expect(live[0]).toBe("Online");
  expect(live[1]).toContain("All submitted changes synced");
});
