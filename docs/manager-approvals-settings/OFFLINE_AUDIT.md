# Technician offline audit

Audit date: 2026-10-20 (Asia/Kuala_Lumpur). Read-only implementation audit; only this file was written. This describes the source inspected, not a newly deployed or phone-accepted release. Code role `admin` means Manager; `supervisor` means Admin.

## 1. Owner summary

- Sign in and prepare the device while connected before going to a site without signal.
- With a saved identity and app shell, the technician can reopen cached jobs without a connection.
- Prepared, open jobs support inspection entry, draft saves, camera photos and local submission.
- Starting an unopened system is inconsistent: some require a recent preparation check; others do not.
- An existing-site service visit can be created offline when its customer, site and setup are cached; its SV number arrives after sync.
- Suppression systems without configured locations can prevent that offline visit creation.
- The standalone Add Customer page can save and queue offline; the Add Customer shortcut inside New Service Visit cannot.
- Add new site still requires the server; an offline site request (S4) is not implemented.
- Current repair visits support cached setup, local entry, Not Done, photos and submission; their new screens have no recorded phone acceptance.
- Reconnection can send queued work automatically; local submission alone does not mean the server has accepted it.
- Accepted inspections are not generally downloaded for offline reading; Final Report, PDF and server-job completion/deletion need the server.
- Wait for a confirmed local save before closing; the original PHONE-SAVE-01 problem remains unresolved.
- A serious update risk remains: database version 12 deletes old repair records, photos and queued work even when unsynced.
- This is not release acceptance: no phone test was performed; follow-up browser testing covered 37 distinct specs with one intermittent failure that passed on rerun.

## 2. Capability matrix

All paths below are repository-relative; `path:line` points to source or a recorded test. `Phone` abbreviates `docs/testing/PHONE_TESTING_STATUS.md`. Dates/builds in the last column are historical records read during this audit, never tests run here.

Assumptions: technician role, same user's workspace, valid open job and compatible cached catalog. **Prepared** means job/configuration/catalog downloaded and a successful accepted-summary check no more than three days old; **unprepared** means that confirmation is absent/stale, even if the job/catalog exist. A job/catalog absent altogether cannot be invented offline. Existing unsynced drafts are distinguished from never-opened systems. **Unreachable** means transport failure, timeout or gateway 502/504; a deliberate server refusal, malformed authority or other HTTP error is not an offline permission grant. Wi-Fi being up does not establish reachability. Auth verification can temporarily hide the workspace before cached access is restored.

The prompt's “11 systems” is ambiguous against this checkout: there are the 11 non-Portable systems below **plus Portable Fire Extinguisher**, also routed in the technician UI. Both are included to avoid omitting an implemented action. The requested “5 gated vs 6 not” split is not supported by current source: among the 11 non-Portable systems, **6 are gated and 5 are not**; Portable makes **7 gated of 12**. See OA-3.

