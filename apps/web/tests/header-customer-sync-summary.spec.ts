import { expect, test } from "@playwright/test";

/**
 * I-74: the header summary and the sign-out count read the technician Add Customer outbox on real IndexedDB.
 */
test("header summary and unsynced count reflect Pending, Failed and Completed customers (I-74)", async ({ page }) => {
  await page.goto("/tests/header-customer-sync-summary.html");
  await page.getByRole("button", { name: "Run header customer sync summary checks", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        const result = JSON.parse(await page.locator("#result").innerText());
        if (result.status === "FAIL" || result.status === "ERROR") return JSON.stringify(result);
        return result.status;
      } catch { return "RUNNING"; }
    }, { timeout: 30_000 })
    .toBe("PASS");
});

test("a Pending customer survives a page reload and still counts (I-74)", async ({ page }) => {
  await page.goto("/tests/header-customer-sync-summary.html");
  await page.getByRole("button", { name: "Seed a Pending customer", exact: true }).click();
  await expect(page.locator("#result")).toHaveText("SEEDED");
  await page.reload();
  await page.getByRole("button", { name: "Read header summary", exact: true }).click();
  await expect.poll(async () => { try { return JSON.parse(await page.locator("#result").innerText()); } catch { return null; } }, { timeout: 15_000 })
    .toEqual({ status: "READ", text: "1 customer waiting to sync", waiting: 1 });
});
