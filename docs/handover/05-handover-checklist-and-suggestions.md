# 5. Handover Checklist and Suggestions

## 5.1 Honest status before you hand over

| Area | Status |
|---|---|
| Features in this pack | Built and tested in the developer environment: browser tests, API tests against a disposable database, and an Android phone (Chrome and installed WebAPK) over a local USB tunnel |
| Production acceptance | **Not done.** The Level 3 checklist ([docs/release/LEVEL3_CHECKLIST.md](../release/LEVEL3_CHECKLIST.md)) records "Client handover: NOT YET": no run on the client's PC, no real domain/HTTPS test, no real Gmail delivery with the client's account, no backup restore drill on the client's PC |
| iPhone | Offline use not tested |
| Docs written from source | Steps in file 01 (Manager CLI) are verified by automated tests, but not run on the client's PC. The Manager-retire SQL in 01 section 1.6 is untested |

Do not describe the system as "production accepted" until the items in 5.2 are done.

## 5.2 Do these before the handover meeting

| # | Task | Why |
|---|---|---|
| 1 | Run the Level 3 checklist on the real client PC and real domain | It is the project's own acceptance gate |
| 2 | On the client PC, run `createAdmin.js` to create **two** Manager accounts (owner plus a trusted second person), and sign in with each | Proves account creation and removes the single point of failure |
| 3 | Delete or clean test data: test customers, test visits (for example `SV-20261011-94`), test accounts such as `mobiletest` | The plan records this as a separate go-live step. Test data is still in the dev database |
| 4 | Make sure no real passwords, tunnel token or `.env` are in the repository or in the pack you hand over | The repo has `.env` locally; it must not be copied across |
| 5 | Set up scheduled backups, an off-PC copy and do one real **restore rehearsal** | Backups that were never restored are not backups |
| 6 | Back up `service-due-email.key` and `.env` into the client's password manager or encrypted storage | Without the key, a restored database loses the saved Gmail password |
| 7 | Send one real test reminder email to an approved address from the client's Gmail | Gmail delivery was only proven on the demo account |
| 8 | Fill in every **[FILL IN]** marker (list in 5.4) | They are the client-specific facts |
| 9 | Test on the technicians' actual phones: install, sign in, prepare offline, fill a form offline, photograph, reconnect, sync | Phone models differ |
| 10 | Complete the company profile (**Settings → Company profile**) with final letterhead details and logo, then generate a sample report PDF for the client to approve | Letterhead goes on every PDF |
| 11 | Walk the client through [02-user-guide.md](02-user-guide.md) live, one role at a time | Handover is a training event, not a file transfer |

## 5.3 Known limits to tell the client

1. **No self-service "forgot password"** for anyone; and **no change-my-password screen**. Managers set Technician and
   Admin passwords; IT resets Manager passwords on the office PC.
2. **Manager accounts cannot be deleted or deactivated from the app**; only by IT using the manual procedure in file 01.
3. **Corrected visits cannot download a PDF yet** (the on-screen report shows the corrections; the PDF button stays off).
4. **Failed, uncertain and missed reminder emails are never retried automatically.**
5. **The office PC is a single point of failure.** If it is off, nobody can sync, and Managers cannot work.
6. Brand-new customers, brand-new sites, report viewing, PDF download and all Manager screens need the internet.
7. An accepted inspection can never be deleted, only corrected with an audit trail.
8. A technician must not clear app data or uninstall before everything has synced.
9. A past phone update discarded old-format repair data once (database version 12). Ask technicians to sync before updates.
10. The app has a large JavaScript bundle (a known warning); first load on a very slow connection is slower than ideal.
11. Developer-recorded open P2/P3 items and phone findings are in [docs/testing/PHONE_TESTING_STATUS.md](../testing/PHONE_TESTING_STATUS.md);
    offline findings still to triage are in [OFFLINE_AUDIT.md](../manager-approvals-settings/OFFLINE_AUDIT.md) (OA-2 to OA-14).

## 5.4 Client-specific facts still to fill in

Search the repository for `[FILL IN` and `[CONFIRM` to find every one. At least:

