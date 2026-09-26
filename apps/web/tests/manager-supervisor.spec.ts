import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * T4: a supervisor uses the Manager experience for review only — Home shows Services and Current
 * Services Done; visit detail and the Final Report work; admin-only screens are never rendered (a deep
 * link lands on Home without calling their APIs); a reload restores the supervisor like an admin (T3).
 */

const supervisor = { id: 830, username: "review-lead", role: "supervisor" };
const visit = {
  id: "c0000000-0000-4000-8000-000000000830", reference: "SV-SUPERVISOR-830",
  customer: "Supervisor Review Customer", site: "Supervisor Review Site", serviceDate: "2026-09-18",
  status: "closed", systems: ["Hydrant System"], inspectionProgress: { accepted: 1, required: 1 },
  createdAt: "2026-09-18T08:00:00.000Z", technician: { id: 21, username: "technician-one", displayName: "technician-one" }, archivedAt: null,
  completion: { completedAt: "2026-09-18T10:00:00.000Z", completedBy: { id: 21, username: "technician-one" } }
};
const report = {
  customer: visit.customer, site: visit.site, serviceDate: visit.serviceDate, jobReference: visit.reference,
  completedAt: visit.completion.completedAt, completedBy: "technician-one",
  systems: [{ systemKey: "hydrant", label: "Hydrant System", status: "Accepted", locations: ["Zone North"] }],
  sections: [{ systemKey: "hydrant", label: "Hydrant System", location: { locationId: "location-1", locationLabel: "Zone North", zoneId: "zone-1", zoneLabel: "Zone North", instanceKey: "primary" }, fields: [{ label: "Canvas Hose", value: "Good", depth: 2 }], evidence: [] }]
};
const customerSummary = {
  customer: { id: "00000000-0000-4000-8000-000000000831", code: "CUST-SUP", displayName: "Supervisor Review Customer" },
  sites: [{ id: "00000000-0000-4000-8000-000000000832", code: "SITE-SUP", displayName: "Supervisor Review Site" }],
  supportedSystems: [{ key: "hydrant", displayName: "Hydrant System", sortOrder: 1 }]
};

async function installSupervisorApi(page: Page) {
  const requests: string[] = [];
  await page.route("**/api/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    requests.push(`${route.request().method()} ${path}`);
    const json = (payload: unknown, status = 200) => route.fulfill({ status, json: payload, headers: { "cache-control": "no-store" } });
    if (path === "/api/auth/me") return json({ user: supervisor });
    if (path === "/api/manager/dashboard/clients") return json({ totalClients: 4 });
    if (path === "/api/manager/dashboard/inspections-per-day") return json({ days: [] });
    if (path === "/api/manager/service-visits") {
      if (url.searchParams.has("from") && url.searchParams.has("to")) return json({ serviceVisits: [], nextCursor: null, totalCount: 0 });
      return url.searchParams.has("customerId")
        ? json({ serviceVisits: [url.searchParams.has("includeArchived") ? { ...visit, archivedAt: "2026-09-19T00:00:00.000Z" } : visit], nextCursor: null, totalCount: 1 })
        : json({ serviceVisits: [visit] });
    }
    if (path === `/api/manager/service-visits/${visit.id}`) return json({ serviceVisit: visit });
    if (path === `/api/manager/service-visits/${visit.id}/final-report.pdf`) return json({ error: "FINAL_REPORT_HAS_CORRECTIONS", message: "PDF unavailable until corrections are included." }, 409);
    if (path === `/api/manager/service-visits/${visit.id}/final-report`) return json({ report });
    // T5b: the visit detail lists the accepted records a supervisor may review.
    if (path === `/api/manager/service-visits/${visit.id}/accepted-records`) return json({ records: [] });
    if (path === "/api/manager/customers") return json({ customers: [customerSummary] });
    if (path === "/api/manager/technicians") return json({ technicians: [{ id: 21, username: "technician-one", displayName: null, role: "inspector", isActive: true, createdAt: "2026-09-01T00:00:00.000Z" }] });
    // Every other Manager route is admin-only on the server.
    if (path.startsWith("/api/manager/")) return json({ error: "FORBIDDEN", message: "You do not have permission for this action" }, 403);
    return json({});
  });
  return requests;
}

const homeCards = (page: Page) => page.locator(".manager-dashboard-card").allInnerTexts();

async function enterAsSupervisor(page: Page, hash = "#/manager") {
  await page.goto(`/tests/manager-service-editor.html${hash}`);
  await expect(page.getByRole("button", { name: /^Manager Monitor/ })).toContainText("Supervisors use this option for review access");
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
}

