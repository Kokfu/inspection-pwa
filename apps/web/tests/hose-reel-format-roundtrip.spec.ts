import { expect, test } from "@playwright/test";

test("Hose Reel form saves real drum content as a format and pre-fills a new visit", async ({ page }) => {
  await page.goto("/tests/hose-reel-format-roundtrip.html");
  await expect(page.getByRole("heading", { name: "Hose Reel System" })).toBeVisible();
  await page.getByRole("spinbutton", { name: "Number of hose reel drums inspected" }).fill("2");
  await page.getByRole("radio", { name: "Swing" }).first().check();
  await page.getByRole("radio", { name: "Fixed" }).last().check();
  await page.getByRole("textbox", { name: "Location" }).first().fill("North lobby");
  await page.getByRole("textbox", { name: "Location" }).last().fill("Loading bay");
  await page.getByRole("textbox", { name: "No. / Reference" }).first().fill("HR-01");
  await page.getByRole("textbox", { name: "No. / Reference" }).last().fill("HR-02");
  await page.getByRole("button", { name: "Save as format for next visit" }).click();
  await expect(page.getByText("Saved on this device, pending sync.")).toBeVisible();
  await page.getByRole("button", { name: "Open next visit from saved format" }).click();
  await expect(page.getByRole("spinbutton", { name: "Number of hose reel drums inspected" })).toHaveValue("2");
  await expect(page.getByRole("heading", { name: "Drum 1 (configured)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Drum 2 (configured)" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Location" }).first()).toHaveValue("North lobby");
  await expect(page.getByRole("textbox", { name: "Location" }).last()).toHaveValue("Loading bay");
  await expect(page.getByRole("textbox", { name: "No. / Reference" }).first()).toHaveValue("HR-01");
  await expect(page.getByRole("textbox", { name: "No. / Reference" }).last()).toHaveValue("HR-02");
  await expect(page.getByRole("radio", { name: "Swing" }).first()).toBeChecked();
  await expect(page.getByRole("radio", { name: "Fixed" }).last()).toBeChecked();
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll("body *")].filter((item) => item.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 8).map((item) => ({ tag: item.tagName, className: item.className, text: item.textContent?.slice(0, 40) })) }));
    expect(overflow, JSON.stringify(overflow)).toMatchObject({ scrollWidth: width });
  }
  if (process.env.HOSE_REEL_SCREENSHOT) await page.screenshot({ path: process.env.HOSE_REEL_SCREENSHOT, fullPage: true });
  await page.getByRole("textbox", { name: "Location" }).first().fill("Technician changed lobby");
  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page.getByText("Draft saved on this device.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open next visit from saved format" }).click();
  await expect(page.getByRole("textbox", { name: "Location" }).first()).toHaveValue("Technician changed lobby");
});
