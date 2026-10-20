import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

/**
 * R3, browser level: the real Automatic Sprinkler technician form, the real Admin/Manager "Remark requests" page and the real
 * App route guard on real IndexedDB, with one small in-memory "server" behind page.route that follows the R2 API contract
 * (apps/api/src/routes/remarkRequests.ts). Proves the owner's rules: "Add to common remarks" is a REQUEST that works offline and
 * leaves the visit text alone; a pending request is never offered; an approved remark (with edited wording) is offered in that
 * one row at every other customer; a rejection tells the technician and changes nothing in the visit; only Admin/Manager can
 * review; deactivation stops a remark being offered.
 */
const customerA = "77000000-0000-4000-8000-000000000050";
const customerB = "77000000-0000-4000-8000-000000000077";
const names: Record<string, string> = { [customerA]: "Sprinkler Customer A", [customerB]: "Second Customer B" };
const jobs: Record<string, [string, string]> = { [customerA]: ["77000000-0000-4000-8000-000000000001", "ASP-SR-1"], [customerB]: ["77000000-0000-4000-8000-000000000002", "ASP-SR-2"] };
const sajKey = "checklist.waterTank.saj_main_water_supply";
const levelKey = "checklist.waterTank.water_level";
const word1 = "Gate valve is leaking";
const word2 = "Float switch is stuck";
const edited1 = "Main gate valve is leaking";
const edited2 = "Float switch is stuck open";
const technicianId = 5001;
const reviewers = { admin: { id: 4, name: "Manager Mary" }, supervisor: { id: 6, name: "Admin Adam" } } as const;

type Decision = { id: string; decision: "approved" | "rejected"; reviewerUserId: number; reviewer: string; reviewerRole: "admin" | "supervisor"; note: string | null; approvedWording: string | null; createdAt: string };
type Req = { id: string; systemKey: string; sectionKey: string; wording: string; customerId: string; customerDisplayName: string; jobId: string | null; jobReference: string | null; requestedByUserId: number; requestedBy: string; createdAt: string; status: "pending" | "approved" | "rejected"; decision: Decision | null };
type Approved = { id: string; systemKey: string; sectionKey: string; wording: string; active: boolean; sourceRequestId: string };
type Legacy = { id: string; customerId: string; customerDisplayName: string; systemKey: string; sectionKey: string; wording: string; active: boolean };
const catalog = ["Battery spoilt", "25mm ball valve spoilt"];

function createServer() {
  return {
    approvedFetches: 0, offline: false, reviewerRole: "admin" as "admin" | "supervisor" | "inspector", approvedMalformed: false,
    requests: [] as Req[], approved: [] as Approved[], legacy: [] as Legacy[], posts: [] as Array<Record<string, unknown>>, decisionPosts: 0, managerCalls: 0, clock: 0
  };
}
type FakeServer = ReturnType<typeof createServer>;
const lower = (value: string) => value.toLowerCase();
const stamp = (server: FakeServer) => new Date(Date.UTC(2026, 9, 20, 8, 0, server.clock++)).toISOString();

