import { expect, test, type Page } from "@playwright/test";

type Visit = {
  id: string; reference: string; customerId: string; customer: string; siteId: string; site: string;
  serviceDate: string; status: "open" | "closed"; technician: { id: number; displayName: string } | null;
};

const technicians = [
  { id: 11, username: "tech-alpha", displayName: null, role: "inspector", isActive: true, createdAt: "2026-09-01T00:00:00.000Z" },
  { id: 12, username: "tech-bravo", displayName: null, role: "inspector", isActive: false, createdAt: "2026-09-02T00:00:00.000Z" },
  { id: 13, username: "tech-charlie", displayName: null, role: "inspector", isActive: true, createdAt: "2026-09-03T00:00:00.000Z" },
  { id: 14, username: "tech-delta", displayName: null, role: "inspector", isActive: true, createdAt: "2026-09-04T00:00:00.000Z" },
  // A supervisor (T4) is listed by the API but never offered as a "created by" filter.
  { id: 15, username: "super-echo", displayName: null, role: "supervisor", isActive: true, createdAt: "2026-09-05T00:00:00.000Z" }
];
const alpha = { id: 11, displayName: "tech-alpha" };
const bravo = { id: 12, displayName: "tech-bravo" };
const acme = "a0000000-0000-4000-8000-000000000001";
const beacon = "a0000000-0000-4000-8000-000000000002";
const crest = "a0000000-0000-4000-8000-000000000003";
const customer = (id: string, code: string, displayName: string, sites: Array<[string, string]>) => ({
  customer: { id, code, displayName },
  sites: sites.map(([siteId, name]) => ({ id: siteId, code: name.toUpperCase(), displayName: name })),
  configuration: { id: `${id}-config`, revision: 1, enabledSystems: [] },
  supportedSystems: []
});
const customers = [
  customer(acme, "ACM-001", "Acme Towers", [["s-north", "North Block"], ["s-south", "South Block"]]),
  customer(beacon, "BCN-002", "Beacon Mall", [["s-beacon", "Beacon Main"]]),
  customer(crest, "CRS-003", "Crest Plaza", [["s-crest", "Crest East"]])
];
const visitId = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const visits: Visit[] = [
  { id: visitId(1), reference: "SV-0001", customerId: acme, customer: "Acme Towers", siteId: "s-north", site: "North Block", serviceDate: "2026-09-10", status: "closed", technician: alpha },
  { id: visitId(2), reference: "SV-0002", customerId: acme, customer: "Acme Towers", siteId: "s-south", site: "South Block", serviceDate: "2026-09-12", status: "open", technician: alpha },
  { id: visitId(3), reference: "SV-0003", customerId: acme, customer: "Acme Towers", siteId: "s-north", site: "North Block", serviceDate: "2026-09-01", status: "closed", technician: bravo },
  { id: visitId(4), reference: "SV-0004", customerId: acme, customer: "Acme Towers", siteId: "s-south", site: "South Block", serviceDate: "2026-08-20", status: "closed", technician: null },
  // 21 more completed visits for tech-alpha at Beacon, so the technician's Completed tab pages (20 + 2).
  ...Array.from({ length: 21 }, (_, index): Visit => ({
    id: visitId(100 + index), reference: `SV-B${String(index).padStart(3, "0")}`, customerId: beacon, customer: "Beacon Mall",
    siteId: "s-beacon", site: "Beacon Main", serviceDate: `2026-07-${String(index + 1).padStart(2, "0")}`, status: "closed", technician: alpha
  })),
  // 55 Crest visits (more than the 50-row default page): even rows tech-charlie, odd rows tech-delta.
  ...Array.from({ length: 55 }, (_, index): Visit => ({
    id: visitId(200 + index), reference: `SV-C${String(index).padStart(3, "0")}`, customerId: crest, customer: "Crest Plaza",
    siteId: "s-crest", site: "Crest East", serviceDate: `2026-${String(1 + Math.floor(index / 28)).padStart(2, "0")}-${String(1 + (index % 28)).padStart(2, "0")}`,
    status: "closed", technician: index % 2 === 0 ? { id: 13, displayName: "tech-charlie" } : { id: 14, displayName: "tech-delta" }
  }))
];
const present = (visit: Visit) => ({
  id: visit.id, reference: visit.reference, customer: visit.customer, site: visit.site, createdAt: `${visit.serviceDate}T01:00:00.000Z`,
  serviceDate: visit.serviceDate, serviceTime: null, status: visit.status, technician: visit.technician, systems: ["Hose Reel"],
  inspectionProgress: { accepted: 1, required: 1 },
  completion: { jobStatus: visit.status, completedAt: visit.status === "closed" ? `${visit.serviceDate}T09:00:00.000Z` : null, completedBy: visit.technician ? { id: visit.technician.id, username: visit.technician.displayName } : null }
});
const report = (visit: Visit) => ({
  customer: visit.customer, site: visit.site, serviceDate: visit.serviceDate, jobReference: visit.reference,
  completedAt: `${visit.serviceDate}T09:00:00.000Z`, completedBy: visit.technician?.displayName ?? "Unknown",
  systems: [{ systemKey: "hose_reel", label: "Hose Reel", status: "Accepted", condition: "GOOD CONDITIONS", conditionDetail: "", locations: ["Level 1"] }],
  sections: [{ systemKey: "hose_reel", label: "Hose Reel", fields: [{ label: `Report body ${visit.reference}`, value: "Good", depth: 1 }], evidence: [] }]
});

