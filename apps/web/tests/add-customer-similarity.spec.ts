import { expect, test } from "@playwright/test";

for (const role of ["technician", "manager"] as const) {
  test(`${role}: use existing or create anyway`, async ({ page, context }) => {
    const posts: unknown[] = [];
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === "POST") {
        posts.push(route.request().postDataJSON());
        return route.fulfill({ json: { customer: {} } });
      }
      if (path === "/api/manager/customers") return route.fulfill({ json: { customers: [{ customer: { id: "existing", displayName: "ABC Sdn Bhd" } }] } });
      return route.fulfill({ json: { systems: [{ key: "hose_reel", displayName: "Hose Reel", sortOrder: 1, assignable: true, retiredAt: null }] } });
    });
    await page.goto(`/tests/add-customer-similarity.html${role === "manager" ? "?manager" : ""}`);
    const name = page.getByLabel("Customer display name");
    await expect(name).toBeVisible();
    if (role === "technician") await context.setOffline(true);
    await name.fill("ABC Sdn. Bhd.");
    const warning = page.getByRole("region", { name: "Similar customers" });
    await expect(warning).toBeVisible();
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: width === 768 ? 1024 : 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await warning.getByRole("button", { name: "Use ABC Sdn Bhd" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      if (width !== 768) await page.screenshot({ path: `test-results/${role}-similarity-${width}.png`, fullPage: true });
    }
    await warning.getByRole("button", { name: "Use ABC Sdn Bhd" }).click();
    if (role === "manager") await expect(page).toHaveURL(/#\/manager-customer\/existing$/);
    else await expect(page.locator("body")).toHaveAttribute("data-selected", "existing");
    expect(posts).toHaveLength(0);
    await page.getByLabel("Hose Reel").check();
    await warning.getByRole("button", { name: "Create anyway" }).click();
    if (role === "manager") {
      await expect(page.locator("body")).toHaveAttribute("data-created", "true");
      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({ displayName: "ABC Sdn. Bhd.", systemKeys: ["hose_reel"] });
    } else {
      await expect(page.getByText("Customer saved on this device, pending sync.")).toBeVisible();
      expect(posts).toHaveLength(0);
      const queued = await page.evaluate(async () => {
        // @ts-expect-error Vite serves the browser module by absolute URL.
        const { localDatabase } = await import("/src/db/localDatabase.ts");
        return localDatabase.syncOutbox.toArray();
      });
      expect(queued).toHaveLength(1);
      expect(queued[0].payload).toMatchObject({ requestId: queued[0].operationId, displayName: "ABC Sdn. Bhd." });
    }
  });
}
