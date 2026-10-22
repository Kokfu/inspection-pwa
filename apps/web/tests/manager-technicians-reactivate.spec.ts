import { expect, test } from "@playwright/test";

for (const role of ["inspector", "supervisor"]) {
  test(`${role}: confirm, cancel, busy state and authoritative list refresh`, async ({ page }) => {
    const technician = { id: 12, username: "fr08-target", displayName: "Test Person", role, isActive: false, createdAt: "2026-10-22T00:00:00.000Z", supervisorIds: [] };
    let writes = 0; let reads = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/manager/technicians**", async (route) => {
      if (route.request().url().endsWith("/reactivate")) {
        writes++; expect(route.request().method()).toBe("POST"); expect(route.request().postData()).toBeNull();
        await held; technician.isActive = true;
        await route.fulfill({ json: { technician } });
      } else { reads++; await route.fulfill({ json: { technicians: [technician] } }); }
    });
    await page.goto("/tests/manager-technicians.html");
    await page.getByLabel("Show deactivated staff (1)").check();
    const button = page.getByRole("button", { name: "Reactivate", exact: true });
    const confirm = `Reactivate this ${role === "supervisor" ? "Admin" : "technician"}? They will be able to sign in again.`;
    page.once("dialog", async (dialog) => { expect(dialog.message()).toBe(confirm); await dialog.dismiss(); });
    await button.click(); expect(writes).toBe(0);
    for (const size of [{ width: 360, height: 800 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(size);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const box = (await button.boundingBox())!; expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44);
      expect(await button.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      await page.keyboard.press("Tab");
      await button.focus();
      expect(await button.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
      if (size.width !== 768) await page.screenshot({ path: test.info().outputPath(`${role}-${size.width}.png`), fullPage: true });
    }
    page.once("dialog", async (dialog) => { expect(dialog.message()).toBe(confirm); await dialog.accept(); });
    await button.click();
    await expect(button).toBeDisabled(); expect(writes).toBe(1); expect(reads).toBe(1);
    release();
    await expect(page.getByRole("status")).toHaveText("Test Person reactivated.");
    expect(reads).toBe(2);
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    await expect(button).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Deactivate", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Permanently remove" })).toHaveCount(0);
  });
}

test("409 stays calm and inactive, including when a password form was open", async ({ page }) => {
  const technician = { id: 12, username: "fr08-target", displayName: null, role: "inspector", isActive: false, createdAt: "2026-10-22T00:00:00.000Z", supervisorIds: [] };
  const message = "Another active account uses this username or person’s name. Change the person’s name before reactivating.";
  await page.route("**/api/manager/technicians**", async (route) => {
    if (route.request().url().endsWith("/reactivate")) await route.fulfill({ status: 409, json: { error: "ACCOUNT_NAME_CLASH", message } });
    else await route.fulfill({ json: { technicians: [technician] } });
  });
  await page.goto("/tests/manager-technicians.html");
  await page.getByLabel("Show deactivated staff (1)").check();
  await page.getByRole("button", { name: "Set new password", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reactivate", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(message);
  await expect(page.getByText("Inactive", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reactivate", exact: true })).toBeEnabled();
  await expect(page.locator("#failure")).toBeEmpty();
});
