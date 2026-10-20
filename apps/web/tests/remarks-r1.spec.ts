import { expect, test } from "@playwright/test";

// R4: Hose Reel rows now hold ONE remark (they used to append a removable list); its Comments box keeps the list.
test("Hose Reel checklist row holds one remark: a later choice replaces it and Others types straight into the row", async ({ page }) => {
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
  await expect(picker.locator("option:checked")).toHaveText("Water level low");
  await expect(row.getByRole("list", { name: "Selected remarks" })).toHaveCount(0);
  await picker.selectOption({ label: "Others (type your own)" });
  const typed = row.getByRole("textbox", { name: "Type a new remark" });
  await typed.fill("Hose Reel typed note");
  await expect(typed).toHaveValue("Hose Reel typed note");
  await expect(row.getByRole("button", { name: "Add to common remarks" })).toBeEnabled();
  await expect(row.getByRole("list", { name: "Selected remarks" })).toHaveCount(0);
});
