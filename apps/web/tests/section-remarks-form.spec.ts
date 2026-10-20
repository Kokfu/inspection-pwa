import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

/**
 * CR-07 Phase 1, browser level: the real Automatic Sprinkler form on real IndexedDB, with a small in-memory server
 * behind page.route. Proves the owner's rule - a remark added in one section is offered ONLY in that section - plus
 * offline entry, survival of a reload, exactly-one-row sync, sharing with a second technician, the 375 px layout and
 * the read-only form.
 */
const customerId = "76000000-0000-4000-8000-000000000050";
const otherCustomerId = "76000000-0000-4000-8000-000000000077";
const wording = "S.A.J Main Water Supply gate valve is leaking";
type Row = { id: string; customerId: string; systemKey: string; sectionKey: string; wording: string };

function createServer() {
  const server = { rows: [] as Row[], posts: [] as Array<Record<string, unknown>>, gets: 0, offline: false };
  return server;
}
type FakeServer = ReturnType<typeof createServer>;

async function wire(context: BrowserContext, server: FakeServer) {
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (server.offline) { await route.abort("internetdisconnected"); return; }
    if (url.pathname === "/api/service-common-remarks") {
      await route.fulfill({ json: { remarks: [
        { id: "00000000-0000-4000-8000-000000003501", systemKey: "automatic_sprinkler", wording: "Battery spoilt", detailLabel: "Battery size", detailOptions: ["12V x 12AH"], active: true },
        { id: "00000000-0000-4000-8000-000000003503", systemKey: "automatic_sprinkler", wording: "25mm ball valve spoilt", detailLabel: null, detailOptions: [], active: true }
      ] } });
      return;
    }
    const list = /^\/api\/customers\/([0-9a-f-]{36})\/section-remarks$/.exec(url.pathname);
    if (list && request.method() === "GET") {
      server.gets += 1;
      await route.fulfill({ json: { remarks: server.rows.filter((row) => row.customerId === list[1]) } });
      return;
    }
    const create = /^\/api\/technician\/customers\/([0-9a-f-]{36})\/systems\/([a-z_0-9]+)\/section-remarks$/.exec(url.pathname);
    if (create && request.method() === "POST") {
      const body = request.postDataJSON() as { id: string; sectionKey: string; wording: string };
      server.posts.push(body);
      const same = server.rows.find((row) => row.id === body.id);
      if (same) { await route.fulfill({ json: { requestedId: body.id, duplicate: true, merged: false, remark: same } }); return; }
      const text = server.rows.find((row) => row.customerId === create[1] && row.sectionKey === body.sectionKey && row.wording.toLowerCase() === body.wording.toLowerCase());
      if (text) { await route.fulfill({ json: { requestedId: body.id, duplicate: false, merged: true, remark: text } }); return; }
      const row = { id: body.id, customerId: create[1]!, systemKey: create[2]!, sectionKey: body.sectionKey, wording: body.wording };
      server.rows.push(row);
      await route.fulfill({ status: 201, json: { requestedId: body.id, duplicate: false, merged: false, remark: row } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "NOT_FOUND" } });
  });
}

async function open(page: Page, options: { syncStatus?: string } = {}) {
  await page.goto("/tests/section-remarks-form.html");
  await page.locator("body[data-harness-ready='1']").waitFor({ state: "attached", timeout: 60_000 });
  await page.evaluate((syncStatus) => (window as unknown as { harness: { mount: (options: object) => Promise<void> } }).harness.mount({ syncStatus }), options.syncStatus);
  await expect(page.locator("#sprinkler-saj_main_water_supply")).toBeVisible({ timeout: 30_000 });
}
const rowOf = (page: Page, key: string) => page.locator(`#sprinkler-${key}`);
const picker = (scope: Locator) => scope.getByRole("combobox", { name: "Remark", exact: true });
const sectionOptions = (scope: Locator) => picker(scope).locator("optgroup[label='Added for this customer'] option");