async function wire(context: BrowserContext, server: FakeServer) {
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (server.offline) { await route.abort("internetdisconnected"); return; }
    if (path === "/api/service-common-remarks") {
      return json({ remarks: catalog.map((wording, index) => ({ id: `00000000-0000-4000-8000-00000000350${index + 1}`, systemKey: "automatic_sprinkler", wording, detailLabel: null, detailOptions: [], active: true })) });
    }
    const legacyList = /^\/api\/customers\/([0-9a-f-]{36})\/section-remarks$/.exec(path);
    if (legacyList && method === "GET") return json({ remarks: server.legacy.filter((row) => row.customerId === legacyList[1] && row.active).map(({ customerDisplayName: _name, active: _active, ...row }) => row) });
    const create = /^\/api\/technician\/customers\/([0-9a-f-]{36})\/systems\/([a-z_0-9]+)\/remark-requests$/.exec(path);
    if (create && method === "POST") {
      const body = request.postDataJSON() as { id: string; sectionKey: string; wording: string; jobId?: string };
      server.posts.push(body);
      const existing = server.requests.find((item) => item.id === lower(body.id));
      if (existing) return json({ requestedId: body.id, duplicate: true, request: existing });
      const compare = lower(body.wording);
      if (catalog.some((wording) => lower(wording) === compare)) return json({ error: "DUPLICATE_CATALOG", message: "This wording is already a standard remark for this service." }, 409);
      if (server.approved.some((item) => item.active && item.sectionKey === body.sectionKey && lower(item.wording) === compare)) {
        return json({ error: "DUPLICATE_APPROVED", message: "This wording is already an approved choice in this section." }, 409);
      }
      if (server.requests.some((item) => item.status === "pending" && item.sectionKey === body.sectionKey && lower(item.wording) === compare)) {
        return json({ error: "DUPLICATE_PENDING", message: "This wording is already waiting for approval in this section." }, 409);
      }
      const [jobId, jobReference] = body.jobId ? [body.jobId, jobs[create[1]!]![1]] : [null, null];
      const row: Req = { id: lower(body.id), systemKey: create[2]!, sectionKey: body.sectionKey, wording: body.wording, customerId: create[1]!, customerDisplayName: names[create[1]!]!, jobId, jobReference, requestedByUserId: technicianId, requestedBy: "Tech One", createdAt: stamp(server), status: "pending", decision: null };
      server.requests.push(row);
      return json({ requestedId: body.id, duplicate: false, request: row }, 201);
    }
    if (path === "/api/systems/automatic_sprinkler/approved-section-remarks" && method === "GET") {
      server.approvedFetches += 1;
      const active = server.approved.filter((item) => item.active);
      return json({ remarks: server.approvedMalformed ? [...active, { id: randomUUID(), systemKey: "automatic_sprinkler", sectionKey: sajKey, wording: "Switched off row", active: false, sourceRequestId: randomUUID() }] : active });
    }
    if (path === "/api/technician/remark-requests" && method === "GET") return json({ requests: [...server.requests].reverse() });
    if (path.startsWith("/api/manager/")) {
      server.managerCalls += 1;
      if (server.reviewerRole === "inspector") return json({ error: "FORBIDDEN" }, 403);
      if (path === "/api/manager/remark-requests" && method === "GET") {
        const status = url.searchParams.get("status") ?? "pending";
        const list = server.requests.filter((item) => status === "all" || (status === "decided" ? item.status !== "pending" : item.status === status));
        return json({ requests: [...list].reverse() });
      }
      const one = /^\/api\/manager\/remark-requests\/([0-9a-f-]{36})$/.exec(path);
      if (one && method === "GET") {
        const found = server.requests.find((item) => item.id === one[1]);
        return found ? json({ request: found }) : json({ error: "REMARK_REQUEST_NOT_FOUND", message: "Remark request not found." }, 404);
      }
      const decide = /^\/api\/manager\/remark-requests\/([0-9a-f-]{36})\/decision$/.exec(path);
      if (decide && method === "POST") {
        server.decisionPosts += 1;
        const body = request.postDataJSON() as { decision: "approved" | "rejected"; note?: string; approvedWording?: string };
        const found = server.requests.find((item) => item.id === decide[1]);
        if (!found) return json({ error: "REMARK_REQUEST_NOT_FOUND", message: "Remark request not found." }, 404);
        if (found.status !== "pending") return json({ error: "REMARK_REQUEST_ALREADY_DECIDED", message: "This remark request has already been decided." }, 409);
        if (body.decision === "rejected" && (!body.note || body.note.length < 3)) return json({ error: "INVALID_REMARK_REQUEST", message: "Reject requires a note." }, 400);
        const approvedWording = body.decision === "approved" ? body.approvedWording ?? found.wording : null;
        if (approvedWording) {
          const compare = lower(approvedWording);
          if (catalog.some((wording) => lower(wording) === compare)) return json({ error: "DUPLICATE_CATALOG", message: "That wording is already a standard remark for this service." }, 409);
          if (server.approved.some((item) => item.active && item.sectionKey === found.sectionKey && lower(item.wording) === compare)) return json({ error: "DUPLICATE_APPROVED", message: "That wording is already an approved choice in this section." }, 409);
          server.approved.push({ id: randomUUID(), systemKey: found.systemKey, sectionKey: found.sectionKey, wording: approvedWording, active: true, sourceRequestId: found.id });
        }
        const reviewer = reviewers[server.reviewerRole];
        found.status = body.decision;
        found.decision = { id: randomUUID(), decision: body.decision, reviewerUserId: reviewer.id, reviewer: reviewer.name, reviewerRole: server.reviewerRole, note: body.note ?? null, approvedWording, createdAt: stamp(server) };
        return json({ request: found }, 201);
      }
      if (path === "/api/manager/section-remarks" && method === "GET") return json({ approvedRemarks: server.approved, legacyRemarks: server.legacy });
      const off = /^\/api\/manager\/section-remarks\/(approved|legacy)\/([0-9a-f-]{36})\/deactivate$/.exec(path);
      if (off && method === "POST") {
        const row = (off[1] === "approved" ? server.approved : server.legacy).find((item) => item.id === off[2]);
        if (!row) return json({ error: "REMARK_REQUEST_NOT_FOUND", message: "Not found." }, 404);
        row.active = false;
        return json({ remark: { id: row.id, active: false } });
      }
    }
    return json({ error: "NOT_FOUND" }, 404);
  });
}

