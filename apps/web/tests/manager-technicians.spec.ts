import { expect, test } from "@playwright/test";

test("create/list/deactivate with cancel confirmation preventing the write", async ({ page }) => {
  let technicians: Array<{ id: number; username: string; displayName: string | null; role: string; isActive: boolean; createdAt: string; supervisorIds: number[] }> = [];
  let deactivations = 0;
  await page.route("**/api/manager/technicians**", async (route) => {
    const request = route.request();
    if (request.url().endsWith("/deactivate")) { deactivations++; technicians[0]!.isActive = false; await route.fulfill({ json: { technician: technicians[0] } }); }
    else if (request.method() === "POST") { technicians = [{ id: 12, username: request.postDataJSON().username, displayName: request.postDataJSON().displayName ?? null, role: request.postDataJSON().role ?? "inspector", isActive: true, createdAt: "2026-09-12T00:00:00.000Z", supervisorIds: [] }]; await route.fulfill({ status: 201, json: { technician: technicians[0] } }); }
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
  expect(deactivations).toBe(1);
  // Deactivated technicians drop off the default list, not just lose their Deactivate button.
  await expect(row).toHaveCount(0);
  await expect(page.getByText("Show deactivated technicians (1)")).toBeVisible();
  await page.getByLabel("Show deactivated technicians (1)").check();
  await expect(row.getByText("Inactive", { exact: true })).toHaveClass(/status-badge--attention/);
  await expect(row.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
});

test("permanent removal requires an inactive account and exact username confirmation", async ({ page }) => {
  let technician: { id: number; username: string; displayName: null; role: string; isActive: boolean; createdAt: string; supervisorIds: number[] } | null = { id: 12, username: "unused-tech", displayName: null, role: "inspector", isActive: false, createdAt: "2026-09-12T00:00:00.000Z", supervisorIds: [] };
  let deletions = 0;
  await page.route("**/api/manager/technicians**", async (route) => {
    if (route.request().method() === "DELETE") {
      deletions++;
      expect(route.request().postDataJSON()).toEqual({ username: "unused-tech" });
      await route.fulfill({ json: { removedId: 12, disposition: "hidden" } });
      technician = null;
    } else await route.fulfill({ json: { technicians: technician ? [technician] : [] } });
  });
  await page.goto("/tests/manager-technicians.html");
  await page.getByLabel("Show deactivated technicians (1)").check();
  const button = page.getByRole("button", { name: "Permanently remove" });
  page.once("dialog", (dialog) => dialog.dismiss());
  await button.click();
  expect(deletions).toBe(0);
  page.once("dialog", (dialog) => dialog.accept("wrong"));
  await button.click();
  expect(deletions).toBe(0);
  page.once("dialog", (dialog) => dialog.accept("unused-tech"));
  await button.click();
  await expect(page.getByText("No technicians.")).toBeVisible();
  await expect(page.getByText("Technician removed from staff lists; historical records remain.")).toBeVisible();
  expect(deletions).toBe(1);
});

test("clearing a person name accepts the server's null and refreshes the row", async ({ page }) => {
  const technician = { id: 12, username: "new-technician", displayName: "Alice Tan" as string | null, role: "inspector", isActive: true, createdAt: "2026-09-12T00:00:00.000Z", supervisorIds: [] };
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

test("admin creates a supervisor from the same form; supervisors are labelled and have no visits link", async ({ page }) => {
  const posts: unknown[] = [];
  let technicians: Array<{ id: number; username: string; displayName: string | null; role: string; isActive: boolean; createdAt: string; supervisorIds: number[] }> = [
    { id: 11, username: "tech-alpha", displayName: null, role: "inspector", isActive: true, createdAt: "2026-09-01T00:00:00.000Z", supervisorIds: [] }
  ];
  await page.route("**/api/manager/technicians**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const body = request.postDataJSON() as { username: string; role?: string };
      posts.push(body);
      const created = { id: 20, username: body.username, displayName: null, role: body.role ?? "inspector", isActive: true, createdAt: "2026-09-20T00:00:00.000Z", supervisorIds: [] };
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
  expect(posts).toEqual([{ username: "review-lead", password: "supervisor-password", displayName: null, role: "supervisor" }]);
  // The form resets to Technician after a create.
  await expect(page.getByLabel("Role")).toHaveValue("inspector");
});

test("search filters the technician list by username; clearing restores it", async ({ page }) => {
  // Rows carry displayName and supervisorIds: the list parser fails closed without them (see the other tests in this file).
  const technicians = [
    { id: 1, username: "alpha-tech", displayName: null, role: "inspector", isActive: true, createdAt: "2026-09-01T00:00:00.000Z", supervisorIds: [] },
    { id: 2, username: "beta-tech", displayName: null, role: "inspector", isActive: true, createdAt: "2026-09-02T00:00:00.000Z", supervisorIds: [] },
    { id: 3, username: "review-lead", displayName: null, role: "supervisor", isActive: true, createdAt: "2026-09-03T00:00:00.000Z", supervisorIds: [] }
  ];
  await page.route("**/api/manager/technicians", (route) => route.fulfill({ json: { technicians } }));
  await page.goto("/tests/manager-technicians.html");
  await expect(page.locator("li")).toHaveCount(3);
  await page.getByLabel("Filter by username").fill("alpha");
  await expect(page.locator("li")).toHaveCount(1);
  await expect(page.getByText("alpha-tech", { exact: true })).toBeVisible();
  await page.getByLabel("Filter by username").fill("no-such-technician");
  await expect(page.locator("li")).toHaveCount(0);
  await expect(page.getByText('No technician matches "no-such-technician".')).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator("li")).toHaveCount(3);
});

test("a technician row missing its role fails closed", async ({ page }) => {
  await page.route("**/api/manager/technicians", (route) => route.fulfill({ json: { technicians: [{ id: 1, username: "no-role", isActive: true, createdAt: "2026-09-01T00:00:00.000Z" }] } }));
  await page.goto("/tests/manager-technicians.html");
  await expect(page.locator("#failure")).toContainText("unavailable");
});

test("admin can assign multiple supervisors and remove one without affecting the other", async ({ page }) => {
  const technician = { id: 11, username: "tech-alpha", displayName: null, role: "inspector", isActive: true, createdAt: "2026-09-01T00:00:00.000Z", supervisorIds: [] as number[] };
  const supervisors = [
    { id: 20, username: "review-one", displayName: "Reviewer One", role: "supervisor", isActive: true, createdAt: "2026-09-01T00:00:00.000Z", supervisorIds: [] },
    { id: 21, username: "review-two", displayName: null, role: "supervisor", isActive: false, createdAt: "2026-09-01T00:00:00.000Z", supervisorIds: [] }
  ];
  const writes: string[] = [];
  await page.route("**/api/manager/technicians**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/assignments") && request.method() === "POST") {
      const supervisorId = (request.postDataJSON() as { supervisorId: number }).supervisorId;
      writes.push(`assign:${supervisorId}`);
      technician.supervisorIds = [...new Set([...technician.supervisorIds, supervisorId])].sort();
      await route.fulfill({ status: 201, json: { technicianId: technician.id, supervisorId, assigned: true } });
    } else if (url.pathname.includes("/assignments/") && request.method() === "DELETE") {
      const supervisorId = Number(url.pathname.split("/").at(-1));
      writes.push(`remove:${supervisorId}`);
      technician.supervisorIds = technician.supervisorIds.filter((id) => id !== supervisorId);
      await route.fulfill({ json: { technicianId: technician.id, supervisorId, assigned: false } });
    } else await route.fulfill({ json: { technicians: [technician, ...supervisors] } });
  });
  await page.goto("/tests/manager-technicians.html");
  const picker = page.getByRole("group", { name: "Assigned supervisors for tech-alpha" });
  const first = picker.getByRole("checkbox", { name: "Reviewer One" });
  const second = picker.getByRole("checkbox", { name: "review-two (inactive)" });
  await first.click();
  await expect(first).toBeChecked();
  await second.click();
  await expect(second).toBeChecked();
  await first.click();
  await expect(first).not.toBeChecked();
  await expect(second).toBeChecked();
  expect(writes).toEqual(["assign:20", "assign:21", "remove:20"]);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("malformed assignment list fails closed", async ({ page }) => {
  await page.route("**/api/manager/technicians", (route) => route.fulfill({ json: { technicians: [
    { id: 11, username: "tech-alpha", displayName: null, role: "inspector", isActive: true, createdAt: "2026-09-01T00:00:00.000Z", supervisorIds: ["20"] }
  ] } }));
  await page.goto("/tests/manager-technicians.html");
  await expect(page.locator("#failure")).toContainText("unavailable");
});

test.describe("admin sets a new password for a technician or supervisor", () => {
  const rows = [
    { id: 12, username: "field-tech", displayName: null, role: "inspector", isActive: true, createdAt: "2026-09-12T00:00:00.000Z", supervisorIds: [] as number[] },
    { id: 13, username: "review-lead", displayName: null, role: "supervisor", isActive: true, createdAt: "2026-09-12T00:00:00.000Z", supervisorIds: [] as number[] }
  ];
  const newPassword = "replacement-pass-1";

  test("mismatch blocks submit; success sends only the body, clears the fields and storage never sees it", async ({ page }) => {
    const resets: Array<{ url: string; method: string; body: unknown }> = [];
    const urls: string[] = [];
    page.on("request", (request) => urls.push(request.url()));
    await page.route("**/api/manager/technicians**", async (route) => {
      const request = route.request();
      if (request.url().endsWith("/password")) { resets.push({ url: request.url(), method: request.method(), body: request.postDataJSON() }); await route.fulfill({ json: { ok: true } }); }
      else await route.fulfill({ json: { technicians: rows } });
    });
    await page.goto("/tests/manager-technicians.html");
    const row = page.locator("li").filter({ has: page.locator("strong", { hasText: /^field-tech$/ }) });
    await row.getByRole("button", { name: "Set new password", exact: true }).click();
    const form = page.getByRole("form", { name: "Set new password for field-tech" });
    const submit = form.getByRole("button", { name: "Set password", exact: true });
    await expect(submit).toBeDisabled();
    await form.getByLabel("New password", { exact: true }).fill("too-short");
    await form.getByLabel("Confirm new password").fill("too-short");
    await expect(submit).toBeDisabled();
    await form.getByLabel("New password", { exact: true }).fill(newPassword);
    await form.getByLabel("Confirm new password").fill("different-pass-12");
    await expect(form.getByText("Passwords do not match.")).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(form.getByLabel("New password", { exact: true })).toHaveAttribute("autocomplete", "new-password");
    await expect(form.getByLabel("New password", { exact: true })).toHaveAttribute("type", "password");
    await form.getByLabel("Confirm new password").fill(newPassword);
    await expect(submit).toBeEnabled();
    expect(resets).toEqual([]);
    await submit.click();
    await expect(page.getByRole("status").filter({ hasText: "New password set for field-tech. They were signed out of existing sessions." })).toBeVisible();
    expect(resets).toHaveLength(1);
    expect(resets[0]).toEqual({ url: expect.stringMatching(/\/api\/manager\/technicians\/12\/password$/), method: "POST", body: { password: newPassword } });
    expect(urls.filter((url) => url.includes("/api/")).some((url) => url.includes(newPassword) || url.includes("?"))).toBe(false);
    expect(urls.some((url) => url.includes(newPassword))).toBe(false);
    await expect(form).toHaveCount(0);
    // Reopening starts empty; nothing was persisted in the page or its storage.
    await row.getByRole("button", { name: "Set new password", exact: true }).click();
    await expect(page.getByLabel("New password", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Confirm new password")).toHaveValue("");
    const persisted = await page.evaluate(async () => {
      const dumps: string[] = [JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage }), document.cookie, location.href];
      const databases = indexedDB.databases ? await indexedDB.databases() : [];
      return { dumps, databases: databases.length };
    });
    expect(persisted.dumps.join("\n")).not.toContain(newPassword);
    expect(persisted.databases).toBe(0);
  });

  test("cancel clears both fields, sends nothing, and supervisors get the action too", async ({ page }) => {
    let resets = 0;
    await page.route("**/api/manager/technicians**", async (route) => {
      if (route.request().url().endsWith("/password")) { resets++; await route.fulfill({ json: { ok: true } }); }
      else await route.fulfill({ json: { technicians: rows } });
    });
    await page.goto("/tests/manager-technicians.html");
    const row = page.locator("li").filter({ has: page.locator("strong", { hasText: /^review-lead$/ }) });
    await row.getByRole("button", { name: "Set new password", exact: true }).click();
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password").fill(newPassword);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("form", { name: /Set new password/ })).toHaveCount(0);
    await row.getByRole("button", { name: "Set new password", exact: true }).click();
    await expect(page.getByLabel("New password", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Confirm new password")).toHaveValue("");
    expect(resets).toBe(0);
  });

  test("a server refusal is announced inside the form, the fields stay empty, and 375px has no horizontal scroll", async ({ page }) => {
    await page.route("**/api/manager/technicians**", async (route) => {
      if (route.request().url().endsWith("/password")) await route.fulfill({ status: 404, json: { error: "TECHNICIAN_NOT_FOUND", message: "Technician was not found." } });
      else await route.fulfill({ json: { technicians: rows } });
    });
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/tests/manager-technicians.html");
    await page.locator("li").filter({ has: page.locator("strong", { hasText: /^field-tech$/ }) }).getByRole("button", { name: "Set new password", exact: true }).click();
    const form = page.getByRole("form", { name: "Set new password for field-tech" });
    await form.getByLabel("New password", { exact: true }).fill(newPassword);
    await form.getByLabel("Confirm new password").fill(newPassword);
    for (const control of [form.getByLabel("New password", { exact: true }), form.getByLabel("Confirm new password"), form.getByRole("button", { name: "Set password" }), form.getByRole("button", { name: "Cancel" })]) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await form.getByRole("button", { name: "Set password" }).click();
    await expect(form.getByRole("alert")).toHaveText("Technician was not found.");
    await expect(form.getByLabel("New password", { exact: true })).toHaveValue("");
    await expect(form.getByLabel("Confirm new password")).toHaveValue("");
    await expect(form.getByRole("button", { name: "Set password" })).toBeDisabled();
  });
});