| Technician action | Online | Offline (no network) | Server unreachable with Wi-Fi up | Evidence (file:line) | Last phone-verified |
|---|---|---|---|---|---|
| Sign in with credentials | Server required | Cannot sign in anew | Cannot sign in anew | `apps/web/src/auth/authApi.ts:80`; `apps/web/src/App.tsx:1594` | 2026-10-20, `20261020T052523Z`, Phone:113; online only |
| Restore previous session | Verify `/auth/me` | Cached identity permits unverified technician workspace, unless explicitly signed out | Cached identity after failed/timed-out probe or 502/504; deliberate auth failure closes access | `apps/web/src/auth/authApi.ts:27`; `apps/web/src/auth/authRestoration.ts:13`; `apps/web/src/auth/authStateRepository.ts:19` | 2026-10-20, `20261020T052523Z`, offline Chrome + WebAPK reopen, Phone:113 |
| Job list | Refresh server jobs/reference data | Previously cached jobs plus local visits only | Cached jobs remain usable after auth recovery; refresh reports failure | `apps/web/src/App.tsx:780`; `apps/web/src/App.tsx:818`; `apps/web/src/jobs/TechnicianHome.tsx:343` | 2026-10-20, `20261020T052523Z`, Phone:113; broad cached-list proof 2026-10-12 `052303Z`, Phone:128 |
| Download for offline / prepare service job | Jobs/reference data and summary confirmations refresh automatically; no per-job download button found in current job screen | Cannot download missing references; existing cache usable | Cannot download missing references | `apps/web/src/App.tsx:827`; `apps/web/src/App.tsx:808`; `apps/web/src/jobs/TechnicianHome.tsx:328`; `apps/web/src/jobs/ServiceJobCard.tsx:28` | Automatic preparation: 2026-10-08, `build-20261008T045852Z`, Phone:363; current per-job button: not phone-tested (not found) |
| Download for offline (current repair setup) | Customer-wide field lists, sites and Before photos; partial failures reported | Download disabled; existing cached data remains | Download fails, preserves saved data | `apps/web/src/repairVisits/NewRepairVisit.tsx:155`; `apps/web/src/repairVisits/NewRepairVisit.tsx:197`; `apps/web/src/repairVisits/repairVisitOffline.ts:100` | not phone-tested; old repair download in Phone:118 is browser-pane evidence only |
| New Service Visit, cached customer/site/setup | Create via server; requestId retained while mounted | Create local UUID + Pending visit/outbox; SV reference assigned at sync; CO2/FM200/Wet Chemical require configured locations | Switches to cached mode; a failed online Create requires another tap and warns that server outcome is uncertain | `apps/web/src/jobs/NewServiceVisit.tsx:209`; `apps/web/src/jobs/NewServiceVisit.tsx:260`; `apps/web/src/jobs/offlineServiceVisitLocal.ts:61`; `apps/web/src/jobs/offlineServiceVisitLocal.ts:112` | 2026-10-20, `20261020T052523Z`, exact local UUID/reconnect/force-close, Phone:113; Wi-Fi-up outage variant not phone-tested |
| New Service Visit, no cached customers/sites/setup | Load required data, then create | Cannot create: explicit missing-cache message; typed call number is only component state | Same missing-cache limit after fallback | `apps/web/src/jobs/NewServiceVisit.tsx:100`; `apps/web/src/jobs/NewServiceVisit.tsx:126`; `apps/web/src/jobs/NewServiceVisit.tsx:212` | not phone-tested |
| Add Customer, standalone sidebar page | Autosave locally, queue, then send | Draft can be entered/saved; Create queues if service formats cached; with no formats, save details only; new customer unavailable for visits until synced | Local draft/queue preserved on failed send | `apps/web/src/jobs/TechnicianAddCustomer.tsx:53`; `apps/web/src/jobs/TechnicianAddCustomer.tsx:71`; `apps/web/src/jobs/technicianCustomerDraft.ts:63` | Current offline queue: not phone-tested; online customer creation only, 2026-10-12 `172425Z`, Phone:135 |
| Add Customer, shortcut inside New Service Visit | Direct server create | Opening shortcut refused; already-open text has no persistent draft | Server call fails; no local customer queue from this shortcut | `apps/web/src/jobs/NewServiceVisit.tsx:169`; `apps/web/src/jobs/NewServiceVisit.tsx:186` | Online shortcut 2026-10-10 `041229Z`, Phone:122; offline not phone-tested |
| Add new site (S4) | New-site visit and site proposal created by server; approval is separate | Create disabled in add-site mode; typed fields stay editable while mounted, not persisted | Cannot create/queue site; unknown outcome warning after failed POST | `apps/web/src/jobs/NewServiceVisit.tsx:157`; `apps/web/src/jobs/NewServiceVisit.tsx:238`; `apps/web/tests/new-service-visit-add-site.spec.ts:97` | Online S1-S3 2026-10-20 `20261020T052523Z`, Phone:113; offline S4 not phone-tested |
| Open Hydrant, prepared / unprepared | Check accepted authority, otherwise local draft | Prepared: new draft allowed; unprepared: existing draft only, new start refused | Same preparation fallback on transport failure; deliberate answer fails closed | `apps/web/src/hydrant/hydrantResolution.ts:109`; `apps/web/src/hydrant/hydrantResolution.ts:139` | 2026-10-12 `052303Z`, cached draft/force-close, Phone:128; never-opened A1 for this system not phone-tested |
| Open Hose Reel, prepared / unprepared | Accepted-summary lookup before local open | Both can start with cached job/catalog; no A1 freshness gate | If auth remains verified, pre-open lookup can fail before local open; restored offline-unverified path opens cache | `apps/web/src/App.tsx:1725`; `apps/web/src/hoseReel/hoseReelRepository.ts:180`; `apps/web/src/hoseReel/hoseReelAuthority.ts:7` | 2026-10-12 `052303Z`, draft/Pending/reconnect, Phone:128 |
| Open Automatic Sprinkler, prepared / unprepared | Resolve server/local; unconfirmed local visit skips server lookup | Both can start from cached job/catalog; no A1 gate | Existing local open path works; no-local verified lookup throws instead of using A1; after offline auth restore cached start works | `apps/web/src/automaticSprinkler/automaticSprinklerResolution.ts:68`; `apps/web/src/automaticSprinkler/automaticSprinklerResolution.ts:90` | 2026-10-11 `101813Z`, offline submission/reload, Phone:120; outage/no-local distinction not phone-tested |
| Open CO2, prepared / unprepared | Initialize local location group; accepted details resolve separately | Both can initialize cached configured locations without A1; missing locations fail | Initialization local; server detail uses local fallback only for unreachable errors | `apps/web/src/App.tsx:1748`; `apps/web/src/co2/co2Repository.ts:118`; `apps/web/src/co2/co2Authority.ts:7` | 2026-10-10 `145037Z`, photos/local submit/force-close/sync, Phone:119 |
| Open Wet Chemical, prepared / unprepared | Shared suppression group, then per-location form | Both use cached locations/catalog without A1; missing locations fail | Same local initialization; accepted-detail refusal still fails closed | `apps/web/src/App.tsx:1758`; `apps/web/src/co2/co2Repository.ts:124`; `apps/web/src/wetChemical/wetChemicalAuthority.ts:18` | not phone-tested for current offline workflow (Phone:120 explicitly excludes Wet Chemical) |
| Open FM200, prepared / unprepared | Initialize local configured-location group | Both use cached locations/catalog without A1; missing locations fail | Local initialization available; authoritative detail only falls back on transport failure | `apps/web/src/App.tsx:1770`; `apps/web/src/fm200/fm200Repository.ts:116`; `apps/web/src/fm200/fm200Authority.ts:7` | not phone-tested for full current offline round trip; corrected-copy UI-only spot check is recorded in Phone:482 |
| Open Dry/Wet Riser, prepared / unprepared | Local existing record or server check/new draft | Prepared: new draft allowed; unprepared: existing draft only | Same gate on transport failure; deliberate errors fail closed | `apps/web/src/dryWetRiser/dryWetRiserResolution.ts:25`; `apps/web/src/App.tsx:1826` | 2026-10-12 `034402Z`, cached draft/force-close/sync, Phone:133 |
| Open Fire Alarm, prepared / unprepared | Existing unsynced local or accepted server/new draft | Prepared: new draft allowed; unprepared: existing unsynced draft only; Synced local routes need server | No-local transport failure uses A1; routed local fallback available on transport failure | `apps/web/src/fireAlarm/fireAlarmResolution.ts:21`; `apps/web/src/fireAlarm/fireAlarmResolution.ts:41` | 2026-10-11 `101813Z`, camera/save/online submit, Phone:120; never-opened offline A1 not phone-tested |
| Open Smoke Ventilation, prepared / unprepared | Server authority before new local start | Prepared: new draft allowed; unprepared: existing draft only | Same preparation fallback on unreachable server | `apps/web/src/smokeVentilation/smokeVentilationResolution.ts:109`; `apps/web/src/smokeVentilation/smokeVentilationResolution.ts:141` | 2026-10-08 `build-20261008T045852Z`, never-opened offline A1, Phone:363 |
| Open Fire Intercom, prepared / unprepared | Server authority before new local start | Prepared: new draft allowed; unprepared: existing draft only | Same preparation fallback on unreachable server | `apps/web/src/fireIntercom/fireIntercomResolution.ts:109`; `apps/web/src/fireIntercom/fireIntercomResolution.ts:141` | 2026-10-08 `build-20261008T045852Z`, never-opened offline A1, Phone:363 |
| Open Fire Rated Roller Shutter, prepared / unprepared | Server authority before new local start | Prepared: new draft allowed; unprepared: existing draft only | Same preparation fallback on unreachable server | `apps/web/src/fireRatedRollerShutter/fireRatedRollerShutterResolution.ts:109`; `apps/web/src/fireRatedRollerShutter/fireRatedRollerShutterResolution.ts:141` | 2026-10-10 `092129Z`, offline native autosave, Phone:139; 2026-10-10 sequence in Phone:6 records offline submit/WebAPK reopen, but does not attach one unambiguous build to that entire sequence |
| Open Portable Fire Extinguisher (additional routed system), prepared / unprepared | Accepted-summary check then local | Prepared: new draft allowed; unprepared: existing draft only | Same A1 fallback on unreachable server | `apps/web/src/portableFireExtinguisher/portableFireExtinguisher.ts:26`; `apps/web/src/jobs/SystemNavigator.tsx:81` | not phone-tested for current full offline round trip |
| Draft save / autosave, open inspection | IndexedDB first; no API needed | Same controls and local validation; wait for successful save | Same local save; auth re-verification can temporarily unmount form | `apps/web/src/inspectionControls/draftAutosave.ts:30`; `apps/web/src/inspectionControls/useDraftAutosave.ts:49`; `apps/web/src/hoseReel/hoseReelRepository.ts:192` | Hydrant/Hose Reel 2026-10-12 `052303Z`, Phone:128; not proof for every system |
| Camera / choose photo | Process and store Blob in IndexedDB; permissions required | Available on editable drafts with camera permission/secure context; photo must finish saving | Same local capture/storage; no upload confirmation implied | `apps/web/src/attachments/attachmentRepository.ts:57`; `apps/web/src/repairVisits/RepairItemCard.tsx:142`; `docs/architecture/12-offline-photo-evidence.md:21` | Inspection camera 2026-10-11 `101813Z`, Phone:120; old repair camera 2026-10-14 `090618Z`, Phone:117 |
| Submit Locally (inspection) | Validate, freeze payload/evidence, atomic Pending + outbox; sync later | Same, no network required | Same; failed sends preserve local work | `apps/web/src/hoseReel/hoseReelRepository.ts:288`; `apps/web/src/co2/co2Repository.ts:339` | 2026-10-12 `052303Z`, Hose Reel, Phone:128; 2026-10-11 `101813Z`, Sprinkler/Hydrant, Phone:120 |
| Trigger sync | Verified identity + work: launch/reconnect, visible, 60s timer; manual sync | Queue remains; no confirmed success | Attempts fail or remain pending; recovery depends on authentication and retry triggers | `apps/web/src/App.tsx:1190`; `apps/web/src/App.tsx:1505`; `apps/web/src/sync/autoSync.ts:31` | 2026-10-20 `20261020T052523Z`, site visit/proposal reconnect, Phone:113-115; outage timing not phone-tested |
| Sync dependency order | Visit confirmed first; V6/V7 evidence stages before inspection acceptance; legacy attachments after parent; repair create -> photos -> submit | No transfers; dependencies retained | Parent/receipt failures hold dependent work | `apps/web/src/sync/syncEngine.ts:601`; `apps/web/src/sync/syncEngine.ts:612`; `apps/web/src/sync/syncEngine.ts:803`; `apps/web/src/repairVisits/repairVisitSync.ts:100` | V7 2026-10-11 `101813Z`, Phone:120; offline visit receipt 2026-10-20 `20261020T052523Z`, Phone:113; new repair order not phone-tested |
| View accepted inspection | Fresh parsed server detail is authority | Some locally submitted copies can display read-only, but no general accepted-detail download; Hydrant/Smoke/Intercom/Roller/Fire Alarm offline Synced route refused; closed-job entry requires connection | Certain existing-local routes allow transport-only fallback; malformed/refused server detail must not fall back | `apps/web/src/hydrant/hydrantResolution.ts:69`; `apps/web/src/fireAlarm/fireAlarmResolution.ts:21`; `apps/web/src/hoseReel/hoseReelAuthority.ts:7`; `apps/web/src/App.tsx:1753` | Online 2026-10-12 `052303Z`, Phone:129; current cross-system offline accepted matrix not phone-tested |
| Final Report view | Server-built accepted/corrected projection | Cannot freshly load; an already-mounted in-memory report may remain visible | Request fails; no persistent report fallback | `apps/web/src/jobs/FinalReportView.tsx:11`; `apps/web/src/jobs/finalReportApi.ts:1` | 2026-10-12 `052303Z`, Phone:126 |
| Download service PDF | Server required; report approval enforced server-side | Cannot generate/download anew; previously exported file belongs to OS storage | Download fails; no offline generation | `apps/web/src/jobs/FinalReportView.tsx:17`; `apps/web/src/jobs/finalReportApi.ts:1`; `docs/testing/PHONE_TESTING_STATUS.md:119` | Server PDF bytes/embedded images 2026-10-11 `101813Z`, Phone:120; physical export/view is not established by that API check |
| Complete job / service | Server rechecks accepted work | Refused; not queued | Fails, job not locally assumed complete | `apps/web/src/App.tsx:1523`; `apps/web/src/jobs/TechnicianHome.tsx:429` | 2026-10-12 `052303Z`, real tap, Phone:126 |
| Delete server job | Server delete/soft archive with confirmation and eligibility | Refused; not queued | Fails without claiming removal | `apps/web/src/App.tsx:1548`; `apps/web/src/App.tsx:1567`; `apps/web/src/jobs/TechnicianHome.tsx:301` | not phone-tested for current destructive path |
| Delete never-synced local visit | Local eligibility/confirmation; sending/inspection work prevents unsafe deletion | Available for eligible empty unsynced visit | Same local eligibility; uncertain server outcome needs attention | `apps/web/src/jobs/offlineServiceVisitLocal.ts:151`; `apps/web/src/jobs/TechnicianHome.tsx:412` | not phone-tested |
| Create current repair visit | Local-first create with cached/fresh field catalog; server allocates RV number | Cached customer/site/catalog required; new local UUID and outbox commit together | Falls back to cached catalog for transport failure; definite refusal/malformed refresh fails | `apps/web/src/repairVisits/NewRepairVisit.tsx:24`; `apps/web/src/repairVisits/NewRepairVisit.tsx:137`; `apps/web/src/repairVisits/repairVisitRepository.ts:28` | not phone-tested; Phone:116-117 concern the removed repair-record model |
| Repair Not Done | Persist outcome/reason; current model requires own After photo too | Same local entry and validation | Same local entry | `apps/web/src/repairVisits/RepairItemCard.tsx:137`; `apps/web/src/repairVisits/RepairItemCard.tsx:173`; `apps/web/src/repairVisits/repairVisitRepository.ts:174` | Current model not phone-tested; old local-only Not Done marker 2026-10-17 `20261017T043839Z`, Phone:116 |
| Repair Compare / Before-After | Before/After panels embedded in form; no old standalone Compare/Print action found | Cached integrity-checked Before photo + local After photo shown; missing Before photo says so | Failed missing-photo fetch cannot manufacture a cached image | `apps/web/src/repairVisits/RepairItemCard.tsx:42`; `apps/web/src/repairVisits/RepairItemCard.tsx:162`; `apps/web/src/repairVisits/repairVisitOffline.ts:100` | Current panels not phone-tested; old Compare offline 2026-10-17 `20261017T043839Z`, Phone:116; old Print was untested |
| Submit current repair visit | Flush local remarks, validate result/remark/photo for every item, freeze, queue; create/photos/submit receipts checked | Same local Submit; photo required for Not Done as well | Same local freeze; uncertain transfers retained for retry | `apps/web/src/repairVisits/RepairVisitForm.tsx:53`; `apps/web/src/repairVisits/repairVisitRepository.ts:174`; `apps/web/src/repairVisits/repairVisitSync.ts:100` | not phone-tested; old repair submit 2026-10-14 `090618Z`, Phone:117 is historical only |
| Location proposal create/save/submit | Local draft + immutable pending operation, server review separate | Works from job snapshot; queued for sync | Local work retained; failures/held-already-pending states explicit | `apps/web/src/jobs/TechnicianLocationProposal.tsx:138`; `apps/web/src/jobs/technicianLocationProposalDraft.ts:1` | 2026-10-20 `20261020T052523Z`, real HTTPS offline/Chrome force-close/reconnect, Phone:114 |
| Location proposal withdraw | Fresh server status; persisted stable withdrawal requestId, then POST and GET | Server withdrawal unavailable; eligible never-sent local request may instead be discarded after confirmation | Preserve mutation identity, no assumed decision; refresh required | `apps/web/src/jobs/TechnicianLocationProposal.tsx:292`; `apps/web/src/jobs/TechnicianLocationProposal.tsx:352`; `apps/web/src/jobs/technicianLocationProposalDraft.ts:62` | 2026-10-20 `20261020T052523Z`, Phone:114-115 |
| Location proposal revise/resubmit | Fresh rejected/withdrawn proposal can start new local UUID revision | Existing revision draft editable/queueable; cannot choose a fresh server decision offline | No stale review decision displayed; existing local revision retained | `apps/web/src/jobs/TechnicianLocationProposal.tsx:309`; `apps/web/src/jobs/TechnicianLocationProposal.tsx:327`; `apps/web/src/jobs/technicianLocationProposalDraft.ts:54` | 2026-10-20 `20261020T052523Z`, Phone:115; full offline revision edit not phone-tested |
| Sign out | Warn about unsynced work; end local identity and server session; local records retained | Local sign-out works; pending server logout prevents cached re-entry; need connection to sign in again | Same local sign-out, deferred server logout | `apps/web/src/App.tsx:1641`; `apps/web/src/auth/authStateRepository.ts:66` | not phone-tested for complete current offline/deferred-logout sequence |

