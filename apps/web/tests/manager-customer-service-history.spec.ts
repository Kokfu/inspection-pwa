import { expect, test } from "@playwright/test";

/**
 * DoD (STEP 3.2 slice B): a read-only "Service history" section on the customer
 * configuration screen, always scoped to `customerId`, with a "Site" select
 * (All Sites default, built from `customer.sites`) and a Status select (All /
 * Open / Closed). Changing either filter resets the list and cursor and
 * refetches from scratch. Rows reuse ManagerHome's visitCard semantics but lead
 * with `visit.site` instead of a redundant "Customer" line. Closed rows show
 * "View Final Report" + "Download PDF"; open rows show only "View Progress".
 * "Load more" appends (never replaces) and disappears once `nextCursor` is
 * `null`. A 403-shaped response trips `onAuthorityFailure`, never a domain
 * error message.
 */
test("Manager customer service history: filtered, paginated, read-only", async ({ page }) => {
  await page.goto("/tests/manager-customer-service-history.html");
  await page.getByRole("button", { name: "Run manager customer service history checks", exact: true }).click();
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await page.locator("#result").innerText()).status;
      } catch {
        return "RUNNING";
      }
    }, { timeout: 30_000 })
    .toBe("PASS");

  const checks: Array<{ name: string; value: boolean }> = JSON.parse(await page.locator("#result").innerText()).checks;
  const byName = Object.fromEntries(checks.map((check) => [check.name, check.value]));
  for (const name of [
    "initial request carries customerId always",
    "initial request has no siteId (All sites default)",
    "initial request has no status (All default)",
    "initial request has no cursor",
    "open row shows only View Progress",
    "closed row shows View Final Report + Download PDF",
    "no redundant Customer label on rows",
    "View Progress calls onViewServiceVisit with the job id",
    "View Final Report calls onViewFinalReport with the job id",
    "Download PDF calls onDownloadFinalReport with the job id",
    "Load more shown while nextCursor is non-null",
    "Load more appended (original rows still present)",
    "Load more request carried the cursor",
    "Load more is gone once nextCursor is null",
    "site filter request carries siteId",
    "site filter request carries customerId",
    "site filter reset the cursor (no cursor on the new request)",
    "site filter reset removed the previously loaded rows (replace, not append)",
    "status filter request carries status=open",
    "status filter request has no siteId",
    "status filter request carries status=closed",
    "403 response trips onAuthorityFailure exactly once",
    "403 response does not render a domain form-message",
    "empty state shown for a filter with zero matches",
    "no crash text"
  ]) {
    expect(byName[name], name).toBe(true);
  }
});
