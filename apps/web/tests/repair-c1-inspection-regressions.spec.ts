import { test } from "@playwright/test";
// Current-entry smoke uses the harness's documented healthy ?online mode.
// Default mode authenticates /auth/me but fails every other API request.
// The runner separately exercises all default-mode retired-draft scenarios;
// this wrapper remains the distinct healthy-online entry/display smoke proof.
test.beforeEach(async ({ page }) => {
  await page.route(/\/tests\/result-tap-scroll\.html(?:\?.*)?$/, async route => {
    if (!route.request().isNavigationRequest()) return route.continue();
    const url = new URL(route.request().url());
    if (url.searchParams.has("online")) return route.continue();
    url.searchParams.set("online", "");
    await route.fulfill({ status: 302, headers: { Location: url.href } });
  });
});
import "./repair-disabled.spec";