## 3. Logic and persistence

### Authentication and readiness

`authState` in the device database stores identity/last verification and explicit/deferred logout flags, not a reusable offline password. The business workspace is `inspection-pwa:user:<id>`; no identity uses `inspection-pwa:locked` (`apps/web/src/db/localDatabase.ts:292-315`). On restore the app loads cached identity/jobs, enters **verifying**, and asks `/api/auth/me` with a five-second timeout. A verified response restores server authority; 401/403 clears it; transport failure/502/504 with cached identity becomes **offline-unverified**; other HTTP/JSON failures become **online-unavailable**, not cached authority (`authRestoration.ts:13`, `authApi.ts:44`, both under `apps/web/src/auth/`). While restoring/verifying/online-unavailable, the workspace is hidden (`apps/web/src/App.tsx:984`, `:2369`). Offline-unverified is technician access, not Manager/Admin server authority. This is a real interruption during re-verification, not continuous editing through every connection transition.

There are two separate readiness indicators. App-shell **Offline ready** checks service-worker control plus the existence of a precache-named cache; it is not proof of cached jobs, photos, auth or every asset's integrity (`apps/web/src/pwa/offlineReadiness.ts:10-35`). Job **Ready for offline use** checks summary-confirmation age, not every enabled contract/Blob. `jobReadyForOffline` passes an empty system key, so a ready job can still have a particular already-accepted system refused offline (`apps/web/src/jobs/offlineStartReadiness.ts:85`). The gate rejects future timestamps and age over three days. An unsynced device-created service visit bypasses confirmation age because it cannot yet have a server acceptance (`offlineStartReadiness.ts:60`). Browser online status is a scheduling hint.

