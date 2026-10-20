import { expect, test } from "@playwright/test";

test("Hose Reel checklist still appends choices and Others with a removable list", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/tests/row-layout-hose-reel.html");
  await page.getByLabel("Number of hose reel drums").fill("1");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await page.evaluate(async () => {
    const path = "/src/inspectionControls/commonRemarks.ts";
    const { addCommonRemark } = await import(/* @vite-ignore */ path);
    await addCommonRemark("hose_reel", "Valve needs repair");
    await addCommonRemark("hose_reel", "Water level low");
  });
  const row = page.locator("#check-water_level");
  const picker = row.getByRole("combobox", { name: "Remark", exact: true });
  await picker.selectOption({ label: "Valve needs repair" });
  await picker.selectOption({ label: "Water level low" });
  await picker.selectOption("others");
  await row.getByRole("textbox", { name: "Type a new remark" }).fill("Hose Reel typed note");
  const items = row.getByRole("list", { name: "Selected remarks" }).getByRole("listitem");
  await expect(items).toHaveText(["Valve needs repairRemove", "Water level lowRemove", "Hose Reel typed noteRemove"]);
  await row.getByRole("button", { name: "Remove remark Water level low", exact: true }).click();
  await expect(items).toHaveText(["Valve needs repairRemove", "Hose Reel typed noteRemove"]);
});