async function addRemark(row: Locator, text: string) {
  if (await row.getByRole("button", { name: "Add new remark" }).count()) {
    await row.getByRole("button", { name: "Add new remark" }).click();
    await row.getByRole("textbox", { name: /^New remark for / }).fill(text);
    await row.getByRole("button", { name: "Save & use" }).click();
  } else {
    await picker(row).selectOption("others");
    await row.getByRole("textbox", { name: "Type a new remark" }).fill(text);
    await row.getByRole("button", { name: "Add to common remarks" }).click();
  }
}

test("offline: a remark added in the Comments box is offered only there, survives a reload, and syncs to exactly one server row", async ({ page, context }) => {
  const server = createServer();
  await wire(context, server);
  await open(page);
  await context.setOffline(true);
  server.offline = true;
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  // R3: a checklist / measurement row's "Add to common remarks" is now a REQUEST (remark-requests-flow.spec.ts); the CR-07
  // customer list is still added to, unchanged, from the Comments box.
  const commentsRow = rowOf(page, "comments");
  await addRemark(commentsRow, wording);
  await expect(commentsRow.getByRole("list", { name: "Selected remarks" })).toContainText(wording);
  await expect(sectionOptions(commentsRow)).toHaveText([wording]);
  // NOT in any checklist or measurement row, nor in a sibling of the same group.
  for (const key of ["saj_main_water_supply", "water_level", "automatic_refilling_facilities", "pump_house_clean", "jockey_pump_pressure", "trfp_jockey_pump"]) {
    const other = rowOf(page, key);
    await expect(other.getByRole("combobox", { name: "Remark", exact: true }), key).toBeVisible();
    await expect(sectionOptions(other), key).toHaveCount(0);
    await expect(other.getByRole("list", { name: "Selected remarks" }), key).toHaveCount(0);
  }
  await expect(picker(commentsRow).getByRole("option", { name: "Others" })).toBeAttached();
  await expect(picker(commentsRow).getByRole("option", { name: "Battery spoilt" })).toBeAttached();

  // The chosen text is stored in the field string only: no id enters the draft payload.
  await commentsRow.getByRole("button", { name: "Save Draft" }).or(page.getByRole("button", { name: "Save Draft" })).first().click();
  await expect.poll(() => page.evaluate(() => JSON.stringify((window as unknown as { harness: { saved?: unknown } }).harness.saved ?? null))).toContain(wording);
  const saved = await page.evaluate(() => (window as unknown as { harness: { saved: { checklist: Record<string, { remarks: string }>; comments: string } } }).harness.saved);
  expect(saved.comments).toBe(wording);
  expect(saved.checklist.saj_main_water_supply!.remarks).toBe("");
  expect(saved.checklist.water_level!.remarks).toBe("");
  expect(JSON.stringify(saved)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4/);

  // Offline sync keeps it queued (Pending), not lost.
  const offlineRun = await page.evaluate(() => (window as unknown as { harness: { sync: () => Promise<{ confirmed: number }> } }).harness.sync());
  expect(offlineRun.confirmed).toBe(0);
  const queued = await page.evaluate(() => (window as unknown as { harness: { outbox: () => Promise<Array<{ status: string; entityType: string }>> } }).harness.outbox());
  expect(queued).toHaveLength(1);
  expect(queued[0]!.status).toBe("Pending");
  expect(server.posts).toHaveLength(0);

  // Reload: the dev harness has no service worker, so the page itself is fetched while the link is up and the phone
  // goes offline again before anything is read. The option must come back from IndexedDB, not from the network.
  await context.setOffline(false);
  await page.reload();
  await page.locator("body[data-harness-ready='1']").waitFor({ state: "attached", timeout: 60_000 });
  await context.setOffline(true);
  await page.evaluate(() => (window as unknown as { harness: { mount: (options: object) => Promise<void> } }).harness.mount({}));
  await expect(sectionOptions(rowOf(page, "comments"))).toHaveText([wording]);
  await expect(sectionOptions(rowOf(page, "water_level"))).toHaveCount(0);
  await expect(sectionOptions(rowOf(page, "saj_main_water_supply"))).toHaveCount(0);

  // Reconnect and sync: exactly one server row, and a second run adds nothing.
  await context.setOffline(false);
  server.offline = false;
  const firstRun = await page.evaluate(() => (window as unknown as { harness: { sync: () => Promise<{ confirmed: number }> } }).harness.sync());
  expect(firstRun.confirmed).toBe(1);
  expect(server.rows).toHaveLength(1);
  expect(server.rows[0]).toMatchObject({ customerId, systemKey: "automatic_sprinkler", sectionKey: "comments", wording });
  const secondRun = await page.evaluate(() => (window as unknown as { harness: { sync: () => Promise<{ attempted: number }> } }).harness.sync());
  expect(secondRun.attempted).toBe(0);
  expect(server.rows).toHaveLength(1);
  const completed = await page.evaluate(() => (window as unknown as { harness: { outbox: () => Promise<Array<{ status: string }>> } }).harness.outbox());
  expect(completed.map((item) => item.status)).toEqual(["Completed"]);
  expect(server.posts[0]!.jobId).toBe("76000000-0000-4000-8000-000000000001");
});