### IndexedDB stores actually used

| Store | Purpose |
|---|---|
| Device `authState` | Last identity, verification, explicit logout and pending server logout. |
| Workspace `referenceData` | Catalog/templates, customer/configuration reference data, jobs by user, sites and maintenance metadata. Cache getters generally read payloads; an `expiresAt` field alone is not a universal offline expiry gate. |
| `drafts` | Generic drafts, per-job offline-start confirmations, standalone customer requests and per-target location proposal drafts/withdrawal identity. |
| `inspectionRecords`, `masterSystemInspections` | Generic and single-system local inspection payloads/statuses. |
| `masterSystemInspectionGroups`, `masterSystemFormInstances` | CO2/Wet Chemical/FM200 configured-location groups/records. |
| `inspectionAttachments` | Processed photo Blobs, hashes, metadata, field identity and evidence status. |
| `offlineServiceVisits` | Stable local job UUID/request, provisional job snapshot, receipt and sync state. |
| `rvVisits`, `rvItems`, `rvPhotos` | Current repair visit, field responses and After-photo Blobs. |
| `rvPreviousVisits`, `rvBeforePhotos` | Downloaded repair field catalogs/previous visits and integrity-checked Before photos. |
| `syncOutbox` | Frozen metadata/payload operations, active key, attempts, timestamps, last error and delivery state. |
| `testRecords` | Retained development/regression slice, not the technician inspection system. |

Evidence: `apps/web/src/db/localDatabase.ts:108-125`, `:262-284`; `apps/web/src/referenceData/referenceDataCache.ts:47`, `:147`; `apps/web/src/jobs/offlineServiceVisitLocal.ts:16`; `apps/web/src/repairVisits/repairVisitOffline.ts:34`. Five old repair stores are **dropped**, not retained/quarantined; see OA-1.

### States, sender and triggers

Business records use Draft/Pending/Syncing/Synced/Failed/Conflict (repair photos also Uploading). **Outbox does not have Synced or Conflict**: its actual states are Pending, Syncing, Failed, Completed (`apps/web/src/db/localDatabase.ts:59`). Repositories write Draft and atomically freeze a locally submitted record + Pending operation. The engine claims Syncing, increments attempts, and marks only confirmed UUIDs Synced / operations Completed; rejected or unconfirmed work becomes Failed, or a business-record Conflict with a Failed outbox. Terminal inspection conflicts are filtered out of later sends (`apps/web/src/sync/syncEngine.ts:195`, `:642`, `:712-799`). Different protocols deliberately use different retry classifications: offline visit/repair transient failures return to Pending; definitive refusals become Failed/Conflict (`apps/web/src/jobs/offlineServiceVisitSync.ts:109-145`; `apps/web/src/repairVisits/repairVisitSync.ts:43-74`). A server review status such as Awaiting Approval is separate from Synced delivery.

Verified session + ready database is required to send. The app requests automatic sync on entering verified (launch and reconnect), becoming visible, and each 60-second tick while visible (`apps/web/src/App.tsx:1190-1208`). A local submit is not universally an immediate sync trigger; current repair and customer/proposal screens also request their own sends. Manual Sync bypasses the automatic Web Lock. Per-tab engine single-flight prevents overlapping engine runs; automatic senders additionally take `inspection-auto-sync` with Web Locks `ifAvailable`; no Web Locks falls back to per-tab sending (`apps/web/src/sync/syncEngine.ts:579`; `apps/web/src/sync/autoSyncLock.ts:1`). This is foreground coordination, not Service Worker Background Sync or guaranteed execution after force-close.

Connectivity recovery re-probes authentication immediately, then at delays 350ms, 1s, 2.5s; it is bounded, not an endless health poll (`apps/web/src/auth/connectivityRecovery.ts:1`). L-6's untapped recovery timing remains unverified. A verified session is not proof that the next API write will succeed.

### Ordering and confirmations

The order is **not** one universal “visit -> inspection -> evidence -> attachments” sequence:

1. Recover interrupted items, then confirm queued service visits; unconfirmed/refused job IDs hold their inspections/evidence (`apps/web/src/sync/syncEngine.ts:598-602`).
2. Current repairs run their own per-visit **create -> photo stage -> submit** sequence, checking receipt identity/fingerprint at each step (`apps/web/src/repairVisits/repairVisitSync.ts:100-157`).
3. Customer requests, location proposals and remarks run before inspection batches (`apps/web/src/sync/syncEngine.ts:606-610`). These are not part of the inspection acceptance transaction.
4. V6/V7 photos stage **before** parent `/api/sync` acceptance; only a fully staged matching frozen manifest lets the parent send (`apps/web/src/sync/syncEngine.ts:612-625`). Photo metadata goes in JSON; binary Blobs use multipart.
5. Legacy optional `inspectionAttachment` uploads run **after** the parent is Synced (`apps/web/src/sync/syncEngine.ts:489-495`, `:803`). Do not apply that older order to V7.

Inspection batches use acceptedIds/duplicateIds intersected with dispatched entity UUIDs; omitted/unconfirmed IDs fail rather than treating HTTP 200 as success (`apps/web/src/sync/syncEngine.ts:712-799`). V7 upload confirmation checks outcome, exact photo UUID, field path and source hash (`apps/web/src/attachments/attachmentApi.ts:104`). Offline service visits check job UUID plus configuration/time receipt values (`apps/web/src/jobs/offlineServiceVisitSync.ts:36`); repairs check exact visit/photo/operation UUIDs and server fingerprints (`apps/web/src/repairVisits/repairVisitParsers.ts:1`). Immutable UUID/payload retries are the idempotency basis. Location proposal withdrawal persists requestId before POST, validates confirmation and re-reads server status; decisions are hidden without a fresh GET (`apps/web/src/jobs/TechnicianLocationProposal.tsx:292-358`). Standalone customer confirmation is weaker: it checks returned customer UUID syntax/name, not an echo of the client requestId (OA-8).

### Retry and survival

Timer eligibility is five minutes after a Failed attempt for ordinary work; current `rvVisit`/`rvPhoto` uses 1 minute, 2 minutes, then 5 minutes by attempts. Launch/visibility/reconnect eligibility can retry Failed work immediately. Pending work is eligible each tick; transient visit/repair errors returning to Pending therefore do **not** get the Failed backoff. Offline service visit sync also has its own five-minute cooldown for Failed entries (`apps/web/src/sync/autoSync.ts:6-44`; `apps/web/src/jobs/offlineServiceVisitSync.ts:28`). There is no claimed general exponential backoff/jitter implementation. Interrupted generic Syncing/Uploading becomes retryable Failed without deleting payload/Blob; offline service and repair visit recovery returns operations to Pending (`apps/web/src/sync/syncEngine.ts:367`; `apps/web/src/jobs/offlineServiceVisitSync.ts:46`; `apps/web/src/repairVisits/repairVisitSync.ts:25`).

Committed IndexedDB drafts/queues/Blobs normally survive refresh, browser close, PWA force-close and network failure. Pending keystrokes/decoding/transactions are **not** promised to survive an OS kill before save confirmation. Inspection autosave waits 1500ms and serializes writes; failure remains dirty; visibility/unmount hooks flush best-effort (`apps/web/src/inspectionControls/draftAutosave.ts:30`, `:90`; `apps/web/src/inspectionControls/useDraftAutosave.ts:49`). Current repair remarks also debounce and flush; outcome/photo writes are local (`apps/web/src/repairVisits/RepairItemCard.tsx:103`). New Service Visit form selections and inline Add Customer/new-site text remain React state until a creation completes (OA-7).

