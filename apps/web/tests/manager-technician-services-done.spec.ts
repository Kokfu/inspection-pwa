import { expect, test, type Page } from "@playwright/test";

type Visit = {
  id: string; reference: string; customerId: string; customer: string; siteId: string; site: string;
  serviceDate: string; status: "open" | "closed"; technician: { id: number; displayName: string } | null;
};

const technicians = [
  { id: 11, username: "tech-alpha", isActive: true, createdAt: "2026-09-01T00:00:00.000Z" },
  { id: 12, username: "tech-bravo", isActive: false, createdAt: "2026-09-02T00:00:00.000Z" }
];
const alpha = { id: 11, displayName: "tech-alpha" };
const bravo = { id: 12, displayName: "tech-bravo" };
const acme = "a0000000-0000-4000-8000-000000000001";
const beacon = "a0000000-0000-4000-8000-000000000002";
const customer = (id: string, code: string, displayName: string, sites: Array<[string, string]>) => ({
  customer: { id, code, displayName },
  sites: sites.map(([siteId, name]) => ({ id: siteId, code: name.toUpperCase(), displayName: name })),
  configuration: { id: `${id}-config`, revision: 1, enabledSystems: [] },
  supportedSystems: []
});
const customers = [
  customer(acme, "ACM-001", "Acme Towers", [["s-north", "North Block"], ["s-south", "South Block"]]),
  customer(beacon, "BCN-002", "Beacon Mall", [["s-beacon", "Beacon Main"]])
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

/** A stateless fake of the admin API that honours the same filters/keyset contract as the server. */
async function mockManagerApi(page: Page) {
  const listQueries: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { user: { id: 900, username: "mobiletest", role: "admin" } } });
    if (path === "/api/manager/technicians") return route.fulfill({ json: { technicians } });
    if (path === "/api/manager/customers") return route.fulfill({ json: { customers } });
    if (path === "/api/manager/service-visits") {
      listQueries.push(url.search);
      const q = url.searchParams;
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
  await openManager(page);
  await page.getByRole("button", { name: "Current Services Done", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Current Services Done", exact: true })).toBeVisible();
  const search = page.getByLabel("Customer name or code");
  await expect(search).toBeVisible();
  // Nothing is listed until a customer is chosen.
  await expect(page.locator(".job-card")).toHaveCount(0);
  expect(listQueries).toEqual([]);

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
  expect(listQueries).toEqual([]);
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
