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
  await others.fill("Pump room door needs repair");
  await expect(page.getByRole("list", { name: "Selected remarks" }).getByRole("listitem")).toHaveCount(3);
  // R4: a technician no longer adds to the system-wide list from a box without a section (the API refuses it, so the button is gone).
  // Sections that take a remark request (checklist / measurement rows) have their own spec per service: remark-requests-r4-*.spec.ts.
  await expect(page.getByRole("button", { name: "Add to common remarks" })).toHaveCount(0);
  await expect(picker.getByRole("option", { name: "Pump room door needs repair" })).toHaveCount(0);
});
