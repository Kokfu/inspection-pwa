# Final check — Email delivery and Save-location features

**Date:** 2026-10-08 · **Branch:** `phase-8e-client-demo-polish` · **Type:** verification only. No product code was changed.
`PHONE_TESTING_STATUS.md` was not updated (to be merged by the owner). Nothing was staged.

Not performed: any real-phone test, any PWA force-close on a phone, any Gmail account other than the one already saved.
The "offline" tests below used the built-in desktop browser with the **API container stopped**
(`docker stop inspection_pwa-api-1`, restarted afterwards); the browser itself stayed online.

---

## Part 1 — Email delivery

### Inspected
`apps/api/src/reminderWorker.ts`, `reminderSmtp.ts`, `reminderCore.ts`, `routes/managerReminders.ts`,
`docker-compose.yml` (reminder-worker, networks), `docs/operations/service-due-email.md`,
Manager Settings → Email reminders (UI), live DB tables (read-only, then one test edit — see Cleanup).

### Tests run
| Command | Result |
|---|---|
| `tsc -p apps/api` (typecheck) | pass |
| `tsx --test reminderCore.test.ts reminderSmtp.test.ts reminderWorker.integration.test.ts` (disposable PG :55432) | 6/6 pass |
| `npx tsc -b` (web) | pass |
| `playwright test manager-email-reminders.spec.ts` | 4/4 pass |
| `git diff --check` | clean |

### Step results
| # | Step | Result |
|---|---|---|
| 1 | Implementation matches the spec (write-only password, AES-256-GCM at rest, fixed smtp.gmail.com:587 STARTTLS with certificate verification, one reservation row per customer + due date + recipient, 09:00 Asia/Kuala_Lumpur, missed/unknown/failed/sent) | PASS |
| 2 | Focused tests | PASS |
| 3 | reminder-worker container up (4 services up; worker logs show only `checked`); key file `service-due-email.key` exists (existence only) | PASS |
| 3b | Worker has no Docker healthcheck (`compose ps` shows only "Up") | NOTE (P3) |
| 4 | TCP 587 to smtp.gmail.com from host: connected. From inside the worker container: 220 banner, EHLO, STARTTLS, TLS 1.3 handshake with a verified certificate | PASS |
| 5 | **Real delivery** with the already-saved sender (`testkk528@gmail.com`) to `kokfu5071@gmail.com`, customer `CUST-81955194D1C2` (non-demo test customer), due date set to 2026-10-09. One cycle run with the worker's own `runReminderCycle` inside the worker container. Delivery row = `sent`, `smtp_accepted_at` set. **Owner confirmed the email arrived.** | PASS |
| 6a | Wrong app password (real Gmail rejection, saved settings untouched, direct `sendGmail` probe) | PASS — category `auth`, `uncertain=false` → recorded `failed`, not retried |
| 6b | Port unreachable (closed local port through the transport seam) | PASS — category `connection`, `uncertain=false` |
| 6c | Empty recipient list | PASS by code and tests — worker query joins on recipients so nothing is sent; status endpoint lists the customer under `gaps`; covered by the integration test and `manager-email-reminders` spec. Not exercised live. |
| 6d | No duplicate on repeat / restart | PASS — second cycle + `docker restart` of the worker: still exactly 1 row for 2026-10-09 |
| 7 | UI: Manager Settings → Email reminders shows "Sender configured", blank write-only password field, SMTP line, next run 2026-10-09 09:00, counts (sent 1, failed 1), recent deliveries with status and error category | PASS |

### Findings
| ID | Sev | Finding |
|---|---|---|
| E-1 | P3 | `reminder-worker` has no Docker healthcheck, so a hung worker (event loop alive but cycles failing) looks "Up". The only signal is the manager screen's delivery history. Suggest a heartbeat row or file + `HEALTHCHECK`. |
| E-2 | P3 (info) | The only earlier attempt (2026-09-29, same customer) failed with `connection` after about 1 s. Egress works now, so the cause (network at that time, or the worker not yet on the `reminder-outbound` network) is unknown. Because there is no automatic retry, one transient failure means that day's reminder is not sent. The doc already states this. |
| E-3 | P3 (info) | Demo customers (`is_demo = true`) are excluded by design from reminders (worker and routes). A demo customer cannot be used to test email. |
| E-4 | Limitation | Only one real Gmail send was performed, with one sender and one recipient. Spam-folder placement and Gmail daily limits were not assessed. A `sent` row means SMTP accepted the message, not that it was read. |

### Verdict — Part 1: **safe to hand to client, with one condition.**
The sender, worker, scheduling, storage and failure handling work, and a real Gmail delivery succeeded end to end.
Condition: on the client PC, repeat the 587 egress probe and one real send with the client's own Gmail app password (the doc already requires this), and back up `service-due-email.key` together with the database backup.

---

## Part 2 — Save-location features

