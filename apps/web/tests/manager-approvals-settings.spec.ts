import { expect, test, type Page } from "@playwright/test";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const instant = "2026-10-19T02:05:00.000Z";
const approval = { status: "awaiting_approval", decidedBy: null, decidedByRole: null, decidedAt: null, note: null, latestCorrectionAt: null, correctedAfterApproval: false };
function visit(n = 1) {
  return { id: uuid(n), reference: `SV-20261019-${n}`, customer: `Customer ${n}`, site: "Main site", createdAt: instant,
    serviceDate: "2026-10-19", serviceTime: null, status: "closed", technician: null, systems: [],
    inspectionProgress: { accepted: 0, required: 0 }, hasAcceptedRecords: false, archivedAt: null,
    completion: { jobId: uuid(n), jobStatus: "closed", eligible: true, checkedAt: instant, requiredUnitCount: 0, acceptedUnitCount: 0,
      completedAt: n === 1 ? instant : "2026-10-20T02:05:00.000Z", completedBy: null, systems: [] },
    reportApproval: { ...approval, correctedAfterApproval: n === 2, latestCorrectionAt: n === 2 ? instant : null } };
}
function siteProposal() {
  return { id: uuid(10), customerId: uuid(20), customerDisplayName: "Customer North", siteId: uuid(21), jobId: null, jobReference: null,
    proposedDisplayName: "New site", proposedAddress: "22 Long Road", submittedByUserId: 2, submittedBy: "Technician", submittedAt: instant, status: "pending", decision: null };
}
function repairVisit() {
  return { clientUuid: uuid(30), visitNumber: "RV-20261019-3", customerId: uuid(20), siteId: uuid(21), createdByUserId: 2,
    configurationRevisionId: uuid(22), serviceCallNumber: null, arrivalTime: "10:05", visitDate: "2026-10-19", deviceCreatedAt: instant,
    previousVisit: null, status: "awaiting_approval", revision: 1, reportNumber: null, approvedByUserId: null, approvedAt: null, createdAt: instant, updatedAt: instant };
}
type Options = { role?: "admin" | "supervisor"; zero?: boolean; failed?: string; reportFailure?: boolean; malformed?: unknown; authority?: { path: string; status: number } };
async function install(page: Page, options: Options = {}) {
  const requests: string[] = [];
  let approved = false;
  let failReport = options.reportFailure;
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    requests.push(path + url.search);
    const json = (body: unknown, status = 200) => route.fulfill({ json: body, status });
    if (path === "/api/auth/me") return json({ user: { id: 4, username: "reviewer", role: options.role ?? "admin" } });
    if (options.authority?.path === path) return json({ error: "FORBIDDEN" }, options.authority.status);
    if (path === options.failed) return json({}, 503);
    if (path === "/api/manager/location-proposals") return json({ proposals: [], counts: { pending: options.zero ? 0 : 2, approved: 0, rejected: 0, withdrawn: 0 } });
    if (path === "/api/manager/site-proposals") return json({ proposals: options.zero ? [] : [siteProposal()] });
    if (path === "/api/repair-visits") return json({ visits: options.zero ? [] : [repairVisit()] });
    if (path === "/api/manager/service-visits") {
      if (!url.searchParams.has("reportApproval")) return json({ serviceVisits: [], totalCount: 0, nextCursor: null });
      if (options.malformed !== undefined) return json(options.malformed);
      if (failReport) { failReport = false; return json({}, 503); }
      const items = options.zero || approved ? [] : url.searchParams.has("cursor") ? [visit(2)] : [visit()];
      return json({ serviceVisits: items, totalCount: options.zero || approved ? 0 : 2, nextCursor: items.length && !url.searchParams.has("cursor") ? "page-two" : null });
    }
    if (path.endsWith("/report-approval")) {
      if (route.request().method() === "POST") approved = true;
      return json({ reportApproval: { ...approval, status: approved ? "approved" : "awaiting_approval" }, events: [] });
    }
    if (path.endsWith("/corrections")) return json({ corrections: [] });
    if (path.endsWith("/final-report")) return json({ report: { customer: "Customer 1", site: "Main site", serviceDate: "2026-10-19", jobReference: "SV-20261019-1",
      completedAt: instant, completedBy: "Technician", systems: [], sections: [] } });
    if (path.endsWith("/dashboard/clients")) return json({ totalClients: 0 });
    if (path.endsWith("/dashboard/inspections-per-day")) return json({ days: [] });
    if (path.endsWith("/dashboard/inspection-status")) return json({ passed: 0, notOk: 0, na: 0 });
    if (path.endsWith("/compliance-reminders")) return json({ overdue: [], dueSoon: [], dueSoonWindowDays: 7 });
    if (path.endsWith("/company-profile")) return json({ companyProfile: { confirmed: false, legalName: "Company", registrationNo: "1", address: "Address", tel: "1", fax: "2", email: "office@example.test", complaintHotline: "3", logoFile: "logo.png", verifiedBy: { name: "Name", title: "Title" }, reportNumberFormat: "MFE/SR/{YYYY}/{SEQ4}" } });
    if (path.endsWith("/reminders/settings")) return json({ settings: { senderEmail: "", passwordConfigured: false, passwordMask: "", smtpHost: "smtp.gmail.com", smtpPort: 587, security: "STARTTLS", sendTime: "09:00", timezone: "Asia/Kuala_Lumpur" } });
    if (path.endsWith("/reminders/staff")) return json({ staff: [] });
    if (path.endsWith("/reminders/status")) return json({ configured: false, encryptionUnavailable: false, nextRunDate: "2026-10-20", nextRunTime: "09:00", timezone: "Asia/Kuala_Lumpur", counts: [], deliveries: [], gaps: [] });
    if (path.endsWith("/customers")) return json({ customers: [] });
    if (path.endsWith("/technicians")) return json({ technicians: [] });
    return json({});
  });
  return requests;
}
async function enter(page: Page, hash = "manager-approvals", role = "admin") {
  await page.goto(`/tests/manager-dashboard-navigation.html#/${hash}`);
  await page.getByRole("button", { name: role === "admin" ? /^Manager Monitor/ : /^Admin Review/ }).click();
}
const cards = (page: Page) => page.locator(".manager-hub-card");
const approvals = (page: Page) => page.locator(".manager-dashboard-card").filter({ hasText: "Approvals" });
const overflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

