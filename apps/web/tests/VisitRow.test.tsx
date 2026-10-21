import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VisitRow, type VisitRowSummary } from "../src/visits/VisitRow";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const visit: VisitRowSummary = { kind: "service", status: "closed", date: "2026-10-21", technicianName: "A technician" };
test("service summary renders type, status, date and technician without an interaction", () => {
  const html = renderToStaticMarkup(createElement(VisitRow, { visit }));
  for (const text of ["Service", "Completed", "2026-10-21", "A technician", 'aria-label="Summary only"']) assert.ok(html.includes(text));
  assert.ok(!html.includes("<button"));
});
test("repair is tappable when a callback is provided and unlocked", () => {
  const html = renderToStaticMarkup(createElement(VisitRow, { visit: { ...visit, kind: "repair", status: "awaiting_approval" }, onClick() {} }));
  assert.ok(html.includes('<button type="button"')); assert.ok(html.includes("Repair")); assert.ok(html.includes("Awaiting approval"));
  assert.ok(!html.includes('aria-label="Summary only"'));
  let calls = 0;
  const row = VisitRow({ visit, onClick() { calls++; } });
  row.props.onClick(); assert.equal(calls, 1);
});

test("row fits phone, tablet and desktop with a touch target and visible keyboard focus", async () => {
  const css = await readFile(new URL("../src/styles/app.css", import.meta.url), "utf8");
  const screenshots = await mkdtemp(join(tmpdir(), "visit-row-"));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const [width, height] of [[360, 800], [768, 1024], [1280, 800]]) {
      await page.setViewportSize({ width, height });
      await page.setContent(`<style>${css}</style>${renderToStaticMarkup(createElement(VisitRow, {
        visit: { ...visit, kind: "repair", status: "awaiting_approval", technicianName: "Long technician name that must wrap on a narrow phone screen" }, onClick() {}
      }))}${renderToStaticMarkup(createElement(VisitRow, { visit }))}`);
      const button = page.getByRole("button");
      const box = await button.boundingBox(); assert.ok(box && box.height >= 44 && box.width >= 44);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.keyboard.press("Tab");
      assert.equal(await button.evaluate(el => el === document.activeElement), true);
      assert.notEqual(await button.evaluate(el => getComputedStyle(el).outlineStyle), "none");
      await page.screenshot({ path: join(screenshots, `${width}.png`) });
    }
    console.log(`VisitRow screenshots: ${screenshots}`);
  } finally { await browser.close(); }
});
test("explicit lock takes precedence over callback and can be hidden for an inert row", () => {
  const locked = VisitRow({ visit, locked: true, onClick() { assert.fail("locked callback"); } });
  assert.equal(locked.type, "div"); assert.equal(locked.props.onClick, undefined);
  const html = renderToStaticMarkup(createElement(VisitRow, { visit: { ...visit, technicianName: null }, locked: false }));
  assert.ok(html.includes("Unassigned")); assert.ok(!html.includes('aria-label="Summary only"'));
});