/** Calls a method of the page's harness (tests/remark-requests-flow.html) and returns its (awaited) result. */
const call = (page: Page, name: string, ...args: unknown[]) =>
  page.evaluate(([method, params]) => ((window as unknown as { harness: Record<string, (...input: unknown[]) => unknown> }).harness[method as string]!)(...(params as unknown[])), [name, args] as const);
let dialogs: "accept" | "dismiss" = "accept";

async function open(page: Page, which: "A" | "B" = "A") {
  await page.goto("/tests/remark-requests-flow.html");
  await page.locator("body[data-harness-ready='1']").waitFor({ state: "attached", timeout: 60_000 });
  await call(page, "mountForm", which);
  await expect(page.locator("#sprinkler-saj_main_water_supply")).toBeVisible({ timeout: 30_000 });
}
const rowOf = (page: Page, key: string) => page.locator(`#sprinkler-${key}`);
const picker = (scope: Locator) => scope.getByRole("combobox", { name: "Remark", exact: true });
const approvedOptions = (scope: Locator) => picker(scope).locator("optgroup[label='Approved remarks'] option");
const customerOptions = (scope: Locator) => picker(scope).locator("optgroup[label='Added for this customer'] option");
const sentMessage = "Sent for approval. It is used in this visit now.";

async function requestFromRow(row: Locator, wording: string) {
  await picker(row).selectOption("others");
  await row.getByRole("textbox", { name: "Type a new remark" }).fill(wording);
  await row.getByRole("button", { name: "Add to common remarks" }).click();
}
const readBack = (page: Page) => page.getByRole("region", { name: "Your remark requests" });

test.beforeEach(async ({ page }) => {
  dialogs = "accept";
  page.on("dialog", (dialog) => void (dialogs === "accept" ? dialog.accept() : dialog.dismiss()));
});