- Company app address (domain) and who owns the registrar and Cloudflare accounts
- Authorised IT or recovery contact (who may run the Manager commands)
- Sender Gmail account for reminders
- Support name, telephone, email and hours
- Office-PC custodian
- Backup schedule, storage location, retention and the responsible person
- Confirmed runtime folder paths on the client PC
- Whether technicians use Android only, or also iPhone

## 5.5 Suggested additional documents to deliver with the project

These are not yet written. They are listed in the order that adds most value.

| Priority | Document | Content |
|---|---|---|
| High | **Credentials and access register** (in the client's password manager, not on paper in the repo) | Windows login, Docker, domain registrar, Cloudflare, sender Gmail and app password, `.env` copy, email key copy, the two Manager usernames. Who holds each and how to recover it |
| High | **Disaster recovery one-pager** | PC dies: the exact steps and order to rebuild on a new PC from the latest backups, with estimated time and who does it |
| High | **Support and escalation sheet** | Who to call, hours, what to collect before calling (error text, visit reference, Support build, logs), what never to send |
| High | **Technician one-page quick card**, printed or phone wallpaper | Sign in, Refresh, wait for Offline ready, fill, Submit, wait for All synced. The six "never" rules from 3.7 |
| High | **Acceptance sign-off sheet** | The Level 3 checklist reduced to a list the client signs, with date, build number and tester name |
| Medium | **Data protection and retention note** | What personal and business data is stored (names, phone numbers, photos, audit log), who can see it, how long photos and reports are kept, how a staff member's data is handled on leaving. Check Malaysian PDPA obligations with the client |
| Medium | **Software licence and third-party notice** | Who owns the code, any licence terms, Docker Desktop licensing for the client's company size, Cloudflare and Gmail terms. Also a statement of what open-source software is used |
| Medium | **Service level / maintenance agreement** | What is supported after handover, response times, who pays for updates, what counts as a new feature |
| Medium | **Release and change log** | Version, date, build number and plain-language changes for each deployment, so the client can tell what changed |
| Medium | **Architecture overview for the next developer** | One page: the diagram in the root README, the folder map, how to run tests, how migrations work, where each feature lives. Consolidate `docs/architecture/*` and trim the 5,000-line `HANDOVER.md` |
| Medium | **Form and report reference** | For each fire system: the fields, the evidence rules, and a sample PDF, so the client can check them against their paper forms (`docs/paper-forms/` and `docs/report-template/` already hold most of this) |
| Low | **Glossary** | SV, RV, V7, outbox, zone, proposal, Synced: one table in plain words (partly in the older user guide) |
| Low | **FAQ** | The ten questions technicians will ask in the first week |

## 5.6 Suggested product improvements to offer the client later

Not required for handover, but worth listing as a roadmap:

1. A proper **"change my password"** screen and a **Manager management** screen (create, deactivate) that is itself protected.
2. **PDF download for corrected visits.**
3. **Automatic retry or one-click resend** for failed reminder emails.
4. **Scheduled backups built into the stack**, with off-site upload and a restore test report.
5. A **second server or cloud failover** if the office PC downtime becomes a problem.
6. **Camera-first photo capture and a photo-source KPI** (camera vs gallery per technician). A plan exists in
   `docs/photo-and-remarks/`, but no implementation was found in the code.
7. **Offline site requests** and offline reading of already-accepted visits.
8. **iPhone offline test** and, if needed, fixes.
9. **Clean-up of the repository**: remove the many `*.log` files in the project root, merge the old `README.md.txt`,
   and rewrite the root `README.md` (it still says "Phase 1 foundation state" and "does not yet implement inspection forms").

## 5.7 Housekeeping for the repository before it is delivered

- The root `README.md` is out of date and will confuse the next developer. Replace it with a short pointer to this folder.
- Log files at the repository root (for example `debug.log`, `*-release*.log`, `.vite-*.log`) are build and test leftovers;
  `.gitignore` already excludes `*.log`, `.env` and `client-input-private/`, so they stay out of Git, but delete them
  if you deliver the folder by zip or disk rather than from Git.
- Do not deliver `.env`, `node_modules`, `client-input-private`, or any customer data with the source.
- Decide what to do with `client-material/` and `client-input-private/` (client files): return or keep, but do not publish.
- Tag a release in Git (you handle Git) so the delivered build can be reproduced.
