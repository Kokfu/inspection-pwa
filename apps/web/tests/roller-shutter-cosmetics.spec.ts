import { expect, test, type Page } from "@playwright/test";

// I-37 / I-34 (phone testing register): spacing of the setup prompts and the duplicated zone name.
const prompt = (page: Page) => page.locator("section[aria-labelledby='roller-shutter-setup-title']");
const groupOf = (page: Page, heading: string) => page.locator(".location-group", { has: page.getByRole("heading", { name: heading, exact: true }) });

/** Vertical gap (css px) between each pair of neighbouring visible blocks directly inside the prompt. */
const blockGaps = (page: Page) => prompt(page).evaluate((section) => {
  const blocks = [...section.children].filter((child) => child.getBoundingClientRect().height > 0);
  return blocks.slice(1).map((block, index) => ({
    between: `${blocks[index].tagName.toLowerCase()} -> ${block.tagName.toLowerCase()}`,
    gap: Math.round(block.getBoundingClientRect().top - blocks[index].getBoundingClientRect().bottom)
  }));
});
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 360, height: 800 }); });

test("I-37: the 'How many zones and locations?' prompt has a gap between every field and above Start", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await expect(page.getByRole("heading", { name: "How many zones and locations?" })).toBeVisible();
  await page.getByLabel("Number of zones").fill("3");
  await expect(page.getByText("Different number of locations in some zones?")).toBeVisible();
  const gaps = await blockGaps(page);
  expect(gaps.length).toBeGreaterThanOrEqual(5);
  for (const { between, gap } of gaps) expect(gap, between).toBeGreaterThanOrEqual(12);
  // The two fields are separate rows, each label above its own input (the second does not sit under the first input's line).
  const zones = await page.getByLabel("Number of zones").boundingBox();
  const perZone = await page.getByLabel("Locations in each zone").boundingBox();
  expect(perZone!.y - (zones!.y + zones!.height)).toBeGreaterThanOrEqual(24);
  expect((await page.getByText("Different number of locations in some zones?").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await page.getByRole("button", { name: "Start Inspection" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // The 'different number' control keeps a visible arrow (display:flex removes the browser's), turned down once open.
  const arrow = () => prompt(page).locator("summary").evaluate((summary) => {
    const style = getComputedStyle(summary, "::before");
    return { content: style.content, transform: style.transform };
  });
  expect((await arrow()).content).toBe('"▸"');
  expect((await arrow()).transform).toBe("none");
  await page.getByText("Different number of locations in some zones?").click();
  await expect(page.getByLabel("Zone 2 locations")).toBeVisible();
  expect((await arrow()).transform).not.toBe("none");
  // The per-zone fields inside it are spaced like the others, and Start still has a gap above it.
  const zone1 = await page.getByLabel("Zone 1 locations").boundingBox();
  const zone2Label = await page.locator("label", { hasText: "Zone 2 locations" }).boundingBox();
  expect(zone2Label!.y - (zone1!.y + zone1!.height)).toBeGreaterThanOrEqual(12);
  expect((await blockGaps(page)).every(({ gap }) => gap >= 12)).toBe(true);
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("I-37: the 'Same shutters as last time' prompt keeps the same spacing, with and without the extra-shutters field", async ({ page }) => {
  for (const query of ["?configured=1", "?zoned=1"]) {
    await page.goto(`/tests/fire-rated-roller-shutter-form.html${query}`);
    await expect(page.getByRole("heading", { name: "Same shutters as last time" })).toBeVisible();
    const gaps = await blockGaps(page);
    expect(gaps.length, query).toBeGreaterThanOrEqual(3);
    for (const { between, gap } of gaps) expect(gap, `${query} ${between}`).toBeGreaterThanOrEqual(12);
    expect(await noHorizontalScroll(page)).toBe(true);
  }
});

test("I-34: an editable zone shows its name once, as the input in the header", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html");
  await page.getByLabel("Number of zones").fill("2");
  await page.getByLabel("Locations in each zone").fill("1");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  const first = groupOf(page, "Zone 1");
  const input = first.getByLabel("Zone name");
  await expect(input).toHaveValue("Zone 1");
  // The input is the title: it sits in the zone header, next to the progress count and the show/hide control.
  await expect(first.locator(".zone-header").getByLabel("Zone name")).toHaveCount(1);
  await expect(first.locator(".zone-header").getByRole("button", { name: /shutters in Zone 1/ })).toBeVisible();
  // The heading stays in the page for screen readers / heading navigation but is not drawn a second time.
  const heading = first.getByRole("heading", { name: "Zone 1", exact: true });
  await expect(heading).toHaveCount(1);
  expect((await heading.boundingBox())!.width).toBeLessThanOrEqual(2);
  const visibleCopies = await first.evaluate((group) => [...group.querySelectorAll("h3, input")].filter((element) => {
    const rect = element.getBoundingClientRect();
    const text = element instanceof HTMLInputElement ? element.value : element.textContent ?? "";
    return rect.width > 2 && rect.height > 2 && text.trim() === "Zone 1";
  }).length);
  expect(visibleCopies).toBe(1);
  // Renaming still renames the heading the rest of the page and the specs use.
  await input.fill("Loading Bay");
  await expect(groupOf(page, "Loading Bay").getByLabel("Zone name")).toHaveValue("Loading Bay");
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("I-34: a zone from the saved layout has no name input and keeps its visible heading", async ({ page }) => {
  await page.goto("/tests/fire-rated-roller-shutter-form.html?zoned=1");
  await page.getByRole("button", { name: "Start Inspection" }).click();
  await expect(page.getByLabel("Zone name")).toHaveCount(0);
  const frozen = page.getByRole("heading", { name: "Zone 1", exact: true });
  await expect(frozen).toBeVisible();
  expect((await frozen.boundingBox())!.width).toBeGreaterThan(20);
});