### Inspected
`ManagerCustomerConfiguration.tsx`, `ManagerLocationProposals.tsx`, `routes/managerCustomers.ts` (locations PUT/GET),
`routes/locationProposals.ts`, `inspections/locationConfiguration.ts`, `inspections/locationProposal.ts`,
`jobs/TechnicianLocationProposal.tsx`, `jobs/technicianLocationProposalDraft.ts`.

### Tests run
| Command | Result |
|---|---|
| `tsx --test locationConfiguration.test.ts locationProposal.test.ts` | pass |
| `tsx --test` managerLocations, locationProposals, managerFm200Locations integration (disposable PG) | pass when run one file at a time (first parallel run: 2 failures, caused by files sharing and dropping one test database; not a product bug) |
| web `tsx --test locationProposalList.test.ts locationProposalReviewShape.test.ts` | 8/8 pass |
| `playwright test` manager-locations, technician-location-proposal-sync, supervisor-location-proposals, location-proposals-unreadable, manager-customer-configuration | 10/10 pass |
| web `tsc -b`, `git diff --check` | pass |

### Walkthrough (test customer "ZZ Final Check Location Test", `CUST-6F5AD192B09D`, created for this check; real customers not touched)
| # | Step | Result |
|---|---|---|
| 3a | Admin add / edit (rename) / remove a location; reload; persists (API, plus add through the UI editor, verified by re-read) | PASS |
| 3a-i | Admin editor: save with a blank location name | PASS (server refuses 400) but see **L-3** |
| 3b | Technician proposes a location with the API stopped; Submit queues it; fresh page load while still offline keeps it (Pending, attempts 0); API restored, Reconnect → Completed after 1 attempt; **exactly one** server row | PASS (needs a workaround for **L-1**) |
| 3b-i | Saved (not submitted) draft survives a reload | **FAIL — L-2** |
| 3c | Supervisor approves one, rejects another (with note); customer config contains only approved names; a **new** visit freezes the approved set; existing visit keeps its frozen set | PASS |
| 3c-i | Reject without a note | PASS (clear message); decisions are terminal (re-decide → 409) |
| 3c-ii | Approve a proposal whose zone no longer exists | PASS (409, clear UI message) |
| 3d | Duplicate location name | **L-4** (accepted by design of code; no rejection) |
| 3d | Empty name / 300-char / 301-char / special characters (`<b>"Q" & 'A' 日本 😀</b>`) / unknown system key / malformed or extra-key payload / bad UUID / non-technician submit / unauthenticated | PASS — all fail closed with specific codes; special characters render as plain text in the supervisor UI |
| 3d | Same proposal id replayed | PASS — 200, no duplicate; same id with a changed body → 409 |
| 3d | Same `locationKey` proposed twice | PASS — 409 already pending |
| 3d | Two **different** technicians proposing the same location | NOT TESTED live (only one technician login with a job on this customer); covered by the code path (advisory lock per customer + system + location key) and `locationProposals.integration.test` |
| 3e | 360 px: Supervisor Location Proposals page, technician proposal form, admin screens' controls | PASS — no horizontal overflow, all controls ≥ 44 px, text ≥ 16 px. The admin location editor itself was measured only via the page structure, not controls individually. |
| 4 | Legacy FM200 proposal `678f1e17` | Not modified by me. It currently shows as **Rejected** (changed by the other chat's work), and the Rejected tab still shows "1 proposal cannot be shown" with the readable proposals listed beside it. |

### Findings
| ID | Sev | Finding | Evidence | Proposed minimal fix |
|---|---|---|---|---|
| **L-1** | **P2** | Technician **Submit for Review stays disabled** with the default zone shown. The Zone dropdown displays "Ground Floor", but the draft's `zoneKey` is `null`; the Submit condition (`!patch.zoneKey && !newZone…`) therefore blocks it, no message explains why, and choosing the already-selected option fires no change event. Workaround that works: click "New zone", then "Existing zone" again. | `TechnicianLocationProposal.tsx:150` and the new-draft default at `technicianLocationProposalDraft.ts:43` (`zoneKey: null`). Reproduced live, online and offline. | Initialise `zoneKey` to the first existing zone key when the system has zones, in the draft creation or effect, or derive the select value from the patch. |
| **L-2** | **P2** | A saved add-location **draft is never found again** after reload or leaving the screen. The effect looks the draft up with `newAddLocationDraft(...).patch.locationKey`, a **freshly generated random key** on every load, so it can never match the stored key. The "Location draft saved on this device" message is misleading. Submitted proposals are unaffected (they live in the outbox). | `TechnicianLocationProposal.tsx:38-39`, `technicianLocationProposalDraft.ts:31-34,40-46`. Reproduced: typed name, Save Draft, API stopped, fresh load → blank name. Offline-contract relevance: drafts must survive refresh. | Look up the existing draft for `(jobId, systemKey)` by prefix/index (or store one draft per job + system under a stable key) before creating a new one. |
| L-3 | P2 | Admin zone/location editor: a failed save shows its message about 1,500 px above the Save button and does not scroll to it, and the text is generic ("The zone/location payload is invalid for this system."). The admin sees nothing happen. | Measured: message at y≈513, Save button at y≈2079; blank name → PUT 400. | Scroll/focus the alert on error and/or show it next to Save; map "empty name" to a specific message, ideally validate before sending. |
| L-4 | P3 | Nothing rejects **duplicate location (or zone) display names**. Only keys must be unique. The admin PUT and two approved technician proposals both produced two "Server Room" entries on one customer; technicians then see two identical rows. | API case D; proposals P1 and P3 approved → config "Main Lobby \| Server Room \| Server Room". | Reject case-insensitive duplicate names within a zone/system on the admin PUT and at approve time (409, supervisor sees why). |
| L-5 | P3 | Header says "All submitted changes synced" while a location proposal is Pending in the outbox (and while the header shows "Offline"). Proposals are not counted in the header summary. | Observed in the offline test. | Include `technicianLocationProposal` outbox items in the unsynced count. |
| L-6 | P3 | After the API returns, the header stayed "Offline" for more than 10 s until **Reconnect** was pressed in this browser. Not re-tested on a phone. | Observed. | Informational; the phone register notes auto-probe every 20 s while visible. |
| L-7 | P3 | Radio buttons in the proposal form are stretched to the full row width at 360 px, so the dot appears centred above its label. | Screenshot; measured 310×44. | CSS only. |
| L-8 | P3 | `listLocationProposals` runs one query per proposal (N+1). Fine now; slow with hundreds. | `inspections/locationProposal.ts:112` | Single query for decisions. |

### Limitations
Browser tests used the desktop built-in browser, not a phone; "offline" = API container stopped. No PWA force-close was done. A second technician was not available for the cross-technician case. Test data created on the live local database is listed below.

### Verdict — Part 2: **not yet, because of L-1 and L-2.**
Server side, approval logic, idempotency, validation and the supervisor screen are solid and fail closed. But a technician cannot submit a proposal with the default zone without a hidden workaround (L-1), and a typed-and-saved draft is lost on refresh (L-2). L-3 makes an admin's failed save look like nothing happened. These are small, local fixes; recommend fixing L-1/L-2/L-3 and retesting on the phone before handing to the client. L-4 is a decision for the owner.

---

## Test data left on the **live local** database (nothing deleted; awaiting owner's call)
- Customer `ZZ Final Check Location Test` (`CUST-6F5AD192B09D`), 8 proposals (incl. 2 approved "Server Room", approved "Offline Annex UI", rejected "Rejected Spot", rejected "Ghost", one pending special-characters proposal), 2 visits SV-20261008-77 and -78, locations edited by the checks.
- Email test: customer `CUST-81955194D1C2` due date was restored to 2026-09-30; a reminder plan for 2026-10-09 with its recipient and one `sent` delivery row (2026-10-08) remain. The `sent` row means this customer will not be emailed again for 2026-10-09.
- Disposable Postgres container used for tests was removed.

---

## Addendum — L-1, L-2, L-3 fixed in source (2026-10-08, owner-approved)

Web only. No API, schema, Dexie schema/version, Docker or lockfile change. **Not yet rebuilt or retested on a phone** (the owner rebuilds the containers).

| ID | Fix | Files |
|---|---|---|
| L-1 | A new add-location draft starts on the job's first zone (so the zone shown is the zone saved); with no zones it starts on an empty "new zone" that must be named. A draft saved before this fix with neither zone is started on the first zone when reopened. | `jobs/technicianLocationProposalDraft.ts` (`newAddLocationDraft`), `jobs/TechnicianLocationProposal.tsx` |
| L-2 | New `loadLatestAddLocationProposalDraft(jobId, systemKey)` finds the stored draft by its job + system key prefix (the per-draft `locationKey` is random, so the screen could never rebuild it). The screen resumes it, including Pending / Failed / Synced states, and "Add another location" uses the same zone default. | same two files |
| L-3 | Blank zone or location names and locations without a zone are refused locally with a specific message (nothing is sent); every save outcome now renders directly above the Save button and is scrolled into view. A load failure is still shown at the top. | `manager/ManagerCustomerConfiguration.tsx` (`ManagerLocationsEditor`) |

Regression coverage (each fails on the original source, restored with `git show HEAD:<file>`, and passes now):
- `tests/technician-location-proposal-form.{html,spec.ts}` — mounts the real screen on IndexedDB: name alone enables Submit; Save Draft then remount restores it with no second draft row; Pending survives a remount; zoneless job offers a zone-name field. Wired into `npm run test:location-proposal-sync`.
- `tests/manager-locations-save-feedback.{html,spec.ts}` — 80-row editor: blank name / no zone refused with no request; server refusal; each message in view just above Save. Wired into `npm run test:locations-manager`.

Checks: web `tsc -b` pass; 14 location/manager-editor Playwright specs pass (incl. the two new); `git diff --check` clean. Full Playwright not re-run. Still open from the report: L-4 (duplicate names, owner decision) and P3 items L-5…L-8, E-1…E-3.
