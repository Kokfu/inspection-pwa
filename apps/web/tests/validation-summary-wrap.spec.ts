import { expect, test } from "@playwright/test";

// I-57: a failed Submit lists raw field paths such as `automatic_sprinkler_checks.automatic_refilling_facilities requires its own Photo`.
// The path has no break opportunity, so on a 392 px phone it made the page 461 px wide (header, cards and result buttons pushed past the
// right edge) until the list was dismissed. The list must wrap inside the viewport.
for (const width of [320, 360, 392]) {
  test(`${width} px: a long unbreakable validation line wraps and the page does not scroll sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/tests/validation-summary-wrap.html");
    await page.locator(".validation-summary li").first().waitFor();
    const m = await page.evaluate(() => {
      const root = document.documentElement;
      const rights = [...document.querySelectorAll(".validation-summary, .validation-summary li, #after")].map((e) => Math.round(e.getBoundingClientRect().right));
      return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, maxRight: Math.max(...rights) };
    });
    expect(m.scrollWidth, JSON.stringify(m)).toBeLessThanOrEqual(m.clientWidth);
    expect(m.maxRight, JSON.stringify(m)).toBeLessThanOrEqual(m.clientWidth);
  });
}
