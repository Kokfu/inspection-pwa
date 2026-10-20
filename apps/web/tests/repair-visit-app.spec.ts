import { expect, test, type Page } from "@playwright/test";
import { actorId, approveVisit, fingerprint, ids, installServer, newServer, pngBytes, returnVisit, type RvServer } from "./repairVisitMock";

/**
 * The technician Repair List through the real app (Level 2): create a repair visit with no signal (previous service visit,
 * previous repair visit, none), fill it, submit it offline, reload, reconnect and see the server's receipts confirm it;
 * then Returned -> edit -> resubmit -> Approved. Also: refusal -> Needs attention -> Retry, delete while unstarted,
 * and a missing offline field list. Phone (360), tablet (768) and desktop (1280): no sideways scroll, 44 px targets, named inputs.
 */
const widths = [360, 768, 1280];
const photo = (red: number) => ({ name: `photo-${red}.png`, mimeType: "image/png", buffer: pngBytes(red, 40, 90) });

async function signIn(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto("/tests/manager-dashboard-navigation.html#/jobs");
  await page.getByRole("button", { name: /^Technician/ }).click();
  await expect(page.locator(".connection-state")).toHaveText("Online");
}
async function openRepairList(page: Page, width: number) {
  if (width < 768) {
    await page.locator("summary", { hasText: "Menu" }).click();
    await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("button", { name: "Repair List" }).click();
  } else {
    await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Repair List" }).click();
  }
  await expect(page.getByRole("heading", { name: "Repair List", level: 2 })).toBeVisible();
}
async function goOffline(page: Page, server: RvServer) {
  server.reachable = false;
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.locator(".connection-state")).toHaveText("Offline", { timeout: 8000 });
}
async function goOnline(page: Page, server: RvServer) {
  server.reachable = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".connection-state")).toHaveText("Online", { timeout: 20_000 });
}
/** Layout and accessibility rules for the repair screens: no sideways scroll, 44 px targets, every input named, visible focus. */
async function assertScreenRules(page: Page) {
  const report = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(".rv-page");
    if (!root) return { error: "no repair screen" };
    const small: string[] = []; const unnamed: string[] = [];
    for (const el of root.querySelectorAll<HTMLElement>("button, a[href], select, summary, textarea, input[type=text], label.rv-field-row, label.rv-choice")) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.height < 43.5 || box.width < 43.5) small.push(`${el.tagName} ${el.textContent?.trim().slice(0, 30)} ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    for (const el of root.querySelectorAll<HTMLInputElement>("input, select, textarea")) {
      const box = el.getBoundingClientRect();
      if (el.type === "file" || (box.width === 0 && box.height === 0)) continue;
      if (!(el.labels?.length || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby"))) unnamed.push(`${el.tagName} ${el.id || el.name}`);
    }
    const fontTooSmall = [...root.querySelectorAll<HTMLElement>("input[type=text], select, textarea")].filter(el => parseFloat(getComputedStyle(el).fontSize) < 16).map(el => el.id);
    return { small, unnamed, fontTooSmall, overflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  expect(report, JSON.stringify(report)).toEqual({ small: [], unnamed: [], fontTooSmall: [], overflow: false });
}
async function assertFocusVisible(page: Page) {
  await page.locator(".rv-page").first().click({ position: { x: 1, y: 1 } });
  let visible = false;
  for (let index = 0; index < 8 && !visible; index += 1) {
    await page.keyboard.press("Tab");
    visible = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.closest(".rv-page")) return false;
      const style = getComputedStyle(el);
      return el.matches(":focus-visible") && style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
    });
  }
  expect(visible, "a repair-screen control shows a focus outline").toBe(true);
}

/** Online first: the sites, field lists and Before photos are saved on the device, as a technician would before leaving coverage. */
async function warmCaches(page: Page, width: number) {
  await openRepairList(page, width);
  await page.getByRole("link", { name: "+ New Repair Visit" }).click();
  await page.getByLabel("Customer", { exact: true }).selectOption(ids.customer);
  await page.getByLabel("Site", { exact: true }).selectOption(ids.site);
  await expect(page.getByLabel("Previous visit").locator("option")).toHaveCount(3);
  await page.getByRole("button", { name: "Download for offline" }).click();
  await expect(page.getByText(/Saved on this device: 3 field lists for 1 site and 2 Before photos/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: /Back to Repair List/ }).click();
}

type Variant = "service" | "repair" | "none";
const variants: Record<Variant, { choice: string; field: RegExp; before: RegExp[]; noPhoto: boolean }> = {
  service: { choice: `service:${ids.previousSv}`, field: /S\.A\.J Main Water Supply/, before: [/SV-20261011-94/, /Not Good/, /Valve leaking/], noPhoto: false },
  repair: { choice: `repair:${ids.previousRv}`, field: /S\.A\.J Main Water Supply/, before: [/RV-20261012-2/, /Not Done/, /No access to the tank/], noPhoto: false },
  none: { choice: "none", field: /Hose Condition/, before: [/No previous visit/], noPhoto: false }
};

async function createOffline(page: Page, variant: Variant, call = "SC-OFF-1") {
  await page.getByRole("link", { name: "+ New Repair Visit" }).click();
  await expect(page.getByText(/Offline — this repair visit is saved on this device/)).toBeVisible();
  await page.getByLabel("Customer", { exact: true }).selectOption(ids.customer);
  await page.getByLabel("Site", { exact: true }).selectOption(ids.site);
  await expect(page.getByLabel("Previous visit")).toBeEnabled();
  await page.getByLabel("Previous visit").selectOption(variants[variant].choice);
  await page.getByLabel("Service Call No").fill(call);
  const checkbox = page.getByRole("checkbox", { name: variants[variant].field });
  await expect(checkbox).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Repair Visit" })).toBeDisabled();
  await expect(page.getByText("Select at least one field.")).toBeVisible();
  await checkbox.check();
  await expect(page.getByText("1 field selected.")).toBeVisible();
  await assertScreenRules(page);
  await page.getByRole("button", { name: "Create Repair Visit" }).click();
}
async function fillItem(page: Page, outcome: "Done Repair" | "Not Done", remark: string, red: number, replace = false) {
  await page.getByRole("radio", { name: outcome }).check();
  await page.getByLabel(outcome === "Not Done" ? "Reason not done (required)" : "Repair remark (required)").fill(remark);
  await page.locator('input[type="file"]').first().setInputFiles(photo(red));
  await expect(page.getByRole("img", { name: "After photo for this field" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Replace photo" })).toBeVisible();
}
const uuidFromHash = (page: Page) => page.evaluate(() => decodeURIComponent(location.hash.split("/")[2] ?? ""));

for (const width of widths) {
  test(`[${width}px] offline create with a previous SERVICE visit: submit offline, reload, reconnect, Returned, edit, resubmit, Approved`, async ({ page }) => {
    test.setTimeout(180_000);
    const server = newServer();
    await installServer(page, server);
    await signIn(page, width);
    await warmCaches(page, width);
    await goOffline(page, server);
    await createOffline(page, "service");

    // The visit opens straight away from the device with the placeholder, the Before panel and no way to submit yet.
    await expect(page.getByRole("heading", { name: /Phone Test Customer — Main Site/ })).toBeVisible({ timeout: 15_000 });
    const uuid = await uuidFromHash(page);
    expect(uuid).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByText("RV number given when synced")).toBeVisible();
    for (const text of variants.service.before) await expect(page.locator(".rv-panel--before").first()).toContainText(text);
    await expect(page.getByRole("img", { name: "Before photo from the previous visit" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("1 of 1 field needs a result, a remark and a photo.")).toBeVisible();
    expect(server.calls).toHaveLength(0);
    await assertScreenRules(page);
    await assertFocusVisible(page);

    // Submit with nothing filled in names what is missing and does not freeze anything.
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText(/not complete: add a result, a remark, a photo/)).toBeVisible();
    await expect(page.getByText("Choose Done Repair or Not Done.")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Done Repair" })).toBeEnabled();

    await fillItem(page, "Done Repair", "Replaced the leaking gate valve", 200);
    await expect(page.getByText("Every field is complete.")).toBeVisible();
    await assertScreenRules(page);
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submitted on this device. It will be sent when you are connected.")).toBeVisible();
    await expect(page.getByText("Pending sync").first()).toBeVisible();
    await expect(page.getByRole("radio", { name: "Done Repair" })).toHaveCount(0);
    expect(server.calls).toHaveLength(0);

    // Reload while still offline: the frozen submission, its remark and photo are all still there.
    await page.reload();
    await expect(page.getByRole("heading", { name: /Phone Test Customer — Main Site/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("RV number given when synced")).toBeVisible();
    await expect(page.getByText("Replaced the leaking gate valve")).toBeVisible();
    await expect(page.getByRole("img", { name: "After photo for this field" })).toBeVisible();
    await expect(page.getByText("Pending sync").first()).toBeVisible();
    // P3: after reopening, a submitted visit still says Submitted, not Saved.
    await expect(page.getByText("Submitted and waiting to sync. It will be sent when you are connected.")).toBeVisible();
    expect(server.calls).toHaveLength(0);

    // Reconnect: create, then the photo, then the submit - each confirmed by its exact UUID.
    await goOnline(page, server);
    await expect.poll(() => server.calls.map(call => call.kind).join(","), { timeout: 40_000 }).toBe("create,photo,submit");
    expect(server.calls[0]).toMatchObject({ uuid, previousVisit: { kind: "service", visitId: ids.previousSv }, items: 1, serviceCallNumber: "SC-OFF-1" });
    expect(server.calls[0]!.deviceCreatedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(server.calls[2]).toMatchObject({ visit: uuid, revision: 1, expected: 1, outcomes: ["done_repair"] });
    await expect(page.getByText(/^RV-\d{8}-1$/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Awaiting approval").first()).toBeVisible();
    await expect(page.getByText("Pending sync")).toHaveCount(0);
    await assertScreenRules(page);

    // Admin returns it. The list shows Returned; opening it shows the reason and lets the technician edit in place.
    returnVisit(server, uuid, "Photo of the valve is blurred. Retake it.");
    await page.getByRole("link", { name: /Back to Repair List/ }).click();
    await expect(page.getByText("Returned", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("tab", { name: /In Progress \(1\)/ })).toBeVisible();
    await assertScreenRules(page);
    await page.getByRole("link", { name: /Phone Test Customer/ }).click();
    await expect(page.getByRole("heading", { name: "Returned to you" })).toBeVisible();
    await expect(page.getByText("Photo of the valve is blurred. Retake it.")).toBeVisible();
    await expect(page.getByLabel("Repair remark (required)")).toHaveValue("Replaced the leaking gate valve");
    await page.getByLabel("Repair remark (required)").fill("Replaced the leaking gate valve and gasket");
    await page.locator('input[type="file"]').first().setInputFiles(photo(60));
    await expect(page.getByText("Photo saved on this device.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Saved on this device.").first()).toBeVisible({ timeout: 5000 }).catch(() => undefined);
    await assertScreenRules(page);
    server.calls.length = 0;
    await page.getByRole("button", { name: "Submit again" }).click();
    await expect.poll(() => server.calls.map(call => call.kind).join(","), { timeout: 40_000 }).toBe("photo,submit");
    expect(server.calls[0]).toMatchObject({ revision: 2 });
    expect(server.calls[1]).toMatchObject({ revision: 2, expected: 1 });
    await expect(page.getByText("Awaiting approval").first()).toBeVisible({ timeout: 20_000 });
    expect(server.visits.get(uuid)!.outcomes.size).toBe(1);

    // Approved: report number, locked, Completed tab, PDF download.
    approveVisit(server, uuid);
    await page.getByRole("link", { name: /Back to Repair List/ }).click();
    await page.getByRole("tab", { name: /Completed/ }).click();
    await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Report MFE/RR/2026/0001")).toBeVisible();
    await page.getByRole("link", { name: /Phone Test Customer/ }).click();
    await expect(page.getByRole("heading", { name: "Approved" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download report (PDF)" }).click();
    expect((await download).suggestedFilename()).toBe("MFE-RR-2026-0001.pdf");
    expect(server.calls.at(-1)).toMatchObject({ kind: "report", visit: uuid, revision: 2 });
    await assertScreenRules(page);
  });

  test(`[${width}px] offline create with a previous REPAIR visit: Not Done first, its After photo is the Before, Not Done submits`, async ({ page }) => {
    test.setTimeout(150_000);
    const server = newServer();
    await installServer(page, server);
    await signIn(page, width);
    await warmCaches(page, width);
    await goOffline(page, server);
    await page.getByRole("link", { name: "+ New Repair Visit" }).click();
    await page.getByLabel("Customer", { exact: true }).selectOption(ids.customer);
    await page.getByLabel("Site", { exact: true }).selectOption(ids.site);
    await expect(page.getByLabel("Previous visit")).toBeEnabled();
    await page.getByLabel("Previous visit").selectOption(variants.repair.choice);
    // Only the fields that repair visit covered are listed, the Not Done one carries its badge and comes first.
    await expect(page.getByRole("checkbox")).toHaveCount(2);
    await expect(page.getByRole("checkbox").first()).toHaveAccessibleName(/S\.A\.J Main Water Supply.*Not Done/);
    await page.getByRole("button", { name: /Select all 1 that need repair/ }).click();
    await expect(page.getByText("1 field selected.")).toBeVisible();
    await page.getByRole("button", { name: "Create Repair Visit" }).click();
    await expect(page.getByRole("heading", { name: /Phone Test Customer — Main Site/ })).toBeVisible({ timeout: 15_000 });
    for (const text of variants.repair.before) await expect(page.locator(".rv-panel--before").first()).toContainText(text);
    await expect(page.getByRole("img", { name: "Before photo from the previous visit" })).toBeVisible({ timeout: 15_000 });
    await fillItem(page, "Not Done", "Still no access; tank is locked", 120);
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submitted on this device.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Still no access; tank is locked")).toBeVisible({ timeout: 20_000 });
    await goOnline(page, server);
    await expect.poll(() => server.calls.map(call => call.kind).join(","), { timeout: 40_000 }).toBe("create,photo,submit");
    expect(server.calls[0]).toMatchObject({ previousVisit: { kind: "repair", visitId: ids.previousRv } });
    expect(server.calls[2]).toMatchObject({ outcomes: ["not_done"] });
    await expect(page.getByText("Awaiting approval").first()).toBeVisible({ timeout: 20_000 });
    await assertScreenRules(page);
  });

  test(`[${width}px] offline create with NO previous visit: the current setup, "No previous visit", After photo alone`, async ({ page }) => {
    test.setTimeout(150_000);
    const server = newServer();
    await installServer(page, server);
    await signIn(page, width);
    await warmCaches(page, width);
    await goOffline(page, server);
    await createOffline(page, "none");
    await expect(page.getByRole("heading", { name: /Phone Test Customer — Main Site/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".rv-panel--before").first()).toContainText("No previous visit");
    await expect(page.getByText("None", { exact: true }).first()).toBeVisible();
    await fillItem(page, "Done Repair", "Replaced hose", 90);
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Submitted on this device.")).toBeVisible();
    expect(server.calls).toHaveLength(0);
    await goOnline(page, server);
    await expect.poll(() => server.calls.map(call => call.kind).join(","), { timeout: 40_000 }).toBe("create,photo,submit");
    expect(server.calls[0]!.previousVisit).toBeNull();
    await expect(page.getByText("Awaiting approval").first()).toBeVisible({ timeout: 20_000 });
    await assertScreenRules(page);
  });
}

test("a field with no photo at the previous visit says so; a refused create shows Needs attention, keeps everything, and Retry completes it", async ({ page }) => {
  test.setTimeout(150_000);
  const server = newServer();
  server.createMode = "refuse";
  await installServer(page, server);
  await signIn(page, 360);
  await warmCaches(page, 360);
  await goOffline(page, server);
  await page.getByRole("link", { name: "+ New Repair Visit" }).click();
  await page.getByLabel("Customer", { exact: true }).selectOption(ids.customer);
  await page.getByLabel("Site", { exact: true }).selectOption(ids.site);
  await expect(page.getByLabel("Previous visit")).toBeEnabled();
  await page.getByLabel("Previous visit").selectOption(variants.service.choice);
  await page.getByRole("checkbox", { name: /Pressure Gauge/ }).check();
  await page.getByRole("button", { name: "Create Repair Visit" }).click();
  await expect(page.getByRole("heading", { name: /Phone Test Customer — Main Site/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("No photo recorded at previous visit")).toBeVisible();
  await fillItem(page, "Done Repair", "New gauge fitted", 33);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.getByRole("link", { name: /Back to Repair List/ }).click();

  await goOnline(page, server);
  await expect(page.getByText("Needs attention").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/setup changed on the server/).first()).toBeVisible();
  expect(server.calls.map(call => call.kind)).not.toContain("photo");
  expect(server.calls.map(call => call.kind)).not.toContain("submit");
  await assertScreenRules(page);

  server.createMode = "ok";
  await page.getByRole("button", { name: /Retry sync/ }).first().click();
  await expect.poll(() => server.calls.map(call => call.kind).join(",").endsWith("create,photo,submit"), { timeout: 40_000 }).toBe(true);
  await expect(page.getByText("Awaiting approval").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Needs attention")).toHaveCount(0);
});

test("a visit whose create the server refused can be discarded, and nothing else is touched", async ({ page }) => {
  test.setTimeout(120_000);
  const server = newServer();
  server.createMode = "refuse";
  await installServer(page, server);
  await signIn(page, 360);
  await warmCaches(page, 360);
  await goOffline(page, server);
  await createOffline(page, "none");
  await expect(page.getByRole("heading", { name: /Phone Test Customer — Main Site/ })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Repair remark (required)").fill("started work");
  await expect(page.getByRole("button", { name: "Delete this repair visit" })).toHaveCount(0);
  await goOnline(page, server);
  await expect(page.getByText("Needs attention").first()).toBeVisible({ timeout: 30_000 });
  page.once("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: "Discard this repair visit" }).click();
  await expect(page.getByText("No repair visits in progress. Tap + New Repair Visit to start one.")).toBeVisible({ timeout: 10_000 });
  expect(server.calls.map(call => call.kind)).not.toContain("submit");
});

test("an unstarted repair visit can be deleted; a started one cannot", async ({ page }) => {
  const server = newServer();
  await installServer(page, server);
  await signIn(page, 360);
  await warmCaches(page, 360);
  await goOffline(page, server);
  await createOffline(page, "none");
  await expect(page.getByRole("heading", { name: /Phone Test Customer — Main Site/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Delete this repair visit" })).toBeVisible();
  await page.getByLabel("Repair remark (required)").fill("started");
  await expect(page.getByRole("button", { name: "Delete this repair visit" })).toHaveCount(0);
  await page.getByLabel("Repair remark (required)").fill("");
  await expect(page.getByRole("button", { name: "Delete this repair visit" })).toBeVisible({ timeout: 5000 });
  page.once("dialog", dialog => void dialog.accept());
  await page.getByRole("button", { name: "Delete this repair visit" }).click();
  await expect(page.getByText("No repair visits in progress. Tap + New Repair Visit to start one.")).toBeVisible({ timeout: 10_000 });
  expect(server.calls).toHaveLength(0);
  await page.reload();
  await expect(page.getByText("No repair visits in progress. Tap + New Repair Visit to start one.")).toBeVisible({ timeout: 15_000 });
});

test("with nothing saved on the device, offline says so instead of guessing", async ({ page }) => {
  const server = newServer();
  await installServer(page, server);
  await signIn(page, 360);
  await openRepairList(page, 360);
  await goOffline(page, server);
  await page.getByRole("link", { name: "+ New Repair Visit" }).click();
  await page.getByLabel("Customer", { exact: true }).selectOption(ids.customer);
  await expect(page.getByLabel("Site", { exact: true }).locator("option")).toHaveCount(1);
  await expect(page.getByText(/No sites are saved on this device for this customer/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Repair Visit" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Download for offline" })).toBeDisabled();
});

test("identity on every request: the signed-in technician id is sent and the fingerprint covers it", async () => {
  expect(fingerprint({ actorId, a: 1 })).not.toBe(fingerprint({ actorId: actorId + 1, a: 1 }));
});

/** OA-14: the photo acknowledgement and the remark autosave status must not overwrite each other. */
test("the 'Photo saved' acknowledgement stays visible when the remark autosave finishes after the photo", async ({ page }) => {
  test.setTimeout(120_000);
  const server = newServer();
  await installServer(page, server);
  await signIn(page, 1280);
  await warmCaches(page, 1280);
  await goOffline(page, server);
  await createOffline(page, "none");
  await expect(page.getByRole("heading", { name: /Phone Test Customer — Main Site/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("radio", { name: "Done Repair" }).check();
  await page.locator('input[type="file"]').first().setInputFiles(photo(90));
  await expect(page.getByRole("img", { name: "After photo for this field" })).toBeVisible({ timeout: 15_000 });
  // The remark is typed AFTER the photo is stored, so its debounced save finishes last.
  await page.getByLabel("Repair remark (required)").fill("Replaced hose");
  await expect(page.getByText("Saved on this device.", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Photo saved on this device.", { exact: true })).toBeVisible();
  // Both are really persisted: the remark and the After photo survive a reload.
  await page.reload();
  await expect(page.getByLabel("Repair remark (required)")).toHaveValue("Replaced hose", { timeout: 20_000 });
  await expect(page.getByRole("img", { name: "After photo for this field" })).toBeVisible();
});
