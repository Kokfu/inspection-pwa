import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 3 (Hose Reel): a fresh Draft asks how many hose reel drums (or shows the saved layout) before the form, and submitting
 * a new or changed layout queues the existing `update-format` proposal automatically. Real form, repository and Dexie.
 */
const inspect = (page: Page) => page.evaluate(() => (window as any).inspect());
const open = async (page: Page, query = "") => { await page.goto(`/tests/row-layout-hose-reel.html${query}`); };
const drums = (page: Page) => page.locator("#hose-reel-locations .hose-row-card");

async function startWithCount(page: Page, count: number) {
  await page.getByLabel("Number of hose reel drums").fill(String(count));
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(drums(page)).toHaveCount(count);
  await expect.poll(async () => (await inspect(page)).stored.responses.rows.length).toBe(count);
}
async function fillAndSubmit(page: Page, names: string[] = []) {
  await page.evaluate((list) => (window as any).fillAll(list), names);
  await page.getByRole("button", { name: "Submit Inspection" }).click();
  await expect.poll(async () => (await inspect(page)).stored.syncStatus).toBe("Pending");
}

test("a first visit asks how many hose reel drums before the form, then opens with that many blank drum sections", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { name: "How many hose reel drums?" })).toBeVisible();
  await expect(page.getByText("Hose Reel Drums", { exact: true })).toHaveCount(0);
  await startWithCount(page, 3);
  const state = await inspect(page);
  expect(state.stored.responses.drumCount).toBe(3);
  expect(state.stored.responses.rows.map((row: any) => row.source)).toEqual(["technician", "technician", "technician"]);
  expect(state.stored.responses.rows.map((row: any) => row.sortOrder)).toEqual([1, 2, 3]);
});