const manager = { id: 900, username: "mobiletest", role: "admin" };
const managerB = { id: 901, username: "manager-b", role: "admin" };
type SessionUser = typeof manager;

/**
 * A fake of the admin API that honours the same filters/keyset contract as the server. The session
 * is signed in as `session.user` until POST /api/auth/logout (or until a test sets
 * `session.signedIn = false`, i.e. the server session expired); login signs in the matching account.
 * `holdCursorPages`, when set, delays every cursor (Load more) response until it resolves.
 */
async function mockManagerApi(page: Page, options: { holdCursorPages?: Promise<void>; session?: { signedIn: boolean; user: SessionUser } } = {}) {
  const listQueries: string[] = [];
  const session = options.session ?? { signedIn: true, user: manager };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/auth/me") return session.signedIn ? route.fulfill({ json: { user: session.user } }) : route.fulfill({ status: 401, json: { error: "UNAUTHENTICATED" } });
    if (path === "/api/auth/logout") { session.signedIn = false; return route.fulfill({ json: {} }); }
    if (path === "/api/auth/login") {
      const username = (route.request().postDataJSON() as { username?: string } | null)?.username;
      session.user = username === managerB.username ? managerB : manager;
      session.signedIn = true;
      return route.fulfill({ json: { user: session.user } });
    }
    if (path === "/api/manager/technicians") return route.fulfill({ json: { technicians } });
    if (path === "/api/manager/customers") return route.fulfill({ json: { customers } });
    if (path === "/api/manager/service-visits") {
      listQueries.push(url.search);
      const q = url.searchParams;
      if (q.get("cursor") && options.holdCursorPages) await options.holdCursorPages;
      const technicianId = q.get("technicianId");
      if (technicianId !== null && !/^[1-9]\d*$/.test(technicianId)) return route.fulfill({ status: 400, json: { error: "INVALID_TECHNICIAN_ID" } });
      const matching = visits.filter((visit) =>
        (!q.get("customerId") || visit.customerId === q.get("customerId"))
        && (!q.get("siteId") || visit.siteId === q.get("siteId"))
        && (!q.get("status") || visit.status === q.get("status"))
        && (technicianId === null || visit.technician?.id === Number(technicianId))
        && (!q.get("from") || visit.serviceDate >= q.get("from")!)
        && (!q.get("to") || visit.serviceDate <= q.get("to")!)
      ).sort((left, right) => right.serviceDate.localeCompare(left.serviceDate) || right.reference.localeCompare(left.reference));
      const limit = Number(q.get("limit") ?? 50);
      const offset = Number(q.get("cursor") ?? 0);
      const pageRows = matching.slice(offset, offset + limit);
      return route.fulfill({ json: { serviceVisits: pageRows.map(present), nextCursor: offset + limit < matching.length ? String(offset + limit) : null, totalCount: matching.length } });
    }
    const reportMatch = /^\/api\/manager\/service-visits\/([^/]+)\/final-report$/.exec(path);
    if (reportMatch) {
      const visit = visits.find((candidate) => candidate.id === reportMatch[1]);
      return visit ? route.fulfill({ json: { report: report(visit) } }) : route.fulfill({ status: 404, json: { error: "SERVICE_VISIT_NOT_FOUND" } });
    }
    const detailMatch = /^\/api\/manager\/service-visits\/([^/]+)$/.exec(path);
    if (detailMatch) {
      const visit = visits.find((candidate) => candidate.id === detailMatch[1]);
      return visit ? route.fulfill({ json: { serviceVisit: present(visit) } }) : route.fulfill({ status: 404, json: { error: "SERVICE_VISIT_NOT_FOUND" } });
    }
    if (path === "/api/inspection-jobs") return route.fulfill({ json: { jobs: [] } });
    return route.fulfill({ json: {} });
  });
  return listQueries;
}