Prompt updates avoid forced form reloads and keep IndexedDB; unknown/editable routes cannot activate an update (`apps/web/src/pwa/updateRoutePolicy.ts:3`; `apps/web/src/pwa/README.md:1`). Production SW has no API runtime cache (`apps/web/vite.config.ts:47-53`). **An app update is not a blanket persistence guarantee:** version-12 old repair deletion is the explicit exception (OA-1). Current inspection retention also differs from the historical photo document's “no cleanup”: cleanup preserves unresolved work, removes stale Draft photos only after a Synced parent plus 24h, and Synced photo copies after 30 days, with outbox checks (`apps/web/src/attachments/attachmentRetention.ts:11-14`, `:50-67`). Completed generic outbox entries can be pruned after 30 days; active/correction work is retained (`apps/web/src/sync/syncEngine.ts:337`). Sign-out removes identity, not business data; clearing browser storage/uninstall/storage eviction is not covered by an app durability guarantee.

## 4. Findings and requested issue re-checks

AGENTS.md defines completion consequences for P0/P1/P2 but does not supply a detailed P0-P3 rubric. This audit uses P0 = immediate critical integrity/security failure; P1 = serious loss/blocking risk; P2 = functional/contract gap; P3 = wording, timing or documentation gap. “Fix size” is an estimate, not authorization to edit protected scope. No fix was made.

### OA-1 — P1 — Old repair data is destroyed by the version-12 upgrade

> **Owner decision 2026-10-20 (D15): closed — by design.** All project data is test data; the old Repair List was retired under repair-visit decision #1 (2026-10-18). No archive or recovery is built.

- **Technician impact/status:** updating a device with an old Draft/Pending/Failed repair removes its response and photo and removes the retry operation. No unsynced check, export, consent or recovery copy precedes the deletion. This is a current source defect, not a phone reproduction.
- **Evidence:** `apps/web/src/db/localDatabase.ts:270-284` drops repairFindings/repairWorkOrders/repairRecords/repairAttachments/repairBeforePhotos and deletes all repairEvidence/repairRecord outbox entries. `apps/web/tests/repair-visit-v12-upgrade.html:45-67` deliberately seeds Pending old rows/Blobs and Failed/Pending old outbox, then expects their removal; `apps/web/tests/repair-visit-v12-upgrade.spec.ts:3` calls that a pass. The follow-up executed this spec successfully against synthetic browser data: deletion is confirmed by the existing test, not safe preservation of the old repairs.
- **Offline Contract:** **Yes**, unsynced work must survive app lifecycle/failure; IndexedDB skill also explicitly requires update preservation. A test asserting removal does not establish safe preservation.
- **Suggested fix/size:** large, separately authorized recovery/upgrade design: retain/quarantine/export or migrate old unsynced work, add recovery UI and an independent preservation test. Do not ship this upgrade to devices with unresolved old repairs. Recovery for devices already upgraded needs a separate assessment; this audit establishes no recoverability.
- **Migration/API:** **Dexie upgrade/schema work required**; API compatibility/recovery may also be needed. PostgreSQL migration not established. Protected-scope changes require a new task; none attempted.

### OA-2 — P1 — PHONE-SAVE-01 remains an open acceptance risk

- **Technician impact/status:** the original prolonged local-save backlog was not explained; closing during an unconfirmed save can lose the latest work. Later successful saves/force-stops do not close the original item, and the current repair replacement has no phone proof.
- **Evidence:** Phone:117 (2026-10-14 `090618Z`, 24 restored tabs; confirmed Draft/Pending force-stop passed but kill-during-write and Wi-Fi-up outage not covered); Phone:475 explicitly keeps PHONE-SAVE-01 OPEN.
- **Offline Contract:** **Potential violation unresolved**; committed-data loss is not reproduced here. Do not claim every typed character is already durable.
- **Suggested fix/size:** medium investigation and targeted phone acceptance: kill during write, interrupted-save wording, many-restored-tabs vs clean start, Wi-Fi-up server outage, current installed-WebAPK repair flow and source/server photo hashes. Keep successful-save acknowledgement tied to completed storage.
- **Migration/API:** neither established as necessary; diagnose first. No phone work performed here.

### OA-3 — P2 — I-02 A1 is inconsistent across systems and connectivity states

- **Technician impact/status:** with cached job/catalog but no fresh confirmation, some never-opened systems start while others refuse; the job-wide badge cannot predict each system. Hose Reel can also fail its pre-open lookup while Wi-Fi is up even with a local draft, whereas offline-unverified bypasses that lookup. Sprinkler's no-local verified lookup does not use A1 fallback.
- **Evidence:** gates in `hydrant/hydrantResolution.ts:141`, `dryWetRiser/dryWetRiserResolution.ts:29`, `fireAlarm/fireAlarmResolution.ts:44`, `smokeVentilation/smokeVentilationResolution.ts:141`, `fireIntercom/fireIntercomResolution.ts:141`, `fireRatedRollerShutter/fireRatedRollerShutterResolution.ts:141` (all under `apps/web/src/`); Portable adds a seventh at `portableFireExtinguisher/portableFireExtinguisher.ts:26`. Non-gated Hose Reel/CO2/Wet Chemical/FM200 dispatch is `apps/web/src/App.tsx:1725-1783`; Sprinkler `automaticSprinkler/automaticSprinklerResolution.ts:68-108`. `apps/web/tests/offlineStartRule.test.ts:32` explicitly lists seven gated modules. Phone:359 lists seven gated and five non-gated, contrary to the prompt's five/six split.
- **Offline Contract:** **Yes for data-entry restrictions**, although owner A1 policy explicitly accepts online preparation (Phone:353). Do not silently replace that policy or weaken duplicate/accepted authority checks.
- **Suggested fix/size:** medium web task: agree one prepared-job rule, make transport-only opening behavior consistent, make readiness reflect enabled-system prerequisites, retain server acceptance reconciliation and fail closed on deliberate errors.
- **Migration/API:** no change demonstrated necessary; existing web preparation mechanism can be reused.

### OA-4 — P2 — Offline Add new site (S4) is absent

- **Technician impact/status:** technician can type a new site but cannot create its visit with no signal; typed site data disappears on reload. S1-S3 phone acceptance is not S4 delivery.
- **Evidence:** `apps/web/src/jobs/NewServiceVisit.tsx:157` requires `!offline` for add-site readiness; `:238` sends `newSite` directly; `:263` warns to reconnect. `apps/web/tests/new-service-visit-add-site.spec.ts:97` explicitly expects offline disablement. `docs/manager-approvals-settings/PROGRESS_STATUS.md:132` says S4 never built; Phone:113 covers online new-site proposals and offline **existing-site** creation.
- **Offline Contract:** **Yes**, new local business-record creation is limited by network.
- **Suggested fix/size:** medium/large separate S4 work: durable provisional site request + stable identity and dependent visit handling; preserve approval authority and uncertain-outcome handling.
- **Migration/API:** needs design review; existing queued visit request requires siteId, so a provisional site may need API/receipt support. Schema requirement not established. No API/migration change attempted.

### OA-5 — P2 — Offline Add Customer depends on entry point