test("a duplicate in the Comments list, or equal to a catalogue entry, is refused with a message and nothing is added", async ({ page, context }) => {
  const server = createServer();
  await wire(context, server);
  await open(page);
  // R3: checklist / measurement rows no longer add to the customer list (their "Add to common remarks" is a request).
  const comments = rowOf(page, "comments");
  await addRemark(comments, "Float valve stuck open");
  await expect(sectionOptions(comments)).toHaveCount(1);
  await comments.getByRole("button", { name: "Add new remark" }).click();
  await comments.getByRole("textbox", { name: /^New remark for Comments/ }).fill("  FLOAT valve   stuck OPEN ");
  await comments.getByRole("button", { name: "Save & use" }).click();
  await expect(comments.getByRole("status")).toContainText("already in this section");
  await expect(sectionOptions(comments)).toHaveCount(1);
  await comments.getByRole("button", { name: "Cancel" }).click();
  // A catalogue wording is refused too.
  await comments.getByRole("button", { name: "Add new remark" }).click();
  await comments.getByRole("textbox", { name: /^New remark for Comments/ }).fill("25mm ball valve spoilt");
  await comments.getByRole("button", { name: "Save & use" }).click();
  await expect(comments.getByRole("status")).toContainText("standard remarks");
  await expect(sectionOptions(comments)).toHaveCount(1);
  // Invalid text is refused with a reason; the editor stays open for correction.
  await comments.getByRole("textbox", { name: /^New remark for Comments/ }).fill("ab");
  await comments.getByRole("button", { name: "Save & use" }).click();
  await expect(comments.getByRole("status")).toContainText("at least 3 characters");
  await comments.getByRole("button", { name: "Cancel" }).click();
  await expect(comments.getByRole("button", { name: "Add new remark" })).toBeVisible();
});

