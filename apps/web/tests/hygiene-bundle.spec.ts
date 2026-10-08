import { expect, test } from "@playwright/test";

/** I-29 in a real browser at 360 px: technician Add Customer (no double border, phone keyboards, autocomplete) and tap behaviour. */
test.use({ viewport: { width: 360, height: 900 } });

test("technician Add Customer: one card border, tel keyboards, autocomplete off, no tap delay, no skipped heading", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = {};
    if (path === "/api/auth/me") json = { user: { id: 805, username: "tech", role: "inspector" } };
    else if (path === "/api/customers/service-format-options") json = { systems: [] };
    else if (path.endsWith("/inspection-jobs")) json = { jobs: [] };
    await route.fulfill({ json });
  });
  await page.goto("/tests/manager-dashboard-navigation.html#/jobs");
  await page.getByRole("button", { name: /^Technician/ }).click();
  await page.locator(".connection-state").waitFor();
  await page.evaluate(() => { location.hash = "#/technician-add-customer"; });
  await expect(page.getByLabel("Customer display name")).toBeVisible();

  const fieldset = await page.locator(".customer-form-card > fieldset:not(.manager-service-picker)").evaluate((el) => {
    const style = getComputedStyle(el);
    return { border: style.borderTopWidth, padding: style.paddingTop };
  });
  expect(fieldset).toEqual({ border: "0px", padding: "0px" });

  for (const label of ["Telephone No", "Fax"]) {
    const input = page.getByLabel(label, { exact: true });
    await expect(input).toHaveAttribute("type", "tel");
    await expect(input).toHaveAttribute("inputmode", "tel");
  }
  const autocompletes = await page.locator(".customer-form-card input:not([type=checkbox])").evaluateAll((els) => els.map((el) => (el as HTMLInputElement).autocomplete));
  expect(autocompletes).toHaveLength(7);
  expect(autocompletes.every((value) => value === "off")).toBe(true);

  expect(await page.locator(".app-account button").first().evaluate((el) => getComputedStyle(el).touchAction)).toBe("manipulation");
  expect(await page.getByLabel("Customer display name").evaluate((el) => getComputedStyle(el).touchAction)).toBe("manipulation");

  const levels = await page.evaluate(() => [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((h) => Number(h.tagName[1])));
  for (let i = 1; i < levels.length; i += 1) expect(levels[i] - levels[i - 1], `heading order ${levels.join(",")}`).toBeLessThanOrEqual(1);
});
