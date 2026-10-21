import { expect, test } from "@playwright/test";

test("dashboard routes Services to customer configuration and keeps Operations available", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()); requests.push(url.pathname + url.search);
    let json: unknown = {};
    if (url.pathname === "/api/auth/me") json = { user: { id: 804, username: "mobiletest", role: "admin" } };
    else if (url.pathname.endsWith("/technicians")) json = { technicians: [] };
    else if (url.pathname === "/api/manager/location-proposals") json = { proposals: [], counts: { pending: 0, approved: 0, rejected: 0, withdrawn: 0 } };
    else if (url.pathname === "/api/manager/site-proposals") json = { proposals: [] };
    else if (url.pathname === "/api/repair-visits") json = { visits: [] };
    else if (url.pathname.endsWith("/upcoming-service")) json = { customers: [], unscheduledCustomers: [] };
    else if (url.pathname.endsWith("/customers/archived")) json = { customers: [] };
    else if (url.pathname.endsWith("/customers")) json = { customers: [] };
    else if (url.pathname.endsWith("/service-catalog")) json = { systems: [] };
    else if (url.pathname.endsWith("/dashboard/clients")) json = { totalClients: 12 };
    else if (url.pathname.endsWith("/dashboard/inspections-per-day")) json = { days: [{ day: url.searchParams.get("to"), count: 2 }] };
    else if (url.pathname.endsWith("/dashboard/inspection-status")) json = { passed: 1, notOk: 3, na: 1 };
    else if (url.pathname.endsWith("/service-visits")) json = { serviceVisits: [], nextCursor: null, totalCount: 7 };
    else if (url.pathname.endsWith("/inspection-jobs")) json = { jobs: [] };
    else if (url.pathname.endsWith("/compliance-reminders")) json = { overdue: [], dueSoon: [], dueSoonWindowDays: 7 };
    await route.fulfill({ json });
  });
  await page.goto("/tests/manager-dashboard-navigation.html#/manager");
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await expect(page.locator("#manager-dashboard-title")).toBeVisible();
  await expect.poll(() => requests.some((r) => r === "/api/manager/customers/compliance-reminders")).toBe(true);
  await expect(page.getByText("12", { exact: true })).toBeVisible();
  await expect(page.locator('dl[aria-label="Dashboard summary"]').getByText("7", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /Inspections per day/ })).toBeVisible();
  const status = page.locator('dl[aria-label="Dashboard summary"]');
  await expect(status).toContainText("Passed1");
  await expect(status).toContainText("Not OK3");
  await expect(status).toContainText("N/A1");
  await expect(page.getByRole("img", { name: "Inspection status: 1 passed, 3 not OK, 1 N/A" })).toBeVisible();
  expect(await page.locator(".status-donut-segment").count()).toBe(3);
  expect(await page.locator(".trend-line").evaluate((line) => getComputedStyle(line).stroke)).not.toBe("none");
  const sidebar = page.getByLabel("Primary navigation");
  for (const [label, hash, heading] of [
    ["Technician List", "manager-technicians", "Technician List"],
    ["Services", "manager-customers", "Customers"],
    ["Operations", "manager-operations", "Operations"],
    ["Add Customer", "manager-add-customer", "Add Customer"],
    ["Current Services Done", "manager-services-done", "Current Services Done"],
    ["Next Upcoming Service", "manager-upcoming-services", "Next Upcoming Service"],
    ["Service Common Remarks", "manager-common-remarks", "Service Common Remarks"],
    ["Service Catalog", "manager-service-catalog", "Service Catalog"],
    ["Approvals", "manager-approvals", "Approvals"],
    ["Settings", "manager-settings", "Settings"]
  ]) {
    await sidebar.getByRole("button", { name: label!, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`#/${hash}$`));
    await expect(page.getByRole("heading", { name: heading!, exact: true })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: label!, exact: true })).toHaveAttribute("aria-current", "page");
    await sidebar.getByRole("button", { name: "Home", exact: true }).click();
    await expect(page).toHaveURL(/#\/manager$/);
  }
  // Services Done is customer-first: it never fetches a flat service-visit list before a customer is chosen.
  const homeCountRequests = requests.filter((r) => r.startsWith("/api/manager/service-visits?"));
  expect(homeCountRequests.length).toBeGreaterThan(0);
  expect(homeCountRequests.every((r) => r.includes("limit=1"))).toBe(true);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole("img", { name: /Inspections per day/ })).toBeVisible();
  await expect(page.getByRole("img", { name: "Inspection status: 1 passed, 3 not OK, 1 N/A" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("wide desktop: Customer Configuration, Add Customer, Service Catalog, Company Profile and Email reminders line up with the header", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/auth/me") json = { user: { id: 804, username: "mobiletest", role: "admin" } };
    else if (path.endsWith("/company-profile")) json = { companyProfile: { confirmed: false, legalName: "Company", registrationNo: "1", address: "Address", tel: "1", fax: "2", email: "office@example.test", complaintHotline: "3", logoFile: "logo.png", verifiedBy: { name: "Name", title: "Title" }, reportNumberFormat: "MFE/SR/{YYYY}/{SEQ4}" } };
    else if (path.endsWith("/reminders/settings")) json = { settings: { senderEmail: "", passwordConfigured: false, passwordMask: "", smtpHost: "smtp.gmail.com", smtpPort: 587, security: "STARTTLS", sendTime: "09:00", timezone: "Asia/Kuala_Lumpur" } };
    else if (path.endsWith("/reminders/staff")) json = { staff: [] };
    else if (path.endsWith("/reminders/status")) json = { configured: false, encryptionUnavailable: false, nextRunDate: "2026-09-29", nextRunTime: "09:00", timezone: "Asia/Kuala_Lumpur", counts: [], deliveries: [], gaps: [] };
    else if (path.endsWith("/technicians")) json = { technicians: [] };
    else if (path.endsWith("/upcoming-service")) json = { customers: [], unscheduledCustomers: [] };
    else if (path.endsWith("/customers") || path.endsWith("/customers/archived")) json = { customers: [] };
    else if (path.endsWith("/service-catalog")) json = { systems: [] };
    else if (path.endsWith("/dashboard/clients")) json = { totalClients: 0 };
    else if (path.endsWith("/dashboard/inspections-per-day")) json = { days: [] };
    else if (path.endsWith("/dashboard/inspection-status")) json = { passed: 0, notOk: 0, na: 0 };
    else if (path.endsWith("/service-visits")) json = { serviceVisits: [], nextCursor: null, totalCount: 0 };
    else if (path.endsWith("/inspection-jobs")) json = { jobs: [] };
    await route.fulfill({ json });
  });
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto("/tests/manager-dashboard-navigation.html#/manager");
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  const sidebar = page.getByLabel("Primary navigation");
  for (const [label, heading, selector] of [
    ["Services", "Customers", 'section[aria-labelledby="manager-customers-title"]'],
    ["Add Customer", "Add Customer", 'section[aria-labelledby="manager-add-customer-title"]'],
    ["Service Catalog", "Service Catalog", 'section[aria-labelledby="manager-service-catalog-title"]'],
    ["Company Profile", "Company Profile", 'section[aria-labelledby="manager-company-profile-title"]'],
    ["Email reminders", "Email Reminders", 'section[aria-labelledby="email-reminder-title"]']
  ] as const) {
    // Settings children retain the same layout protections after moving off the sidebar.
    if (label === "Company Profile" || label === "Email reminders") {
      await sidebar.getByRole("button", { name: "Settings", exact: true }).click();
      await page.locator(".manager-hub-card").filter({ hasText: label === "Company Profile" ? "Company profile" : label }).click();
    } else await sidebar.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true, level: 2 })).toBeVisible();
    for (const width of [1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.locator(selector).evaluate((element) => {
        const page = element.getBoundingClientRect();
        const header = document.querySelector("header")!.getBoundingClientRect();
        const centered = Math.abs(page.left + page.width / 2 - window.innerWidth / 2) <= 2;
        // Once the column is wider than the page width, the page must match the header edges.
        return centered && (window.innerWidth < 1800 || (Math.abs(page.left - header.left) <= 2 && Math.abs(page.right - header.right) <= 2));
      }), `${label} at ${width}px`).toBe(true);
    }
  }
});