test("technician offline: Others -> Add to common remarks queues one request, leaves the visit text alone, and reaches the server once after reconnecting", async ({ page, context }) => {
  const server = createServer();
  await wire(context, server);
  await open(page);
  await context.setOffline(true);
  server.offline = true;
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  const saj = rowOf(page, "saj_main_water_supply");
  await picker(saj).selectOption("others");
  const send = saj.getByRole("button", { name: "Add to common remarks" });
  await expect(send).toBeDisabled();
  await saj.getByRole("textbox", { name: "Type a new remark" }).fill(word1);
  await expect(send).toBeEnabled();
  await send.click();
  await expect(saj.getByRole("status")).toHaveText(sentMessage);
  await expect(saj.getByRole("textbox", { name: "Type a new remark" })).toHaveValue(word1);
  await expect(approvedOptions(saj)).toHaveCount(0);
  await expect(picker(saj).getByRole("option", { name: word1 })).toHaveCount(0);
  await expect(readBack(page).getByText(word1)).toBeVisible();
  await expect(readBack(page).getByText("Waiting to send", { exact: true })).toBeVisible();

  // The same text again is refused locally; nothing second is queued.
  await send.click();
  await expect(saj.getByRole("status")).toContainText("already waiting for approval");
  let queued = await call(page, "outbox") as Array<{ status: string }>;
  expect(queued).toHaveLength(1);
  expect(queued[0]!.status).toBe("Pending");
  expect(server.posts).toHaveLength(0);

  // Still offline: the sync keeps it queued, the visit is untouched.
  const offlineRun = await call(page, "sync") as { confirmed: number };
  expect(offlineRun.confirmed).toBe(0);
  queued = await call(page, "outbox") as Array<{ status: string }>;
  expect(queued).toHaveLength(1);
  expect(queued[0]!.status).toBe("Pending");

  await context.setOffline(false);
  server.offline = false;
  const run = await call(page, "sync") as { confirmed: number };
  expect(run.confirmed).toBe(1);
  expect(server.requests).toHaveLength(1);
  expect(server.requests[0]).toMatchObject({ wording: word1, sectionKey: sajKey, customerId: customerA, status: "pending", jobId: jobs[customerA]![0] });
  expect(server.posts).toHaveLength(1);
  expect(server.posts[0]!.id).toBe(server.requests[0]!.id);
  await expect(readBack(page).getByText("Waiting for approval", { exact: true })).toBeVisible();
  await expect(saj.getByRole("textbox", { name: "Type a new remark" })).toHaveValue(word1);
  const again = await call(page, "sync") as { attempted: number };
  expect(again.attempted).toBe(0);
  expect(server.requests).toHaveLength(1);
  // A pending request is never a choice, for the requester or anyone else.
  await call(page, "refreshApproved");
  await expect(approvedOptions(saj)).toHaveCount(0);
});