test("hub cards have ordered red counts and open their pages; phone Back returns to Approvals", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const requests = await install(page); await enter(page);
  await expect(cards(page).locator("strong")).toHaveText(["Location proposals", "Site requests", "Repair visits", "Service reports", "Remark requests"]);
  await expect(cards(page).locator(".approval-pending-count")).toHaveText(["2", "1", "1", "2"]);
  for (const badge of await cards(page).locator(".approval-pending-count").all()) {
    expect(await badge.evaluate(el => { const css = getComputedStyle(el), root = getComputedStyle(document.documentElement), box = el.getBoundingClientRect();
      const probe = document.createElement("span"); probe.style.color = root.getPropertyValue("--danger-ink"); document.body.append(probe);
      const danger = getComputedStyle(probe).color; probe.remove();
      return css.backgroundColor === danger && css.color === "rgb(255, 255, 255)" && box.width >= 20 && box.height >= 20 && css.borderRadius !== "0px";
    })).toBe(true);
    await expect(badge).toHaveAttribute("aria-label", /\d+ pending/);
  }
  expect(requests).toContain("/api/manager/service-visits?reportApproval=awaiting_approval&limit=1");
  for (const [title, hash, heading] of [["Location proposals", "manager-location-proposals", "Location Proposals"], ["Site requests", "manager-site-proposals", "Site Requests"], ["Repair visits", "manager-repairs", "Repair Visits"], ["Service reports", "manager-report-approvals", "Service reports"]]) {
    await cards(page).filter({ hasText: title }).click();
    await expect(page).toHaveURL(new RegExp(`#/${hash}$`));
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.locator('[aria-label="Primary navigation"] button[aria-current="page"]')).toHaveText("Approvals");
    await page.getByRole("button", { name: "Back to Approvals", exact: true }).click();
    await expect(page).toHaveURL(/#\/manager-approvals$/);
  }
  await overflow(page);
});

