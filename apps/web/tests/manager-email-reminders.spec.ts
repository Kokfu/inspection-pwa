import { expect, test } from "@playwright/test";

test("staff addresses filter on submit by name, username, email and status", async ({ page }) => {
  await page.route("**/api/manager/reminders/settings", (route) => route.fulfill({ json: { settings: { senderEmail: "", passwordConfigured: false, passwordMask: "", smtpHost: "smtp.gmail.com", smtpPort: 587, security: "STARTTLS", sendTime: "09:00", timezone: "Asia/Kuala_Lumpur" } } }));
  await page.route("**/api/manager/reminders/staff", (route) => route.fulfill({ json: { staff: [
    { id: 12, username: "alpha-tech", displayName: "Alice Tan", role: "inspector", isActive: true, email: "alice@example.test" },
    { id: 13, username: "bravo-tech", displayName: "Bob Lim", role: "inspector", isActive: false, email: "bob@example.test" }
  ] } }));
  await page.route("**/api/manager/reminders/status", (route) => route.fulfill({ json: { configured: false, encryptionUnavailable: false, nextRunDate: "2026-09-29", nextRunTime: "09:00", timezone: "Asia/Kuala_Lumpur", counts: [], deliveries: [], gaps: [] } }));
  await page.goto("/tests/manager-email-reminders.html");
  const addresses = page.getByRole("region", { name: "Staff notification addresses" });
  const rows = addresses.locator("ul.manager-technician-list > li");
  const search = addresses.getByRole("searchbox", { name: "Name, username, or email" });
  await expect(rows).toHaveCount(2);
  await search.fill("ALICE");
  await expect(rows).toHaveCount(2);
  await addresses.getByRole("button", { name: "Search" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Alice Tan");
  await search.fill("BRAVO-TECH");
  await addresses.getByRole("button", { name: "Search" }).click();
  await expect(rows.first()).toContainText("Bob Lim");
  await search.fill("alice@EXAMPLE.TEST");
  await addresses.getByRole("button", { name: "Search" }).click();
  await expect(rows.first()).toContainText("Alice Tan");
  await addresses.getByRole("combobox", { name: "Status" }).selectOption("inactive");
  await expect(addresses.getByText("No staff match this filter.")).toBeVisible();
  await addresses.getByRole("button", { name: "Clear" }).click();
  await expect(search).toHaveValue("");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Bob Lim");
  await addresses.getByRole("combobox", { name: "Status" }).selectOption("all");
  await expect(rows).toHaveCount(2);
});

test("Manager settings starts empty, saves write-only password, and shows delivery alerts on phone and desktop", async ({ page }, testInfo) => {
  let sender = "";
  let configured = false;
  let savedPassword = "";
  await page.route("**/api/manager/reminders/settings", async (route) => {
    if (route.request().method() === "PUT") {
      const input = route.request().postDataJSON() as { senderEmail: string; appPassword: string };
      sender = input.senderEmail; savedPassword = input.appPassword; configured = true;
    }
    await route.fulfill({ json: { settings: { senderEmail: sender, passwordConfigured: configured, passwordMask: configured ? "••••••••" : "", smtpHost: "smtp.gmail.com", smtpPort: 587, security: "STARTTLS", sendTime: "09:00", timezone: "Asia/Kuala_Lumpur" } } });
  });
  await page.route("**/api/manager/reminders/staff", (route) => route.fulfill({ json: { staff: [{ id: 12, username: "technician-a", displayName: "Tech A", role: "inspector", isActive: true, email: null }] } }));
  await page.route("**/api/manager/reminders/status", (route) => route.fulfill({ json: { configured, encryptionUnavailable: false, nextRunDate: "2026-09-29", nextRunTime: "09:00", timezone: "Asia/Kuala_Lumpur", counts: [{ status: "failed", count: 1 }], deliveries: [{ customerId: "customer-a", customerName: "Customer A", dueDate: "2026-09-29", recipientEmail: "tech@example.test", status: "failed", errorCategory: "auth", attemptedAt: "2026-09-28T01:00:00.000Z" }], gaps: [{ customerId: "customer-b", customerName: "Customer B", dueDate: "2026-09-30" }] } }));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tests/manager-email-reminders.html");
  await expect(page.getByText("Sender not configured")).toBeVisible();
  await expect(page.getByText("Customer A · 2026-09-29 · tech@example.test · failed (auth)")).toBeVisible();
  await page.getByLabel("Sender Gmail address").fill("sender@gmail.com");
  await page.getByLabel("Gmail app password").fill("fake-test-password");
  await page.getByRole("button", { name: "Save email settings" }).click();
  await expect(page.getByText("Sender configured")).toBeVisible();
  await expect(page.getByLabel("Gmail app password")).toHaveValue("");
  expect(savedPassword).toBe("fake-test-password");
  expect(await page.locator("body").innerText()).not.toContain(savedPassword);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("manager-email-reminders-phone.png"), fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("manager-email-reminders-desktop.png"), fullPage: true });
  await expect(page.locator("#failure")).toBeEmpty();
});

