# S3a — Manager site archive / restore

Date: 2026-10-20. Scope: API only. Ready for focused review and the next manager UI checkpoint.

## Contract

Admin-only `POST /manager/customers/:customerId/sites/:siteId/archive` and `/restore` accept an exact empty JSON object `{}`. UUID validation precedes database access. Both return `{ customer: <refreshed manager customer> }`.

The existing `sites` array stays active-only. An additive `archivedSites` array contains `{ id, code, displayName, address, archived: true }`. It includes ordinary inactive sites and inactive approved proposal sites; pending and rejected proposals are excluded. Existing web consumers read named properties and do not reject additional customer properties. No web source/type/UI was changed by S3a; the UI checkpoint must consume the additive field explicitly.

Each change locks the active, non-demo customer first, then its site, checks proposal decisions with `deriveSiteProposalState` / `loadSiteProposalDecisions`, updates only `is_active`, writes a success audit event, loads the response through the same transaction client and commits. A response-load or audit failure rolls back. The customer lock is the existing coordination point for add-site, typed-site creation and proposal approval. Competing restores cannot both activate normalized duplicate names. Restore compares every active candidate and the archived name with the same server-side `siteNameKey` helper (NFC, whitespace collapse/trim and lowercase). Stored names are never rewritten.

Review fixes (2026-10-20): added composed/decomposed Unicode clashes in both directions and non-breaking whitespace coverage, with refusal rollback/no-audit assertions and recovery after archiving the clash. The existing two-technician concurrency regression now locates visits by request UUID and derives the winning text/actor from the immutable proposal's job; either transaction may win, while one site/proposal and two visits remain required.

After these fixes, the cold runner passed end-to-end: 48 unit tests and 22 integration tests (including subtests), zero failures/skips, API typecheck and diff whitespace check. API build also passed separately. Both review findings are closed; the disposable container was removed. Ready for the next site-archive checkpoint, subject to the existing requirement that S2 also be reviewed before S3b.

Pending/rejected sites return 409 `SITE_PROPOSAL_NOT_APPROVED` through both routes. Restore name clashes return 409 `SITE_NAME_CONFLICT`. Missing or foreign-customer sites return 404. No last-active-site block exists. Repeating an already satisfied state returns the same customer shape and does not duplicate transition audits. Audit actions are `manager_customer_site_archived` and `manager_customer_site_restored`, entity type `customer_site`.

## History and sync investigation (read-only)

- Technician history/canonical reads: `inspectionJobs.ts` joins `customer_sites` without an activity predicate (lines 61, 92 before S3a). Manager visit reads do the same in `managerServiceVisits.ts` (lines 93, 446). No history-rendering site-activity filter was found.
- Final service report cover authority reads the frozen site name/address from `configuration_snapshot` (`finalServiceReport.ts`, around lines 911–930); its PDF uses that report authority. Repair report authority joins the site without activity filtering (`repairVisitReportAuthority.ts`, line 14). No job, accepted record, report, PDF, site name or address is rewritten by archive/restore.
- Current reference site listing (`inspectionReference.ts`, line 239) and new online `createServiceVisit(siteId)` (`serviceVisits.ts`, lines 309–310) already require an active site. Archive removes availability; restore restores it. An already committed online create replay still precedes the activity check.
- A first sync of an offline-created service visit whose site was archived returns 409 `SITE_INACTIVE` (`offlineServiceVisits.ts`, lines 75–79). No server job is created. An exact replay of an already committed create returns its existing receipt before current activity/configuration/date checks. Web sync retains the local visit/outbox as Failed, shows Needs attention and the inactive-site reason, and holds dependent forms until create is confirmed. Restore plus retry can recover it, subject to unchanged configuration and the existing 30-day device/date window.
- First repair create also returns 409 `SITE_INACTIVE`, including when it references an older visit (`repairVisitWrites.ts`, configuration at lines 50–55, create at line 118). Exact committed create replay precedes configuration checks. The web retains failed operations and the local repair visit with a reason and retry path. A repair already created on the server that has no previous visit rechecks activity on submit (line 193); one based on a previous visit deliberately skips that current-configuration check. Approval/report history does not introduce a site-activity check.
- `repairVisits/fieldCatalog.ts`, line 209, does filter active sites, but this is **current configuration catalog selection**, not historical rendering. `previousVisits.ts` reads historical visits without site-activity filtering.

