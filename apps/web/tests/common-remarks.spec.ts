import { expect, test } from "@playwright/test";

test("common remarks and Others share one final Remarks field without quantity", async ({ page }) => {
  await page.route("**/api/service-common-remarks", (route) => route.fulfill({ json: { remarks: [
    { id: "00000000-0000-4000-8000-000000003501", systemKey: "automatic_sprinkler", wording: "Battery spoilt", detailLabel: "Battery size", detailOptions: ["12V x 12AH"], active: true },
    { id: "00000000-0000-4000-8000-000000003503", systemKey: "automatic_sprinkler", wording: "25mm ball valve spoilt", detailLabel: null, detailOptions: [], active: true }
  ] } }));
  await page.goto("/tests/common-remarks.html");
  const picker = page.getByRole("combobox", { name: "Remark", exact: true });
  await expect(picker.getByRole("option", { name: "Battery spoilt" })).toBeAttached();
  await expect(page.getByText("Quantity", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Remarks", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add to common remarks" })).toHaveCount(0);

  await picker.selectOption({ label: "Battery spoilt" });
  await page.getByRole("combobox", { name: "Battery size" }).selectOption("12V x 12AH");
  await picker.selectOption({ label: "25mm ball valve spoilt" });
  await expect(page.getByRole("list", { name: "Selected remarks" }).getByRole("listitem")).toHaveText(["Battery spoilt — 12V x 12AHRemove", "25mm ball valve spoiltRemove"]);

  await picker.selectOption("others");
  const others = page.getByRole("textbox", { name: "Type a new remark" });
  await expect(page.getByRole("button", { name: "Add to common remarks" })).toBeDisabled();
  await others.fill("Pump room door needs repair");
  await expect(page.getByRole("list", { name: "Selected remarks" }).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Add to common remarks" })).toBeEnabled();
  await page.getByRole("button", { name: "Add to common remarks" }).click();
  await expect(picker.getByRole("option", { name: "Pump room door needs repair" })).toBeAttached();
  await expect(page.getByRole("list", { name: "Selected remarks" }).getByRole("listitem")).toHaveCount(3);
});
