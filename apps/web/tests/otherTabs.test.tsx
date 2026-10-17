import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OtherTabsNotice } from "../src/pwa/OtherTabsNotice";
import { OTHER_TABS_WARN_AT, TAB_LOCK_PREFIX, countOtherTabs, shouldWarnAboutTabs, startTabPresence, tabNoticeText, type LockManagerLike } from "../src/pwa/otherTabs";

const held = (...names: Array<string | null | undefined>) => ({ held: names.map((name) => ({ name })) });

test("countOtherTabs counts distinct presence locks and ignores this tab and unrelated locks", () => {
  const me = `${TAB_LOCK_PREFIX}me`;
  assert.equal(countOtherTabs(held(me, `${TAB_LOCK_PREFIX}a`, `${TAB_LOCK_PREFIX}b`, `${TAB_LOCK_PREFIX}b`, "other-lock", null, undefined), me), 2);
  assert.equal(countOtherTabs(held(me), me), 0);
  assert.equal(countOtherTabs({}, me), 0);
  assert.equal(countOtherTabs(null, me), 0);
  assert.equal(countOtherTabs(undefined, me), 0);
});

test("the warning starts at the documented threshold and never on bad input", () => {
  assert.equal(OTHER_TABS_WARN_AT, 3);
  assert.equal(shouldWarnAboutTabs(0), false);
  assert.equal(shouldWarnAboutTabs(OTHER_TABS_WARN_AT - 1), false);
  assert.equal(shouldWarnAboutTabs(OTHER_TABS_WARN_AT), true);
  assert.equal(shouldWarnAboutTabs(11), true);
  assert.equal(shouldWarnAboutTabs(Number.NaN), false);
  assert.equal(shouldWarnAboutTabs(2.5), false);
});

test("the notice renders only at the threshold and tells the technician what to do", () => {
  assert.equal(renderToStaticMarkup(createElement(OtherTabsNotice, { otherTabs: 2 })), "");
  const html = renderToStaticMarkup(createElement(OtherTabsNotice, { otherTabs: 5 }));
  assert.match(html, /role="status"/);
  assert.match(html, /Too many open tabs/);
  assert.match(html, /open in 5 other browser tabs/);
  assert.match(html, /Close the extra tabs/);
  assert.equal(tabNoticeText(5).includes("installed app"), true);
});

function fakeLocks() {
  const heldNames: string[] = [];
  const releases = new Map<string, () => void>();
  const manager: LockManagerLike = {
    request(name, _options, callback) {
      heldNames.push(name);
      return callback().then(() => { heldNames.splice(heldNames.indexOf(name), 1); });
    },
    async query() { return { held: heldNames.map((name) => ({ name })) }; }
  };
  return { manager, heldNames, releases };
}

test("a presence lock is held until stop() and counted by the other tabs", async () => {
  const { manager, heldNames } = fakeLocks();
  const a = startTabPresence(manager, "a")!, b = startTabPresence(manager, "b")!, c = startTabPresence(manager, "c")!;
  assert.deepEqual(heldNames.sort(), [a.name, b.name, c.name].sort());
  assert.equal(await a.readOtherTabs(), 2);
  b.stop(); await new Promise((r) => setTimeout(r, 0));
  assert.equal(await a.readOtherTabs(), 1);
  assert.equal(await c.readOtherTabs(), 1);
  a.stop(); c.stop(); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(heldNames, []);
});

test("without Web Locks, or when a query fails, the count is 0 and nothing throws", async () => {
  assert.equal(startTabPresence(undefined, "x"), undefined);
  const failing: LockManagerLike = { request: () => new Promise(() => undefined), query: async () => { throw new Error("denied"); } };
  assert.equal(await startTabPresence(failing, "y")!.readOtherTabs(), 0);
  const rejecting: LockManagerLike = { request: () => Promise.reject(new Error("no")), query: async () => ({ held: [] }) };
  assert.equal(await startTabPresence(rejecting, "z")!.readOtherTabs(), 0);
});
