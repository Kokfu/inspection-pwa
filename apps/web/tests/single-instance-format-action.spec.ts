import { expect, test } from "@playwright/test";

for (const system of ["smoke_ventilation", "fire_intercom"]) {
  test(`${system} corrects a configured label only in the future format`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/tests/single-instance-format-action.html?system=${system}`);
    await page.getByLabel("Format label 1").fill("Corrected Label");
    await page.getByRole("button", { name: "Save as format for next visit" }).click();
    await expect(page.getByText("Saved on this device, pending sync.")).toBeVisible();
    const proposal = await page.evaluate(() => (window as any).inspect());
    expect(proposal.patch.rows).toEqual([{ assetReference: "Corrected Label" }, { assetReference: "Added Label" }]);
    expect(proposal.status).toBe("Pending");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