async function openManager(page: Page) {
  await page.goto("/tests/manager-technician-services-done.html#/manager");
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await expect(page.locator("#manager-dashboard-title")).toBeVisible();
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("Technicians row opens technician detail with In Progress / Completed counts, paging, and a report round trip", async ({ page }) => {
  const listQueries = await mockManagerApi(page);
  await openManager(page);
  await page.getByRole("button", { name: "Technician List", exact: true }).click();
  // Add Technician and Deactivate are still present, unchanged.
  await expect(page.getByRole("button", { name: "Add Technician", exact: true })).toBeVisible();
  await expect(page.locator("li").filter({ hasText: "tech-alpha" }).getByRole("button", { name: "Deactivate", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "View tech-alpha service visits" }).click();
  await expect(page).toHaveURL(/#\/manager-technician\/11$/);
  await expect(page.getByRole("heading", { name: "tech-alpha", exact: true })).toBeVisible();
  await expect(page.locator(".workspace-heading .status-badge")).toHaveText("Active");
  expect(listQueries).toEqual(expect.arrayContaining(["?technicianId=11&status=open&limit=20", "?technicianId=11&status=closed&limit=20"]));

  const inProgressTab = page.getByRole("tab", { name: "In Progress (1)" });
  const completedTab = page.getByRole("tab", { name: "Completed (22)" });
  await expect(inProgressTab).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel");
  await expect(panel.locator(".job-card")).toHaveCount(1);
  await expect(panel).toContainText("Acme Towers");
  await expect(panel).toContainText("South Block");
  await expect(panel).toContainText("SV-0002");
  await expect(panel.getByRole("button", { name: "View Report" })).toHaveCount(0);

  // Keyboard: ArrowRight moves to Completed.
  await inProgressTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(completedTab).toHaveAttribute("aria-selected", "true");
  await expect(completedTab).toBeFocused();
  await expect(panel.locator(".job-card")).toHaveCount(20);
  await panel.getByRole("button", { name: "Load more" }).click();
  await expect(panel.locator(".job-card")).toHaveCount(22);
  await expect(panel.getByRole("button", { name: "Load more" })).toHaveCount(0);

  await page.setViewportSize({ width: 375, height: 812 });
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 1280, height: 800 });

  const first = panel.locator("li").filter({ hasText: "SV-0001" });
  await expect(first.getByRole("button", { name: "Download PDF" })).toBeVisible();
  await first.getByRole("button", { name: "View Report" }).click();
  await expect(page).toHaveURL(new RegExp(`#/manager-final-report/${visitId(1)}$`));
  await expect(page.getByText("Report body SV-0001")).toBeVisible();
  await page.getByRole("button", { name: "Back to Technician", exact: true }).click();
  await expect(page).toHaveURL(/#\/manager-technician\/11$/);
  await expect(page.getByRole("tab", { name: "Completed (22)" })).toHaveAttribute("aria-selected", "true");

  // Inactive technician shows the inactive badge and empty states.
  await page.getByRole("button", { name: "Back to Technicians", exact: true }).click();
  await expect(page).toHaveURL(/#\/manager-technicians$/);
  await page.getByRole("button", { name: "View tech-bravo service visits" }).click();
  await expect(page.locator(".workspace-heading .status-badge")).toHaveText("Inactive");
  await expect(page.getByRole("tab", { name: "In Progress (0)" })).toBeVisible();
  await expect(page.getByText("No service visits in progress.")).toBeVisible();
  await page.getByRole("tab", { name: "Completed (1)" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("SV-0003");
});

test("Services Done is customer-first with search, site grouping, technician filter, remembered filters and 375px layout", async ({ page }) => {
  const listQueries = await mockManagerApi(page);
  const customerListQueries = () => listQueries.filter((query) => new URLSearchParams(query).has("customerId"));
  await openManager(page);
  await page.getByRole("button", { name: "Current Services Done", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Current Services Done", exact: true })).toBeVisible();
  const search = page.getByLabel("Customer name or code");
  await expect(search).toBeVisible();
  // Nothing is listed until a customer is chosen.
  await expect(page.locator(".job-card")).toHaveCount(0);
  expect(customerListQueries()).toEqual([]);

  await page.setViewportSize({ width: 375, height: 812 });
  await expectNoHorizontalScroll(page);

  // Enter submits; case-insensitive name match.
  await search.fill("acme");
  await search.press("Enter");
  const matches = page.getByRole("region", { name: "Matching customers" });
  await expect(matches.getByRole("button")).toHaveCount(1);
  await expect(matches).toContainText("Acme Towers");
  // Clear empties the box and the matches.
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(matches).toHaveCount(0);
  // No match -> clear message; Search button submits.
  await search.fill("zzz");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No customers match “zzz”.")).toBeVisible();
  // Code match.
  await search.fill("bcn-002");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(matches).toContainText("Beacon Mall");
  await search.fill("ACM");
  await search.press("Enter");
  expect(customerListQueries()).toEqual([]);
  await matches.getByRole("button", { name: /Acme Towers/ }).click();

  // Step 2: this customer only, grouped by site (newest first), technician shown, Unknown for NULL creator.
  await expect(page.getByRole("heading", { name: "Acme Towers", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change customer", exact: true })).toBeVisible();
  const south = page.getByRole("region", { name: "South Block service visits" });
  const north = page.getByRole("region", { name: "North Block service visits" });
  await expect(south).toContainText("2 visits");
  await expect(north).toContainText("2 visits");
  const groupOrder = await page.locator(".manager-site-group h4").allInnerTexts();
  expect(groupOrder).toEqual(["South Block", "North Block"]);
  await expect(south.locator(".job-reference")).toHaveText(["SV-0002", "SV-0004"]);
  await expect(south.locator("li").filter({ hasText: "SV-0004" })).toContainText("Unknown");
  await expect(north.locator("li").filter({ hasText: "SV-0003" })).toContainText("tech-bravo");
  await expect(page.locator(".job-card")).toHaveCount(4);
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 1280, height: 800 });

  // The filter offers technicians only (T4: the listed supervisor never creates visits).
  await expect(page.getByLabel("Technician").locator("option")).toHaveText(["All technicians", "tech-alpha", "tech-bravo (inactive)", "tech-charlie", "tech-delta"]);
  // Technician filter narrows only after Apply.
  await page.getByLabel("Technician").selectOption({ label: "tech-alpha" });
  await expect(page.locator(".job-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".job-card")).toHaveCount(2);
  expect(listQueries[listQueries.length - 1]).toBe(`?customerId=${acme}&technicianId=11`);
  await page.getByLabel("Status").selectOption({ label: "Completed" });
  await page.getByLabel("From").fill("2026-09-01");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".job-card")).toHaveCount(1);
  await expect(page.locator(".job-card .job-reference")).toHaveText(["SV-0001"]);

  // Back from a report keeps the customer and the applied filters.
  await page.getByRole("button", { name: "View Final Report", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/manager-final-report/${visitId(1)}$`));
  await expect(page.getByText("Report body SV-0001")).toBeVisible();
  await page.getByRole("button", { name: "Back to Services Done", exact: true }).click();
  await expect(page).toHaveURL(/#\/manager-services-done$/);
  await expect(page.getByRole("heading", { name: "Acme Towers", exact: true })).toBeVisible();
  await expect(page.getByLabel("Technician")).toHaveValue("11");
  await expect(page.getByLabel("Status")).toHaveValue("closed");
  await expect(page.getByLabel("From")).toHaveValue("2026-09-01");
  await expect(page.locator(".job-card .job-reference")).toHaveText(["SV-0001"]);

  // Clear filters restores the full customer list.
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.locator(".job-card")).toHaveCount(4);
  await expect(page.getByLabel("Technician")).toHaveValue("");

  // Change customer returns to step 1 with nothing listed.
  await page.getByRole("button", { name: "Change customer", exact: true }).click();
  await expect(page.getByLabel("Customer name or code")).toBeVisible();
  await expect(page.locator(".job-card")).toHaveCount(0);
});

const managerSessionKeys = () => Object.keys(sessionStorage).filter((key) =>
  key.startsWith("manager-report-return:") || key.startsWith("manager-services-done:") || key.startsWith("manager-technician-tab:")
  || key.startsWith("manager-session-owner:"));
const managerOwner = () => sessionStorage.getItem("manager-session-owner:v1");

test("a stored Back target applies only to its own report: a deep link to another report goes Back to Operations", async ({ page }) => {
  await mockManagerApi(page);
  await openManager(page);
  await page.getByRole("button", { name: "Technician List", exact: true }).click();
  await page.getByRole("button", { name: "View tech-alpha service visits" }).click();
  await page.getByRole("tab", { name: "Completed (22)" }).click();
  await page.getByRole("tabpanel").locator("li").filter({ hasText: "SV-0001" }).getByRole("button", { name: "View Report" }).click();
  await expect(page.getByText("Report body SV-0001")).toBeVisible();
  await page.getByRole("button", { name: "Back to Technician", exact: true }).click();
  await expect(page).toHaveURL(/#\/manager-technician\/11$/);

  // Same tab, deep link to a different completed job's report.
  await page.evaluate((jobId) => { window.location.hash = `#/manager-final-report/${jobId}`; }, visitId(100));
  await expect(page.getByText("Report body SV-B000")).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to Technician", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to Operations", exact: true }).click();
  await expect(page).toHaveURL(/#\/manager-operations$/);
  await expect(page.locator("#manager-home-title")).toBeVisible();
});

test("a Load more response that lands after Apply cannot append old-filter rows or a stale cursor", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const listQueries = await mockManagerApi(page, { holdCursorPages: held });
  await openManager(page);
  await page.getByRole("button", { name: "Current Services Done", exact: true }).click();
  await page.getByLabel("Customer name or code").fill("crest");
  await page.getByLabel("Customer name or code").press("Enter");
  await page.getByRole("region", { name: "Matching customers" }).getByRole("button", { name: /Crest Plaza/ }).click();
  await expect(page.locator(".job-card")).toHaveCount(50);
  await expect(page.getByText("50 of 55 visits")).toBeVisible();

  // Load more is in flight (held) while a narrower filter is applied.
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect.poll(() => listQueries.filter((query) => query.includes("cursor=")).length).toBe(1);
  await page.getByLabel("Technician").selectOption({ label: "tech-delta" });
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator(".job-card")).toHaveCount(27);
  await expect(page.getByText("27 of 27 visits")).toBeVisible();
  const staleResponse = page.waitForResponse((response) => response.url().includes("cursor="));
  release();
  // The released (stale) page reaches the browser; give React a moment to (not) apply it.
  await staleResponse;
  await page.waitForTimeout(300);

  const deltaRefs = visits.filter((visit) => visit.customerId === crest && visit.technician?.id === 14).map((visit) => visit.reference);
  await expect(page.locator(".job-card")).toHaveCount(27);
  const shownRefs = await page.locator(".job-card .job-reference").allInnerTexts();
  expect(shownRefs).toHaveLength(27);
  expect(new Set(shownRefs)).toEqual(new Set(deltaRefs));
  await expect(page.getByText("27 of 27 visits")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more", exact: true })).toHaveCount(0);
  // Exactly one cursor request was ever made (the held one); no Load more with a stale cursor followed.
  expect(listQueries.filter((query) => query.includes("cursor="))).toHaveLength(1);
});

test("logout clears every Manager session key; logging back in shows Services Done without a preselected customer", async ({ page }) => {
  await mockManagerApi(page);
  await openManager(page);
  // Technician tab + report return route.
  await page.getByRole("button", { name: "Technician List", exact: true }).click();
  await page.getByRole("button", { name: "View tech-alpha service visits" }).click();
  await page.getByRole("tab", { name: "Completed (22)" }).click();
  await page.getByRole("tabpanel").locator("li").filter({ hasText: "SV-0001" }).getByRole("button", { name: "View Report" }).click();
  await expect(page.getByText("Report body SV-0001")).toBeVisible();
  // Services Done selection.
  await page.evaluate(() => { window.location.hash = "#/manager-services-done"; });
  await page.getByLabel("Customer name or code").fill("acme");
  await page.getByLabel("Customer name or code").press("Enter");
  await page.getByRole("region", { name: "Matching customers" }).getByRole("button", { name: /Acme Towers/ }).click();
  await expect(page.getByRole("heading", { name: "Acme Towers", exact: true })).toBeVisible();
  // A technician-workspace key that logout must NOT touch.
  await page.evaluate(() => sessionStorage.setItem("technician-home-tab:901", "completed"));
  expect((await page.evaluate(managerSessionKeys)).sort()).toEqual(["manager-report-return:v2", "manager-services-done:v1", "manager-session-owner:v1", "manager-technician-tab:11"]);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect.poll(() => page.evaluate(managerSessionKeys)).toEqual([]);
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await page.getByLabel("Username", { exact: true }).fill("mobiletest");
  await page.getByLabel("Password", { exact: true }).fill("test-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#manager-dashboard-title")).toBeVisible();
  await page.getByRole("button", { name: "Current Services Done", exact: true }).click();
  await expect(page.getByLabel("Customer name or code")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Acme Towers", exact: true })).toHaveCount(0);
  await expect(page.locator(".job-card")).toHaveCount(0);
  // Only the new session's owner stamp remains.
  expect(await page.evaluate(managerSessionKeys)).toEqual(["manager-session-owner:v1"]);
  expect(await page.evaluate(managerOwner)).toBe("900");
  expect(await page.evaluate(() => sessionStorage.getItem("technician-home-tab:901"))).toBe("completed");
});

test("a different manager signing in after an expired session (no logout) inherits no Manager session state", async ({ page }) => {
  const session = { signedIn: true, user: manager };
  await mockManagerApi(page, { session });
  await openManager(page);
  // Manager A (900) selects Acme in Services Done.
  await page.getByRole("button", { name: "Current Services Done", exact: true }).click();
  await page.getByLabel("Customer name or code").fill("acme");
  await page.getByLabel("Customer name or code").press("Enter");
  await page.getByRole("region", { name: "Matching customers" }).getByRole("button", { name: /Acme Towers/ }).click();
  await expect(page.getByRole("heading", { name: "Acme Towers", exact: true })).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("technician-home-tab:901", "completed"));
  expect((await page.evaluate(managerSessionKeys)).sort()).toEqual(["manager-services-done:v1", "manager-session-owner:v1"]);

  // A's server session expires without any logout; the tab reloads.
  session.signedIn = false;
  await page.reload();
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await page.getByLabel("Username", { exact: true }).fill("manager-b");
  await page.getByLabel("Password", { exact: true }).fill("test-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#manager-dashboard-title")).toBeVisible();
  await expect.poll(() => page.evaluate(() => fetch("/api/auth/me").then((response) => response.json()).then((body) => body.user?.id))).toBe(901);

  await page.getByRole("button", { name: "Current Services Done", exact: true }).click();
  await expect(page.getByLabel("Customer name or code")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Acme Towers", exact: true })).toHaveCount(0);
  await expect(page.locator(".job-card")).toHaveCount(0);
  expect(await page.evaluate(managerSessionKeys)).toEqual(["manager-session-owner:v1"]);
  expect(await page.evaluate(managerOwner)).toBe("901");
  expect(await page.evaluate(() => sessionStorage.getItem("technician-home-tab:901"))).toBe("completed");
});

/**
 * While customers load, Services Done shows the search form even if a selection is remembered; wait for
 * the load to settle so the assertions that follow see the real (selected or unselected) state.
 */
async function servicesDoneSettled(page: Page) {
  await expect(page.getByRole("heading", { name: "Current Services Done", exact: true })).toBeVisible();
  await expect(page.getByText("Loading customers…")).toHaveCount(0);
}

/** After a reload by a different verified user the role chooser is shown (T3 restores Manager only for the same verified manager); choose Manager and return to Services Done. */
async function resumeManagerOnServicesDone(page: Page) {
  await expect(page).toHaveURL(/#\/manager-services-done$/);
  // Choosing Manager navigates Home only once verified; either way, return to Services Done.
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await page.evaluate(() => { window.location.hash = "#/manager-services-done"; });
  await expect(page.getByRole("heading", { name: "Current Services Done", exact: true })).toBeVisible();
}

async function selectAcmeInServicesDone(page: Page) {
  await page.getByRole("button", { name: "Current Services Done", exact: true }).click();
  await page.getByLabel("Customer name or code").fill("acme");
  await page.getByLabel("Customer name or code").press("Enter");
  await page.getByRole("region", { name: "Matching customers" }).getByRole("button", { name: /Acme Towers/ }).click();
  await expect(page.getByRole("heading", { name: "Acme Towers", exact: true })).toBeVisible();
  await expect(page.locator(".job-card")).toHaveCount(4);
  await expect(page).toHaveURL(/#\/manager-services-done$/);
}

test("a reload restored to a different manager (no login, no logout) inherits no Services Done selection", async ({ page }) => {
  const session = { signedIn: true, user: manager };
  await mockManagerApi(page, { session });
  await openManager(page);
  await selectAcmeInServicesDone(page);
  await page.evaluate(() => sessionStorage.setItem("technician-home-tab:901", "completed"));

  // Manager B signed in elsewhere on the same cookie; this tab reloads onto Services Done.
  session.user = managerB;
  await page.reload();
  await resumeManagerOnServicesDone(page);
  await expect(page.locator(".app-account-name")).toHaveText("manager-b");
  await servicesDoneSettled(page);
  await expect(page.getByRole("heading", { name: "Acme Towers", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Customer name or code")).toBeVisible();
  await expect(page.locator(".job-card")).toHaveCount(0);
  expect(await page.evaluate(managerSessionKeys)).toEqual(["manager-session-owner:v1"]);
  expect(await page.evaluate(managerOwner)).toBe("901");
  expect(await page.evaluate(() => sessionStorage.getItem("technician-home-tab:901"))).toBe("completed");
});

test("a live cross-tab identity change (inspection-auth-change) clears the Services Done selection before the new manager sees it", async ({ page }) => {
  const session = { signedIn: true, user: manager };
  await mockManagerApi(page, { session });
  await openManager(page);
  await selectAcmeInServicesDone(page);

  // Manager B is now the server session; a second tab in the same browser context loads the app,
  // verifies 901 and broadcasts inspection-auth-change to this tab.
  session.user = managerB;
  const other = await page.context().newPage();
  await mockManagerApi(other, { session });
  await other.goto("/tests/manager-technician-services-done.html#/manager");

  // This tab revalidates in place (no reload, no navigation) and becomes manager-b.
  await expect(page.locator(".app-account-name")).toHaveText("manager-b");
  await expect(page).toHaveURL(/#\/manager-services-done$/);
  await servicesDoneSettled(page);
  await expect(page.getByRole("heading", { name: "Acme Towers", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Customer name or code")).toBeVisible();
  await expect(page.locator(".job-card")).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("manager-services-done:v1"))).toBeNull();
  expect(await page.evaluate(managerSessionKeys)).toEqual(["manager-session-owner:v1"]);
  expect(await page.evaluate(managerOwner)).toBe("901");
  await other.close();
});

test("a reload by the same manager keeps the remembered Services Done selection", async ({ page }) => {
  const session = { signedIn: true, user: manager };
  await mockManagerApi(page, { session });
  await openManager(page);
  await selectAcmeInServicesDone(page);

  await page.reload();
  // T3: the same verified manager is restored into Manager on this screen, without the role chooser.
  await expect(page).toHaveURL(/#\/manager-services-done$/);
  await expect(page.getByRole("heading", { name: "Current Services Done", exact: true })).toBeVisible();
  await expect(page.getByText("Choose how you are signing in")).toHaveCount(0);
  await expect(page.locator(".app-account-name")).toHaveText("mobiletest");
  await expect(page.getByRole("heading", { name: "Acme Towers", exact: true })).toBeVisible();
  await expect(page.locator(".job-card")).toHaveCount(4);
  expect((await page.evaluate(managerSessionKeys)).sort()).toEqual(["manager-services-done:v1", "manager-session-owner:v1"]);
  expect(await page.evaluate(managerOwner)).toBe("900");
});

test("the same manager signing in again after an expired session (no logout) starts a fresh Manager session", async ({ page }) => {
  const session = { signedIn: true, user: manager };
  await mockManagerApi(page, { session });
  await openManager(page);
  await selectAcmeInServicesDone(page);
  await page.evaluate(() => sessionStorage.setItem("technician-home-tab:901", "completed"));

  // A's server session expires without any logout; the tab reloads and A signs in again.
  session.signedIn = false;
  await page.reload();
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await page.getByLabel("Username", { exact: true }).fill("mobiletest");
  await page.getByLabel("Password", { exact: true }).fill("test-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#manager-dashboard-title")).toBeVisible();
  await expect(page.locator(".app-account-name")).toHaveText("mobiletest");

  await page.getByRole("button", { name: "Current Services Done", exact: true }).click();
  await servicesDoneSettled(page);
  await expect(page.getByRole("heading", { name: "Acme Towers", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Customer name or code")).toBeVisible();
  await expect(page.locator(".job-card")).toHaveCount(0);
  expect(await page.evaluate(managerSessionKeys)).toEqual(["manager-session-owner:v1"]);
  expect(await page.evaluate(managerOwner)).toBe("900");
  expect(await page.evaluate(() => sessionStorage.getItem("technician-home-tab:901"))).toBe("completed");
});