test("supervisor Home shows only the review cards; Services, visit detail and Final Report work", async ({ page }) => {
  await installSupervisorApi(page);
  await enterAsSupervisor(page);
  await expect.poll(() => homeCards(page)).toEqual(["Services", "Current Services Done"]);
  await expect(page.getByText("Supervisor workspace")).toBeVisible();
  await expect(page.getByText("4", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /Inspections per day/ })).toBeVisible();
  await expect(page.getByText("No inspections scheduled in this period.")).toBeVisible();

  await page.getByRole("button", { name: "Services", exact: true }).click();
  await expect(page.getByText("Supervisor workspace")).toBeVisible();
  await page.getByRole("button", { name: /SV-SUPERVISOR-830/ }).click();
  await expect(page.getByText(/Completed .* by technician-one\./)).toBeVisible();
  await expect(page.getByText(/2026-09-18T10:00:00/)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`#/manager-service-visit/${visit.id}$`));
  await page.getByRole("button", { name: /View report|Final Report/ }).first().click();
  await expect(page.getByText("Canvas Hose")).toBeVisible();
  await expect(page.getByRole("region", { name: "Service visit details" })).toContainText(/18 Sep.*2026.*18:00/);
  await expect(page.getByText("2026-09-18T10:00:00.000Z")).toHaveCount(0);
  await expect(page.getByText("Choose how you are signing in")).toHaveCount(0);
});

test("supervisor Services Done searches the customer list without configuration", async ({ page }) => {
  const requests = await installSupervisorApi(page);
  await enterAsSupervisor(page);
  await page.getByRole("button", { name: "Current Services Done", exact: true }).click();
  await page.getByLabel("Customer name or code").fill("supervisor");
  await page.getByLabel("Customer name or code").press("Enter");
  await page.getByRole("region", { name: "Matching customers" }).getByRole("button", { name: /Supervisor Review Customer/ }).click();
  await expect(page.getByRole("heading", { name: "Supervisor Review Customer", exact: true })).toBeVisible();
  await expect(page.getByLabel("Technician").locator("option")).toHaveText(["All technicians", "technician-one"]);
  await expect(page.getByRole("button", { name: "View Final Report" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Archive", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Download PDF" }).click();
  await expect(page.getByRole("alert")).toContainText("PDF unavailable until corrections are included.");
  await page.getByRole("checkbox", { name: "Show archived visits" }).check();
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toHaveCount(0);
  expect(requests.filter((entry) => /\/api\/manager\/customers\/./.test(entry))).toEqual([]);
});

for (const hash of ["#/manager-customers", "#/manager-technicians", "#/manager-upcoming-services", "#/manager-customer/00000000-0000-4000-8000-000000000831", "#/manager-customer/00000000-0000-4000-8000-000000000831/service/hydrant", "#/manager-technician/21"]) {
  test(`supervisor deep link ${hash} lands on Home without calling admin-only APIs`, async ({ page }) => {
    const requests = await installSupervisorApi(page);
    await enterAsSupervisor(page, hash);
    await expect(page).toHaveURL(/#\/manager$/);
    await expect.poll(() => homeCards(page)).toEqual(["Services", "Current Services Done"]);
    await expect(page.getByText("Choose how you are signing in")).toHaveCount(0);
    expect(requests.filter((entry) => /\/api\/manager\/(customers\/|customers\/upcoming|technicians\/)/.test(entry))).toEqual([]);
  });
}

test("supervisor cannot use the Technician experience", async ({ page }) => {
  await installSupervisorApi(page);
  await page.goto("/tests/manager-service-editor.html#/jobs");
  await expect(page.locator(".app-account-name")).toHaveText("review-lead");
  await page.getByRole("button", { name: /^Technician Complete/ }).click();
  await expect(page.getByRole("alert")).toContainText("does not have Technician access");
});

test("a reload restores the supervisor into Manager (T3)", async ({ page }) => {
  await installSupervisorApi(page);
  await enterAsSupervisor(page);
  await expect(page.getByText("4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Current Services Done", exact: true }).click();
  await expect(page).toHaveURL(/#\/manager-services-done$/);
  await page.reload();
  await expect(page).toHaveURL(/#\/manager-services-done$/);
  await expect(page.getByRole("heading", { name: "Current Services Done", exact: true })).toBeVisible();
  await expect(page.getByText("Choose how you are signing in")).toHaveCount(0);
});
