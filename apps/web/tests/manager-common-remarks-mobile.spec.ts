import { expect, test } from "@playwright/test";

test("manager can edit and remove an offline common remark without a server write", async ({ page, context }) => {
  const writes: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/service-common-remarks") && route.request().method() !== "GET") writes.push(route.request().method());
    if (path === "/api/auth/me") return route.fulfill({ json: { user: { id: 804, username: "mobiletest", role: "admin" } } });
    if (path === "/api/service-common-remarks") return route.fulfill({ json: { remarks: [] } });
    return route.fulfill({ json: {} });
  });
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/tests/manager-dashboard-navigation.html#/manager-common-remarks");
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await expect(page.getByRole("heading", { name: "Service common remarks" })).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel("Add common remark for Automatic Sprinkler").fill("Offline remark");
  await page.getByRole("button", { name: "Add common remark" }).click();
  await expect(page.getByText("Offline remark", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Wording").fill("Edited offline remark");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Edited offline remark", { exact: true })).toBeVisible();
  const editedPending = await page.evaluate(async () => {
    const { localDatabase } = await import("/src/db/localDatabase.ts");
    return (await localDatabase.syncOutbox.where("entityType").equals("commonRemark").toArray())
      .filter((item) => item.status !== "Completed");
  });
  expect(editedPending).toHaveLength(1);
  expect(editedPending[0].payload).toMatchObject({ wording: "Edited offline remark" });
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Edited offline remark", { exact: true })).toHaveCount(0);
  const state = await page.evaluate(async () => {
    const { localDatabase } = await import("/src/db/localDatabase.ts");
    return {
      cache: await localDatabase.referenceData.get("service-common-remarks:global"),
      pending: (await localDatabase.syncOutbox.where("entityType").equals("commonRemark").toArray()).filter((item) => item.status !== "Completed")
    };
  });
  expect(state.cache?.payload).toEqual([]);
  expect(state.pending).toEqual([]);
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Service common remarks" })).toBeVisible();
  await expect(page.getByText("Edited offline remark", { exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("manager mobile menu reaches manager pages at phone width", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { user: { id: 804, username: "mobiletest", role: "admin" } } });
    if (path === "/api/service-common-remarks") return route.fulfill({ json: { remarks: [] } });
    if (path.endsWith("/service-catalog")) return route.fulfill({ json: { systems: [] } });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tests/manager-dashboard-navigation.html#/manager-common-remarks");
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await expect(page.getByLabel("Primary navigation")).toBeHidden();
  await expect(page.locator(".app-mobile-navigation summary")).toBeVisible();
  await page.locator(".app-mobile-navigation summary").click();
  const mobile = page.getByLabel("Mobile navigation");
  await mobile.getByRole("button", { name: "Service Catalog" }).click();
  await expect(page.getByRole("heading", { name: "Service Catalog" })).toBeVisible();
  // I-36: choosing a destination closes the menu; it is opened again for the next choice.
  await expect(page.locator("details.app-mobile-navigation")).not.toHaveJSProperty("open", true);
  await page.locator(".app-mobile-navigation summary").click();
  await expect(mobile.getByRole("button", { name: "Service Catalog" })).toHaveAttribute("aria-current", "page");
  await mobile.getByRole("button", { name: "Service Common Remarks" }).click();
  await expect(page.locator("details.app-mobile-navigation")).not.toHaveJSProperty("open", true);
  await expect(page.getByRole("heading", { name: "Service common remarks" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