test("recipient picker previews saved people and shows copied-date review warning", async ({ page }) => {
  const customerId = "c0000000-0000-4000-8000-000000000001";
  const dueDate = "2026-09-29";
  const staff = [{ id: 12, username: "technician-a", displayName: "Tech A", role: "inspector", isActive: true, email: "tech@example.test" }, { id: 13, username: "supervisor-a", displayName: "Supervisor A", role: "supervisor", isActive: true, email: null }];
  let recipients: Array<{ staffUserId: number | null; extraName: string | null; extraEmail: string | null }> = [];
  let effective: Array<{ name: string; email: string }> = [];
  await page.route("**/api/manager/customers/upcoming-service", (route) => route.fulfill({ json: { customers: [{ id: customerId, code: "C", displayName: "Customer A", nextServiceDueDate: dueDate }], unscheduledCustomers: [] } }));
  await page.route("**/api/manager/reminders/staff", (route) => route.fulfill({ json: { staff } }));
  await page.route(`**/api/manager/reminders/plans/${customerId}`, async (route) => {
    if (route.request().method() === "PUT") {
      const input = route.request().postDataJSON() as { staffUserIds: number[]; extras: Array<{ name: string; email: string }> };
      recipients = [...input.staffUserIds.map((id) => ({ staffUserId: id, extraName: null, extraEmail: null })), ...input.extras.map((extra) => ({ staffUserId: null, extraName: extra.name, extraEmail: extra.email }))];
      effective = [...input.staffUserIds.map((id) => ({ name: "Tech A", email: staff.find((person) => person.id === id)!.email! })), ...input.extras];
      await route.fulfill({ json: { saved: true, dueDate } }); return;
    }
    await route.fulfill({ json: { plan: { customerId, dueDate, reviewRequired: recipients.length === 0, recipients, effective, blocked: effective.length === 0, plannedSendDate: "2026-09-28", priorSentCount: 1 } } });
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tests/manager-upcoming-services.html");
  await page.getByRole("button", { name: "Reminder recipients" }).click();
  await expect(page.getByText("Reminder blocked: add recipients.")).toBeVisible();
  await expect(page.getByText("Recipients were copied from the previous date.", { exact: false })).toBeVisible();
  await expect(page.getByText("Previous service dates have sent reminders.", { exact: false })).toBeVisible();
  await page.getByLabel("Tech A · Technician · tech@example.test").check();
  await expect(page.getByLabel("Supervisor A · Supervisor · add email in Email reminders Settings")).toBeDisabled();
  await page.getByLabel("Name", { exact: true }).fill("Coordinator");
  await page.getByLabel("Email", { exact: true }).fill("coord@example.test");
  await page.getByRole("button", { name: "Add address" }).click();
  await page.getByRole("button", { name: "Save recipients" }).click();
  await expect(page.getByText("Coordinator · coord@example.test")).toBeVisible();
  await expect(page.getByText("Reminder blocked: add recipients.")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator("#failure")).toBeEmpty();
});