- **Technician impact/status:** standalone page supports offline queueing with cached service formats, but the New Service Visit shortcut refuses offline and bypasses local draft/outbox. The preliminary snapshot incorrectly describes all Add Customer as connection-required.
- **Evidence:** `apps/web/src/jobs/TechnicianAddCustomer.tsx:53-85`, `:116-125`; `apps/web/src/jobs/technicianCustomerDraft.ts:63-77`; `apps/web/src/jobs/NewServiceVisit.tsx:169-191`; `docs/manager-approvals-settings/PROGRESS_STATUS.md:132`.
- **Offline Contract:** **Yes**, inline local creation/draft persistence is missing; standalone support is not a defect. No-cache service selection remains an explicit prerequisite, not proof the whole page is disabled.
- **Suggested fix/size:** small/medium web task: route shortcut to the proven durable standalone workflow with return context; retain same mutation identity and validation. Phone-test both paths and the no-format-cache message.
- **Migration/API:** none needed for workflow reuse.

### OA-6 — P3 — I-68's old fix does not prove the new repair notice is current

- **Technician impact/status:** old RepairPartView fix is recorded, and Phone:279 later observes its new wording despite I-68's “phone retest pending” heading. That component is gone. Current `RepairVisitForm` sets “Submitted. Sending…” (or “will be sent”) in component notice and does not clear it on Synced/awaiting_approval, while a separate banner says sent. Stale delivery text can therefore recur in the current screen.
- **Evidence:** Phone:280 (original I-68), Phone:279 (later phone sighting); `apps/web/src/repairVisits/RepairVisitForm.tsx:23`, `:53-61`, `:134`, `:151`. Source inspection only for the new notice; no browser reproduction here.
- **Offline Contract:** **No demonstrated durability violation**; confusing status wording.
- **Suggested fix/size:** small web task: derive/clear action notice from persisted delivery/review state and test transition while component stays mounted.
- **Migration/API:** neither required.

### OA-7 — P2 — Visit setup and inline creation can be lost before local persistence

- **Technician impact/status:** New Service Visit customer/site/system selections, call number and mutation IDs are component state. Refresh/force-close before successful Create loses setup. Online creation is API-first; lost-response safety is limited by the mounted requestId. This contrasts with standalone customer autosave and current repair local-first create.
- **Evidence:** `apps/web/src/jobs/NewServiceVisit.tsx:53-90`, `:186-198`, `:231-245`; only `submitOffline` calls local persistence (`:209-217`). `:260-266` correctly warns an online visit may already exist; it does not persist that unknown request for replay after reload. This audit did not reproduce a duplicate.
- **Offline Contract:** **Yes** for API-first business writes/draft-only-in-memory; duplicate after lost response/reload is a risk, not an observed outcome here.
- **Suggested fix/size:** medium: persist setup and mutation identity before send, reconcile unknown create outcomes before creating a different local identity; retain explicit server reread and current fail-closed errors.
- **Migration/API:** no new migration established; existing drafts store may suffice. Exact replay/reconciliation support must be checked in its own task before deciding API changes.

### OA-8 — P2 — Standalone customer Synced does not confirm the client mutation UUID

> **Owner decision 2026-10-20 (D16): fix as task C1** (additive `requestId` receipt on `POST /customers`, required by the technician client). See PROMPTS.md C1.

- **Technician impact/status:** a successful customer response with any valid customer UUID and matching displayName can mark the queued request Synced, even though the response never echoes that request's UUID. The server does have requestId idempotency, but the web confirmation is weaker than visit/inspection receipts.
- **Evidence:** `apps/web/src/referenceData/referenceDataApi.ts:125-140` checks returned ID syntax and name; `apps/web/src/jobs/technicianCustomerDraft.ts:117-129` marks Synced/Completed. Read-only API evidence: `apps/api/src/routes/managerCustomers.ts:673-681` reserves requestId and `:771` returns customer data without a requestId receipt.
- **Offline Contract:** **Yes**, exact client operation UUID is not confirmed before Synced. This is not generic HTTP-200-only behavior, but still lacks mutation correlation.
- **Suggested fix/size:** medium separately scoped receipt contract + web exact-request confirmation and wrong-request/same-name regression. No actual wrong-customer server response was produced here.
- **Migration/API:** **API response change likely required** to echo authenticated requestId; existing idempotency table suggests no PostgreSQL migration needed. Reported only, as required by protected scope.

### OA-9 — P2 — I-69 source fix is historical; current repair persistence still lacks phone acceptance

- **Technician impact/status:** old hidden-tab hash-inside-transaction locking was fixed; phone probes improved but the original holder/stall was not reproduced after the fix. The named old repository/stores are now removed, so neither the old defect nor a full current-device fix can be asserted from that record.
- **Evidence:** Phone:281 contains both “retest pending” heading and 2026-10-17 `20261017T072457Z` retest (4 tabs, 1-16ms probes), explicitly says hash fix proven by specs, not reproduced phone stall. Current create/submit computes hashes/byte checks before transaction: `apps/web/src/repairVisits/repairVisitRepository.ts:35-61`, `:187-205`; current sync checks photos before settle: `apps/web/src/repairVisits/repairVisitSync.ts:147-164`. Version-12 deletion: `apps/web/src/db/localDatabase.ts:274`.
- **Offline Contract:** historical locking interfered with local save; **current violation not reproduced** under I-69. OA-1 is the separate proven update loss.
- **Suggested fix/size:** small/medium verification task on the new model: multi-tab save, background hashing, update, stalled transaction and recovery wording. Do not call I-69 entirely unfixed or phone-closed solely from its heading.
- **Migration/API:** none established for verification or off-transaction hashing.

### OA-10 — P3 — I-70 remains a warning-only mitigation

- **Technician impact/status:** many live tabs can still stall device IndexedDB for tens of seconds; “Too many open tabs” advises closing tabs but does not prevent the condition. Memory pressure is an evidence-based hypothesis, not a proven cause.
- **Evidence:** Phone:282: 8+ live tabs, aborted 2s probes, app waits 17-49s; notice verified 2026-10-17 `20261017T082657Z`. Current notice remains mounted in `apps/web/src/App.tsx:2361`; implementation `apps/web/src/pwa/otherTabs.ts:1`.
- **Offline Contract:** **Potential impact on save availability**; no proven new committed-data loss from this item. Notice is not a durability fix.
- **Suggested fix/size:** small operational guidance/phone retest first; medium profiling if persistent in one installed window. One-tab enforcement needs separate product decision and evidence it helps.
- **Migration/API:** neither established as necessary.

### OA-11 — P3 — L-6 recovery timing remains open

- **Technician impact/status:** reconnecting network/server does not have a fully established untapped header/auth recovery bound; user may need Reconnect or visibility change. Foreground sync timer requires verified auth, so it cannot by itself recover every unverified session.
- **Evidence:** Phone:237 explicitly “Open / timing not retested”; `apps/web/src/auth/connectivityRecovery.ts:1` bounded probes; `apps/web/src/App.tsx:1193-1207` verified eligibility.
- **Offline Contract:** **No demonstrated local-write loss**; delayed synchronization/recovery.
- **Suggested fix/size:** small/medium connectivity test: restore API while Wi-Fi stays up, measure automatic recovery with no tap; then add a safe probe only if required, preserving authority rules.
- **Migration/API:** neither required for test/scheduling work.

### OA-12 — P3 — Status documents overstate or understate current capabilities

- **Technician impact/status:** owner can give wrong instructions or infer phone acceptance for a replacement workflow. Old I-02 B1 says visits online-only; preliminary snapshot says Add Customer requires connection and per-job Download exists; old repair Compare/Print and I-68/I-69 pending headings conflict with later evidence/current replacement.
- **Evidence:** Phone:338-360 vs Phone:113; `docs/manager-approvals-settings/PROGRESS_STATUS.md:128-132` vs current `apps/web/src/jobs/TechnicianAddCustomer.tsx:71` and `apps/web/src/repairVisits/NewRepairVisit.tsx:197`; Phone:279-282 vs `apps/web/src/db/localDatabase.ts:270`. Architecture photo retention (`docs/architecture/12-offline-photo-evidence.md`, “Local Retention”) predates current cleanup at `apps/web/src/attachments/attachmentRetention.ts:11`.
- **Offline Contract:** **No direct runtime violation**; misleading verification/operations record.
- **Suggested fix/size:** small documentation task after owner reconciles workflow scope; per-build/feature phone matrix, separate historical records from current acceptance. This audit is the only document changed now.
- **Migration/API:** neither required.