test("Manager and Admin approve with edited wording; another customer is offered each remark in its own row only", async ({ page, context }) => {
  const server = createServer();
  await wire(context, server);
  await open(page);
  await requestFromRow(rowOf(page, "saj_main_water_supply"), word1);
  await requestFromRow(rowOf(page, "water_level"), word2);
  await expect(rowOf(page, "water_level").getByRole("status")).toHaveText(sentMessage);
  expect((await call(page, "sync") as { confirmed: number }).confirmed).toBe(2);
  expect(server.requests.map((item) => item.status)).toEqual(["pending", "pending"]);
  const byWording = (wording: string) => server.requests.find((item) => item.wording === wording)!;

  // ---- Manager (code role admin) approves the first with an edited wording.
  server.reviewerRole = "admin";
  await call(page, "mountManager");
  const manager = page.locator("#manager");
  await expect(manager.getByRole("heading", { name: "Remark requests", level: 2 })).toBeVisible();
  const cards = manager.locator(".proposal-card");
  await expect(cards).toHaveCount(2);
  await cards.filter({ hasText: word1 }).click();
  const detail = manager.getByRole("region", { name: "Remark request review" });
  await expect(detail.getByRole("heading", { name: word1 })).toBeVisible();
  await expect(detail.getByText("Water Tank › S.A.J Main Water Supply", { exact: true })).toBeVisible();
  await expect(detail.getByText("Automatic Sprinkler System", { exact: true })).toBeVisible();
  await expect(detail.getByText("Tech One", { exact: true })).toBeVisible();
  await expect(detail.getByText("Sprinkler Customer A", { exact: true })).toBeVisible();
  await expect(detail.getByText("ASP-SR-1", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Edit wording and approve" }).click();
  await detail.getByRole("textbox", { name: "Approved wording" }).fill(`  ${edited1}  `);
  await detail.getByRole("button", { name: "Approve with edited wording" }).click();
  await expect(detail.getByText(/Approved with edited wording by Manager Mary \(Manager\)/)).toBeVisible();
  expect(server.approved).toHaveLength(1);
  expect(server.approved[0]).toMatchObject({ sectionKey: sajKey, wording: edited1, active: true });
  expect(byWording(word1)).toMatchObject({ status: "approved", wording: word1 });
  expect(byWording(word1).decision).toMatchObject({ reviewerRole: "admin", approvedWording: edited1 });

  // ---- Admin (code role supervisor) approves the second with an edited wording.
  server.reviewerRole = "supervisor";
  await call(page, "unmountManager");
  await call(page, "mountManager");
  await expect(cards).toHaveCount(1);
  await cards.filter({ hasText: word2 }).click();
  await detail.getByRole("button", { name: "Edit wording and approve" }).click();
  await detail.getByRole("textbox", { name: "Approved wording" }).fill(edited2);
  await detail.getByRole("textbox", { name: /^Note/ }).fill("Wording tidied up");
  await detail.getByRole("button", { name: "Approve with edited wording" }).click();
  await expect(detail.getByText(/by Admin Adam \(Admin\)/)).toBeVisible();
  expect(byWording(word2).decision).toMatchObject({ reviewerRole: "supervisor", approvedWording: edited2, note: "Wording tidied up" });
  await manager.getByRole("tab", { name: "Decided" }).click();
  await expect(manager.locator(".proposal-card")).toHaveCount(2);
  await expect(manager.locator(".proposal-card").filter({ hasText: word1 })).toContainText("Approved with edited wording");
  await expect(manager.getByRole("tab", { name: "Pending" })).toBeVisible();
  await call(page, "unmountManager");

  // ---- The requesting technician is told, in the same form.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(readBack(page).getByText("Approved", { exact: true }).first()).toBeVisible();
  await expect(readBack(page)).toContainText(`Approved as: ${edited1}`);
  await expect(readBack(page)).toContainText("Admin note: Wording tidied up");

  // ---- ANOTHER customer, after a reload: each approved remark appears in its own row only.
  await page.reload();
  await page.locator("body[data-harness-ready='1']").waitFor({ state: "attached", timeout: 60_000 });
  await call(page, "mountForm", "B");
  const sajB = rowOf(page, "saj_main_water_supply");
  await expect(sajB).toBeVisible({ timeout: 30_000 });
  await expect(approvedOptions(sajB)).toHaveText([edited1]);
  await expect(approvedOptions(rowOf(page, "water_level"))).toHaveText([edited2]);
  for (const key of ["automatic_refilling_facilities", "drain_and_stop_valve_positions", "pump_house_clean", "battery_serviceable", "breaching_inlet", "trfp_jockey_pump", "jockey_pump_pressure", "installation_gauge"]) {
    await expect(approvedOptions(rowOf(page, key)), key).toHaveCount(0);
  }
  await expect(approvedOptions(page.locator("#sprinkler-comments"))).toHaveCount(0);
  await expect(customerOptions(sajB)).toHaveCount(0);
  await expect(picker(sajB).getByRole("option", { name: "Battery spoilt" })).toBeAttached();
  await expect(picker(sajB).getByRole("option", { name: "Others (type your own)" })).toBeAttached();
  await expect(picker(sajB).getByRole("option", { name: edited2 })).toHaveCount(0);
  await picker(sajB).selectOption({ label: edited1 });
  await expect(picker(sajB)).toHaveValue(/^approved:/);
  // Another customer's technician has no request of their own to read back.
  await expect(readBack(page)).toHaveCount(0);
});

test("reject: a note is required, the technician is told, the visit text stays, nothing is offered", async ({ page, context }) => {
  const server = createServer();
  await wire(context, server);
  await open(page);
  const saj = rowOf(page, "saj_main_water_supply");
  await requestFromRow(saj, word1);
  expect((await call(page, "sync") as { confirmed: number }).confirmed).toBe(1);

  server.reviewerRole = "supervisor";
  await call(page, "mountManager");
  const manager = page.locator("#manager");
  await manager.locator(".proposal-card").filter({ hasText: word1 }).click();
  const detail = manager.getByRole("region", { name: "Remark request review" });
  await detail.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(detail.getByRole("alert")).toContainText("A note is required to reject");
  expect(server.decisionPosts).toBe(0);
  await detail.getByRole("textbox", { name: /^Note/ }).fill("Already covered by Battery spoilt");
  await detail.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(detail.getByText(/Rejected by Admin Adam \(Admin\)/)).toBeVisible();
  expect(server.requests[0]).toMatchObject({ status: "rejected" });
  expect(server.requests[0]!.decision).toMatchObject({ decision: "rejected", note: "Already covered by Battery spoilt", approvedWording: null });
  expect(server.approved).toHaveLength(0);
  await call(page, "unmountManager");

  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(readBack(page).getByText("Rejected", { exact: true })).toBeVisible();
  await expect(readBack(page)).toContainText("Admin note: Already covered by Battery spoilt");
  await expect(readBack(page)).toContainText("Your visit keeps the text you typed.");
  await expect(saj.getByRole("textbox", { name: "Type a new remark" })).toHaveValue(word1);
  await call(page, "refreshApproved");
  await expect(approvedOptions(saj)).toHaveCount(0);
  await expect(picker(saj).getByRole("option", { name: word1 })).toHaveCount(0);
});

test("a server refusal at send time (duplicate) shows the server's own message in the row", async ({ page, context }) => {
  const server = createServer();
  await wire(context, server);
  await open(page);
  await expect.poll(() => server.approvedFetches).toBeGreaterThan(0);
  // The wording is approved AFTER this device last refreshed its choices, so only the server can know.
  server.approved.push({ id: randomUUID(), systemKey: "automatic_sprinkler", sectionKey: sajKey, wording: word1, active: true, sourceRequestId: randomUUID() });
  const saj = rowOf(page, "saj_main_water_supply");
  await requestFromRow(saj, word1);
  await expect(saj.getByRole("status")).toHaveText(sentMessage);
  const run = await call(page, "sync") as { confirmed: number; failed: number };
  expect(run).toMatchObject({ confirmed: 0, failed: 1 });
  await expect(saj.getByRole("status")).toHaveText("This wording is already an approved choice in this section.");
  await expect(saj.getByRole("textbox", { name: "Type a new remark" })).toHaveValue(word1);
  await expect(readBack(page)).toContainText("Not accepted");
  await expect(readBack(page)).toContainText("already an approved choice");
  // The technician can remove the refused request; the visit text is still there.
  await readBack(page).getByRole("button", { name: "Remove this request" }).click();
  await readBack(page).getByRole("button", { name: "Confirm remove" }).click();
  await expect(readBack(page)).toHaveCount(0);
  expect(await call(page, "outbox")).toHaveLength(0);
  await expect(saj.getByRole("textbox", { name: "Type a new remark" })).toHaveValue(word1);
});

test("malformed approved list from the server fails closed: the last good choices stay, nothing half-trusted appears", async ({ page, context }) => {
  const server = createServer();
  server.approved.push({ id: randomUUID(), systemKey: "automatic_sprinkler", sectionKey: sajKey, wording: edited1, active: true, sourceRequestId: randomUUID() });
  await wire(context, server);
  await open(page);
  const saj = rowOf(page, "saj_main_water_supply");
  await expect(approvedOptions(saj)).toHaveText([edited1]);
  server.approvedMalformed = true;
  expect(await call(page, "refreshApproved")).toMatch(/malformed/i);
  await expect(approvedOptions(saj)).toHaveText([edited1]);
  await expect(picker(saj).getByRole("option", { name: "Switched off row" })).toHaveCount(0);
});

test("Remarks in use: approved remarks per service + section and the older customer remarks, each deactivated only after confirmation", async ({ page, context }) => {
  const server = createServer();
  const approvedId = randomUUID();
  const legacyId = randomUUID();
  server.approved.push({ id: approvedId, systemKey: "automatic_sprinkler", sectionKey: sajKey, wording: edited1, active: true, sourceRequestId: randomUUID() });
  server.legacy.push({ id: legacyId, customerId: customerA, customerDisplayName: names[customerA]!, systemKey: "automatic_sprinkler", sectionKey: levelKey, wording: "Older customer remark", active: true });
  server.legacy.push({ id: randomUUID(), customerId: customerB, customerDisplayName: names[customerB]!, systemKey: "automatic_sprinkler", sectionKey: sajKey, wording: "Customer B only remark", active: true });
  await wire(context, server);
  await open(page);
  const saj = rowOf(page, "saj_main_water_supply");
  await expect(approvedOptions(saj)).toHaveText([edited1]);
  await expect(customerOptions(rowOf(page, "water_level"))).toHaveText(["Older customer remark"]);
  await expect(customerOptions(saj)).toHaveCount(0);

  server.reviewerRole = "admin";
  await call(page, "mountManager");
  const manager = page.locator("#manager");
  await manager.getByRole("tab", { name: "Remarks in use" }).click();
  await expect(manager.getByRole("heading", { name: "Automatic Sprinkler System · Water Tank › S.A.J Main Water Supply", level: 4 })).toBeVisible();
  await expect(manager.getByText(edited1)).toBeVisible();
  await expect(manager.getByText("Older customer remark")).toBeVisible();
  await expect(manager.getByText("Sprinkler Customer A · Automatic Sprinkler System · Water Tank › Water Level")).toBeVisible();
  await expect(manager.getByText("Customer B only remark")).toBeVisible();

  // Cancel does nothing.
  dialogs = "dismiss";
  await manager.getByRole("button", { name: `Deactivate ${edited1}` }).click();
  expect(server.approved[0]!.active).toBe(true);
  // Confirm deactivates and the list says so.
  dialogs = "accept";
  await manager.getByRole("button", { name: `Deactivate ${edited1}` }).click();
  await expect(manager.getByText("Deactivated", { exact: true })).toBeVisible();
  await expect(manager.getByRole("button", { name: `Deactivate ${edited1}` })).toHaveCount(0);
  expect(server.approved[0]!.active).toBe(false);
  await manager.getByRole("button", { name: "Deactivate customer remark Older customer remark" }).click();
  await expect(manager.getByText("Deactivated", { exact: true })).toHaveCount(2);
  expect(server.legacy.find((item) => item.id === legacyId)!.active).toBe(false);
  expect(server.legacy.filter((item) => item.active)).toHaveLength(1);

  // A fresh visit no longer offers either of them.
  await call(page, "unmountManager");
  await page.reload();
  await page.locator("body[data-harness-ready='1']").waitFor({ state: "attached", timeout: 60_000 });
  await call(page, "mountForm", "A");
  await expect(rowOf(page, "saj_main_water_supply")).toBeVisible({ timeout: 30_000 });
  await expect(approvedOptions(rowOf(page, "saj_main_water_supply"))).toHaveCount(0);
  await expect(customerOptions(rowOf(page, "water_level"))).toHaveCount(0);
});

test("375 px: the review page and the technician read-back fit without sideways scrolling and keep 44 px targets", async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const server = createServer();
  await wire(context, server);
  await open(page);
  await requestFromRow(rowOf(page, "saj_main_water_supply"), "A fairly long remark wording that has to wrap across several lines on a narrow phone screen to prove the layout");
  expect((await call(page, "sync") as { confirmed: number }).confirmed).toBe(1);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(await overflow()).toBe(true);
  await expect(readBack(page)).toBeVisible();
  await readBack(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("technician-readback-375.png") });

  await call(page, "unmountForm");
  await call(page, "mountManager");
  const manager = page.locator("#manager");
  await expect(manager.locator(".proposal-card")).toHaveCount(1);
  expect(await overflow()).toBe(true);
  await manager.locator(".proposal-card").click();
  const detail = manager.getByRole("region", { name: "Remark request review" });
  await detail.getByRole("button", { name: "Edit wording and approve" }).click();
  await expect(detail.getByRole("textbox", { name: "Approved wording" })).toBeVisible();
  expect(await overflow()).toBe(true);
  for (const control of await manager.locator("button:visible").all()) {
    const box = (await control.boundingBox())!;
    expect(box.height, await control.innerText()).toBeGreaterThanOrEqual(43.5);
  }
  for (const input of await manager.locator("textarea:visible").all()) {
    expect(await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  }
  await page.screenshot({ path: testInfo.outputPath("manager-detail-375.png") });
  await manager.getByRole("tab", { name: "Remarks in use" }).click();
  expect(await overflow()).toBe(true);
});

/* ------------------------------------------------------------------------------------------------
 * The real App: who can open the page.
 * ---------------------------------------------------------------------------------------------- */
async function installApp(page: Page, role: "inspector" | "admin" | "supervisor") {
  const requests: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname);
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (url.pathname === "/api/auth/me") return json({ user: { id: role === "inspector" ? technicianId : 4, username: "someone", role } });
    if (url.pathname === "/api/manager/remark-requests") return role === "inspector" ? json({ error: "FORBIDDEN" }, 403) : json({ requests: [] });
    if (url.pathname === "/api/manager/location-proposals") return json({ proposals: [], counts: { pending: 0, approved: 0, rejected: 0, withdrawn: 0 } });
    if (url.pathname === "/api/manager/site-proposals") return json({ proposals: [] });
    if (url.pathname === "/api/repair-visits") return json({ visits: [] });
    if (url.pathname === "/api/manager/service-visits") return json({ serviceVisits: [], totalCount: 0, nextCursor: null });
    return json({});
  });
  return requests;
}