test("the count must be a whole number from 1 to 250 and nothing starts on a bad one", async ({ page }) => {
  await open(page);
  for (const bad of ["", "0", "-1", "2.5", "251", "1e2"]) {
    await page.getByLabel("Number of hose reel drums").evaluate((input: HTMLInputElement, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, bad);
    await page.getByRole("button", { name: "Start Inspection" }).click();
    await expect(page.getByRole("alert")).toContainText("whole number from 1 to 250");
    await expect(drums(page)).toHaveCount(0);
  }
});

test("a saved layout is shown with each drum's type, pre-filled, with optional extra drums", async ({ page }) => {
  await open(page, "?preset=saved");
  await expect(page.getByRole("heading", { name: "Same hose reel drums as last time" })).toBeVisible();
  await expect(page.getByText("D-1 – Pump room (swing)")).toBeVisible();
  await expect(page.getByText("D-2 – Roof (fixed)")).toBeVisible();
  await page.getByLabel("Extra hose reel drums this visit (optional)").fill("1");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(drums(page)).toHaveCount(3);
  await expect.poll(async () => (await inspect(page)).stored.responses.rows.length).toBe(3);
  const rows = (await inspect(page)).stored.responses.rows;
  expect(rows.map((row: any) => [row.source, row.assetReference, row.locationText, row.drumType])).toEqual([
    ["configured", "D-1", "Pump room", "swing"], ["configured", "D-2", "Roof", "fixed"], ["technician", null, "", null]
  ]);
  expect((await inspect(page)).stored.responses.drumCount).toBe(3);
});

test("submitting offline queues the layout (every drum, with its type) and says so, also after a reload", async ({ page }) => {
  await open(page);
  await startWithCount(page, 2);
  await fillAndSubmit(page, ["Pump room", "Roof"]);
  await expect(page.getByText("Hose reel drum layout saved on this device.")).toBeVisible();
  const state = await inspect(page);
  expect(state.proposal.status).toBe("Pending");
  expect(state.proposal.patch).toEqual({ kind: "update-format", locationKey: "general", rows: [
    { assetReference: "", locationText: "Pump room", drumType: "swing" }, { assetReference: "", locationText: "Roof", drumType: "swing" }
  ] });
  expect(state.outbox.filter((item: any) => item.entityType === "technicianLocationProposal")).toHaveLength(1);
  await page.reload();
  await expect(page.getByText("Hose reel drum layout saved on this device.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /How many hose reel drums|Same hose reel drums/ })).toHaveCount(0);
});

test("submitting online sends the layout to the server once and says it went to an Admin", async ({ page }) => {
  await open(page, "?online");
  await startWithCount(page, 1);
  await fillAndSubmit(page, ["Boiler room"]);
  await expect(page.getByText("Hose reel drum layout sent to an Admin for approval.")).toBeVisible();
  const state = await inspect(page);
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0].body.patch.rows).toEqual([{ assetReference: "", locationText: "Boiler room", drumType: "swing" }]);
  expect(state.proposal.status).toBe("Synced");
});

test("an unchanged saved layout with no extra drums proposes nothing", async ({ page }) => {
  await open(page, "?preset=saved&online");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(drums(page)).toHaveCount(2);
  await fillAndSubmit(page);
  const state = await inspect(page);
  expect(state.posts).toHaveLength(0);
  expect(state.proposal).toBeUndefined();
  await expect(page.locator(".form-message").filter({ hasText: /layout/i })).toHaveCount(0);
});

test("an extra drum on a saved layout is proposed with the saved drums first", async ({ page }) => {
  await open(page, "?preset=saved&online");
  await page.getByLabel("Extra hose reel drums this visit (optional)").fill("1");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(drums(page)).toHaveCount(3);
  await expect.poll(async () => (await inspect(page)).stored.responses.rows.length).toBe(3);
  await fillAndSubmit(page, ["Basement"]);
  const state = await inspect(page);
  expect(state.posts[0].body.patch.rows).toEqual([
    { assetReference: "D-1", locationText: "Pump room", drumType: "swing" }, { assetReference: "D-2", locationText: "Roof", drumType: "fixed" },
    { assetReference: "", locationText: "Basement", drumType: "swing" }
  ]);
});

test("when the server holds the proposal behind an earlier one, the visit says so calmly and nothing needs attention", async ({ page }) => {
  await open(page, "?online");
  await page.evaluate(() => { (window as any).__proposalReply = { status: 409 }; });
  await startWithCount(page, 1);
  await fillAndSubmit(page, ["Roof"]);
  await expect(page.getByText("already waiting for Admin review, so this visit's layout was not sent.")).toBeVisible();
  await expect(page.getByText("needs attention")).toHaveCount(0);
  const state = await inspect(page);
  expect(state.outbox.find((item: any) => item.entityType === "technicianLocationProposal").status).toBe("Completed");
  expect(state.stored.syncStatus).toBe("Pending");
});

test("reopening a draft that already has entries never puts the prompt back", async ({ page }) => {
  await open(page);
  await startWithCount(page, 2);
  await page.evaluate(async () => {
    const { localDatabase } = await import(/* @vite-ignore */ "/src/db/localDatabase.ts" as string);
    const stored = await (window as any).inspect();
    const next = structuredClone(stored.stored.responses);
    next.comments = "started";
    await localDatabase.masterSystemInspections.update(stored.stored.clientUuid, { responses: next });
  });
  await page.reload();
  await expect(page.getByLabel("Number of hose reel drums inspected")).toBeVisible();
  await expect(page.getByRole("heading", { name: /How many hose reel drums/ })).toHaveCount(0);
});

test("correcting a saved drum's location counts as work: after a reload the prompt does not come back", async ({ page }) => {
  await open(page, "?preset=saved");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(drums(page)).toHaveCount(2);
  await drums(page).first().getByLabel("Location").fill("Boiler room");
  await expect.poll(async () => (await inspect(page)).stored.responses.rows[0].locationText).toBe("Boiler room");
  await page.reload();
  await expect(page.getByLabel("Number of hose reel drums inspected")).toBeVisible();
  await expect(page.getByRole("heading", { name: /How many hose reel drums|Same hose reel drums/ })).toHaveCount(0);
  await expect(drums(page).first().getByLabel("Location")).toHaveValue("Boiler room");
});
