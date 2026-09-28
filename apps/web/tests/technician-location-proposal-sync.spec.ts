import { expect, test } from "@playwright/test";

/**
 * `technicianLocationProposalDraft.ts` drives real Dexie/IndexedDB in a real browser tab (no
 * fake-indexeddb dependency in this project), mirroring `manager-locations.spec.ts` /
 * `portable-fire-extinguisher-sync-race.html`'s harness pattern. Covers the Offline Contract
 * requirements this module must satisfy: local-first save, offline-safe validation, Pending -> Failed
 * preservation on a network error (never silently dropped), retry-to-Synced, and the "exact UUID"
 * confirmation rule -- a server response naming a different id must never be trusted as success.
 */
test("technician location proposal draft: save, validate, queue, Failed-preservation, retry, exact-id confirmation", async ({ page }) => {
  await page.goto("/tests/technician-location-proposal-sync.html");
  await page.getByRole("button", { name: "Run technician location proposal sync checks", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await page.locator("#result").innerText()).status;
      } catch {
        return "RUNNING";
      }
    }, { timeout: 30_000 })
    .toBe("PASS");
});
