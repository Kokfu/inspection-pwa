import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * T3: a reload keeps the Manager / Technician choice for the same verified admin in this tab.
 * The choice lives in sessionStorage (`manager-experience:v1`) bound to the Manager owner stamp, so
 * a different verified user, a non-admin, logout, or a fail-closed exit to the chooser all get the
 * role chooser after a reload. The technician flow is unchanged (nothing remembered).
 */

type FakeUser = { id: number; username: string; role: "admin" | "inspector" };
const manager: FakeUser = { id: 804, username: "manager", role: "admin" };

async function installFakeApi(page: Page) {
  const state = { user: manager as FakeUser, forbidManager: false };
  await page.route("**/api/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (payload: unknown, status = 200) => route.fulfill({ status, json: payload, headers: { "cache-control": "no-store" } });
    if (path === "/api/auth/me") return json({ user: state.user });
    if (path.startsWith("/api/manager/") && state.forbidManager) return json({ error: "FORBIDDEN", message: "Manager access was revoked." }, 403);
    if (path === "/api/manager/customers") return json({ customers: [] });
    if (path === "/api/manager/technicians") return json({ technicians: [] });
    if (path.startsWith("/api/manager/service-visits")) return json({ serviceVisits: [], nextCursor: null, totalCount: 0 });
    return json({});
  });
  return state;
}

const chooser = (page: Page) => page.getByText("Choose how you are signing in");
const rememberedChoice = (page: Page) => page.evaluate(() => sessionStorage.getItem("manager-experience:v1"));

async function enterManagerServicesDone(page: Page) {
  await page.goto("/tests/manager-service-editor.html#/manager");
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await page.getByRole("button", { name: /Current Services Done/ }).click();
  await expect(page).toHaveURL(/#\/manager-services-done$/);
  await expect(page.getByRole("button", { name: "Back to Home" })).toBeVisible();
  await expect.poll(() => rememberedChoice(page)).toBe('"manager"');
}

test("reload keeps Manager and the same screen for the same verified admin", async ({ page }) => {
  await installFakeApi(page);
  await enterManagerServicesDone(page);
  await page.reload();
  await expect(page).toHaveURL(/#\/manager-services-done$/);
  await expect(page.getByRole("button", { name: "Back to Home" })).toBeVisible();
  await expect(chooser(page)).toHaveCount(0);
  // A second reload still restores it.
  await page.reload();
  await expect(page.getByRole("button", { name: "Back to Home" })).toBeVisible();
  await expect(chooser(page)).toHaveCount(0);
});

test("a different verified user after reload gets the role chooser", async ({ page }) => {
  const api = await installFakeApi(page);
  await enterManagerServicesDone(page);
  api.user = { id: 805, username: "other-manager", role: "admin" };
  await page.reload();
  await expect(chooser(page)).toBeVisible();
  await expect.poll(() => rememberedChoice(page)).toBeNull();
});

test("the same user id without admin role is never restored into Manager", async ({ page }) => {
  const api = await installFakeApi(page);
  await enterManagerServicesDone(page);
  api.user = { ...manager, role: "inspector" };
  await page.reload();
  await expect(chooser(page)).toBeVisible();
  // Once verified, not even the Manager selection is restored (the title follows the selected experience).
  await expect(page.locator(".app-account-name")).toHaveText("manager");
  await expect(page.locator("#app-title")).toHaveText("Field Service Inspections");
  await expect(page.getByRole("button", { name: "Back to Home" })).toHaveCount(0);
});

test("logout clears the remembered choice", async ({ page }) => {
  await installFakeApi(page);
  await enterManagerServicesDone(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect.poll(() => rememberedChoice(page)).toBeNull();
  await page.reload();
  await expect(chooser(page)).toBeVisible();
});

test("a fail-closed exit to the chooser is not undone by a reload", async ({ page }) => {
  const api = await installFakeApi(page);
  await enterManagerServicesDone(page);
  api.forbidManager = true;
  await page.getByRole("button", { name: "Back to Home" }).click();
  await page.getByRole("button", { name: "Services", exact: true }).click();
  await expect(chooser(page)).toBeVisible();
  await expect.poll(() => rememberedChoice(page)).toBeNull();
  api.forbidManager = false;
  await page.reload();
  await expect(chooser(page)).toBeVisible();
});

test("technician choice is not remembered (unchanged behaviour)", async ({ page }) => {
  const api = await installFakeApi(page);
  api.user = { id: 901, username: "technician-one", role: "inspector" };
  await page.goto("/tests/manager-service-editor.html#/jobs");
  await page.getByRole("button", { name: /^Technician Complete/ }).click();
  await expect(chooser(page)).toHaveCount(0);
  expect(await rememberedChoice(page)).toBeNull();
  await page.reload();
  await expect(chooser(page)).toBeVisible();
  expect(await rememberedChoice(page)).toBeNull();
});