test("a second technician of the same customer sees the remark after a refresh, in its own section only", async ({ browser, page, context }) => {
  const server = createServer();
  server.rows.push(
    { id: "76000000-0000-4000-8000-0000000000a1", customerId, systemKey: "automatic_sprinkler", sectionKey: "checklist.waterTank.saj_main_water_supply", wording: "Added by the first technician" },
    { id: "76000000-0000-4000-8000-0000000000a2", customerId: otherCustomerId, systemKey: "automatic_sprinkler", sectionKey: "checklist.waterTank.saj_main_water_supply", wording: "Another customer's remark" }
  );
  await wire(context, server);
  await open(page);
  const sajRow = rowOf(page, "saj_main_water_supply");
  await expect(sectionOptions(sajRow)).toHaveText(["Added by the first technician"]);
  await expect(sectionOptions(rowOf(page, "water_level"))).toHaveCount(0);
  await expect(page.locator("#form").getByText("Another customer's remark")).toHaveCount(0);
  expect(server.gets).toBeGreaterThanOrEqual(1);
  // A second, separate browser profile (own IndexedDB) adds its own remark; the first sees it after a fresh open.
  const secondContext = await browser.newContext();
  await wire(secondContext, server);
  const secondPage = await secondContext.newPage();
  await open(secondPage);
  // R3: the second technician adds to the customer list from the Comments box (a row's button is now a request).
  await addRemark(rowOf(secondPage, "comments"), "Added by the second technician");
  expect(await secondPage.evaluate(() => (window as unknown as { harness: { sync: () => Promise<{ confirmed: number }> } }).harness.sync())).toMatchObject({ confirmed: 1 });
  await secondContext.close();
  expect(server.rows.filter((row) => row.customerId === customerId)).toHaveLength(2);
  const thirdContext = await browser.newContext();
  await wire(thirdContext, server);
  const thirdPage = await thirdContext.newPage();
  await open(thirdPage);
  await expect(sectionOptions(rowOf(thirdPage, "saj_main_water_supply"))).toHaveText(["Added by the first technician"]);
  await expect(sectionOptions(rowOf(thirdPage, "comments"))).toHaveText(["Added by the second technician"]);
  await thirdContext.close();
});

test("a local remark typed on two phones merges onto one server row and the field text is unchanged", async ({ page, context }) => {
  const server = createServer();
  server.rows.push({ id: "76000000-0000-4000-8000-0000000000b1", customerId, systemKey: "automatic_sprinkler", sectionKey: "comments", wording: "Pump room door needs repair" });
  await wire(context, server);
  await open(page);
  // Offline-first use: the server list has not been fetched yet on this phone, so the technician adds the same text.
  await page.reload(); await page.locator("body[data-harness-ready='1']").waitFor({ state: "attached" });
  server.offline = true; await context.setOffline(true);
  await page.evaluate(() => (window as unknown as { harness: { mount: (options: object) => Promise<void> } }).harness.mount({}));
  const comments = rowOf(page, "comments");
  await addRemark(comments, "pump room DOOR needs repair");
  await expect(comments.getByRole("list", { name: "Selected remarks" })).toContainText("pump room DOOR needs repair");
  server.offline = false; await context.setOffline(false);
  const run = await page.evaluate(() => (window as unknown as { harness: { sync: () => Promise<{ confirmed: number }> } }).harness.sync());
  expect(run.confirmed).toBe(1);
  expect(server.rows).toHaveLength(1);
  await expect(sectionOptions(comments)).toHaveText(["Pump room door needs repair"]);
  await expect(comments.getByRole("list", { name: "Selected remarks" })).toContainText("pump room DOOR needs repair");
});

