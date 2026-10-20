import { expect, test, type Page } from "@playwright/test";

// P4 Photo KPI page: mocked /api/manager/photo-kpi that follows the real API contract (apps/api/src/routes/managerPhotoKpi.ts).
const malaysiaMonth = () => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
};
const index = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
const fromIndex = (n: number) => `${String(Math.floor(n / 12)).padStart(4, "0")}-${String(n % 12 + 1).padStart(2, "0")}`;
const percent = (c: number, g: number) => (c + g > 0 ? Math.round(g * 1000 / (c + g)) / 10 : null);

const people = [
  { userId: 11, username: "alice", displayName: "Alice Tan", hidden: false, seed: 1 },
  { userId: 12, username: "bob", displayName: "Bob Lim", hidden: false, seed: 2 },
  { userId: 13, username: "cara", displayName: null, hidden: false, seed: 0 },
  { userId: 14, username: "old", displayName: "Old Hand", hidden: true, seed: 3 }
];
function payload(period: string, now: string) {
  const anchor = period === "all" ? now : period;
  const months = Array.from({ length: 6 }, (_, i) => fromIndex(index(anchor) - 5 + i));
  const technicians = people.flatMap((person) => {
    const trend = months.map((month, i) => person.seed === 0 ? { month, camera: 0, gallery: 0, unknown: 0 }
      : { month, camera: (person.seed + i) % 4 + 1, gallery: (person.seed * i) % 3, unknown: i === 5 && person.seed === 2 ? 1 : 0 });
    const own = period === "all" ? trend.reduce((a, p) => ({ camera: a.camera + p.camera, gallery: a.gallery + p.gallery, unknown: a.unknown + p.unknown }), { camera: 0, gallery: 0, unknown: 0 })
      : { camera: trend[5]!.camera, gallery: trend[5]!.gallery, unknown: trend[5]!.unknown };
    // Hidden accounts are listed only with photos in the period; the active, photo-less Cara is always listed.
    if (person.hidden && own.camera + own.gallery + own.unknown === 0) return [];
    return [{ userId: person.userId, username: person.username, displayName: person.displayName, hidden: person.hidden, ...own, galleryPercent: percent(own.camera, own.gallery), trend }];
  });
  const sum = technicians.reduce((a, t) => ({ camera: a.camera + t.camera, gallery: a.gallery + t.gallery, unknown: a.unknown + t.unknown }), { camera: 0, gallery: 0, unknown: 0 });
  const totalTrend = months.map((month, i) => ({ month, camera: technicians.reduce((a, t) => a + t.trend[i]!.camera, 0), gallery: technicians.reduce((a, t) => a + t.trend[i]!.gallery, 0), unknown: technicians.reduce((a, t) => a + t.trend[i]!.unknown, 0) }));
  return { period, months, technicians, total: { ...sum, galleryPercent: percent(sum.camera, sum.gallery), trend: totalTrend } };
}

type Options = { role?: "admin" | "supervisor" | "inspector"; fail?: boolean; malformed?: boolean; authority?: number };
async function install(page: Page, options: Options = {}) {
  const requests: string[] = [];
  let failuresLeft = options.fail ? 1 : 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown, status = 200) => route.fulfill({ json: body, status });
    if (url.pathname === "/api/auth/me") return json({ user: { id: 4, username: "reviewer", role: options.role ?? "admin" } });
    if (url.pathname === "/api/manager/photo-kpi") {
      requests.push(url.search);
      if (options.authority) return json({ error: "FORBIDDEN" }, options.authority);
      if (failuresLeft > 0) { failuresLeft -= 1; return json({}, 503); }
      const body = payload(url.searchParams.get("period")!, malaysiaMonth());
      if (options.malformed) body.total.camera += 1;
      return json(body);
    }
    return json({});
  });
  return requests;
}
async function enter(page: Page, role: "admin" | "supervisor" = "admin") {
  await page.goto("/tests/manager-dashboard-navigation.html#/manager-photo-kpi");
  await page.getByRole("button", { name: role === "admin" ? /^Manager Monitor/ : /^Admin Review/ }).click();
}
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
const bars = (page: Page) => page.locator(".photo-kpi-bars > li .photo-kpi-bar-name");

