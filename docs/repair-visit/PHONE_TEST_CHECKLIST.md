# Repair Visit — Owner phone test (Level 3)

Nobody but you can tick this list. Do it on the real phone, on the real HTTPS address, with the
build that includes the Repair Visit switch-over. Use a test customer; do not use a real customer.

**Before you start**
- Phone online, signed in as a **technician** (A) and a second device or browser signed in as
  **Admin/Manager** (B).
- Open the app once online, wait for "Ready for offline use", then close and reopen it once.
- Check the build number in the header matches the build you deployed.
- You need one test customer with a site and at least one **approved** service visit that you
  (technician A) created, so it can be the "previous visit".

Mark each row Pass / Fail. Write down anything unexpected.

## Part 1 — Offline service visit

| # | Step | Expected |
|---|------|----------|
| 1.1 | Online: open **New Service Visit**, pick the test customer and site (this saves them on the phone). Go back to Home. | Customer and site were available. |
| 1.2 | Turn on **airplane mode** (Wi-Fi and data off). Header says Offline. | Header shows Offline. |
| 1.3 | **New Service Visit**: pick customer, site, one system, Create. | Visit opens straight away. Job Reference says "SV number given when synced". Card says "Pending sync". The page may reload once by itself; the visit must still open. |
| 1.4 | Open the system form. Type in every field, tap Good / Not Good, take a photo with the camera for a Not Good field. | Every input works, camera works, nothing is disabled. "Autosaved on this device" appears. |
| 1.5 | Tap **Submit Inspection**. | "Inspection submitted locally and waiting for sync." Header shows "1 inspection waiting to sync". |
| 1.6 | **Force-close** the app (swipe it away). Reopen it from the home-screen icon, still in airplane mode. Choose Technician. | App opens offline. The visit is still there, still "Pending sync", the submitted form and photo are still there. |
| 1.7 | Turn airplane mode **off**. Open the app / tap **Sync Now**. | Visit becomes **Synced** and shows a real number `SV-YYYYMMDD-NN`. Form and photo show synced. |
| 1.8 | On device B (Admin), find the visit. | Exactly **one** visit with that SV number. It has the form and the photo. Its internal ID is the one the phone made (it was not duplicated). |

## Part 2 — Offline repair visit (previous visit = service visit)

| # | Step | Expected |
|---|------|----------|
| 2.1 | Online: **Repair List → + New Repair Visit**. Pick customer, site, Previous visit = the approved service visit. Tap **Download for offline**. | "Saved on this device: … field lists … Before photos". No error. |
| 2.2 | Airplane mode **on**. Open **New Repair Visit** again, pick customer, site, the same previous visit. | The field list appears (Not Good fields first). Message says it works offline and gets its RV number when it syncs. |
| 2.3 | Tick one **Not Good** field and one **Good** field. Create Repair Visit. | Visit opens. Date and arrival time shown. "RV number given when synced". Each field shows its Before result, remark and photo (or "No photo recorded at previous visit"). |
| 2.4 | Field 1: choose **Done Repair**, type a remark, take an After photo. Field 2: choose **Not Done**, type the reason, take a photo. | Both accepted. Submit is not blocked while offline. |
| 2.5 | Try Submit with one field missing its photo. | Submit is refused with a clear message; nothing is lost. Add the photo. |
| 2.6 | Tap **Submit**. Force-close the app. Reopen (still offline). | Repair visit is still there: "Submitted on this device", pending sync, both photos still there. |
| 2.7 | Airplane mode **off**. Open the app / **Sync Now**. | Becomes **Awaiting approval** with a real number `RV-YYYYMMDD-N`. |

## Part 3 — Admin return, edit, resubmit, approve

| # | Step | Expected |
|---|------|----------|
| 3.1 | Device B (Admin): **Repair Visits → Review** the visit. | Before and After shown side by side; previous visit named; photos open. |
| 3.2 | Try **Return to technician** with the reason empty. | Refused: a reason is required. |
| 3.3 | Type a reason, **Return to technician**. | Status Returned. |
| 3.4 | Phone (online): **Repair List → Refresh**. Open the visit. | Status **Returned** with your reason shown. Nothing has to be re-entered. |
| 3.5 | Change a remark and replace one photo. **Submit** again. | Becomes Awaiting approval again (revision 2). |
| 3.6 | Admin: **Approve → Confirm approval**. | "Approved as MFE/RR/YYYY/NNNN. The visit is locked." |
| 3.7 | Phone: **Refresh**. | The repair visit shows Approved and can no longer be edited. |

## Part 4 — PDF on the phone

| # | Step | Expected |
|---|------|----------|
| 4.1 | Open the approved repair visit's PDF on the **phone** (download/open). | A4 landscape PDF opens in the phone's PDF viewer. |
| 4.2 | Check page 1 (cover). | Letterhead, report number `MFE/RR/…`, repair visit number, previous visit, technician, approval line. Matches the approved mock-up layout. |
| 4.3 | Check the summary and the field pages. | Each field has Before (left) and After (right) with result, remark and photo; the Not Good field shows Done Repair; the Not Done field shows Not Done and the reason. "No photo recorded at previous visit" appears where it applies. Text is not cut off. |
| 4.4 | Open the **previous service visit's** PDF again. | Identical to before. The repair did not change it. |

## Part 5 — Repair visit whose previous visit is a repair visit

| # | Step | Expected |
|---|------|----------|
| 5.1 | Phone online: New Repair Visit, same customer and site. The Previous visit list now includes the approved repair visit. Choose it. **Download for offline**. | RV appears in the list. |
| 5.2 | Airplane mode on. Create a repair visit with that previous visit. | The **Not Done** field is listed first. Its Before shows the old repair's After photo, result and remark. |
| 5.3 | Do Done Repair + remark + photo for the fields, Submit, reconnect, Admin approves. | New RV number, new `MFE/RR/…` number. PDF Before photos are the previous repair visit's After photos. |

