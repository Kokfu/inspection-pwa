import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

/**
 * R4, browser level. The REAL technician form of one service (tests/remark-requests-r4.html) on real IndexedDB, with one small in-memory
 * "server" behind page.route that follows the R2 contract (apps/api/src/routes/remarkRequests.ts). Every service spec calls
 * `defineRemarkRequestSpec`, so each one proves the same owner rules for ITS OWN section keys:
 *   choose a standard remark | replace it (one remark only) | Others (typed, works offline) | Add to common remarks = a REQUEST that
 *   leaves the visit text alone, is created offline, is confirmed only after sync, and, once approved, is offered in that one section
 *   at every other customer (and nowhere else).
 */
const customerA = "78000000-0000-4000-8000-000000000050";
const customerB = "78000000-0000-4000-8000-000000000077";
const jobIds: Record<string, string> = { [customerA]: "78000000-0000-4000-8000-000000000001", [customerB]: "78000000-0000-4000-8000-000000000002" };
const technicianId = 5001;
const catalogWordings = ["Cannot be tested", "Needs replacement"];

type Req = { id: string; systemKey: string; sectionKey: string; wording: string; customerId: string; customerDisplayName: string; jobId: string | null; jobReference: string | null; requestedByUserId: number; requestedBy: string; createdAt: string; status: "pending" | "approved" | "rejected"; decision: null | Record<string, unknown> };
type Approved = { id: string; systemKey: string; sectionKey: string; wording: string; active: boolean; sourceRequestId: string };

export function createServer() {
  return { offline: false, requests: [] as Req[], approved: [] as Approved[], posts: [] as Array<Record<string, unknown>>, postedPaths: [] as string[], commonRemarkPosts: 0, clock: 0 };
}
export type FakeServer = ReturnType<typeof createServer>;
const lower = (value: string) => value.toLowerCase();

export async function wire(context: BrowserContext, server: FakeServer, systemKey: string) {
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    // The harness imports the real template source (served by Vite from .../apps/api/src/...): that is a module, not the API.
    if (!path.startsWith("/api/") || path.startsWith("/api/src/")) { await route.fallback(); return; }
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (server.offline) { await route.abort("internetdisconnected"); return; }
    if (path === "/api/service-common-remarks" && method === "GET") {
      return json({ remarks: catalogWordings.map((wording, index) => ({ id: `00000000-0000-4000-8000-00000000360${index + 1}`, systemKey, wording, detailLabel: null, detailOptions: [], active: true })) });
    }
    if (path === "/api/service-common-remarks" && method === "POST") { server.commonRemarkPosts += 1; return json({ error: "FORBIDDEN" }, 403); }
    const legacyList = /^\/api\/customers\/([0-9a-f-]{36})\/section-remarks$/.exec(path);
    if (legacyList && method === "GET") return json({ remarks: [] });
    const create = /^\/api\/technician\/customers\/([0-9a-f-]{36})\/systems\/([a-z_0-9]+)\/remark-requests$/.exec(path);
    if (create && method === "POST") {
      const body = request.postDataJSON() as { id: string; sectionKey: string; wording: string; jobId?: string };
      server.posts.push(body); server.postedPaths.push(path);
      const existing = server.requests.find((item) => item.id === lower(body.id));
      if (existing) return json({ requestedId: body.id, duplicate: true, request: existing });
      const compare = lower(body.wording);
      if (catalogWordings.some((wording) => lower(wording) === compare)) return json({ error: "DUPLICATE_CATALOG", message: "This wording is already a standard remark for this service." }, 409);
      const row: Req = {
        id: lower(body.id), systemKey: create[2]!, sectionKey: body.sectionKey, wording: body.wording, customerId: create[1]!,
        customerDisplayName: create[1] === customerA ? "Customer A" : "Customer B", jobId: body.jobId ?? null, jobReference: body.jobId ? `R4-${create[2]}` : null,
        requestedByUserId: technicianId, requestedBy: "Tech One", createdAt: new Date(Date.UTC(2026, 9, 21, 8, 0, server.clock++)).toISOString(), status: "pending", decision: null
      };
      server.requests.push(row);
      return json({ requestedId: body.id, duplicate: false, request: row }, 201);
    }
    const approvedList = /^\/api\/systems\/([a-z_0-9]+)\/approved-section-remarks$/.exec(path);
    if (approvedList && method === "GET") return json({ remarks: server.approved.filter((item) => item.active && item.systemKey === approvedList[1]) });
    if (path === "/api/technician/remark-requests" && method === "GET") return json({ requests: [...server.requests].reverse() });
    return json({ error: "NOT_FOUND" }, 404);
  });
}

