import { expect, test, type Page } from "@playwright/test";

/** I-01 / I-06 / I-10 in a real browser, at phone width, through the real App. */

async function signIn(page: Page, health: { status: number } | "abort" = { status: 200 }) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/health") return health === "abort" ? route.abort("connectionrefused") : route.fulfill({ status: health.status, json: { status: "ok" } });
    let json: unknown = {};
    if (path === "/api/auth/me") json = { user: { id: 805, username: "tech", role: "inspector" } };
    else if (path === "/api/customers/service-format-options") json = { systems: [] };
    else if (path === "/api/customers/upcoming-service") json = { customers: [], unscheduledCustomers: [] };
    else if (path === "/api/customers") json = { customers: [] };
    else if (path.endsWith("/inspection-jobs")) json = { jobs: [] };
    await route.fulfill({ json });
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tests/manager-dashboard-navigation.html#/jobs");
  await page.getByRole("button", { name: /^Technician/ }).click();
  await expect(page.locator(".connection-state")).toBeVisible();
}

test("I-06: at 360px the header has 44px buttons, >=12px status text and no horizontal scroll", async ({ page }) => {
  await signIn(page);
  const signOut = page.getByRole("button", { name: "Sign out" });
  const box = (await signOut.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
  for (const selector of [".app-build", ".app-header .eyebrow", ".connection-state", ".sync-summary", ".app-account button"]) {
    const size = await page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size, selector).toBeGreaterThanOrEqual(12);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("I-01: a reachable network with an unreachable server shows 'Server unreachable', then recovers", async ({ page }) => {
  await signIn(page, "abort");
  await expect(page.locator(".connection-state")).toHaveText("Server unreachable");
  await page.unroute("**/api/**");
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path === "/api/auth/me" ? { user: { id: 805, username: "tech", role: "inspector" } } : path === "/api/health" ? { status: "ok" } : {} });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".connection-state")).toHaveText("Online");
});

test("I-01: a server that answers (even with an error) is not reported unreachable", async ({ page }) => {
  await signIn(page, { status: 500 });
  await page.waitForTimeout(800);
  await expect(page.locator(".connection-state")).toHaveText("Online");
});

test("I-10: with nothing unsynced, sign-out does not prompt", async ({ page }) => {
  await signIn(page);
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: /^Technician/ })).toBeVisible();
  expect(dialogs).toEqual([]);
});

test("I-10: sign-out names unsynced work; cancel keeps the session, accept signs out", async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("inspection-pwa:user:805");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("syncOutbox", "readwrite");
      tx.objectStore("syncOutbox").put({ operationId: "00000000-0000-4000-8000-0000000000aa", entityType: "inspection", entityId: "00000000-0000-4000-8000-0000000000ab", action: "create", payload: {}, createdAt: new Date().toISOString(), attempts: 0, status: "Pending", activeKey: "x" });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  const dialogs: string[] = [];
  let accept = false;
  page.on("dialog", async (dialog) => { dialogs.push(dialog.message()); if (accept) await dialog.accept(); else await dialog.dismiss(); });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain("1 submitted item not yet synced (1 waiting to sync)");
  await page.waitForTimeout(500);
  await expect(page.locator(".connection-state")).toBeVisible(); // cancelled: still signed in
  accept = true;
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: /^Technician/ })).toBeVisible();
  expect(dialogs).toHaveLength(2);
});
