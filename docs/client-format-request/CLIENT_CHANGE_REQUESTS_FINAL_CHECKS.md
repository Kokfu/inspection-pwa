# Client change requests — final cross-checks (do AFTER all CR items are built)

> Companion to [CLIENT_CHANGE_REQUESTS_2026-10.md](CLIENT_CHANGE_REQUESTS_2026-10.md). Each CR was tested on its own
> (Level 1). This list is the **second pass**: things that only make sense to check once every request is done, so
> they are checked once instead of after every item. Tick a box and write the result when checked.
> Created 2026-10-10.

---

## A. CR-03 / CR-04 — Arrival / Departure (commit `101aa51`)

What changed: the New Service Visit form no longer has Arrival or Departure. The form sends the **device clock
(local HH:MM) at the first Create tap** in the existing `arrivalTime` field. `departureTime` is no longer sent.
The API, DB columns and report code were **not** changed.

### A1. Report cover and PDF (needs a decision)
- [ ] **Label.** The report cover (`apps/api/src/reports/template/cover.html:34`) still says **"Arrival / Departure"**.
  `renderReportHtml.ts` joins the two values with " / " only when both exist, so a new visit prints just `09:05`
  under the label "Arrival / Departure". Decide: (a) rename the label to "Arrival" / "Start time" (also update
  `sample.snapshot.html` and the report snapshot tests), or (b) stamp Departure automatically when the technician
  submits/completes the visit, or (c) leave as is. Owner decision: _
- [ ] Generate a **fresh PDF** of a visit created with the new form and look at the cover.
- [ ] Generate a PDF of an **old visit that has both values** and confirm it is unchanged ("09:05 / 16:40").
- [ ] Web Final Report view (`finalServiceReport.ts:983-984` lists "Arrival" and "Departure" rows separately): a new
  visit shows Arrival only, no empty Departure row. Confirm on screen.

### A2. Other places that show these times
- [ ] Manager screens (Services, visit detail, Services Done, corrections editor): nothing shows "Departure: undefined/blank".
- [ ] `docs/client/USER_GUIDE.md` and any client screenshots: no longer describe typing Arrival/Departure.
- [ ] Reminder / e-mail texts do not mention them.

### A3. Clock and timezone
- [ ] The arrival time is the **phone's** local time, but the visit date, `service_time` and the `SV-YYYYMMDD-n`
  reference come from the **server's Malaysia clock**. Test with a phone set to a wrong time/timezone: the cover
  would show an arrival that disagrees with the visit date. Decide whether to (a) accept, (b) send the Malaysia
  time computed on the phone, or (c) let the server stamp arrival (needs an API change).
- [ ] Retry after a lost response (airplane mode toggled during Create) replays the same visit with the same arrival
  time, with no `IDEMPOTENCY_MISMATCH`. (Covered in a harness; confirm on the phone.)

### A4. API leftovers
- [ ] The API still **accepts** `departureTime` for older app versions. Decide if/when to reject it
  (strict validation) after all phones run the new build.
- [ ] Create-visit remains **online-only** (customers/sites load live). Confirm this is still the intended rule.

---

## B. CR-08 — Photo date/time stamp (commit `ce5a5db`)

- [ ] Phone: camera photo shows one readable stamp (bright and dark scenes, portrait and landscape).
- [ ] Phone: a gallery photo shows **today's processing time**, not its original date (this is by design; confirm the
  client agrees).
- [ ] Offline capture -> force-close -> reopen -> sync: stamp survives and is not doubled.
- [ ] **Accepted detail** and the **final PDF**: the stamp is legible after the server's re-encode and the PDF scaling.
- [ ] Corrected copy of a rejected record keeps its original stamp (not re-stamped).
- [ ] Full-size phone photos: processing time and memory on the real phone (12 MP measured at ~450 ms on a desktop only).
  Photos over 20 MiB / 40 MP / 12 000 px per edge are still rejected (existing limit). Decide if that limit is OK.
- [ ] Future features that capture photos (Repair List "After" photo, CR-09; optional Good photos, CR-01) go through
  the same processor, so they inherit the stamp. Confirm it appears there too.

---

## C. CR-05 — Remaining Inspections (commit `2874caa`)
- [ ] Phone: block is one line collapsed, expands to the list, "Ready to Complete" panel unchanged.

## D. CR-11 — Admin wording (commit `d422ab4`)
- [ ] Phone/desktop: role card, sign-in, review notices all say "Admin".
- [ ] Owner decision pending on the 5 screens where **both** review roles now read "Admin" (see
  `docs/testing/CR11_ADMIN_WORDING.md`).
- [ ] One user-facing string ("Tell your Admin…") in `referenceDataApi.ts` was left for the I-44 commit; confirm it
  ends up committed.
- [ ] Generated PDFs created before the change still say "Reviewed by Supervisor" (not rewritten). Confirm the client accepts.

## E. CR-09 / CR-10 — Repair (when built)
- [ ] Old accepted records containing Complete Repair still render in accepted detail and the PDF.
- [ ] Phones running an old app build can still offer Complete Repair until the service worker updates; the server
  must keep accepting it.

---

## F. Whole-system pass once every CR is done
- [ ] Full web Playwright suite and web node tests; API suite on the disposable Postgres (`127.0.0.1:55432`).
- [ ] One end-to-end visit on the phone: new visit (no Arrival/Departure) -> forms (stamped photos, Admin wording) ->
  submit offline -> sync -> Admin review -> PDF. Look at the PDF cover and photo pages.
- [ ] Docker rebuild, restart persistence, installed-PWA update and offline relaunch (Level 3, only at the release checkpoint).
- [ ] Update `docs/client/USER_GUIDE.md` for every user-visible change (Arrival/Departure, Admin, photo stamp, Remaining
  Inspections, remarks, Repair List).