## Verification

| Gate | Result |
|---|---|
| API typecheck | PASS |
| API build after review fixes | PASS |
| Focused lifecycle unit + existing managerCustomers, siteProposal and serviceVisits units | PASS: 48 tests, 0 skips |
| New disposable-Postgres lifecycle integration | PASS: 1 scenario, covering archive/reference/create refusal/restore, normalized name clash and race, approved/pending/rejected proposals, auth 401/403, strict bodies/UUIDs, missing site, replay/audits, historical name, audit-failure rollback, last active site |
| Existing managerCustomers integration | PASS: 1 test, 0 skips |
| Existing siteProposals integration | PASS: 17 tests including subtests, 0 skips |
| Existing serviceVisits integration | PASS: 3 tests, 0 skips |
| Total requested tests | PASS: 70 tests, 0 failures/skips |
| git diff --check | PASS |
| Reproducible cold runner | PASS end-to-end; disposable database removed afterward |
| Protected schema/template/V6 paths | Working-tree status clean; S3a makes no migration or schema change |
| Web build / browser / offline / physical phone | Not run: S3a makes no web edits; no such acceptance claim |

The cold runner starts its own disposable PostgreSQL on `127.0.0.1:55432`, overrides both database URL environment variables even if already set, runs the suites in separate sequential processes, restores the environment and removes only its own container. It refuses an occupied port/name. Test database credentials in the runner are disposable fixtures only.

```powershell
cd C:\PWA_OfflineRecordWebApp
& .\apps\api\src\routes\verifyManagerCustomerSites.ps1
if ($LASTEXITCODE -ne 0) { throw 'S3a verification failed.' }
cd C:\PWA_OfflineRecordWebApp\apps\api
npm run build
if ($LASTEXITCODE -ne 0) { throw 'API build failed.' }
```

## Files changed by S3a

- `apps/api/src/routes/managerCustomers.ts`: lifecycle endpoints and additive archived-site presentation.
- `apps/api/src/routes/managerCustomerSites.test.ts`: malformed input rejected before transaction access.
- `apps/api/src/routes/managerCustomerSites.integration.test.ts`: real HTTP/PostgreSQL lifecycle, authorization, history, race and rollback coverage.
- `apps/api/src/routes/siteProposals.integration.test.ts`: review-authorized repair of the race-dependent winner assumption; preserves uniqueness and strengthens winning-text/actor assertions.
- `apps/api/src/routes/verifyManagerCustomerSites.ps1`: reproducible cold test runner and cleanup.
- `docs/testing/S3A_SITE_ARCHIVE_RESTORE.md`: contract, test results and sync/history investigation.
- `HANDOVER.md`: S3a checkpoint link and date.

P0 remaining in S3a: 0 identified. P1 remaining in S3a: 0 identified. P2 defects identified in S3a: 0. Product limitations for the next manager UI/acceptance checkpoint: no archive/restore UI yet; archiving the last site leaves no active siteId for a new visit (restore/add/approve a site to regain one); pre-sync archive refusals use existing recovery rules above. These are documented task consequences, not new sync fixes.

Concurrent/unrelated web and `docs/site-proposals/` working-tree edits are outside S3a and were preserved. Historical templates, Postgres/Dexie schema, lockfiles, deployment configuration, client materials and production data were not edited. No staging or Git mutations.

SAFE FOR S3a REVIEW: Y. Next step: focused review, then manager UI work under a separate checkpoint.
