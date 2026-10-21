import { expect, test, type Page } from "@playwright/test";

async function openHome(page: Page) {
  await page.goto("/tests/technician-home-ownership.html?open-work=1");
  await page.getByRole("button", { name: /Technician/ }).click();
  await expect(page.locator(".job-card")).toHaveCount(8);
}

test("live customer, site, service and SV/RV filtering; clear; original navigation", async ({ page }) => {
  await openHome(page);
  const search = page.getByRole("searchbox", { name: "Search open work" });
  for (const [query, count] of [["  aCmE  ", 2], ["north DEPOT", 1], ["annual inspection", 2], ["sv-184", 1], ["beacon", 6], ["west workshop", 6], ["rv-63", 1]] as const) {
    await search.fill(query);
    await expect(page.locator(".job-card:visible")).toHaveCount(count);
    await expect(page.getByText(`Showing ${count} of 8`, { exact: true })).toBeVisible();
  }
  await search.fill("unmatched");
  await expect(page.getByText("No visits match", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(page.locator(".job-card:visible")).toHaveCount(8);
  await search.fill("sv-184");
  await page.locator("button.job-card").click();
  await expect(page.getByRole("button", { name: "Back to My Jobs" })).toBeVisible();
  await page.getByRole("button", { name: "Back to My Jobs" }).click();
  await search.fill("rv-63");
  await page.locator("a.job-card").click();
  await expect(page).toHaveURL(/#\/repair-visits\/41000000-0000-4000-8000-000000000063/);
});

test("collapse persists across reload; matching search temporarily expands both sections", async ({ page }) => {
  await openHome(page);
  for (const section of ["service", "repair"]) {
    const toggle = page.getByRole("button", { name: `Hide ${section} visits`, exact: true });
    await expect(toggle).toHaveAttribute("aria-controls", `open-work-${section}-content`);
    await toggle.click();
    await expect(page.getByRole("button", { name: `Show ${section} visits` })).toHaveAttribute("aria-expanded", "false");
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: "Service visits (2)", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Repair visits (6)", exact: true })).toBeVisible();
  await expect(page.locator(".job-card:visible")).toHaveCount(0);
  const search = page.getByRole("searchbox");
  for (const query of ["sv-184", "rv-63"]) {
    await search.fill(query);
    await expect(page.locator(".job-card:visible")).toHaveCount(1);
  }
  await page.getByRole("button", { name: "Hide repair visits" }).click();
  await expect(page.getByRole("heading", { name: "Repair visits (6) — 1 matches" })).toBeVisible();
  await search.fill("");
  await expect(page.locator(".job-card:visible")).toHaveCount(0);
  const preferences = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("inspection-pwa:open-work:")));
  expect(preferences.sort()).toEqual([
    ["inspection-pwa:open-work:v1:user:901:repair:collapsed", "true"],
    ["inspection-pwa:open-work:v1:user:901:service:collapsed", "true"]
  ]);
});

test("network-blocked filtering has no fetch calls", async ({ page, context }) => {
  await openHome(page);
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
  await page.evaluate(() => {
    (window as any).searchFetches = 0;
    window.fetch = async () => { (window as any).searchFetches++; throw new TypeError("Network blocked"); };
  });
  await context.setOffline(true);
  await expect(page.locator(".offline-notice").filter({ hasText: "changes are saved on this device" })).toBeVisible();
  await page.evaluate(() => { (window as any).searchFetches = 0; });
  for (const [query, count] of [["acme", 2], ["north depot", 1], ["sv-184", 1], ["rv-63", 1]] as const) {
    await page.getByRole("searchbox").fill(query);
    await expect(page.locator(".job-card:visible")).toHaveCount(count);
  }
  expect(await page.evaluate(() => (window as any).searchFetches)).toBe(0);
});

test("storage failures keep filtering and toggles usable", async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) { if (key.startsWith("inspection-pwa:open-work:")) throw new Error("Storage blocked"); return get.call(this, key); };
    Storage.prototype.setItem = function(key, value) { if (key.startsWith("inspection-pwa:open-work:")) throw new Error("Storage blocked"); return set.call(this, key, value); };
  });
  await openHome(page);
  await page.getByRole("button", { name: "Hide service visits" }).click();
  await page.getByRole("searchbox").fill("sv-184");
  await expect(page.locator(".job-card:visible")).toHaveCount(1);
});

test("responsive search and toggle layout", async ({ page }) => {
  await openHome(page);
  for (const width of [360, 375, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 800 });
    await page.getByRole("searchbox").fill("a");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await page.locator(".open-work-section-heading button").all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    if (width === 375 || width === 1920) await page.screenshot({ path: `test-results/open-work-${width}.png`, fullPage: true });
  }
});

test("collapse preference belongs to the signed-in user", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: "Hide service visits" }).click();
  async function signIn(username: string) {
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("button", { name: /Technician/ }).click();
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill("test-only");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await signIn("tech-b");
  await expect(page.locator(".job-card:visible")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Hide service visits" })).toHaveAttribute("aria-expanded", "true");
  await signIn("tech-a");
  await expect(page.getByRole("button", { name: "Show service visits" })).toHaveAttribute("aria-expanded", "false");
});
