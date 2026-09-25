import { expect, test, type Page } from "@playwright/test";

/**
 * T5c: corrections are visible on an Accepted record without implying the record itself changed. The
 * panel is read-only and best-effort — a refused or malformed response must leave the accepted detail
 * rendering exactly as before.
 */
const clientUuid = "00000000-0000-4000-8000-000000000901";
const correction = {
  id: "correction-1", fieldPath: "chargerAndBatteries.main_supply.result", label: "Charger & Batteries › Main Supply › Result",
  sequence: 1, previousValue: "good", newValue: "not_good", reason: "Terminal corrosion found on the photo",
  correctedBy: "review-lead", correctedByRole: "supervisor", correctedAt: "2026-09-20T02:00:00.000Z"
};

const open = (page: Page) => page.goto(`/tests/accepted-corrections-panel.html?clientUuid=${clientUuid}`);

test("corrections on an accepted record are listed with the original value and the reason", async ({ page }) => {
  await page.route(`**/api/inspections/${clientUuid}/corrections`, (route) => route.fulfill({ json: { clientUuid, corrections: [correction] } }));
  await open(page);
  await expect(page.getByRole("heading", { name: "1 correction after submission" })).toBeVisible();
  await expect(page.getByText("The inspection below is shown exactly as it was accepted.", { exact: false })).toBeVisible();
  await expect(page.getByRole("listitem")).toContainText("Charger & Batteries › Main Supply › Result: Good → Not Good");
  await expect(page.getByRole("listitem")).toContainText("review-lead (supervisor)");
  await expect(page.getByRole("listitem")).toContainText("Terminal corrosion found on the photo");
  await expect(page.locator("#accepted-detail")).toHaveText("Accepted inspection detail");
});

test("no corrections or a refusal renders nothing; a failed check says so", async ({ page }) => {
  // A reader who may not see corrections for this record (401/403/404) is told nothing at all.
  for (const respond of [
    { json: { clientUuid, corrections: [] } },
    { status: 403, json: { error: "FORBIDDEN" } },
    { status: 404, json: { error: "INSPECTION_NOT_FOUND" } }
  ]) {
    await page.route(`**/api/inspections/${clientUuid}/corrections`, (route) => route.fulfill(respond));
    await open(page);
    // The panel renders nothing, and the accepted detail beside it is untouched.
    await expect(page.locator("#accepted-detail")).toHaveText("Accepted inspection detail");
    await expect(page.getByRole("heading")).toHaveCount(0);
    await expect(page.getByRole("listitem")).toHaveCount(0);
    await page.unroute(`**/api/inspections/${clientUuid}/corrections`);
  }
});

test("a failed or malformed check is stated, never silently treated as no corrections", async ({ page }) => {
  for (const respond of [
    { status: 500, json: { error: "INTERNAL_SERVER_ERROR" } },
    { json: { clientUuid, corrections: [{ ...correction, previousValue: { nested: true } }] } }
  ]) {
    await page.route(`**/api/inspections/${clientUuid}/corrections`, (route) => route.fulfill(respond));
    await open(page);
    await expect(page.getByText("Corrections made after submission could not be checked.", { exact: false })).toBeVisible();
    await expect(page.locator("#accepted-detail")).toHaveText("Accepted inspection detail");
    await page.unroute(`**/api/inspections/${clientUuid}/corrections`);
  }
});