/** Approves a request the way the Admin/Manager page would, with the wording the reviewer settled on. */
export function approve(server: FakeServer, wording: string, approvedWording = wording) {
  const found = server.requests.find((item) => item.wording === wording)!;
  found.status = "approved";
  found.decision = { id: randomUUID(), decision: "approved", reviewerUserId: 4, reviewer: "Manager Mary", reviewerRole: "admin", note: null, approvedWording, createdAt: new Date(Date.UTC(2026, 9, 21, 9, 0, server.clock++)).toISOString() };
  server.approved.push({ id: randomUUID(), systemKey: found.systemKey, sectionKey: found.sectionKey, wording: approvedWording, active: true, sourceRequestId: found.id });
}

const call = (page: Page, name: string, ...args: unknown[]) =>
  page.evaluate(([method, params]) => ((window as unknown as { harness: Record<string, (...input: unknown[]) => unknown> }).harness[method as string]!)(...(params as unknown[])), [name, args] as const);
const picker = (scope: Locator) => scope.getByRole("combobox", { name: "Remark", exact: true });
const sentMessage = "Sent for approval. It is used in this visit now.";

export type SpecConfig = {
  title: string;
  systemKey: string;
  /** The section key the chosen row must send, and a DIFFERENT allowlisted section of the same service (to prove the scope). */
  sectionKey: string;
  otherSectionKey: string;
  /** Finds the Remark control of the row under test, and of a second row (a different section) on the same form. */
  row: (page: Page) => Locator;
  otherRow: (page: Page) => Locator;
  /** True when the second row is the SAME template slot (repeated rows share one key), so an approved remark is offered there too. */
  otherSameSection?: boolean;
  /** The Comments box of the service: it keeps today's behaviour (no request flow). */
  comments: (page: Page) => Locator;
  ready: (page: Page) => Locator;
  /** Hose Reel and Hydrant first show the saved-layout prompt; the technician taps Start Inspection to open the form. */
  needsStart?: boolean;
};

async function open(page: Page, config: SpecConfig, which: "A" | "B" = "A") {
  await page.goto("/tests/remark-requests-r4.html");
  await page.locator("body[data-harness-ready='1']").waitFor({ state: "attached", timeout: 60_000 });
  await call(page, "mount", config.systemKey, which);
  if (config.needsStart) await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(config.ready(page)).toBeVisible({ timeout: 30_000 });
  await expect(picker(config.row(page))).toBeVisible();
}

