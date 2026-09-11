import { expect, test } from "@playwright/test";

/**
 * DoD (STEP 3.2 slice C): a read-only "Service history" section on the customer
 * configuration screen, always scoped to `customerId`, with "Site", "Status",
 * "System", "From", and "To" filters (All Sites / All / All systems defaults).
 * Changing any filter resets the list and cursor and refetches from scratch,
 * and `loadMore` carries the same active filters as page 1. Rows reuse
 * ManagerHome's visitCard semantics but lead with `visit.site` instead of a
 * redundant "Customer" line. Closed rows show "View Final Report" +
 * "Download PDF"; open rows show only "View Progress". "Load more" appends
 * (never replaces) and disappears once `nextCursor` is `null`. A 403-shaped
 * response trips `onAuthorityFailure`, never a domain error message. An
 * INVALID_DATE_RANGE 400 surfaces inline via the existing domain-error path.
 * A "{visits.length} of {totalCount} visits" chip renders next to the heading
 * except on the empty state, and updates on Load More and on any filter change.
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
    "initial request has no systemKey (All systems default)",
    "initial request has no from/to (unset by default)",
    "System select offers the customer's full supported-system catalog",
    "visits chip shows X of Y visits after initial load",
    "open row shows only View Progress",
    "closed row shows View Final Report + Download PDF",
    "no redundant Customer label on rows",
    "View Progress calls onViewServiceVisit with the job id",
    "View Final Report calls onViewFinalReport with the job id",
    "Download PDF calls onDownloadFinalReport with the job id",
    "Load more shown while nextCursor is non-null",
    "Load more appended (original rows still present)",
    "Load more request carried the cursor",
    "visits chip updates after Load More",
    "Load more is gone once nextCursor is null",
    "site filter request carries siteId",
    "site filter request carries customerId",
    "site filter reset the cursor (no cursor on the new request)",
    "site filter reset removed the previously loaded rows (replace, not append)",
    "visits chip updates after a filter change",
    "status filter request carries status=open",
    "status filter request has no siteId",
    "status filter request carries status=closed",
    "system filter request carries systemKey=",
    "date filter request carries from=",
    "date filter request carries to=",
    "invalid date range surfaces the server message inline",
    "invalid date range does not trip onAuthorityFailure",
    "403 response trips onAuthorityFailure exactly once",
    "403 response does not render a domain form-message",
    "empty state shown for a filter with zero matches",
    "visits chip absent on the empty state",
    "no crash text"
  ]) {
    expect(byName[name], name).toBe(true);
  }
});
