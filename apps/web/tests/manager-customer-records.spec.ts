import { expect, test } from "@playwright/test";

const fixture = () => ({ customer: { id: "71000000-0000-4000-8000-000000000001", code: "S3A", displayName: "Alpha Customer", contactPerson: "Jane Contact", contactPhone: "0123456789", fax: null, contractNumber: null, serviceFrequency: null },
  sites: [{ id: "71000000-0000-4000-8000-000000000002", code: "MAIN", displayName: "North Warehouse", address: "Main Street" }], archivedSites: [],
  configuration: { id: "71000000-0000-4000-8000-000000000003", revision: 1, enabledSystems: [] }, supportedSystems: [] });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/customers/*/visit-summaries?*", route => route.fulfill({ json: { visits: [], nextCursor: null } }));
});

const service = { id: "72000000-0000-4000-8000-000000000001", kind: "service", date: "2026-10-21", status: "closed",
  siteId: null, siteName: null, technicianId: 12, technicianName: "Other technician", ownedByCaller: false };
const repair = { ...service, id: "72000000-0000-4000-8000-000000000002", kind: "repair", date: "2026-10-20", status: "approved" };

test("manager Timeline counts all pages, opens both foreign visit kinds and clears count on invalid refresh", async ({ page }) => {
  const stored = fixture(); let invalid = false;
  await page.route("**/api/manager/customers{,/**}", route => route.fulfill({ json: route.request().url().endsWith("/customers") ? { customers: [stored] } : { customer: stored } }));
  await page.route("**/api/customers/*/visit-summaries?*", route => route.fulfill({ json: invalid ? { visits: null, nextCursor: null }
    : new URL(route.request().url()).searchParams.has("cursor") ? { visits: [repair], nextCursor: null } : { visits: [service], nextCursor: "next" } }));
  await page.goto("/tests/manager-customer-records.html");
  await page.getByRole("button", { name: "Alpha Customer", exact: true }).click();
  const tab = page.getByRole("tab", { name: "Timeline 2", exact: true });
  await tab.click();
  await expect(page.locator("button.visit-row")).toHaveCount(2);
  await expect(page.getByRole("img", { name: "Summary only" })).toHaveCount(0);
  for (const [width, height] of [[360, 800], [768, 1024], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await page.locator("button.visit-row").first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: test.info().outputPath(`manager-timeline-${width}.png`), fullPage: true });
  }
  await page.locator("button.visit-row").first().focus();
  await expect(page.locator("button.visit-row").first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`#/manager-service-visit/${service.id}$`));
  await page.locator("button.visit-row").last().click();
  await expect(page).toHaveURL(new RegExp(`#/manager-repairs/${repair.id}$`));
  await page.getByRole("button", { name: "Repairs", exact: true }).click();
  await expect(page.locator("button.visit-row")).toHaveCount(1); await expect(tab).toBeVisible();
  invalid = true; await page.getByRole("button", { name: "Refresh history" }).click();
  await expect(page.getByRole("alert")).toContainText("invalid summary data");
  await expect(page.getByRole("tab", { name: "Timeline", exact: true })).toBeVisible();
  await expect(page.locator("button.visit-row")).toHaveCount(0);
});

for (const visit of [service, repair]) {
  test(`App manager customer Timeline opens the existing ${visit.kind} route`, async ({ page }) => {
    const stored = fixture();
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      let json: unknown = {};
      if (path === "/api/auth/me") json = { user: { id: 9081, username: "s3b-manager", role: "admin" } };
      else if (path.endsWith("/visit-summaries")) json = { visits: [service, repair], nextCursor: null };
      else if (path === `/api/manager/customers/${stored.customer.id}`) json = { customer: stored };
      else if (path.endsWith("/customers") || path.endsWith("/customers/archived")) json = { customers: [stored] };
      else if (path.endsWith("/technicians")) json = { technicians: [] };
      else if (path.endsWith("/service-visits")) json = { serviceVisits: [], nextCursor: null, totalCount: 0 };
      else if (path.endsWith("/inspection-jobs")) json = { jobs: [] };
      await route.fulfill({ json });
    });
    await page.goto(`/#/manager-customer/${fixture().customer.id}`);
    const monitor = page.getByRole("button", { name: /^Manager Monitor/ });
    if (await monitor.isVisible()) await monitor.click();
    await page.getByRole("tab", { name: /^Timeline/ }).click();
    await expect(page.locator("button.visit-row")).toHaveCount(2);
    await page.locator("button.visit-row").filter({ hasText: visit.kind === "service" ? "Service" : "Repair" }).click();
    await expect(page).toHaveURL(new RegExp(`#/${visit.kind === "service" ? "manager-service-visit" : "manager-repairs"}/${visit.id}$`));
  });
}

test("customers table search, responsive cards, tabs, edit round-trip and discard", async ({ page }) => {
  let stored = fixture(); let patches = 0;
  await page.route("**/api/manager/customers{,/**}", async (route) => {
    if (route.request().method() === "PATCH") {
      patches++; const body = route.request().postDataJSON(); stored = { ...stored, customer: { ...stored.customer, ...body.changes } };
    }
    await route.fulfill({ json: route.request().url().endsWith("/customers") ? { customers: [{ ...stored, tableSummary: { lastVisit: "2026-10-20", openCount: 2 } }] } : { customer: stored } });
  });
  await page.goto("/tests/manager-customer-records.html");
  await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add customer" })).toHaveAttribute("href", "#/manager-add-customer");
  for (const search of ["alpha", "jane", "warehouse", "012345", "main street", "S3A"]) {
    await page.locator("input[type=search]").fill(search); await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("button", { name: "Alpha Customer", exact: true })).toBeVisible();
  }
  await page.locator("input[type=search]").fill("no such customer"); await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No customers match the search.")).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  for (const [width, height] of [[360, 800], [768, 1024], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator(".customer-records-table thead")).toHaveCSS("display", width < 768 ? "none" : "table-header-group");
    await page.screenshot({ path: test.info().outputPath(`customers-${width}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "Alpha Customer", exact: true }).click();
  await expect(page.getByText("Edits apply to all visits, past and future.")).toBeVisible();
  await page.getByRole("tab", { name: "Sites", exact: true }).click(); await expect(page.getByLabel("Site Address", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /^Timeline/ }).click(); await expect(page.getByText("No visits match these filters.")).toBeVisible();
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
  await page.getByLabel("Customer name", { exact: true }).fill("Renamed Customer");
  await page.getByLabel("Contact person", { exact: true }).fill("New Contact");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible(); expect(patches).toBe(1);
  await page.getByRole("button", { name: "Back to Customers", exact: true }).click();
  await expect(page.locator('.customer-records-table td[data-label="Last visit"]')).toHaveText("2026-10-20");
  await expect(page.locator('.customer-records-table td[data-label="Open"]')).toHaveText("2");
  await page.reload(); await page.getByRole("button", { name: "Renamed Customer", exact: true }).click();
  await expect(page.getByLabel("Contact person", { exact: true })).toHaveValue("New Contact");
  await page.getByLabel("Customer name", { exact: true }).fill("Discard me");
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByLabel("Customer name", { exact: true })).toHaveValue("Renamed Customer");
  for (const [width, height] of [[360, 800], [768, 1024], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const target = await page.getByRole("button", { name: "Save changes", exact: true }).boundingBox(); expect(target!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: test.info().outputPath(`details-${width}.png`), fullPage: true });
  }
});

test("typing during PATCH survives confirmation, reload and a second save with the new baseline", async ({ page }) => {
  let stored = fixture();
  let releasePatch!: () => void;
  const gate = new Promise<void>((resolve) => { releasePatch = resolve; });
  let patchStarted!: () => void;
  const started = new Promise<void>((resolve) => { patchStarted = resolve; });
  const edits: Array<{ expected: Record<string, unknown>; changes: Record<string, unknown> }> = [];
  await page.route("**/api/manager/customers{,/**}", async (route) => {
    if (route.request().method() === "PATCH") {
      const edit = route.request().postDataJSON(); edits.push(edit);
      stored = { ...stored, customer: { ...stored.customer, ...edit.changes } };
      if (edits.length === 1) { patchStarted(); await gate; }
    }
    await route.fulfill({ json: route.request().url().endsWith("/customers") ? { customers: [stored] } : { customer: stored } });
  });
  await page.goto("/tests/manager-customer-records.html");
  await page.getByRole("button", { name: "Alpha Customer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
  await page.getByLabel("Phone", { exact: true }).fill("999");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await started;
  await page.getByLabel("Contact person", { exact: true }).fill("Typed during save");
  releasePatch();
  await expect(page.getByRole("status")).toContainText("Newer edits remain saved on this device");
  await expect(page.getByLabel("Contact person", { exact: true })).toHaveValue("Typed during save");
  const draft = await page.evaluate(async () => (window as any).testDb.drafts.where("entityType").equals("managerCustomerDetails").first());
  expect(draft.payload.changes.contactPerson).toBe("Typed during save");
  expect(draft.payload.expected.contactPhone).toBe("999");
  expect(draft.payload.expected.contactPerson).toBe("Jane Contact");
  await page.reload(); await page.getByRole("button", { name: "Alpha Customer", exact: true }).click();
  await expect(page.getByLabel("Contact person", { exact: true })).toHaveValue("Typed during save");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
  expect(edits[1].expected.contactPhone).toBe("999");
  expect(edits[1].changes.contactPerson).toBe("Typed during save");
  expect(await page.evaluate(async () => (window as any).testDb.drafts.where("entityType").equals("managerCustomerDetails").count())).toBe(0);
});

for (const failure of ["malformed-get", "failed-get", "malformed-patch", "unauthorized-patch", "forbidden-patch"] as const) {
  test(`${failure} clears the authoritative view and retains the local draft`, async ({ page }) => {
    let stored = fixture(); let submitted = false;
    await page.route("**/api/manager/customers{,/**}", async (route) => {
      if (route.request().method() === "PATCH") {
        submitted = true;
        if (failure === "malformed-patch") { await route.fulfill({ body: "{invalid", contentType: "application/json" }); return; }
        if (failure === "unauthorized-patch" || failure === "forbidden-patch") { await route.fulfill({ status: failure === "unauthorized-patch" ? 401 : 403, json: {} }); return; }
        stored = { ...stored, customer: { ...stored.customer, ...route.request().postDataJSON().changes } };
      } else if (submitted && !route.request().url().endsWith("/customers")) {
        if (failure === "failed-get") { await route.abort(); return; }
        await route.fulfill({ json: { customer: { ...stored, configuration: null } } }); return;
      }
      await route.fulfill({ json: route.request().url().endsWith("/customers") ? { customers: [stored] } : { customer: stored } });
    });
    await page.goto("/tests/manager-customer-records.html");
    await page.getByRole("button", { name: "Alpha Customer", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
    await page.getByLabel("Phone", { exact: true }).fill("999");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("Phone", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).authorityKind)).toBe(failure.endsWith("authorized-patch") || failure === "forbidden-patch" ? "authorization" : "unavailable");
    const drafts = await page.evaluate(async () => (window as any).testDb.drafts.where("entityType").equals("managerCustomerDetails").toArray());
    expect(drafts).toHaveLength(1); expect(drafts[0].payload.changes.contactPhone).toBe("999");
  });
}

test("a stale-edit conflict retains the draft and editable form without invalidating authority", async ({ page }) => {
  const stored = fixture();
  await page.route("**/api/manager/customers{,/**}", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({ status: 409, json: { error: "CUSTOMER_EDIT_CONFLICT", message: "Customer details changed. Refresh and review before saving again." } }); return;
    }
    await route.fulfill({ json: route.request().url().endsWith("/customers") ? { customers: [stored] } : { customer: stored } });
  });
  await page.goto("/tests/manager-customer-records.html");
  await page.getByRole("button", { name: "Alpha Customer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
  await page.getByLabel("Phone", { exact: true }).fill("999");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Customer details changed.");
  await expect(page.getByLabel("Phone", { exact: true })).toHaveValue("999");
  await expect(page.getByLabel("Phone", { exact: true })).toBeEditable();
  expect(await page.evaluate(() => (window as any).authorityError)).toBeUndefined();
  expect(await page.evaluate(async () => (window as any).testDb.drafts.where("entityType").equals("managerCustomerDetails").count())).toBe(1);
});

test("failed PATCH stays in IndexedDB across reload, permits entry, retries, and rejects malformed confirmation", async ({ page }) => {
  let stored = fixture(); let fail = true; let poison = false;
  await page.route("**/api/manager/customers{,/**}", async (route) => {
    if (route.request().method() === "PATCH") {
      if (fail) { await route.abort(); return; }
      if (poison) { await route.fulfill({ json: { customer: null } }); return; }
      stored = { ...stored, customer: { ...stored.customer, ...route.request().postDataJSON().changes } };
    }
    await route.fulfill({ json: route.request().url().endsWith("/customers") ? { customers: [{ ...stored, tableSummary: { lastVisit: "2026-10-20", openCount: 2 } }] } : { customer: stored } });
  });
  await page.goto("/tests/manager-customer-records.html");
  await page.getByRole("button", { name: "Alpha Customer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
  await page.getByLabel("Phone", { exact: true }).fill("999");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("remains saved on this device");
  await expect(page.getByLabel("Phone", { exact: true })).toHaveCount(0);
  await page.reload(); await page.getByRole("button", { name: "Alpha Customer", exact: true }).click();
  await expect(page.getByLabel("Phone", { exact: true })).toHaveValue("999");
  await expect(page.getByRole("status")).toContainText("Review and Save changes to retry");
  await page.getByLabel("Contact person", { exact: true }).fill("Still editable");
  fail = false; poison = true;
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("confirmation is invalid");
  await expect(page.getByLabel("Phone", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(async () => (window as any).testDb.drafts.where("entityType").equals("managerCustomerDetails").count())).toBe(1);
  poison = false; await page.getByRole("button", { name: "Reopen customer" }).click(); await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
  expect(await page.evaluate(async () => (window as any).testDb.drafts.where("entityType").equals("managerCustomerDetails").count())).toBe(0);
});

test("Unconfirmed status, chip filter and Confirm details header", async ({ page }) => {
  const alpha = { ...fixture(), customer: { ...fixture().customer, confirmed: false, createdBy: "tech-one", createdAt: "2026-10-20T08:30:00.000Z", confirmedAt: null } };
  const beta = { ...fixture(), customer: { ...fixture().customer, id: "71000000-0000-4000-8000-000000000009", code: "B", displayName: "Beta Customer", confirmed: true, createdBy: null, confirmedAt: null } };
  let stored = alpha; let confirms = 0; let mode: "ok" | "unchanged" | "malformed" = "ok";
  const rows = () => [stored, beta].map(row => ({ ...row, tableSummary: { lastVisit: null, openCount: 0 } }));
  await page.route("**/api/manager/customers{,/**}", async (route) => {
    const url = route.request().url();
    if (route.request().method() === "POST" && url.endsWith("/confirm")) {
      confirms += 1;
      if (mode === "malformed") { await route.fulfill({ json: { customer: { ...stored.customer, confirmed: "yes" } } }); return; }
      if (mode === "ok") stored = { ...stored, customer: { ...stored.customer, confirmed: true, confirmedAt: "2026-10-21T01:00:00.000Z" } };
      await route.fulfill({ json: { customer: stored } }); return;
    }
    await route.fulfill({ json: url.endsWith("/customers") ? { customers: rows() } : { customer: stored } });
  });
  await page.goto("/tests/manager-customer-records.html");
  const chip = page.getByRole("button", { name: "Unconfirmed (1)", exact: true });
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("tbody tr").filter({ hasText: "Alpha Customer" }).locator(".customer-unconfirmed-badge")).toHaveText("Unconfirmed");
  await expect(page.locator("tbody tr").filter({ hasText: "Beta Customer" }).locator(".customer-unconfirmed-badge")).toHaveCount(0);
  for (const [width, height] of [[360, 800], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Alpha Customer");
  await page.getByRole("button", { name: "Alpha Customer", exact: true }).click();
  await expect(page.locator(".customer-added-by")).toHaveText("Added by tech-one on 2026-10-20");
  const confirm = page.getByRole("button", { name: "Confirm details", exact: true });
  expect((await confirm.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // Unconfirmed customers stay fully editable.
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
  mode = "unchanged"; await confirm.click();
  await expect(page.getByRole("alert")).toContainText(/unavailable|invalid|cannot be verified/i);
  expect(confirms).toBe(1);
  await page.reload(); await page.getByRole("button", { name: "Alpha Customer", exact: true }).click();
  mode = "malformed"; await confirm.click();
  await expect(confirm).toHaveCount(0);
  expect(confirms).toBe(2);
  await page.reload(); await page.getByRole("button", { name: "Alpha Customer", exact: true }).click();
  mode = "ok"; await confirm.click();
  await expect(confirm).toHaveCount(0);
  await expect(page.locator(".status-badge--complete")).toHaveText("Current settings");
  await expect(page.locator(".customer-added-by")).toHaveText("Added by tech-one on 2026-10-20");
  expect(confirms).toBe(3);
  await page.getByRole("button", { name: "Back to Customers" }).click();
  await expect(page.getByRole("button", { name: "Unconfirmed (0)", exact: true })).toBeVisible();
  await expect(page.locator(".customer-unconfirmed-badge")).toHaveCount(0);
});
