import { expect, test } from "@playwright/test";

test("FM200 offline edit survives a late startup workspace refresh and Save Draft", async ({ page, context }) => {
  await page.goto("/tests/result-tap-scroll.html?online&cr09&holdWorkspaceRefresh");
  await page.waitForFunction(() => typeof (window as any).openSystem === "function");
  expect(await page.evaluate(() => (window as any).openSystem("fm200_fire_suppression"))).toBe(true);
  const result = page.getByRole("group", { name: "Main Supply result", exact: true });
  await expect(result.getByText("Complete Repair (no longer selectable)", { exact: true })).toBeVisible();
  await context.setOffline(true);
  await result.getByRole("button", { name: "Good", exact: true }).click();
  await expect(result.getByRole("button", { name: "Good", exact: true })).toHaveAttribute("aria-pressed", "true");
  await result.evaluate(element => { (element as any).__draftRefreshMarker = true; });
  const reads = await page.evaluate(() => (window as any).workspaceFormReads);
  await page.evaluate(() => (window as any).releaseWorkspaceRefresh());
  await expect.poll(() => page.evaluate(() => (window as any).workspaceFormReads)).toBeGreaterThan(reads);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await result.evaluate(element => (element as any).__draftRefreshMarker)).toBe(true);
  await expect(result.getByRole("button", { name: "Good", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { localDatabase } = await import("/src/db/localDatabase.ts");
    const record = await localDatabase.masterSystemFormInstances.get((window as any).__clientUuid);
    return (window as any).__repairPath.reduce((value: any, key: string) => value[key], record.responses);
  })).toBe("good");
});

test("FM200 malformed authority refresh closes the editor instead of retaining a local draft", async ({ page }) => {
  await page.goto("/tests/result-tap-scroll.html?online&cr09&holdWorkspaceRefresh");
  await page.waitForFunction(() => typeof (window as any).openSystem === "function");
  expect(await page.evaluate(() => (window as any).openSystem("fm200_fire_suppression"))).toBe(true);
  await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toBeVisible();
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (...args) => String(args[0]).startsWith("/api/master-system-inspections?")
      ? new Response(JSON.stringify({ inspections: [{}], hasMore: false, nextCursor: null }),
        { status: 200, headers: { "Content-Type": "application/json" } })
      : original(...args);
    (window as any).releaseWorkspaceRefresh();
  });
  await expect(page.getByRole("heading", { name: "FM200 form unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Draft", exact: true })).toHaveCount(0);
});