## Part 6 — Other checks

| # | Step | Expected |
|---|------|----------|
| 6.1 | Offline, create a service visit for a customer you never opened online on this phone. | Clear message that the customer/site must be saved first; nothing is lost; the form is not silently blank. |
| 6.2 | Offline: tap **Add New Customer**. | Clear message that it needs a connection. |
| 6.3 | Repair visit: leave a field's After photo out, close the app, reopen. | Draft and entered text are kept. |
| 6.4 | Header sync badge while pending and after sync. | Counts waiting items, then says all synced. |
| 6.5 | Look at every screen above on the phone. | No horizontal scrolling, buttons large enough to tap, text readable. |

## Result — run by the agent on the owner's phone, 2026-10-19

Phone: OnePlus/Oppo CPH2375, Android 13, Chrome (a browser tab, **not** the installed home-screen app).
Build: production web bundle of HEAD served from a **disposable** stack through `adb reverse`
(`http://localhost:4176`, Service Worker active, "Offline ready" shown). The runtime Docker stack and its
database were not touched; it still runs the old build, so this was **not** the real HTTPS deployment.
"Offline" = Wi-Fi off, mobile data off and the server stopped (real, not a mock). Device B (Admin) was
desktop Chromium. Photos were taken with the phone's real camera (the phone lay flat, so images are dark).

| Row | Result |
|---|---|
| 1.1–1.2 online bootstrap, offline | Pass ("Offline ready"; "No internet connection") |
| 1.3 offline service visit create | Pass (placeholder, Pending sync, nothing sent) |
| 1.4 fill form, camera photo offline | **Fail first time, then Pass**: see P1-A. With the visit just created and the app still open, tapping the system card did nothing ("Failed to fetch"). After force-close and reopen the form opened; every input and the camera worked. |
| 1.5–1.6 submit, force-close, reopen offline | Pass (still pending, form and photo kept) |
| 1.7–1.8 reconnect | Pass: auto-synced to `SV-20261019-2`, same visit ID, 1 form, 1 photo, one row |
| 2.1–2.2 download, offline field list | Pass |
| 2.3 offline repair visit create (mid-session, no reopen needed) | Pass |
| 2.4–2.5 outcomes, camera, missing-photo refusal | Pass ("…is not complete: add a photo.") |
| 2.6–2.7 submit, force-close, reconnect | Pass → `RV-20261019-1`, 2 photos |
| 3.1–3.3 Admin review, empty reason refused, Return | Pass |
| 3.4–3.5 phone sees Returned + reason, edits, new photo, resubmits | Pass (revision 2) |
| 3.6–3.7 Approve, phone shows Approved | Pass (`MFE/RR/2026/0001`) |
| 4.1–4.3 PDF on the phone | Pass: "Download report (PDF)" saves a 125 kB file; Chrome opens it (also offline); 3 pages, layout as approved, phone photo in the After slot |
| 4.4 previous service visit PDF unchanged | Not repeated on the phone (checked on the desktop run: byte-identical) |
| 5.1–5.3 previous = repair visit | Pass: Not Done first, Before = old After; synced, approved `MFE/RR/2026/0002`; PDF Before = the phone photos |
| 6.1 customer never opened | Different from expected: other customers' sites and setup were already saved, so the visit could be started offline |
| 6.2 Add New Customer offline | Pass (clear message) |
| 6.3–6.5 | Not done separately |

**Findings from the phone run**
- **P1-A** Opening the system form of a service visit created offline in the *same session* fails with
  "Failed to fetch" until the app is closed and reopened. Cause (read in code): `resolveAutomaticSprinklerOpenTarget`
  asks the server because the session is still "verified"; a visit that has no server record yet has nothing to find.
  The visit and data are safe; reopening works. **FIXED and RE-TESTED ON THE PHONE (2026-10-19, build 20261019T092928Z, CPH2375):** server unreachable with Wi-Fi on so the session stayed verified ("Server unreachable"), visit created, Automatic Sprinkler card opened with no reopen, Good tapped and saved locally, reconnect synced it as SV-20261019-115 with the same visit ID. the open paths now skip the server lookup for a visit not yet confirmed by the server (`isUnconfirmedLocalVisit`; Automatic Sprinkler and Hose Reel were the only ones that asked the server unguarded). Covered by `apps/web/tests/offline-visit-open-form.spec.ts` (browser, one verified session, no reload) and `offline-visit-open-target.spec.ts` (resolver and guard).
- P2 (FIXED, test: offline-visit-open-form.spec.ts) After sync the open form header kept "SV NUMBER GIVEN WHEN SYNCED" until you navigated away.
- P3 (FIXED, test: repair-visit-app.spec.ts) After reopen, a submitted repair visit said "Saved on this device"; it now says "Submitted and waiting to sync."
- Tooling: my cold-gate run built the web bundle with `NODE_ENV=test` (the standard-gate block sets it before the
  web build), producing a non-production bundle in which the app never registers its Service Worker. Fix the
  environment for the web build in the standard gate.

Not proven: the installed home-screen app, the real HTTPS domain/Caddy, the owner's runtime stack and data,
Admin approval from the phone, and airplane-mode toggle itself (Wi-Fi and data were switched off separately).

## Owner sign-off (your own run)

- Phone model / browser: ______________   Build number: ______________   Date: ______________
- All rows Pass?  Yes / No      Failures (row number and what you saw): ______________