for (const [role, button] of [["admin", /^Manager Monitor/], ["supervisor", /^Admin Review/]] as const) {
  test(`${role === "admin" ? "Manager" : "Admin"} opens Remark requests from the Approvals hub and Back returns to Approvals`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const requests = await installApp(page, role);
    await page.goto("/tests/manager-dashboard-navigation.html#/manager-approvals");
    await page.getByRole("button", { name: button }).click();
    const card = page.locator(".manager-hub-card").filter({ hasText: "Remark requests" });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/#\/manager-remark-requests$/);
    await expect(page.getByRole("heading", { name: "Remark requests", level: 2 })).toBeVisible();
    await expect(page.getByText("No remark requests are waiting.")).toBeVisible();
    await expect(page.locator('[aria-label="Primary navigation"] button[aria-current="page"]')).toHaveText("Approvals");
    expect(requests).toContain("/api/manager/remark-requests");
    await page.getByRole("button", { name: "Back to Approvals", exact: true }).click();
    await expect(page).toHaveURL(/#\/manager-approvals$/);
  });
}

test("a technician cannot open the Remark requests page, by address or by any control, and nothing is fetched", async ({ page }) => {
  const requests = await installApp(page, "inspector");
  await page.goto("/tests/manager-dashboard-navigation.html#/manager-remark-requests");
  await expect(page.getByRole("heading", { name: "Remark requests" })).toHaveCount(0);
  await expect(page.getByText("Manager workspace")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Approvals/ })).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(requests.some((path) => path.startsWith("/api/manager/"))).toBe(false);
});

test("the API refuses a technician too: a 403 from the review routes shows no data and no page", async ({ page, context }) => {
  const server = createServer();
  server.reviewerRole = "inspector";
  await wire(context, server);
  await open(page);
  await call(page, "mountManager");
  await expect.poll(() => page.evaluate(() => (window as unknown as { harness: { authority: string[] } }).harness.authority.length)).toBe(1);
  await expect(page.locator("#manager .proposal-card")).toHaveCount(0);
});
