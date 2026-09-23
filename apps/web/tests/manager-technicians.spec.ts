import { expect, test } from "@playwright/test";

test("create/list/deactivate with cancel confirmation preventing the write", async ({ page }) => {
  let technicians: Array<{ id: number; username: string; displayName: string | null; isActive: boolean; createdAt: string }> = [];
  let deactivations = 0;
  await page.route("**/api/manager/technicians**", async (route) => {
    const request = route.request();
    if (request.url().endsWith("/deactivate")) { deactivations++; technicians[0]!.isActive = false; await route.fulfill({ json: { technician: technicians[0] } }); }
    else if (request.method() === "POST") { technicians = [{ id: 12, username: request.postDataJSON().username, displayName: request.postDataJSON().displayName ?? null, isActive: true, createdAt: "2026-09-12T00:00:00.000Z" }]; await route.fulfill({ status: 201, json: { technician: technicians[0] } }); }
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

test("clearing a person name accepts the server's null and refreshes the row", async ({ page }) => {
  const technician = { id: 12, username: "new-technician", displayName: "Alice Tan" as string | null, isActive: true, createdAt: "2026-09-12T00:00:00.000Z" };
  const writes: Array<string | null> = [];
  await page.route("**/api/manager/technicians**", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { displayName: string | null };
      writes.push(body.displayName);
      await new Promise((resolve) => setTimeout(resolve, 100));
      technician.displayName = body.displayName;
      await route.fulfill({ json: { technician } });
    } else {
      await route.fulfill({ json: { technicians: [technician] } });
    }
  });
  await page.goto("/tests/manager-technicians.html");
  const row = page.locator("li").filter({ hasText: "new-technician" });
  const input = row.getByLabel("Person’s name");
  await expect(input).toHaveValue("Alice Tan");
  await input.fill("");
  const saved = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith("/display-name"));
  const refreshed = page.waitForResponse((response) => response.request().method() === "GET" && response.url().endsWith("/manager/technicians"));
  await row.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Updating technicians…")).toBeVisible();
  expect((await saved).status()).toBe(200);
  expect((await refreshed).status()).toBe(200);
  await expect(page.getByText("Updating technicians…")).toBeHidden();
  expect(writes).toEqual([null]);
  await expect(input).toHaveValue("");
  await expect(page.locator("#failure")).toBeEmpty();
  await expect(row.getByText("Active", { exact: true })).toBeVisible();
});

test("malformed list fails closed", async ({ page }) => {
  await page.route("**/api/manager/technicians", (route) => route.fulfill({ json: { technicians: [{ id: 1, username: "malformed", isActive: "yes", createdAt: "today" }] } }));
  await page.goto("/tests/manager-technicians.html");
  await expect(page.locator("#failure")).toContainText("unavailable");
  await expect(page.locator("li")).toHaveCount(0);
});