export function defineRemarkRequestSpec(config: SpecConfig) {
  test.describe(config.title, () => {
    let server: FakeServer;
    test.beforeEach(async ({ context, page }) => {
      server = createServer();
      await wire(context, server, config.systemKey);
      await page.setViewportSize({ width: 375, height: 812 });
    });

    test("choose a standard remark, replace it with another, clear it: one remark per row", async ({ page }) => {
      await open(page, config);
      const row = config.row(page);
      await expect(picker(row).getByRole("option", { name: catalogWordings[0]! })).toBeAttached();
      await picker(row).selectOption({ label: catalogWordings[0]! });
      await expect(picker(row)).toHaveValue(/.+/);
      await expect(picker(row).locator("option:checked")).toHaveText(catalogWordings[0]!);
      await picker(row).selectOption({ label: catalogWordings[1]! });
      await expect(picker(row).locator("option:checked")).toHaveText(catalogWordings[1]!);
      // No stacked list and no Remove button: the dropdown itself shows the one remark.
      await expect(row.getByRole("list", { name: "Selected remarks" })).toHaveCount(0);
      await expect(row.getByRole("button", { name: /^Remove remark/ })).toHaveCount(0);
      await picker(row).selectOption({ label: "No remark" });
      await expect(picker(row).locator("option:checked")).toHaveText("No remark");
      // The other rows of the form are separate: choosing here did not touch them.
      await expect(picker(config.otherRow(page)).locator("option:checked")).toHaveText("No remark");
    });

    test("Others types straight into the row, offline, and a request leaves that text alone", async ({ page, context }) => {
      await open(page, config);
      const row = config.row(page);
      await context.setOffline(true);
      server.offline = true;
      await picker(row).selectOption({ label: "Others (type your own)" });
      const typed = row.getByRole("textbox", { name: "Type a new remark" });
      await typed.fill("Door sensor is loose");
      await expect(typed).toHaveValue("Door sensor is loose");
      await expect(row.getByRole("list", { name: "Selected remarks" })).toHaveCount(0);

      await row.getByRole("button", { name: "Add to common remarks" }).click();
      await expect(row.getByRole("status")).toHaveText(sentMessage);
      await expect(typed).toHaveValue("Door sensor is loose");
      // Created on the device, in the outbox, for THIS service + section + customer; nothing reached the server or the system-wide list.
      const queued = await call(page, "outbox") as Array<{ status: string; payload: { systemKey: string; sectionKey: string; customerId: string; wording: string; jobId?: string } }>;
      expect(queued).toHaveLength(1);
      expect(queued[0]!.payload).toMatchObject({ systemKey: config.systemKey, sectionKey: config.sectionKey, customerId: customerA, wording: "Door sensor is loose", jobId: jobIds[customerA] });
      expect(["Pending", "Syncing"]).toContain(queued[0]!.status);
      expect(server.posts).toHaveLength(0);
      expect(await call(page, "commonRemarkOutbox")).toHaveLength(0);
      // The visit text is in the local draft (used in this visit's report straight away) while the request waits.
      await expect(picker(row)).toHaveValue("others");
      // Pending is never offered: another section of the same service does not list it either.
      await expect(picker(config.otherRow(page)).getByRole("option", { name: "Door sensor is loose" })).toHaveCount(0);

      // Reconnect: the same UUID is sent once and confirmed only when the server echoes it.
      await context.setOffline(false);
      server.offline = false;
      const run = await call(page, "sync") as { confirmed: number; failed: number };
      expect(run.failed).toBe(0);
      expect(server.posts).toHaveLength(1);
      expect(server.postedPaths[0]).toBe(`/api/technician/customers/${customerA}/systems/${config.systemKey}/remark-requests`);
      expect(server.posts[0]).toMatchObject({ sectionKey: config.sectionKey, wording: "Door sensor is loose", jobId: jobIds[customerA] });
      expect(server.requests[0]!.id).toBe(((queued[0]!.payload as unknown) as { id: string }).id);
      expect(server.commonRemarkPosts).toBe(0);
      await expect(typed).toHaveValue("Door sensor is loose");
    });

    test("once approved, the wording is offered in that section only, at another customer", async ({ page }) => {
      await open(page, config);
      const row = config.row(page);
      await picker(row).selectOption({ label: "Others (type your own)" });
      await row.getByRole("textbox", { name: "Type a new remark" }).fill("Cable cover is missing");
      await row.getByRole("button", { name: "Add to common remarks" }).click();
      await expect(row.getByRole("status")).toHaveText(sentMessage);
      await call(page, "sync");
      expect(server.requests).toHaveLength(1);
      // Pending: not offered to anyone yet.
      await call(page, "refreshApproved", config.systemKey);
      await expect(picker(row).locator("optgroup[label='Approved remarks'] option")).toHaveCount(0);

      approve(server, "Cable cover is missing", "Cable cover is missing or damaged");
      // A different customer's visit, same service: the approved remark shows in this row only.
      await open(page, config, "B");
      await call(page, "refreshApproved", config.systemKey);
      const rowB = config.row(page);
      await expect(picker(rowB).locator("optgroup[label='Approved remarks'] option")).toHaveText(["Cable cover is missing or damaged"], { timeout: 15_000 });
      await expect(picker(config.otherRow(page)).locator("optgroup[label='Approved remarks'] option")).toHaveCount(config.otherSameSection ? 1 : 0);
      await picker(rowB).selectOption({ label: "Cable cover is missing or damaged" });
      await expect(picker(rowB).locator("option:checked")).toHaveText("Cable cover is missing or damaged");
    });

    test("the Comments box keeps today's behaviour: stacked list, no request flow, no system-wide add", async ({ page }) => {
      await open(page, config);
      const comments = config.comments(page);
      const commentPicker = picker(comments);
      await commentPicker.selectOption({ label: catalogWordings[0]! });
      await commentPicker.selectOption({ label: catalogWordings[1]! });
      await expect(comments.getByRole("list", { name: "Selected remarks" }).getByRole("listitem")).toHaveText([`${catalogWordings[0]!}Remove`, `${catalogWordings[1]!}Remove`]);
      await commentPicker.selectOption("others");
      await comments.getByRole("textbox", { name: "Type a new remark" }).fill("A visit-only comment");
      await expect(comments.getByRole("list", { name: "Selected remarks" }).getByRole("listitem")).toHaveCount(3);
      // A technician can no longer push text into the system-wide list from here (the API refuses it), and there is no request button.
      await expect(comments.getByRole("button", { name: "Add to common remarks" })).toHaveCount(0);
      expect(await call(page, "outbox")).toHaveLength(0);
      expect(await call(page, "commonRemarkOutbox")).toHaveLength(0);
    });
  });
}
