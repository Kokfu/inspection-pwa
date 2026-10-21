import { expect, test, type Page } from "@playwright/test";
import { installFakeManagerApi, openFakeCustomer } from "./managerServiceEditorFixture";

/**
 * I-25 / I-26 / I-27 in a real browser at phone width (360 px), on the real Manager screens with the fake Manager API:
 * every button, link and tab is at least 44 px, no visible text is under 12 px, and keyboard focus draws an opaque ring.
 */
test.use({ viewport: { width: 360, height: 800 } });

const audit = (page: Page) => page.evaluate(() => {
  const visible = (e: Element) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const small = [...document.querySelectorAll("button, a[href], summary, [role=tab], [role=button]")].filter(visible)
    .filter((e) => (e as HTMLElement).closest("details:not([open]) > :not(summary)") === null)
    .map((e) => ({ label: (e.textContent || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 30), cls: String((e as HTMLElement).className).slice(0, 30), h: Math.round(e.getBoundingClientRect().height * 10) / 10, w: Math.round(e.getBoundingClientRect().width) }))
    .filter((e) => e.h < 43.5);
  const tiny = [...document.querySelectorAll("body *")].filter((e) => visible(e) && [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim()) && parseFloat(getComputedStyle(e).fontSize) < 11.99)
    .map((e) => `${parseFloat(getComputedStyle(e).fontSize)}px "${(e.textContent || "").trim().slice(0, 24)}" ${String((e as HTMLElement).className).slice(0, 24)}`);
  return { small, tiny, overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 };
});

test("Customer page and per-service editor: no target under 44 px, no text under 12 px, no horizontal overflow", async ({ page }) => {
  await installFakeManagerApi(page);
  await openFakeCustomer(page);
  await expect(page.getByRole("heading", { name: "Services", level: 3, exact: true })).toBeVisible();
  const customerPage = await audit(page);
  expect(customerPage.small, "customer configuration targets").toEqual([]);
  expect(customerPage.tiny, "customer configuration text").toEqual([]);
  expect(customerPage.overflowX).toBe(false);

  await page.getByRole("button", { name: /Hose Reel System/ }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(/Hose Reel System/);
  await expect(page.getByRole("button", { name: "Edit wording: S.A.J Main Water Supply" })).toBeVisible();
  const editor = await audit(page);
  expect(editor.small, "service editor targets").toEqual([]);
  expect(editor.tiny, "service editor text").toEqual([]);
  expect(editor.overflowX).toBe(false);
});

test("Keyboard focus draws an opaque 3 px ring on buttons, links, tabs and summary; white on the dark header", async ({ page }) => {
  await installFakeManagerApi(page);
  await openFakeCustomer(page);
  await expect(page.getByRole("heading", { name: "Services", level: 3, exact: true })).toBeVisible();
  const ring = async (selector: string) => {
    await page.keyboard.press("Tab"); // make the page "keyboard modality" so :focus-visible applies to scripted focus
    return page.evaluate((sel) => {
      const element = document.querySelector(sel) as HTMLElement | null;
      if (!element) return undefined;
      element.focus({ focusVisible: true } as FocusOptions);
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor, focused: document.activeElement === element };
    }, selector);
  };
  const rgbaAlpha = (color: string) => { const m = /rgba?\(([^)]+)\)/.exec(color); if (!m) return 1; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 ? Number(p[3]) : 1; };
  for (const selector of [".secondary-command", ".manager-service-card", "[role=tab]", ".app-mobile-navigation summary", ".app-account button"]) {
    const result = await ring(selector);
    if (!result) continue; // not on this screen
    expect(result.focused, `${selector} focusable`).toBe(true);
    expect(result.style, `${selector} outline style`).toBe("solid");
    expect(parseFloat(result.width), `${selector} outline width`).toBeGreaterThanOrEqual(3);
    expect(rgbaAlpha(result.color), `${selector} outline is opaque (${result.color})`).toBe(1);
  }
  const header = await ring(".app-account button");
  if (header) expect(header.color).toBe("rgb(255, 255, 255)");
});

test("Customer service history cards (open and closed visits) fit a 360 px screen and keep 44 px buttons", async ({ page }) => {
  // The history cards live on Current Services Done: the customer is picked there (not on the customer page).
  const acme = "a0000000-0000-4000-8000-000000000001";
  const site = "d0000000-0000-4000-8000-000000000001";
  const technician = { id: 7, displayName: "technician-demo" };
  const visit = (n: number, status: "open" | "closed") => ({
    id: `b0000000-0000-4000-8000-00000000000${n}`, reference: `SV-2026100${n}`, customer: "Acme Towers", site: "North Block",
    createdAt: "2026-10-08T03:00:00.000Z", serviceDate: "2026-10-08", serviceTime: null, status, technician, systems: ["Hose Reel System"],
    inspectionProgress: status === "open" ? { accepted: 1, required: 3 } : { accepted: 11, required: 11 },
    completion: { jobStatus: status, completedAt: status === "closed" ? "2026-10-08T05:00:00.000Z" : null, completedBy: status === "closed" ? { id: 7, username: "technician-demo" } : null }
  });
  const visits = [visit(1, "open"), visit(2, "closed")];
  const customers = [{
    customer: { id: acme, code: "ACM-001", displayName: "Acme Towers" },
    sites: [{ id: site, code: "NORTH", displayName: "North Block" }],
    configuration: { id: `${acme}-config`, revision: 1, enabledSystems: [] }, supportedSystems: []
  }];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { user: { id: 900, username: "mobiletest", role: "admin" } } });
    if (path === "/api/manager/technicians") return route.fulfill({ json: { technicians: [] } });
    if (path === "/api/repair-visits") return route.fulfill({ json: { visits: [] } });
    if (path === "/api/manager/customers") return route.fulfill({ json: { customers } });
    if (path === "/api/manager/service-visits") return route.fulfill({ json: { serviceVisits: visits, nextCursor: null, totalCount: visits.length } });
    if (path === "/api/inspection-jobs") return route.fulfill({ json: { jobs: [] } });
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 1280, height: 800 }); // the sidebar only exists on desktop; narrow to 360 once the history is open
  await page.goto("/tests/manager-technician-services-done.html#/manager");
  await page.getByRole("button", { name: /^Manager Monitor/ }).click();
  await page.getByLabel("Primary navigation").getByRole("button", { name: "Current Services Done", exact: true }).click();
  await page.getByLabel("Select customer", { exact: true }).selectOption({ label: "Acme Towers" });
  await expect(page.getByText("SV-20261001")).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.getByText("SV-20261002")).toBeVisible();
  const result = await audit(page);
  expect(result.overflowX, "no horizontal overflow with service-history cards").toBe(false);
  expect(result.small).toEqual([]);
  expect(result.tiny).toEqual([]);
  await expect(page.locator(".job-card")).toHaveCount(2);
  const widths = await page.evaluate(() => ({ card: Math.max(...[...document.querySelectorAll(".job-card")].map((e) => e.getBoundingClientRect().right)), viewport: window.innerWidth }));
  expect(widths.card, "cards end inside the viewport").toBeLessThanOrEqual(widths.viewport);
});
