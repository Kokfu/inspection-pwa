import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 360, height: 800 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  test(`remaining inspections disclosure at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/tests/job-completion-workflow.html?mode=incomplete");
    const block = page.locator(".remaining-inspections");
    const details = block.locator("details");
    const summary = block.locator("summary");
    const units = block.locator(".completion-requirement");
    await expect(summary).toHaveText("Remaining Inspections - 1 of 3 complete");
    await expect(details).not.toHaveAttribute("open");
    await expect(units).toHaveCount(2);
    await expect(units.first()).not.toBeVisible();
    await expect(units.last()).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Complete Service", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Ready to Complete" })).toHaveCount(0);
    const dimensions = await summary.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return { height: element.getBoundingClientRect().height, lines: new Set(Array.from(range.getClientRects(), (rect) => rect.top)).size,
        fits: element.scrollWidth <= element.clientWidth };
    });
    expect(dimensions.height).toBeGreaterThanOrEqual(44);
    expect(dimensions.lines).toBe(1);
    expect(dimensions.fits).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("collapsed.png"), fullPage: true });

    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open", "");
    await expect(units.first()).toBeVisible();
    await expect(units.first()).toHaveText("Hose Reel - Primary inspectionInspection is not complete");
    await expect(units.last()).toBeVisible();
    await expect(units.last()).toHaveText("Hose Reel - Upper floorRequired evidence is pending");
    await expect(block).not.toContainText("Ground floor");
    await expect(summary).toBeFocused();
    expect(await summary.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
    await page.screenshot({ path: test.info().outputPath("expanded.png"), fullPage: true });
    await page.keyboard.press("Space");
    await expect(units.first()).not.toBeVisible();
  });
}

test("ready panel and unavailable completion message are preserved", async ({ page }) => {
  await page.goto("/tests/job-completion-workflow.html?mode=ready");
  const ready = page.locator(".job-completion--ready");
  await expect(ready.getByRole("heading", { name: "Ready to Complete" })).toBeVisible();
  await expect(ready).toContainText("1 of 1 inspections complete");
  await expect(ready).toContainText("All required inspections are complete.");
  await expect(ready.getByRole("button", { name: "Complete Service", exact: true })).toBeEnabled();
  await expect(page.locator(".remaining-inspections")).toHaveCount(0);

  await page.goto("/tests/job-completion-workflow.html?mode=unavailable");
  await expect(page.locator("summary")).toHaveText("Remaining Inspections - Progress unavailable");
  await expect(page.getByText("Reconnect and refresh to confirm completion readiness.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete Service", exact: true })).toHaveCount(0);
});

test("existing completion workflow checks still pass", async ({ page }) => {
  await page.goto("/tests/job-completion-workflow.html");
  await page.getByRole("button", { name: "Run job completion workflow checks" }).click();
  await expect(page.locator("#result")).toContainText('"status": "PASS"');
  const result = JSON.parse(await page.locator("#result").innerText());
  expect(result.checkCount).toBe(10);
  expect(result.checks.every((check: { passed: boolean }) => check.passed)).toBe(true);
});