test("zero counts have no badge; all four loaded Home total uses B0 totalCount", async ({ page }) => {
  await install(page, { zero: true }); await enter(page);
  await expect(cards(page)).toHaveCount(5); await expect(page.locator(".approval-pending-count")).toHaveCount(0);
  await page.getByLabel("Primary navigation").getByRole("button", { name: "Home", exact: true }).click();
  await expect(approvals(page)).toHaveText("Approvals"); await expect(approvals(page).locator(".approval-pending-count")).toHaveCount(0);
});
test("Home total is the sum of all four counts; sidebar stays badge-free", async ({ page }) => {
  await install(page); await enter(page, "manager");
  await expect(approvals(page).getByLabel("6 pending")).toBeVisible();
  await expect(approvals(page).getByRole("img", { name: "6 pending", exact: true })).toHaveText("6");
  await expect(page.getByLabel("Primary navigation").getByRole("button", { name: "Approvals", exact: true })).toHaveText("Approvals");
  await expect(page.getByText(/Pending:/)).toHaveCount(0);
});
test("Home withholds the total until the fourth independent count resolves", async ({ page }) => {
  await install(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let waiting = false;
  await page.route("**/api/manager/service-visits?reportApproval=awaiting_approval&limit=1", async route => {
    waiting = true; await gate;
    await route.fulfill({ json: { serviceVisits: [visit()], totalCount: 2, nextCursor: "page-two" } });
  });
  try {
    await enter(page, "manager");
    await expect.poll(() => waiting).toBe(true);
    await expect(approvals(page)).toHaveText("Approvals");
    release();
    await expect(approvals(page).getByLabel("6 pending")).toBeVisible();
  } finally { release(); }
});
for (const [path, card] of [["/api/manager/location-proposals", 0], ["/api/manager/site-proposals", 1], ["/api/repair-visits", 2], ["/api/manager/service-visits", 3]] as const) {
  test(`independent count failure ${path} omits only its hub badge and Home total`, async ({ page }) => {
    await install(page, { failed: path }); await enter(page);
    await expect(cards(page).locator(".approval-pending-count")).toHaveCount(3);
    await expect(cards(page).nth(card).locator(".approval-pending-count")).toHaveCount(0);
    await page.getByLabel("Primary navigation").getByRole("button", { name: "Home", exact: true }).click();
    await expect(approvals(page)).toHaveText("Approvals");
  });
}
test("repair visit detail Back returns to the repair list with one back control; sidebar keeps Approvals", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await install(page); await enter(page, `manager-repairs/${uuid(30)}`);
  await expect(page.locator('[aria-label="Primary navigation"] button[aria-current="page"]')).toHaveText("Approvals");
  await expect(page.getByRole("button", { name: /Back/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Back to Approvals" })).toHaveCount(0);
  await page.getByRole("button", { name: /Back/ }).click();
  await expect(page).toHaveURL(/#\/manager-repairs$/);
  await expect(page.getByRole("button", { name: "Back to Approvals", exact: true })).toBeVisible();
});
for (const hash of ["manager-location-proposals", "manager-site-proposals", "manager-repairs", "manager-report-approvals", "manager-email-reminders", "manager-company-profile"]) {
  test(`old/direct address ${hash} highlights its parent and phone Back opens hub`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await install(page); await enter(page, hash);
    const parent = hash.includes("reminders") || hash.includes("profile") ? "Settings" : "Approvals";
    await expect(page.locator('[aria-label="Primary navigation"] button[aria-current="page"]')).toHaveText(parent);
    await page.getByRole("button", { name: `Back to ${parent}`, exact: true }).click();
    await expect(page.getByRole("heading", { name: parent, exact: true })).toBeVisible();
  });
}
test("Settings is Manager-only, last, and contains both removed sidebar destinations", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 }); await install(page); await enter(page, "manager-settings");
  const nav = page.getByLabel("Primary navigation");
  await expect(nav.locator("button").last()).toHaveText("Settings");
  await expect(nav.locator("button").nth(-3)).toHaveText("Approvals");
  await expect(nav.locator("button").nth(-2)).toHaveText("Photo KPI");
  await expect(nav.locator("button").nth(-4)).toHaveText("Service Catalog");
  await expect(nav.locator("button").filter({ hasText: /Email reminders|Company Profile|Location Proposals|Site Requests|Repair Visits/ })).toHaveCount(0);
  await expect(cards(page).locator("strong")).toHaveText(["Email reminders", "Company profile"]);
  for (const [title, hash] of [["Email reminders", "manager-email-reminders"], ["Company profile", "manager-company-profile"]]) {
    await cards(page).filter({ hasText: title }).click(); await expect(page).toHaveURL(new RegExp(`#/${hash}$`));
    await page.getByRole("button", { name: "Back to Settings" }).click();
  }
});
for (const hash of ["manager-settings", "manager-email-reminders", "manager-company-profile"]) {
  test(`Admin is refused ${hash} without fetching Settings data`, async ({ page }) => {
    const requests = await install(page, { role: "supervisor" }); await enter(page, hash, "supervisor");
    await expect(page).toHaveURL(/#\/manager$/);
    await expect(page.getByLabel("Primary navigation").getByRole("button")).toHaveText(["Home", "Services", "Current Services Done", "Approvals", "Photo KPI"]);
    expect(requests.some(path => /reminders\/(settings|staff|status)|company-profile/.test(path))).toBe(false);
  });
}

test("reports render oldest first, paginate, open existing report, approve and re-fetch on return", async ({ page }) => {
  const requests = await install(page); await enter(page, "manager-report-approvals");
  await expect(page.locator(".report-approval-row")).toHaveCount(1);
  await expect(page.locator(".report-approval-row")).toContainText(["Customer 1SV-20261019-1Completed"]);
  await expect(page.getByText("Awaiting approval", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.locator(".report-approval-row > strong")).toHaveText(["Customer 1", "Customer 2"]);
  await expect(page.getByText("Re-approval needed", { exact: true })).toBeVisible();
  expect(requests).toContain("/api/manager/service-visits?reportApproval=awaiting_approval&cursor=page-two");
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  await page.locator(".report-approval-row").first().click();
  await expect(page).toHaveURL(new RegExp(`#/manager-final-report/${uuid(1)}$`));
  await page.getByRole("button", { name: "Approve report", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Report approved", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to Service reports" }).click();
  await expect(page.getByText("No reports are waiting for approval.")).toBeVisible();
  expect(requests.filter(path => path === "/api/manager/service-visits?reportApproval=awaiting_approval")).toHaveLength(2);
  expect(requests.some(path => path === `/api/manager/service-visits/${uuid(1)}`)).toBe(false);
});
test("reports load failure alerts and Retry reloads", async ({ page }) => {
  await install(page, { reportFailure: true }); await enter(page, "manager-report-approvals");
  await expect(page.getByRole("alert")).toContainText("Service reports could not be loaded");
  await expect(page.locator(".report-approval-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator(".report-approval-row")).toHaveCount(1);
});
test("malformed next page clears previous rows; Retry restarts from the first page", async ({ page }) => {
  const requests = await install(page);
  await page.route("**/api/manager/service-visits?reportApproval=awaiting_approval&cursor=page-two", route => route.fulfill({ json: { serviceVisits: [visit(2)], nextCursor: 42, totalCount: 2 } }));
  await enter(page, "manager-report-approvals");
  await expect(page.locator(".report-approval-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("alert")).toContainText("Service reports could not be loaded");
  await expect(page.locator(".report-approval-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator(".report-approval-row")).toHaveCount(1);
  expect(requests.filter(path => path === "/api/manager/service-visits?reportApproval=awaiting_approval")).toHaveLength(2);
});
for (const [name, malformed] of [
  ["wrong status", { serviceVisits: [{ ...visit(), reportApproval: { ...approval, status: "approved" } }], totalCount: 1, nextCursor: null }],
  ["negative count", { serviceVisits: [visit()], totalCount: -1, nextCursor: null }],
  ["fraction count", { serviceVisits: [visit()], totalCount: 1.5, nextCursor: null }],
  ["cursor type", { serviceVisits: [visit()], totalCount: 1, nextCursor: 9 }],
  ["missing customer", { serviceVisits: [{ ...visit(), customer: null }], totalCount: 1, nextCursor: null }],
  ["bad completed time", { serviceVisits: [{ ...visit(), completion: { ...visit().completion, completedAt: "yesterday" } }], totalCount: 1, nextCursor: null }],
  ["invalid calendar date", { serviceVisits: [{ ...visit(), serviceDate: "2026-02-31" }], totalCount: 1, nextCursor: null }],
  ["invalid service time", { serviceVisits: [{ ...visit(), serviceTime: "99:99" }], totalCount: 1, nextCursor: null }],
  ["array enum", { serviceVisits: [{ ...visit(), completion: { ...visit().completion, systems: [{ systemKey: "hydrant", systemLabel: "Hydrant", status: ["accepted"], units: [] }] } }], totalCount: 1, nextCursor: null }]
] as const) {
  test(`reports reject malformed ${name} with no stale rows`, async ({ page }) => {
    await install(page, { malformed }); await enter(page, "manager-report-approvals");
    await expect(page.getByRole("alert")).toContainText("Service reports could not be loaded");
    await expect(page.locator(".report-approval-row")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByText("No reports are waiting for approval.")).toHaveCount(0);
  });
}
for (const status of [401, 403]) {
  test(`Home count authority failure ${status} stays silent and keeps Home`, async ({ page }) => {
    await install(page, { authority: { path: "/api/manager/service-visits", status } }); await enter(page, "manager");
    await expect(page.locator("#manager-dashboard-title")).toBeVisible();
    await expect(page.getByText("Choose how you are signing in:", { exact: true })).toHaveCount(0);
    await expect(approvals(page)).toHaveText("Approvals");
  });
  for (const hash of ["manager-report-approvals"]) test(`${hash} report authority failure ${status} fails closed`, async ({ page }) => {
    await install(page, { authority: { path: "/api/manager/service-visits", status } }); await enter(page, hash);
    await expect(page.getByText("Choose how you are signing in:", { exact: true })).toBeVisible();
    await expect(page.locator(".report-approval-row")).toHaveCount(0);
    await expect(page.locator("#manager-dashboard-title")).toHaveCount(0);
  });
}
for (const path of ["/api/manager/location-proposals", "/api/manager/site-proposals", "/api/repair-visits", "/api/manager/service-visits"]) {
  for (const status of [401, 403]) test(`hub authority failure ${status} ${path} fails closed`, async ({ page }) => {
    await install(page, { authority: { path, status } }); await enter(page);
    await expect(page.getByText("Choose how you are signing in:", { exact: true })).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
  });
}
for (const role of ["admin", "supervisor"] as const) {
  test(`${role} mobile Menu and hub screenshots; layout, focus, touch targets at 360/768/1280`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 800 }); await install(page, { role }); await enter(page, "manager-approvals", role);
    await expect(page.locator(".approval-pending-count")).toHaveCount(4);
    await page.locator("summary").filter({ hasText: "Menu" }).click();
    await page.screenshot({ path: testInfo.outputPath(`menu-${role}-360.png`), fullPage: true });
    await expect(page.getByLabel("Mobile navigation").getByRole("button").last()).toHaveText(role === "admin" ? "Settings" : "Photo KPI");
    await page.getByLabel("Mobile navigation").getByRole("button", { name: "Approvals", exact: true }).click();
    for (const hash of ["manager-approvals", "manager-report-approvals", ...(role === "admin" ? ["manager-settings"] : [])]) {
      await page.evaluate(hash => { location.hash = `#/${hash}`; }, hash);
      await expect(page.locator(".manager-hub")).toBeVisible();
      if (hash === "manager-report-approvals") await expect(page.locator(".report-approval-row")).toHaveCount(1);
      for (const width of [360, 768, 1280]) {
        await page.setViewportSize({ width, height: width === 768 ? 1024 : 800 });
        await overflow(page);
        const buttons = page.locator(".manager-hub button");
        for (const button of await buttons.all()) {
          const box = await button.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        await page.keyboard.press("Tab");
        await buttons.first().focus();
        expect(await buttons.first().evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
        await page.screenshot({ path: testInfo.outputPath(`${hash}-${width}.png`), fullPage: true });
      }
    }
  });
}

// 1x1 transparent PNG
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHh6mZQAAAABJRU5ErkJggg==", "base64");
test("I-73: Company profile with no stored logo gets 204 and logs no console error; a stored logo is shown", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await install(page);
  let logo: "none" | "png" = "none";
  await page.route("**/api/manager/company-profile/logo**", route => logo === "none" ? route.fulfill({ status: 204 }) : route.fulfill({ status: 200, contentType: "image/png", body: png }));
  await enter(page, "manager-company-profile");
  const image = page.locator("img[alt^=\"Current company logo\"]");
  await expect(image).toBeAttached();
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).complete)).toBe(true);
  await expect(image).toBeHidden();
  expect(errors).toEqual([]);

  logo = "png";
  await page.reload();
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await expect(image).toBeVisible();
  expect(errors).toEqual([]);
});
