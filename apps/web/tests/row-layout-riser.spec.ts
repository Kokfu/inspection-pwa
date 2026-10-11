import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 3 (Dry/Wet Riser, V7): a fresh Draft asks how many riser outlets (or shows the saved layout) before the form, and submitting
 * a new or changed layout queues the existing `update-format` proposal automatically. Real form, repository and Dexie.
 */
const inspect = (page: Page) => page.evaluate(() => (window as any).inspect());
const open = async (page: Page, query = "") => { await page.goto(`/tests/row-layout-riser.html${query}`); };
const outlets = (page: Page) => page.locator(".riser-outlet-table__row");

async function fillAndSubmit(page: Page, names: string[] = []) {
  await expect.poll(async () => (await inspect(page)).stored.responses.riserOutlets.length).toBeGreaterThan(0);
  await page.evaluate((list) => (window as any).fillAll(list), names);
  await page.getByRole("button", { name: "Submit Inspection" }).click();
  await expect.poll(async () => (await inspect(page)).stored.syncStatus).toBe("Pending");
}
async function startWithCount(page: Page, count: number) {
  await page.getByLabel("Number of riser outlets").fill(String(count));
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(outlets(page)).toHaveCount(count);
  await expect.poll(async () => (await inspect(page)).stored.responses.riserOutlets.length).toBe(count);
}

test("a first visit asks how many riser outlets before the form, then opens with that many rows", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { name: "How many riser outlets?" })).toBeVisible();
  await expect(page.getByText("Water Tank", { exact: true })).toHaveCount(0);
  await startWithCount(page, 3);
  const rows = (await inspect(page)).stored.responses.riserOutlets;
  expect(rows.map((row: any) => row.source)).toEqual(["configured", "technician", "technician"]);
  expect(rows.map((row: any) => row.sortOrder)).toEqual([1, 2, 3]);
});

test("the count must be a whole number from 1 to 250 and nothing starts on a bad one", async ({ page }) => {
  await open(page);
  for (const bad of ["", "0", "-1", "2.5", "251", "1e2"]) {
    await page.getByLabel("Number of riser outlets").evaluate((input: HTMLInputElement, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, bad);
    await page.getByRole("button", { name: "Start Inspection" }).click();
    await expect(page.getByRole("alert")).toContainText("whole number from 1 to 250");
    await expect(outlets(page)).toHaveCount(0);
  }
});

test("a saved layout is shown as 'same riser outlets as last time', pre-filled, with optional extra outlets", async ({ page }) => {
  await open(page, "?preset=saved");
  await expect(page.getByRole("heading", { name: "Same riser outlets as last time" })).toBeVisible();
  await expect(page.getByText("R-1 – Lobby riser")).toBeVisible();
  await page.getByLabel("Extra riser outlets this visit (optional)").fill("2");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(outlets(page)).toHaveCount(4);
  await expect.poll(async () => (await inspect(page)).stored.responses.riserOutlets.length).toBe(4);
  const rows = (await inspect(page)).stored.responses.riserOutlets;
  expect(rows.map((row: any) => [row.source, row.assetReference, row.locationText])).toEqual([["configured", "R-1", "Lobby riser"], ["configured", "R-2", "Roof riser"], ["technician", "", ""], ["technician", "", ""]]);
});

test("a customer with several named locations keeps the form and the per-location buttons (no prompt, nothing automatic)", async ({ page }) => {
  await open(page, "?preset=saved&locations=2");
  await expect(page.getByText("Water Tank", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /How many riser outlets|Same riser outlets/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /as format for next visit/ })).toHaveCount(2);
});

test("a single-location customer has no per-location buttons: the layout is saved automatically instead", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(page.getByText("Water Tank", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /as format for next visit/ })).toHaveCount(0);
});

test("submitting offline queues the layout (every outlet, including the added ones) and says so, also after a reload", async ({ page }) => {
  await open(page);
  await startWithCount(page, 3);
  await fillAndSubmit(page, ["Gate", "Car park"]);
  await expect(page.getByText("Riser outlet layout saved on this device.")).toBeVisible();
  const state = await inspect(page);
  expect(state.proposal.status).toBe("Pending");
  expect(state.proposal.patch).toEqual({ kind: "update-format", locationKey: "general", rows: [
    { assetReference: "", locationText: "General" }, { assetReference: "", locationText: "Gate" }, { assetReference: "", locationText: "Car park" }
  ] });
  await page.reload();
  await expect(page.getByText("Riser outlet layout saved on this device.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /How many riser outlets|Same riser outlets/ })).toHaveCount(0);
});

test("submitting online sends the layout to the server once and says it went to an Admin", async ({ page }) => {
  await open(page, "?online");
  await startWithCount(page, 2);
  await fillAndSubmit(page, ["Roof"]);
  await expect(page.getByText("Riser outlet layout sent to an Admin for approval.")).toBeVisible();
  const state = await inspect(page);
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0].body.patch.rows).toEqual([{ assetReference: "", locationText: "General" }, { assetReference: "", locationText: "Roof" }]);
  expect(state.proposal.status).toBe("Synced");
});

test("an unchanged saved layout with no extra outlets proposes nothing", async ({ page }) => {
  await open(page, "?preset=saved&online");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await fillAndSubmit(page);
  const state = await inspect(page);
  expect(state.posts).toHaveLength(0);
  expect(state.proposal).toBeUndefined();
  await expect(page.locator(".form-message").filter({ hasText: /layout/i })).toHaveCount(0);
});