test("375 px: single choice replaces, details reopen, Others types offline, clear persists, and targets fit", async ({ page, context }) => {
  const server = createServer();
  await wire(context, server);
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  const row = rowOf(page, "saj_main_water_supply");
  await expect(picker(row).getByRole("option", { name: "Battery spoilt" })).toBeAttached();
  // The existing harness records onSaveDraft; persist its response through the real repository.
  const persist = async () => {
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await page.evaluate(async () => {
      const dbPath = "/src/db/localDatabase.ts";
      const repoPath = "/src/automaticSprinkler/automaticSprinklerRepository.ts";
      const { localDatabase } = await import(/* @vite-ignore */ dbPath);
      const { saveAutomaticSprinklerDraft } = await import(/* @vite-ignore */ repoPath);
      const records = await localDatabase.masterSystemInspections.toArray();
      await saveAutomaticSprinklerDraft(records[0], (window as any).harness.saved);
    });
  };
  const reload = async () => {
    await page.reload();
    await page.locator("body[data-harness-ready='1']").waitFor({ state: "attached" });
    await page.evaluate(() => (window as any).harness.mount({}));
  };
  const saveReload = async () => { await persist(); await reload(); };
  await picker(row).selectOption({ label: "25mm ball valve spoilt" });
  await expect(picker(row)).toHaveValue("00000000-0000-4000-8000-000000003503");
  await picker(row).selectOption({ label: "Battery spoilt" });
  await row.getByRole("combobox", { name: "Battery size" }).selectOption("12V x 12AH");
  await saveReload();
  await expect(picker(row)).toHaveValue("00000000-0000-4000-8000-000000003501");
  await expect(row.getByRole("combobox", { name: "Battery size" })).toHaveValue("12V x 12AH");
  await picker(row).selectOption("others");
  await context.setOffline(true);
  const input = row.getByRole("textbox", { name: "Type a new remark" });
  await input.fill("Typed offline for this visit");
  await expect(input).toHaveValue("Typed offline for this visit");
  await expect.poll(() => page.evaluate(() => (window as any).harness.saved?.checklist.saj_main_water_supply.remarks)).toBe("Typed offline for this visit");
  await expect(row.getByRole("list")).toHaveCount(0);
  for (const target of [picker(row), input, row.getByRole("button", { name: "Add to common remarks" })]) {
    await target.scrollIntoViewIfNeeded();
    const bounds = (await target.boundingBox())!;
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(await target.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
  }
  await persist();
  await context.setOffline(false); // Dev harness has no cached app shell.
  await reload();
  await expect(picker(row)).toHaveValue("others");
  await expect(input).toHaveValue("Typed offline for this visit");
  await picker(row).selectOption({ label: "No remark" });
  await saveReload();
  await expect(picker(row)).toHaveValue("");
  await expect(input).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const edit of ["clear", "catalog match"] as const) {
  test(`375 px: reopened Others stays editable offline after ${edit}`, async ({ page, context }) => {
    await wire(context, createServer());
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page);
    await page.evaluate(async () => {
      const path = "/src/db/localDatabase.ts";
      const { localDatabase } = await import(/* @vite-ignore */ path);
      const [record] = await localDatabase.masterSystemInspections.toArray();
      record.responses.checklist.saj_main_water_supply.remarks = "Existing custom note";
      await localDatabase.masterSystemInspections.put(record);
    });
    await page.reload();
    await page.locator("body[data-harness-ready='1']").waitFor({ state: "attached" });
    await page.evaluate(() => (window as any).harness.mount({}));
    const row = rowOf(page, "saj_main_water_supply");
    const input = row.getByRole("textbox", { name: "Type a new remark" });
    await expect(picker(row).getByRole("option", { name: "Battery spoilt" })).toBeAttached();
    await expect(input).toHaveValue("Existing custom note");
    await context.setOffline(true);
    const next = edit === "clear" ? "" : "Battery spoilt";
    await input.fill(next);
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await expect(picker(row)).toHaveValue("others");
    await input.press("End");
    await input.pressSequentially(" replacement");
    await expect(input).toHaveValue(`${next} replacement`);
    await expect.poll(() => page.evaluate(() => (window as any).harness.saved?.checklist.saj_main_water_supply.remarks)).toBe(`${next} replacement`);
    await picker(row).selectOption({ label: "Battery spoilt" });
    await expect(input).toHaveCount(0);
    await row.getByRole("combobox", { name: "Battery size" }).selectOption("12V x 12AH");
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    expect(await page.evaluate(() => (window as any).harness.saved.checklist.saj_main_water_supply.remarks)).toBe("Battery spoilt — 12V x 12AH");
    await picker(row).selectOption({ label: "No remark" });
    await expect(picker(row)).toHaveValue("");
  });
}

test("only Comments retains Add new remark; read-only has no controls", async ({ page, context }) => {
  const server = createServer();
  await wire(context, server);
  await open(page);
  await expect(page.getByRole("button", { name: "Add new remark" })).toHaveCount(1);
  await expect(rowOf(page, "comments").getByRole("button", { name: "Add new remark" })).toBeVisible();
  await page.evaluate(() => (window as any).harness.mount({ syncStatus: "Pending" }));
  await expect(page.getByRole("button", { name: "Add new remark" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Remark", exact: true })).toHaveCount(0);
  await expect(rowOf(page, "saj_main_water_supply").getByText("Remark", { exact: true })).toBeVisible();
});

test("Comments preserves append, detail, Others, Remove and its separate Save & use editor", async ({ page, context }) => {
  await wire(context, createServer());
  await open(page);
  const row = rowOf(page, "comments");
  await picker(row).selectOption({ label: "Battery spoilt" });
  await row.getByRole("combobox", { name: "Battery size" }).selectOption("12V x 12AH");
  await picker(row).selectOption({ label: "25mm ball valve spoilt" });
  await picker(row).selectOption("others");
  await row.getByRole("textbox", { name: "Type a new remark" }).fill("Comments typed note");
  const items = row.getByRole("list", { name: "Selected remarks" }).getByRole("listitem");
  await expect(items).toHaveText(["Battery spoilt \u2014 12V x 12AHRemove", "25mm ball valve spoiltRemove", "Comments typed noteRemove"]);
  await row.getByRole("button", { name: "Remove remark 25mm ball valve spoilt", exact: true }).click();
  await expect(items).toHaveCount(2);
  await addRemark(row, "Comments saved for this customer");
  await expect(items).toHaveCount(3);
  await expect(sectionOptions(row)).toHaveText(["Comments saved for this customer"]);
});


test("legacy multi-line rows stay intact until a pick, including read-only", async ({ page, context }) => {
  await wire(context, createServer());
  await open(page);
  await page.evaluate(async () => {
    const path = "/src/db/localDatabase.ts";
    const { localDatabase } = await import(/* @vite-ignore */ path);
    const records = await localDatabase.masterSystemInspections.toArray();
    const record = records[0];
    record.responses.checklist.saj_main_water_supply.remarks = "First legacy line\nSecond legacy line";
    await localDatabase.masterSystemInspections.put(record);
  });
  await page.reload();
  await page.locator("body[data-harness-ready='1']").waitFor({ state: "attached" });
  await page.evaluate(() => (window as any).harness.mount({ syncStatus: "Pending" }));
  const row = rowOf(page, "saj_main_water_supply");
  await expect(row.getByRole("listitem")).toHaveText(["First legacy line", "Second legacy line"]);
  await expect(row.getByRole("button", { name: /Remove/ })).toHaveCount(0);
  await page.evaluate(() => (window as any).harness.mount({}));
  await expect(row.getByText("Pick one remark to replace these")).toBeVisible();
  await expect(row.getByRole("listitem")).toHaveText(["First legacy line", "Second legacy line"]);
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  expect(await page.evaluate(() => (window as any).harness.saved.checklist.saj_main_water_supply.remarks)).toBe("First legacy line\nSecond legacy line");
  await picker(row).selectOption({ label: "25mm ball valve spoilt" });
  await expect(row.getByRole("listitem")).toHaveCount(0);
  await page.getByRole("button", { name: "Save Draft", exact: true }).click();
  expect(await page.evaluate(() => (window as any).harness.saved.checklist.saj_main_water_supply.remarks)).toBe("25mm ball valve spoilt");
});

test("responsive picker at phone, tablet and desktop sizes", async ({ page, context }, info) => {
  await wire(context, createServer());
  await open(page);
  const row = rowOf(page, "saj_main_water_supply");
  await picker(row).selectOption("others");
  await row.getByRole("textbox", { name: "Type a new remark" }).fill("Visit-only note");
  for (const [width, height] of [[360, 800], [768, 1024], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await row.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`remarks-${width}.png`) });
  }
});