### OA-13 — P2 — Auth probe does not strictly validate a truthy user object

- **Technician impact/status:** malformed HTTP-200 JSON such as `{user:{}}` is classified authenticated by the probe instead of unavailable; restore then treats it as verified. Later workspace/role logic may refuse or fail, but strict fail-closed classification is missing at the trust boundary.
- **Evidence:** `apps/web/src/auth/authApi.ts:69-75` type-asserts JSON and tests only `data.user`; `apps/web/src/auth/authRestoration.ts:18` accepts authenticated user. Cached identity role/type checks exist separately (`apps/web/src/auth/authStateRepository.ts:23-33`); they do not validate this fresh response. Source finding, not a run malformed-response reproduction. Passing auth tests below do not prove this shape is rejected.
- **Offline Contract:** **Server-authority/fail-closed rule violated**; no demonstrated local data loss or server authorization bypass.
- **Suggested fix/size:** small web parser for exact identity keys, valid id/username/role before authenticated; focused malformed/unknown-role regression. Keep deliberate errors distinct from transport failure.
- **Migration/API:** neither needed if current valid server shape is preserved.

### OA-14 — P2 — Intermittent repair photo-acknowledgement regression

- **Technician impact/status:** the browser test timed out waiting for the photo-saved acknowledgement after editing a returned repair and replacing its photo at 1280px. The same scenario passed on one focused rerun. This establishes an intermittent verification failure; it does not prove photo loss or identify whether the UI message or the test timing is at fault.
- **Evidence:** follow-up main suite: `apps/web/tests/repair-visit-app.spec.ts:190`, `getByText('Photo saved on this device.')` not found within 15 seconds; overall 32 passed/1 failed. Focused `grep: '1280px.*previous SERVICE'`: 1 passed in 14.9s. Current remark and photo operations both write the same status state (`apps/web/src/repairVisits/RepairItemCard.tsx:111`, `:145`), a possible explanation requiring investigation, not a proven root cause. The reported error-context file was unavailable when read; no additional snapshot evidence is claimed.
- **Offline Contract:** **Not established**; a missing acknowledgement alone is not evidence that the Blob failed to persist.
- **Suggested fix/size:** small/medium targeted investigation with independent persisted-photo/hash assertions and separate acknowledgement of remark/photo saves; preserve meaningful test coverage rather than weakening the assertion to obtain green.
- **Migration/API:** neither established as necessary. No fix made.

**Counts:** P0 remaining: **0 identified**. P1 remaining: **2** (OA-1, OA-2). P2: **8** (OA-3/4/5/7/8/9/13/14). P3: **4** (OA-6/10/11/12). P2 deferral belongs to the named implementation/phone checkpoint and does not override P1 closure requirements. No claim of exhaustive security review.

## 5. Verification gaps and work actually run

### Not established on a phone for current source

- New repair-visit create/Not Done/Before-After/submit/return/resubmit/approval workflow, its seven-day catalog metadata behavior, cached-photo integrity and current PDF flow. The old CR-09 phone tests use different stores/endpoints and are not transferable proof.
- Upgrade from old repair Draft/Pending/Failed with preservation; current upgrade explicitly deletes those rows. Existing upgrade spec expects deletion and cannot close OA-1.
- PHONE-SAVE-01: kill during an actual write; interrupted/unconfirmed save wording; Wi-Fi still up while API unreachable; restored-tab vs clean-start comparison; current repair installed-WebAPK round trip; phone-local vs server photo hash. The site-proposal WebAPK pass closes only that specific site/visit scope.
- Every enabled system's never-opened prepared/unprepared/stale (>3 days)/already-accepted path; A1 phone proof specifically names Smoke Ventilation and Fire Intercom. Camera/local-save proof on selected systems does not prove all systems, IME composition or simultaneous tabs.
- Full current offline Wet Chemical/FM200/Portable round trip; expired/revoked session restoration and malformed authoritative refresh across all forms; no-cache New Service Visit and standalone Add Customer; offline Add Customer queue + exact request receipt.
- S4 new-site offline queue is absent, not merely untested. Current service-job per-job Download and old standalone repair Compare/Print are not present in the inspected UI; do not list them as passing capabilities.
- Untapped L-6 recovery with Wi-Fi unchanged; all retry backoff boundaries/cross-tab manual overlaps on phone; browser-OS kill mid-sync on the current repair model.
- Actual Android/iOS PDF save/view/print, iOS offline camera/install/storage persistence, production HTTPS acceptance for the current full workflow. Phone:114 is a real-HTTPS location-proposal pass only; Phone:113 is USB localhost, not production HTTPS.
- Current 360px layout/touch rules were subsequently exercised by the existing browser specs in the follow-up below; no manual 360px visual acceptance or physical phone check was performed. No browser/PWA OS force-close, integration database, Docker or deployment test was performed by this audit. An online deployed-app smoke check and browser screenshot observation were performed in the follow-up; neither establishes offline phone acceptance.

### Commands and results in this audit

Run from the existing workspace without Git mutation. Existing unit tests only; no tests were added/edited.

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
& ..\api\node_modules\.bin\tsx.cmd --test tests/offlineStartRule.test.ts tests/offlineServiceVisit.test.ts tests/autoSync.test.ts tests/autoSyncLock.test.ts tests/authProbeGateway.test.ts tests/authorityOfflineFallback.test.ts tests/serverReachability.test.ts tests/draftAutosave.test.ts
# PASS: 84 tests, 0 failures, 0 skipped.
& ..\api\node_modules\.bin\tsx.cmd --test tests/repairVisits.test.ts tests/auth-restoration-regression.test.ts tests/attachmentRetention.test.ts
# PASS: 22 tests, 0 failures, 0 skipped. Total: 106.
npm run typecheck
# PASS: tsc -b, exit 0.
npm run build
# PASS: tsc -b + Vite production build; service worker + 11 precache entries generated.
# Existing warning: main JS chunk exceeds 500 kB (1,311.30 kB minified).
npx playwright test tests/offline-start-readiness.spec.ts tests/offline-service-visit-sync.spec.ts tests/offline-visit-open-target.spec.ts tests/technician-offline-regression.spec.ts tests/new-service-visit-add-site.spec.ts tests/repair-visit-sync.spec.ts tests/repair-visit-app.spec.ts --workers=1 --reporter=line
# BLOCKED, exit 1 before tests: Vite strictPort 4175 already in use.
# No spec executed, no skip/pass credit. Existing process left alone; no config edited.
cd C:\PWA_OfflineRecordWebApp
git diff --check
# PASS, exit 0; concurrent API test files emitted LF/CRLF warnings only.
git status --short
# Read before and after; audit contribution is only this new OFFLINE_AUDIT.md.
```

API and V7 integration gates are not applicable to this read-only task. Historical template files were not edited; no baseline byte-comparison against e30c649 was run, so historical byte equality is not claimed. Existing decisions, request IDs, confirmation flows, schema, lockfiles, API, Docker/Caddy and environment files were not modified by this audit.

### Definition of Done and final report

| Item | Result | Evidence / limitation |
|---|---|---|
| Requested skills/contracts/readmes and phone records inspected | PASS | Source audit and citations above; UI guideline source fetched, no visual UI acceptance claimed. |
| OFFLINE_AUDIT.md exists with <=15-line owner summary | PASS | Section 1 contains 14 summary bullets. |
| Every capability cell has a value, system preparation/outage distinctions included | PASS | Section 2; all 11 non-Portable systems plus additional routed Portable system. |
| Every issue has severity, impact, evidence, contract assessment, fix size, API/migration assessment | PASS | OA-1 through OA-13; source findings distinguished from historical phone records. |
| Focused/relevant unit regression specs | PASS | 106 passed, 0 failed, 0 skipped. |
| Focused/relevant Playwright specs | FAIL (intermittent) | Follow-up: 37 distinct specs; main suite 32 passed/1 failed, extra suite 4 passed; failed case passed on one rerun. OA-14 remains open. |
| Web typecheck and production build | PASS | Both exit 0; bundle-size warning recorded. |
| git diff --check | PASS | Whitespace clean; LF/CRLF warning recorded. |
| Only authorized output changed by this audit | PASS | No source/test/config/doc writes except this file; generated ignored build/test output is not source. |
| Whole working tree shows only this file | NOT MET | Pre-existing untracked docs/photo-and-remarks/; additional concurrent files appeared, listed below. Nothing was reverted. |
| Protected source / historical templates unchanged by this audit | PASS (scope) | No edits; strict historical baseline equality not tested. Other concurrent API edits cannot be certified by this audit. |
| Phone/offline/browser acceptance for current release | NOT ACCEPTED | No phone tests; simulated-offline browser coverage ran with one intermittent failure. Deployed build smoke check is not latest-source acceptance. |
| No remaining relevant P0/P1 for acceptance | FAIL | 0 P0 identified; 2 P1 open. Audit documents them; release acceptance remains blocked. |

Files changed by this audit: **`docs/manager-approvals-settings/OFFLINE_AUDIT.md`** — evidence-based capability, persistence, issues and verification report. Behavior changed: **none**.

Working-tree provenance: initial `git status --short` contained only `?? docs/photo-and-remarks/`. During the audit, these additional paths appeared as modified/untracked; this agent did not edit them:

```text
 M apps/api/src/routes/managerServiceVisits.test.ts
 M apps/api/src/routes/managerServiceVisits.ts
 M apps/api/src/routes/reportApprovals.integration.test.ts
 M apps/web/package.json
 M apps/web/src/manager/ManagerLocationProposals.tsx
 M apps/web/src/manager/ManagerSiteProposals.tsx
 M apps/web/src/manager/managerLocationProposals.css
 M apps/web/src/manager/managerSiteProposals.css
 M apps/web/tests/location-proposals-unreadable.spec.ts
 M apps/web/tests/supervisor-location-proposals.spec.ts
 M apps/web/tests/supervisor-site-proposals.spec.ts