test("an extra outlet on a saved layout is proposed with the saved outlets first", async ({ page }) => {
  await open(page, "?preset=saved&online");
  await page.getByLabel("Extra riser outlets this visit (optional)").fill("1");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(outlets(page)).toHaveCount(3);
  await expect.poll(async () => (await inspect(page)).stored.responses.riserOutlets.length).toBe(3);
  await fillAndSubmit(page, ["Basement"]);
  expect((await inspect(page)).posts[0].body.patch.rows).toEqual([
    { assetReference: "R-1", locationText: "Lobby riser" }, { assetReference: "R-2", locationText: "Roof riser" }, { assetReference: "", locationText: "Basement" }
  ]);
});

test("when the server holds the proposal behind an earlier one, the visit says so calmly and nothing needs attention", async ({ page }) => {
  await open(page, "?online");
  await page.evaluate(() => { (window as any).__proposalReply = { status: 409 }; });
  await startWithCount(page, 2);
  await fillAndSubmit(page, ["Roof"]);
  await expect(page.getByText("already waiting for Admin review, so this visit's layout was not sent.")).toBeVisible();
  await expect(page.getByText("needs attention")).toHaveCount(0);
  const state = await inspect(page);
  expect(state.outbox.find((item: any) => item.entityType === "technicianLocationProposal").status).toBe("Completed");
});

test("I-59: a configured outlet's Reference and Location cannot be edited, the technician's own outlets can", async ({ page }) => {
  await open(page, "?preset=saved");
  await page.getByLabel("Extra riser outlets this visit (optional)").fill("1");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(outlets(page)).toHaveCount(3);
  for (const index of [0, 1]) {
    await expect(outlets(page).nth(index).getByLabel("Location")).toBeDisabled();
    await expect(outlets(page).nth(index).getByLabel("Reference Number")).toBeDisabled();
  }
  await expect(outlets(page).nth(2).getByLabel("Location")).toBeEnabled();
  await expect(outlets(page).nth(2).getByLabel("Reference Number")).toBeEnabled();
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
  await expect(page.getByText("Water Tank", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /How many riser outlets/ })).toHaveCount(0);
});

// A brand-new customer has no location at all: the layout is proposed under "general" and the server turns it into the General location.
test("a brand-new customer (no location) is asked how many riser outlets and starts with only the technician's own outlets", async ({ page }) => {
  await open(page, "?locations=0");
  await expect(page.getByRole("heading", { name: "How many riser outlets?" })).toBeVisible();
  await expect(page.getByText("Water Tank", { exact: true })).toHaveCount(0);
  await startWithCount(page, 3);
  const rows = (await inspect(page)).stored.responses.riserOutlets;
  expect(rows.map((row: any) => row.source)).toEqual(["technician", "technician", "technician"]);
  expect(rows.map((row: any) => row.sortOrder)).toEqual([1, 2, 3]);
  for (let index = 0; index < 3; index += 1) await expect(outlets(page).nth(index).getByLabel("Location")).toBeEnabled();
  await expect(page.getByRole("button", { name: /as format for next visit/ })).toHaveCount(0);
});

test("a brand-new customer's offline submit queues the layout under 'general' and says so, also after a reload", async ({ page }) => {
  await open(page, "?locations=0");
  await startWithCount(page, 3);
  await fillAndSubmit(page, ["Gate", "Car park", "Roof"]);
  await expect(page.getByText("Riser outlet layout saved on this device.")).toBeVisible();
  const state = await inspect(page);
  expect(state.proposal.status).toBe("Pending");
  expect(state.proposal.patch).toEqual({ kind: "update-format", locationKey: "general", rows: [
    { assetReference: "", locationText: "Gate" }, { assetReference: "", locationText: "Car park" }, { assetReference: "", locationText: "Roof" }
  ] });
  expect(state.outbox.filter((item: any) => item.entityType === "technicianLocationProposal")).toHaveLength(1);
  expect(state.stored.responses.riserOutlets.every((row: any) => row.source === "technician")).toBe(true);
  await page.reload();
  await expect(page.getByText("Riser outlet layout saved on this device.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /How many riser outlets|Same riser outlets/ })).toHaveCount(0);
});

test("a brand-new customer's online submit sends the layout to the server once, under 'general'", async ({ page }) => {
  await open(page, "?locations=0&online");
  await startWithCount(page, 2);
  await fillAndSubmit(page, ["Lobby", "Roof"]);
  await expect(page.getByText("Riser outlet layout sent to an Admin for approval.")).toBeVisible();
  const state = await inspect(page);
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0].url).toContain("/systems/dry_wet_riser/location-proposals");
  expect(state.posts[0].body.patch).toEqual({ kind: "update-format", locationKey: "general", rows: [{ assetReference: "", locationText: "Lobby" }, { assetReference: "", locationText: "Roof" }] });
  expect(state.proposal.status).toBe("Synced");
});

test("a customer with a zone but no location keeps the form with no prompt and nothing automatic", async ({ page }) => {
  await open(page, "?locations=0&zones=1&online");
  await expect(page.getByText("Water Tank", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /How many riser outlets|Same riser outlets/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Add Riser Outlet" }).click();
  await fillAndSubmit(page, ["Lobby"]);
  const state = await inspect(page);
  expect(state.posts).toHaveLength(0);
  expect(state.proposal).toBeUndefined();
});

test("a brand-new customer's draft with entries never gets the prompt back after a reload", async ({ page }) => {
  await open(page, "?locations=0");
  await startWithCount(page, 1);
  await page.evaluate(async () => {
    const { localDatabase } = await import(/* @vite-ignore */ "/src/db/localDatabase.ts" as string);
    const stored = await (window as any).inspect();
    const next = structuredClone(stored.stored.responses);
    next.comments = "started";
    await localDatabase.masterSystemInspections.update(stored.stored.clientUuid, { responses: next });
  });
  await page.reload();
  await expect(page.getByText("Water Tank", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /How many riser outlets/ })).toHaveCount(0);
});