for (const viewport of [{ name: "375 px phone", width: 375, height: 800 }, { name: "1280 px desktop", width: 1280, height: 900 }]) {
  test(`all technicians, one technician, month switch and All time at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const requests = await install(page);
    await enter(page);
    const now = malaysiaMonth();
    await expect(page.getByRole("heading", { name: "Photo KPI", exact: true })).toBeVisible();
    await expect(page.getByLabel("Month", { exact: true })).toHaveValue(now);
    expect(requests).toEqual([`?period=${now}`]);

    // All technicians: totals, a chart per technician sorted by gallery %, and a text table with the same numbers.
    const expected = payload(now, now);
    const all = page.getByLabel(`All technicians, ${new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${now}-01T00:00:00Z`))}`);
    await expect(all.locator("dd")).toHaveText([String(expected.total.camera), String(expected.total.gallery), `${expected.total.galleryPercent!.toFixed(1)}%`, String(expected.total.unknown)]);
    const order = [...expected.technicians].sort((a, b) => (b.galleryPercent ?? -1) - (a.galleryPercent ?? -1) || (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username))
      .map((t) => `${t.displayName ?? t.username}${t.hidden ? " (hidden)" : ""}`);
    await expect(bars(page)).toHaveText(order);
    const firstBar = page.locator(".photo-kpi-bars svg").first();
    await expect(firstBar).toHaveAttribute("role", "img");
    await expect(firstBar).toHaveAttribute("aria-label", /camera, .* gallery, .* unknown, gallery/);
    await expect(page.locator(".photo-kpi-table").first().locator("tbody tr")).toHaveCount(expected.technicians.length);
    await expect(page.getByRole("list", { name: "Chart key" }).first()).toContainText("Gallery (hatched)");
    // Zero-photo technician: listed with no percentage (an em dash), never a fake 0 %.
    await expect(page.locator(".photo-kpi-table").first().locator("tr", { hasText: "cara" }).locator("td").last()).toHaveText("—");

    // One technician: search narrows the list, select shows their numbers, donut and 6-month trend.
    await expect(page.getByText("Choose a technician to see their photos.")).toBeVisible();
    await page.getByLabel("Find a technician").fill("bob");
    const select = page.locator(".photo-kpi-picker select");
    await expect(select.locator("option")).toHaveText(["Choose a technician", "Bob Lim"]);
    await select.selectOption({ label: "Bob Lim" });
    const bob = expected.technicians.find((t) => t.username === "bob")!;
    const one = page.locator(".photo-kpi-one");
    await expect(one.getByRole("heading", { name: "Bob Lim", level: 4 })).toBeVisible();
    await expect(one.locator("dl dd")).toHaveText([String(bob.camera), String(bob.gallery), `${bob.galleryPercent!.toFixed(1)}%`, String(bob.unknown)]);
    await expect(one.locator("svg.photo-kpi-donut")).toHaveAttribute("aria-label", new RegExp(`${bob.camera} camera, ${bob.gallery} gallery`));
    await expect(one.locator("svg.photo-kpi-trend")).toHaveAttribute("aria-label", /Photos per month, last 6 months/);
    await expect(one.locator(".photo-kpi-trend ~ .photo-kpi-table-wrap tbody tr")).toHaveCount(6);
    await noOverflow(page);

    // Switch month: new request, the selected technician stays selected and the numbers change.
    const previous = fromIndex(index(now) - 1);
    await page.getByLabel("Month", { exact: true }).fill(previous);
    await expect.poll(() => requests.at(-1)).toBe(`?period=${previous}`);
    const bobPrevious = payload(previous, now).technicians.find((t) => t.username === "bob")!;
    await expect(one.locator("dl dd").first()).toHaveText(String(bobPrevious.camera));
    await expect(one.getByRole("heading", { name: "Bob Lim", level: 4 })).toBeVisible();

    // All time.
    const allTime = page.getByRole("button", { name: "All time", exact: true });
    await allTime.click();
    await expect.poll(() => requests.at(-1)).toBe("?period=all");
    await expect(allTime).toHaveAttribute("aria-pressed", "true");
    const bobAll = payload("all", now).technicians.find((t) => t.username === "bob")!;
    await expect(one.locator("dl dd").first()).toHaveText(String(bobAll.camera));
    await expect(page.locator(".photo-kpi-bars")).toBeVisible();
    // Picking a month again leaves All time.
    await page.getByLabel("Month", { exact: true }).fill(now);
    await expect.poll(() => requests.at(-1)).toBe(`?period=${now}`);
    await expect(allTime).toHaveAttribute("aria-pressed", "false");
    await noOverflow(page);

    // Touch targets and 16 px entry.
    for (const locator of [allTime, page.getByLabel("Find a technician"), select, page.getByLabel("Month", { exact: true })]) {
      const box = (await locator.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(await locator.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    }
    await page.screenshot({ path: `test-results/photo-kpi-${viewport.width}.png`, fullPage: true });
  });
}

test("a hidden technician appears only in a period where they have photos; All time never shows a zero hidden row", async ({ page }) => {
  await install(page);
  await enter(page);
  await expect(bars(page).filter({ hasText: "Old Hand (hidden)" })).toHaveCount(1);
  await expect(page.locator(".photo-kpi-table").first().locator("tbody tr")).toHaveCount(4);
});

test("a failed load shows a retry; a malformed or inconsistent reply is never charted", async ({ page }) => {
  await install(page, { fail: true });
  await enter(page);
  await expect(page.getByRole("alert")).toContainText("currently unavailable");
  await expect(page.locator(".photo-kpi-bars")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".photo-kpi-bars")).toBeVisible();
});
test("an inconsistent total fails closed", async ({ page }) => {
  await install(page, { malformed: true });
  await enter(page);
  await expect(page.getByRole("alert")).toContainText("currently unavailable");
  await expect(page.locator(".photo-kpi-bars")).toHaveCount(0);
  await expect(page.locator("dl")).toHaveCount(0);
});

test("the Admin (supervisor) role can open the page; it is linked from Home and the sidebar", async ({ page }) => {
  await install(page, { role: "supervisor" });
  await page.goto("/tests/manager-dashboard-navigation.html#/manager");
  await page.getByRole("button", { name: /^Admin Review/ }).click();
  await page.getByLabel("Primary navigation").getByRole("button", { name: "Photo KPI", exact: true }).click();
  await expect(page).toHaveURL(/#\/manager-photo-kpi$/);
  await expect(page.getByRole("heading", { name: "Photo KPI", exact: true })).toBeVisible();
  await expect(page.locator('[aria-label="Primary navigation"] button[aria-current="page"]')).toHaveText("Photo KPI");
  await expect(page.locator(".photo-kpi-bars")).toBeVisible();
});

test("an authorization refusal does not draw the page", async ({ page }) => {
  await install(page, { authority: 403 });
  await enter(page);
  await expect(page.locator(".photo-kpi-bars")).toHaveCount(0);
  await expect(page.locator("dl")).toHaveCount(0);
});

test("a technician cannot open the manager page", async ({ page }) => {
  await install(page, { role: "inspector" });
  await page.goto("/tests/manager-dashboard-navigation.html#/manager-photo-kpi");
  await expect(page.getByRole("heading", { name: "Photo KPI", exact: true })).toHaveCount(0);
});
