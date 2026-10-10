import { expect, test, type Page } from "@playwright/test";

// I-41: while a Draft form is open and nothing has been edited the strip has no text; it must not be painted as an
// empty grey box, but it must still take up its height so the page does not jump at the first save (I-18/I-23).
const strip = (page: Page) => page.locator(".autosave-status");
const paint = (page: Page) => strip(page).evaluate((element) => {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return {
    text: element.textContent ?? "",
    background: style.backgroundColor,
    borderBottomWidth: parseFloat(style.borderBottomWidth),
    borderBottomColor: style.borderBottomColor,
    pointerEvents: style.pointerEvents,
    height: rect.height,
    position: style.position
  };
});
const transparent = (color: string) => color === "transparent" || /^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)$/.test(color);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tests/autosave-strip-idle.html");
});

test("I-41: the idle strip is not painted, keeps its height and does not catch taps", async ({ page }) => {
  await expect(strip(page)).toHaveCount(0);
  await page.evaluate(() => (window as any).autosave.setActive(true));
  await expect(strip(page)).toHaveCount(1);
  const idle = await paint(page);
  expect(idle.text).toBe("");
  expect(transparent(idle.background), `background ${idle.background}`).toBe(true);
  expect(idle.borderBottomWidth === 0 || transparent(idle.borderBottomColor), `border ${idle.borderBottomWidth}px ${idle.borderBottomColor}`).toBe(true);
  expect(idle.pointerEvents).toBe("none");
  expect(idle.height).toBeGreaterThanOrEqual(32);
  const reservedTop = (await page.locator("#content").boundingBox())!.y;
  // Scrolled, the transparent strip is the only thing at the top and must not cover the content with a coloured box.
  await page.evaluate(() => window.scrollTo(0, 600));
  const scrolled = await paint(page);
  expect(transparent(scrolled.background)).toBe(true);

  // The first save must not move the page: the strip already took its height while idle.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => (window as any).autosave.publish("saved"));
  await expect(strip(page)).toHaveText("Autosaved on this device");
  const saved = await paint(page);
  expect(transparent(saved.background)).toBe(false);
  // I-48: the strip is informational. Painted or not, it never catches a tap meant for what is under it (the Menu bar).
  expect(saved.pointerEvents).toBe("none");
  expect(Math.abs(saved.height - idle.height)).toBeLessThanOrEqual(1);
  expect((await page.locator("#content").boundingBox())!.y).toBe(reservedTop);

  // Back to idle after leaving the form: nothing is rendered.
  await page.evaluate(() => (window as any).autosave.setActive(false));
  await expect(strip(page)).toHaveCount(0);
});

test("I-48: a tap in the middle of the strip reaches the control under it, in every state", async ({ page }) => {
  await page.evaluate(() => (window as any).autosave.setActive(true));
  for (const status of ["idle", "pending", "saving", "saved", "error"]) {
    await page.evaluate((next) => (window as any).autosave.publish(next), status);
    await page.evaluate(() => window.scrollTo(0, 420));
    const box = (await strip(page).boundingBox())!;
    const hit = await page.evaluate(({ x, y }) => String(document.elementFromPoint(x, y)?.id || document.elementFromPoint(x, y)?.className), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    expect(hit, `status ${status}`).toBe("under");
    expect((await paint(page)).pointerEvents, `status ${status}`).toBe("none");
  }
  // A real click through the strip lands on the button under it.
  await page.evaluate(() => (window as any).autosave.publish("saved"));
  const box = (await strip(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await page.evaluate(() => (window as any).underClicks)).toBe(1);
});
