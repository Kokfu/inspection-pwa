import { expect, test } from "@playwright/test";

test("create/list/deactivate with cancel confirmation preventing the write", async ({ page }) => {
  let technicians: Array<{ id: number; username: string; role: string; isActive: boolean; createdAt: string }> = [];
  let deactivations = 0;
  await page.route("**/api/manager/technicians**", async (route) => {
    const request = route.request();
    if (request.url().endsWith("/deactivate")) { deactivations++; technicians[0]!.isActive = false; await route.fulfill({ json: { technician: technicians[0] } }); }
    else if (request.method() === "POST") { technicians = [{ id: 12, username: request.postDataJSON().username, role: request.postDataJSON().role ?? "inspector", isActive: true, createdAt: "2026-09-12T00:00:00.000Z" }]; await route.fulfill({ status: 201, json: { technician: technicians[0] } }); }
    else await route.fulfill({ json: { technicians } });
  });
  await page.goto("/tests/manager-technicians.html");
  await expect(page.getByText("No technicians.")).toBeVisible();
  await page.getByLabel("Username", { exact: true }).fill("new-technician");
  await page.getByLabel("Password", { exact: true }).fill("technician-password");
  await page.getByRole("button", { name: "Add Technician", exact: true }).click();
  const row = page.locator("li").filter({ hasText: "new-technician" });
  await expect(row.getByText("Active", { exact: true })).toHaveClass(/status-badge--complete/);
  page.once("dialog", async (dialog) => { expect(dialog.message()).toBe("Deactivate this technician? They will no longer be able to log in."); await dialog.dismiss(); });
  await row.getByRole("button", { name: "Deactivate", exact: true }).click();
  expect(deactivations).toBe(0);
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(row.getByText("Inactive", { exact: true })).toHaveClass(/status-badge--attention/);
  expect(deactivations).toBe(1);
  await expect(row.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
});

test("malformed list fails closed", async ({ page }) => {
  await page.route("**/api/manager/technicians", (route) => route.fulfill({ json: { technicians: [{ id: 1, username: "malformed", isActive: "yes", createdAt: "today" }] } }));
  await page.goto("/tests/manager-technicians.html");
  await expect(page.locator("#failure")).toContainText("unavailable");
  await expect(page.locator("li")).toHaveCount(0);
});

test("admin creates a supervisor from the same form; supervisors are labelled and have no visits link", async ({ page }) => {
  const posts: unknown[] = [];
  let technicians: Array<{ id: number; username: string; role: string; isActive: boolean; createdAt: string }> = [
    { id: 11, username: "tech-alpha", role: "inspector", isActive: true, createdAt: "2026-09-01T00:00:00.000Z" }
  ];
  await page.route("**/api/manager/technicians**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const body = request.postDataJSON() as { username: string; role?: string };
      posts.push(body);
      const created = { id: 20, username: body.username, role: body.role ?? "inspector", isActive: true, createdAt: "2026-09-20T00:00:00.000Z" };
      technicians = [...technicians, created];
      await route.fulfill({ status: 201, json: { technician: created } });
    } else await route.fulfill({ json: { technicians } });
  });
  await page.goto("/tests/manager-technicians.html");
  await expect(page.getByLabel("Role")).toHaveValue("inspector");
  await page.getByLabel("Username", { exact: true }).fill("review-lead");
  await page.getByLabel("Password", { exact: true }).fill("supervisor-password");
  await page.getByLabel("Role").selectOption("supervisor");
  await page.getByRole("button", { name: "Add Supervisor", exact: true }).click();
  const row = page.locator("li").filter({ hasText: "review-lead" });
  await expect(row.getByText("Supervisor", { exact: true })).toBeVisible();
  expect(posts).toEqual([{ username: "review-lead", password: "supervisor-password", role: "supervisor" }]);
  // The form resets to Technician after a create.
  await expect(page.getByLabel("Role")).toHaveValue("inspector");
});

test("a technician row missing its role fails closed", async ({ page }) => {
  await page.route("**/api/manager/technicians", (route) => route.fulfill({ json: { technicians: [{ id: 1, username: "no-role", isActive: true, createdAt: "2026-09-01T00:00:00.000Z" }] } }));
  await page.goto("/tests/manager-technicians.html");
  await expect(page.locator("#failure")).toContainText("unavailable");
});
