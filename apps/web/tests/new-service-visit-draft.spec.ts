import { expect, test, type Page } from "@playwright/test";

/**
 * OA-7: New Service Visit keeps the technician's unfinished setup, and the identity of a create that may have been sent,
 * on the device. A reload (or a force-close) must not lose the setup nor turn a replayed create into a second visit.
 */
const open = async (page: Page) => { await page.goto("/tests/new-service-visit-draft.html"); await expect(page.locator("#state")).toHaveText("READY"); };
const draft = (page: Page) => page.evaluate(() => (window as unknown as { __draft: () => Promise<Record<string, unknown> | null> }).__draft());
const posts = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("posts") ?? "[]") as Array<Record<string, unknown>>);
async function fillSetup(page: Page) {
  await expect(page.locator("#service-customer option")).toHaveCount(2);
  await page.locator("#service-customer").selectOption("customer-a");
  await expect(page.locator("#service-site option")).toHaveCount(2);
  await page.locator("#service-site").selectOption("site-a");
  await page.getByRole("checkbox", { name: /Hose Reel/ }).check();
  await page.locator("#service-call-number").fill("CALL-7");
}

test("OA-7: a reload restores the customer, site, services and call number", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("button", { name: "Start over" })).toHaveCount(0);
  await fillSetup(page);
  await expect.poll(async () => (await draft(page))?.serviceCallNumber).toBe("CALL-7");

  await page.reload();
  await expect(page.locator("#state")).toHaveText("READY");
  await expect(page.locator("#service-customer")).toHaveValue("customer-a");
  await expect(page.locator("#service-site")).toHaveValue("site-a");
  await expect(page.getByRole("checkbox", { name: /Hose Reel/ })).toBeChecked();
  await expect(page.locator("#service-call-number")).toHaveValue("CALL-7");
  await expect(page.getByText("Your unfinished setup was restored")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Service Visit" })).toBeEnabled();

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.locator("#service-customer")).toHaveValue("");
  await expect.poll(() => draft(page)).toBeNull();
  await page.reload();
  await expect(page.locator("#state")).toHaveText("READY");
  await expect(page.locator("#service-customer")).toHaveValue("");
  await expect(page.getByText("Your unfinished setup was restored")).toHaveCount(0);
});

test("OA-7: a create whose reply was lost is replayed with the same identity after a reload, and is never duplicated", async ({ page }) => {
  await open(page);
  await page.evaluate(() => sessionStorage.setItem("mode", "unreachable"));
  await fillSetup(page);
  await page.getByRole("button", { name: "Create Service Visit" }).click();
  await expect(page.getByText("may already have been created")).toBeVisible();
  const first = (await posts(page))[0]!;
  await expect.poll(async () => (await draft(page))?.sending).toBe(true);

  await page.reload(); // the app closed while the outcome was unknown
  await expect(page.locator("#state")).toHaveText("READY");
  await expect(page.getByText("may already exist")).toBeVisible();
  await expect(page.locator("#service-customer")).toBeDisabled(); // an edited body would no longer be the same request
  await expect(page.locator("#service-call-number")).toBeDisabled();

  await page.evaluate(() => sessionStorage.setItem("mode", "ok"));
  await page.getByRole("button", { name: "Create Service Visit" }).click();
  await expect.poll(async () => (await posts(page)).length).toBe(2);
  const second = (await posts(page))[1]!;
  expect(second.requestId, "same request identity").toBe(first.requestId);
  expect(second.arrivalTime, "same start time").toBe(first.arrivalTime);
  expect(second).toEqual(first);
  await expect.poll(() => draft(page)).toBeNull(); // cleared once the server confirmed a visit
  await page.reload();
  await expect(page.locator("#state")).toHaveText("READY");
  await expect(page.locator("#service-customer")).toHaveValue("");
});

test("OA-7: Start over after an unknown outcome gives a fresh identity", async ({ page }) => {
  await open(page);
  await page.evaluate(() => sessionStorage.setItem("mode", "unreachable"));
  await fillSetup(page);
  await page.getByRole("button", { name: "Create Service Visit" }).click();
  await expect(page.getByText("may already have been created")).toBeVisible();
  const lost = (await posts(page))[0]!;
  await page.reload();
  await expect(page.locator("#state")).toHaveText("READY");
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.locator("#service-customer")).toBeEnabled();
  await page.evaluate(() => sessionStorage.setItem("mode", "ok"));
  await fillSetup(page);
  await page.getByRole("button", { name: "Create Service Visit" }).click();
  await expect.poll(async () => (await posts(page)).length).toBe(2);
  expect((await posts(page))[1]!.requestId).not.toBe(lost.requestId);
});