?? apps/web/src/manager/proposalFilters.tsx
?? apps/web/tests/proposalFilters.test.ts
?? docs/photo-and-remarks/
```

The new audit file is the sole additional contribution attributable to this audit. Concurrent changes mean the commands above are observations of a moving workspace, not a frozen release certification. The final status check must be interpreted with this provenance; do not delete or restore others' work to manufacture a clean status.

### Follow-up testing authorized by the owner (2026-10-20)

The owner supplied testing credentials and authorized testing after the initial audit. No credential was saved to a file or printed in test output. The live smoke check reused the browser's existing technician session; **fresh credential login for any of the three accounts was not tested**. Earlier statements about the initial blocked browser run remain its historical record; these follow-up results supersede its verification gap for the specific browser specs listed below. Phone verification columns remain unchanged.

Port 4175 was occupied by a listener; a read of its offline-start harness timed out after 10 seconds. No existing process was stopped. A sandboxed retry stalled and was interrupted, and an ordinary unsandboxed CLI retry again failed before collection with port-in-use. Attempts to override the imported config through the CLI first hit Windows quoting/package-path errors and then still loaded port 4175. The successful approach used the installed Playwright runner and changed only the loaded in-memory configuration to ports 4187/4188/4189; no checked-in or temporary configuration file was written.

| Run | Result | What this establishes |
|---|---|---|
| Seven original targeted specs, port 4187, Chromium, 1 worker | **32 passed, 1 failed**, 3.0 minutes, exit 1 | Add-site safeguards/layout, prepared offline start, local visit exact-UUID sync, inspection regressions, current repair create/submit/review flows; one returned-repair replacement acknowledgement timed out at 1280px (OA-14). |
| `repair-visit-v12-upgrade.spec.ts` + `technician-sidebar-navigation.spec.ts`, port 4188, 1 worker | **4 passed**, 35.5 seconds, exit 0 | Confirms destructive old-repair upgrade behavior; technician navigation, exact customer retry identity and offline customer draft/queue/reconnect. Synthetic data only. |
| Failed repair case alone, port 4189, `grep: '1280px.*previous SERVICE'` | **1 passed**, 14.9 seconds, exit 0 | Failure did not repeat once; does not erase the first failure or establish root cause. |
| Deployed `https://localhost/` browser smoke check | Technician jobs and current Repair List loaded | Existing authenticated session; displayed build `build-20261020T052523Z`, 94 cached jobs, repair list In Progress (1)/Completed (1), header Sync needs attention, update available. No form editing, explicit Sync, update activation, approval or deletion was performed. Temporary tab closed. This is online desktop smoke evidence, not a phone or full offline round trip. |

Totals: **37 distinct browser tests; 38 executions including the rerun; 37 passing executions and 1 failing execution.** Do not report an all-green original suite. No tests were added, modified, skipped or weakened. Test workflows use mocks and isolated browser data, not production business writes. The live app was only navigated/read; normal app startup/refresh behavior was not disabled.

Reproducible file-free runner, using the same installed runner API and equivalent sequential invocation of the three observed runs (the extra suite originally ran alongside the main suite). The checked-in config and existing port 4175 remain untouched:

```powershell
cd C:\PWA_OfflineRecordWebApp\apps\web
@'
const { configLoader } = require('./node_modules/playwright/lib/common');
const { testRunner } = require('./node_modules/playwright/lib/runner');
(async () => {
  const runs = [
    { port: 4187, locations: [
      'tests/offline-start-readiness.spec.ts',
      'tests/offline-service-visit-sync.spec.ts',
      'tests/offline-visit-open-target.spec.ts',
      'tests/technician-offline-regression.spec.ts',
      'tests/new-service-visit-add-site.spec.ts',
      'tests/repair-visit-sync.spec.ts',
      'tests/repair-visit-app.spec.ts'
    ] },
    { port: 4188, locations: [
      'tests/repair-visit-v12-upgrade.spec.ts',
      'tests/technician-sidebar-navigation.spec.ts'
    ] },
    { port: 4189, locations: ['tests/repair-visit-app.spec.ts'],
      grep: '1280px.*previous SERVICE' }
  ];
  let failed = false;
  for (const run of runs) {
    const baseURL = `http://127.0.0.1:${run.port}`;
    const config = await configLoader.loadConfigFromFile('./playwright.config.ts', {
      workers: 1, reporter: [['line']], use: { baseURL },
      outputDir: `./test-results/offline-audit-${run.port}`
    });
    config.webServers[0].command =
      `npm run dev -- --host 127.0.0.1 --port ${run.port} --strictPort`;
    config.webServers[0].url = baseURL;
    const status = await testRunner.runAllTestsWithConfig(config, {
      locations: run.locations, ...(run.grep ? { grep: run.grep } : {})
    });
    console.log(`AUDIT_PORT_${run.port}=${status}`);
    failed ||= status !== 'passed';
  }
  process.exit(failed ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
'@ | node
cd C:\PWA_OfflineRecordWebApp
git diff --check
git status --short
```

Readiness: the document is ready for owner triage. Prioritize old-repair update preservation and PHONE-SAVE-01/current-repair phone acceptance, then targeted web/API receipt tasks and the intermittent OA-14 test. Any protected-scope fix needs a separately authorized task. Do not proceed to release or claim gates green. No Git staging or history operation performed.

SAFE FOR REVIEW: N

This conservative verdict reflects the two open P1 risks and intermittent browser-gate failure; it does not prevent reviewing this read-only audit report. Stop here.
