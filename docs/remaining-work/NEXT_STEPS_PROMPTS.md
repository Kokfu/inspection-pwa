# Next steps — prompts and parked items

> 2026-10-21. Owner decision: **fix only issues that have actually been found; everything else is parked until the client reports it.**
> Build under test: `build-20261021T074258Z` (commits `fa0a884`, `bce1848`). Git is the owner's; stop before staging.

## Found issues: state

| Issue | State | What is left |
|---|---|---|
| I-77 Hose Reel autosave remount | **Phone-verified 2026-10-21** | None |
| I-78 cold start never recovers | **Phone-verified 2026-10-21** (Online in 14 s, no tap) | None |
| I-79 repair save stall (4 tabs) | Mitigated (notice only), committed | Phone check 2026-10-21: not reproduced with 4 tabs; a 7-tab variant hung a new tab (N-1). **Note and ignore** (owner decision). |
| I-80 drawer Back | Fixed, **phone-verified** | None |
| I-81 calendar status words | Fixed, committed | Phone check only if the demo data has scheduled days; Playwright covers it. |
| OA-7 New Service Visit setup lost | **Phone-verified 2026-10-21** (one visit on replay) | None |
| P1, P2, R3 technician side | **Phone-checked 2026-10-21** | None |
| P4, R3 Manager page | **Phone-checked 2026-10-21** | None |

## Prompt 1 — Technician phone check (DONE 2026-10-21, results in PHONE_TESTING_STATUS.md; kept for reference)

Needs the technician password from the owner at the start of the chat. Do not write it to any file.

```text
Read AGENTS.md, docs/remaining-work/NEXT_STEPS_PROMPTS.md and docs/testing/PHONE_TESTING_STATUS.md (section 3 "how to drive the phone", and the last section "Fix-round phone check, manager side"). Do not touch Docker Compose, the database schema, or Git (no stage/commit). Fix nothing unless a check fails.

Context: build build-20261021T074258Z is deployed and on the USB phone (CPH2375, http://localhost:8081, NOT production HTTPS). The phone is signed in as Manager mobiletest. The owner will give the technician-demo password in this chat: type it into the sign-in screen only, never into a file or a command that is logged. Real taps for buttons (adb input tap), CDP only to read state or set text fields; say which is which.

Run these checks as technician-demo and record PASS / FAIL with evidence in a new section of docs/testing/PHONE_TESTING_STATUS.md and update the I-77 / I-78 / OA-7 rows (Fixed in source -> Verified, or reopen with the failing steps):
1. I-77: open a Hose Reel inspection, tap Location, type, stop. Poll every 40 ms for ~8 s: the text input must stay connected (isConnected true), keep focus, and the keyboard must not close. Text saved in IndexedDB.
2. I-78: Wi-Fi on, Set-ServerUnreachable, Stop-AppOnPhone + Start-AppOnPhone, choose Technician (header Offline + Reconnect), then Start-PhoneProxy. Within ~30 s the header must reach Online with no tap on Reconnect.
3. OA-7: New Service Visit: pick customer, site, a service, type a Service Call No; Stop-AppOnPhone + Start-AppOnPhone -> setup restored with "Your unfinished setup was restored" and Start over. Then Set-ServerUnreachable, tap Create (message: may already have been created), force-stop and reopen -> form read-only except Create / Start over; Start-PhoneProxy, tap Create -> exactly ONE visit on the server (same requestId in the proxy log), draft cleared.
4. P1: Take Photo is the only photo button; deny the camera permission (or use a state where the camera cannot start) -> "Camera not working? Upload from gallery" appears, confirm box, picked photo shows "Uploaded from gallery".
5. P2: as Manager, open the accepted detail / Final Report that contains that gallery photo: label "GALLERY · uploaded <time>" is shown; the customer PDF is unchanged (no gallery text).
6. R3 Automatic Sprinkler: Others -> Add to common remarks -> "Sent for approval", read-back "Your remark requests" at the foot of the form; Manager approves it; another customer's Sprinkler row offers it.
7. I-79 (best effort, 10 min max): open one repair visit and 3 more tabs of the same route, type remarks, take an After photo. If "Saving is slow" appears, record it; if nothing stalls, write "not reproduced - noted and ignored (owner decision)" and stop.

Rules: report each failure with steps, build id and evidence before changing anything; any fix needs a regression test that fails before and passes after; run git diff --check; stop before staging. End with: checks PASS/FAIL, new issues (P0-P3), test data left behind, what is not tested.
```

## Parked until the client reports it (take note only, no work)

| Item | Why parked | Trigger to reopen |
|---|---|---|
| Inline Add Customer / Add site fields lost on refresh (online) | Not an observed problem; New Service Visit setup itself is now kept (OA-7). Offline Add Customer already saves on the device via the standalone page. | A technician loses typed customer / site text. |
| OA-4 offline new site | Needs a new queue and server rules (a feature). | Technician cannot add a missing site without signal. |
| Visual polish pass (web-design-guidelines audit) | No defect found. | Client or owner asks for a design pass before a demo. |
| I-79 root cause (which tab holds the IndexedDB transaction) | Seen once, not reproduced. | It happens again. |
| OA-12 old rows in PHONE_TESTING_STATUS.md | Docs only. | Next time the file is reorganised. |

## Release checklist (not code changes; do when deploying to the client PC)

These are deployment steps, not found issues. Do them at the release checkpoint (Level 3 in AGENTS.md), not before.

1. Back up the client database.
2. Apply migrations 057 (remark requests), 058 (staged evidence `captured_at`), 059 (customer confirmation). They run on API start; they are additive and idempotent; untested on a production-sized database.
3. Installed app (WebAPK) on the real HTTPS domain: sign-in, camera, offline typing, force-close and reopen, reconnect sync.
4. Docker Compose build/start, API health, PostgreSQL restart persistence.
