# Phone Testing — Status, Issue Register and Next Steps

> **Living document.** Every issue found while testing goes into the register below (§5) *before* anything
> else. Fixes and retests then reference the issue ID. A new chat can resume from this file alone.
>
> **Last updated:** 2026-10-08 · **Branch:** `phase-8e-client-demo-polish` · **Base before this work:** `18e9895`
> **Commits:** `10f3bbb` (F-1 server fix) · `3df96d9` (F-2/F-3 web fixes) · docs + tooling commit (this file, `scripts/phone-testing/`)
> **Build verified on the phone:** `build-20261007T151746Z` (deployed release `sha256-f29129f665ca9c59`)
> **Device:** OnePlus/Oppo `CPH2375` (adb serial `182449ec`), Chrome + installed WebAPK, USB-connected.

---

## 1. The working loop

1. **Test** on the phone (or API/browser) → anything wrong becomes a row in §5 with an ID (`I-nn`), severity,
   how to reproduce and evidence.
2. **Fix** one issue (or a small related group) → add a regression test that **fails before / passes after**
   (prove it by temporarily restoring the original source with `git show HEAD:<file>`, never `git stash`).
3. **Rebuild** — the *user* rebuilds the Docker containers (the agent must not touch Docker Compose).
4. **Retest on the phone** with the same steps that found the issue; record before/after numbers.
5. **Update this file** (status column, test matrix, "Last updated"), then stop before staging. The user does git.

Severity: **P0** data loss/security hole · **P1** blocks core field work · **P2** degraded/confusing/hardening ·
**P3** cosmetic/cleanup. A task is not complete with an open P0/P1 in its scope (see `AGENTS.md`).

---

## 2. Where we are (snapshot)

**Fixed and verified this round**

| ID | What | Verified |
|----|------|----------|
| F-1 | **P1 (server):** an identical retry of an already-staged V7/V6 evidence photo returned `409 IDEMPOTENCY_CONFLICT` (bigint-vs-number compare) → a photo whose response was lost could never sync. Fix: `String(actorUserId)` in `v7StagedEvidence.ts` + `fireAlarmV6Evidence.ts`. | Integration tests (11 V7 suites + V6) + phone: stuck photo recovered, exactly one row |
| F-2 | **P1 (web):** with Wi-Fi up but the server unreachable (or API behind Caddy returning 502/504), "Continue inspection" on a saved draft failed with "Failed to fetch". Fix: open-target + route/authority resolvers fall back to the local record on *unreachable* (network `TypeError`, 502/504, 3 s timeout); a real server answer (500/**503**/401…) still fails closed. New `apps/web/src/jobs/serverReachability.ts`. | 47 Node tests + browser harnesses + phone (scenarios A/B/C) |
| F-3 | **P2 (web):** placeholder showed "<System> inspection unavailable" for the whole load; the server was asked twice, each failure taking 2–4 s. Fix: heading says "Opening …" while loading; the second check skips the wait for 5 s after a just-found-unreachable; each check is capped at 3 s. | `route-loading-heading.spec.ts` + phone: tap→draft 6.3 s → ~2.2–2.7 s (API down: 3.1 s), no "unavailable" flash; normal path 0.25 s |

**Committed** (on explicit owner instruction for this task; normally the owner does git) — see §7.
`HANDOVER.md`, `apps/api/src/reports/finalServiceReport.ts` and `finalServiceReport.test.ts` were already modified
*before* this work, are **not ours**, and were deliberately left uncommitted.

**Deployed vs. source:** the API container (F-1) and web container (F-2, F-3) were rebuilt by the owner and verified on the
phone; the deployed build equals the committed source for these fixes.

---

## 3. Environment and how to run things

### Running the phone tests
Tooling lives in `scripts/phone-testing/` (PowerShell + Node, no secrets). Start with:

```powershell
. .\scripts\phone-testing\phone-env.ps1
Initialize-PhoneEnv          # adb forward 9222, adb reverse 8081, starts proxy.js
Invoke-Cdp "location.hash"   # run JS in the phone's Chrome tab (prefix with @ to run a file)
```

How the phone reaches the app: `phone localhost:8081 → adb reverse → proxy.js → https://localhost (Caddy)`.
Caddy redirects plain HTTP to `https://localhost/` and the phone cannot bind ports < 1024, so the proxy exists purely
to give Chrome a secure-context `http://localhost` origin (service worker, IndexedDB, camera all work).

| To simulate | Do |
|---|---|
| **Truly offline** | `Set-PhoneOffline` (Wi-Fi off **and** proxy stopped — the USB tunnel works with Wi-Fi off, so the proxy must die too) |
| **Server unreachable, Wi-Fi up** | `Set-ServerUnreachable` |
| **API down behind Caddy (502/504)** | `docker stop inspection_pwa-api-1` … `docker start inspection_pwa-api-1` |
| Lost response / cut upload / slow / fake 401 | `Set-ProxyMode "dropresp:sync"`, `"cutreq:/api/v7-evidence/stage"`, `"slow:20000:sync"`, `"status:401:/api/sync"` |
| Force-close | `Stop-AppOnPhone` then `Start-AppOnPhone` |
| Back online | `Set-PhoneOnline` |

Other scripts: `mkVisit.js` (create a visit), `fillSmoke.js` / `fillIntercom.js` (fill + submit a record),
`intercomPhotos.template.js` (Not Good rows + photos, optional tamper), `state.js` (IndexedDB queue summary),
`timeline.js` (request/state timeline when opening a draft), `audit*.js` (mobile UI audit), `validate.js` (photo validation),
`authmatrix.ps1` (needs `PWA_*_USER/PASS` env vars), `relcheck.ps1` (does the deployed bundle contain the fix?), `pwfail.ps1` (group Playwright failures).
`state.js`/`orphans.js` hard-code the technician's per-user IndexedDB name `inspection-pwa:user:436`.

### Verify a rebuild reached the phone
1. `scripts\phone-testing\relcheck.ps1` — shows the active release, whether fix strings are in the bundle, and the build id.
2. On the phone: reload → "New version available" banner → **Update now** → build id in the header must change.

### Accounts
Demo logins (technician, supervisor, admin) are **not** stored in the repo or in this file. Ask the owner for them at the
start of a chat. Another technician (`Technician1`) owns SV-47/-48/-49; the app deliberately hides other technicians' jobs.

### Gotchas that cost time
- **Keyboard (Pinyin IME):** `adb shell input text` leaves text as an uncommitted suggestion → send `KEYCODE_SPACE` to commit; use alphanumerics (underscores get mangled).
- **Floating overlay bubble** (black/white circle on the left edge) makes Android refuse permission dialogs ("close any bubbles or overlays") → close it before testing the camera.
- **Screenshots:** use `Get-PhoneScreenshot` (`adb exec-out`). Saving PNGs on the phone gets them indexed into the gallery and shifts the photo picker.
- **Background Chrome tabs are frozen** — scripted control of a non-foreground tab hangs.
- `adb reverse` is lost when the adb server restarts → re-run `Initialize-PhoneEnv`.
- App data lives in a **per-user** IndexedDB (`inspection-pwa:user:<id>`); a test harness must seed it *after* login.
- Scripted HTTPS calls need Caddy's local cert accepted, and session cookies are `Secure` (use `https://localhost/api`, not the http proxy).
- A job's systems must be opened **online once** before they can be opened offline (see I-02).
- The Playwright baseline is **123/30 → 124/30** (30 stale manager specs, see I-09); compare *sets of failing tests*, not just counts.

---

## 4. Test matrix

✅ done and passing · ⚠️ done, found issues · ⛔ blocked/not done

| Area | Result |
|---|---|
| Offline draft → Pending → sync, exactly one server row | ✅ |
| Offline photo (Not Good + photo): stage → parent atomic accept, SHA recorded, file on disk | ✅ |
| Stale evidence (Poor→Good) excluded from manifest, never blocks | ✅ |
| Partial batch (accept + reject), rejection reason kept | ✅ |
| Lost response (photo, parent) → idempotent retry, no duplicates | ✅ (after F-1) |
| Cut upload mid-body; force-close mid-sync; recovery | ✅ |
| Concurrent Sync Now (same tab) → one request | ✅ · cross-tab ⛔ (Chrome freezes background tabs) |
| Duplicate image: client blocks; server rejects at acceptance; cross-job reuse allowed | ✅ |
| Simulated expired session (401) → fails safe, recovers | ✅ (proxy-simulated; real session revocation ⛔ — denied by policy) |
| Cross-user safety (sign out/in as other role, data separated, no wrong-identity sync) | ✅ |
| App update flow (SW waiting → Update now), data survives | ✅ |
| Install to home screen (WebAPK), standalone launch, offline launch, force-close/relaunch | ✅ |
| Real gallery picker; PNG/GIF accepted; bad/oversized images rejected cleanly | ✅ |
| **Real camera capture** | ⛔ blocked by overlay bubble (I-11) |
| Container restarts (Postgres/API/Caddy): data, uploads, sessions survive | ✅ |
| Final report + PDF embed accepted photos; photo hashes on disk match DB (56/56) | ✅ |
| Auth matrix (401/403/404/409 behaviours) | ✅ |
| Mobile UI audit (360 px: no overflow, inputs ≥16 px, labelled) | ⚠️ I-06 |
| Unreachable-server open of saved draft (A/B/C scenarios) | ✅ (F-2/F-3) |
| Repo suites: API build/typecheck, 11 V7 + V6 integration (disposable PG :55432), web typecheck/build/unit | ✅ |
| Full Playwright | ⚠️ 124 pass / 30 fail (I-09) |
| HTTPS with a real domain/valid certificate; physical-phone HTTPS install | ⛔ needs production setup |
| Real camera, real expired/revoked session, cross-tab sync | ⛔ see above |

---

## 5. Issue register

Status: **Open** · **Decision** (needs owner choice) · **Fixed** · **Won't fix/by design**.

| ID | Sev | Status | Issue | Evidence / how to reproduce | Suggested direction |
|----|-----|--------|-------|-----------------------------|---------------------|
| **I-01** | P2 | Open | Header still says **"Online"** when Wi-Fi is up but the server is unreachable (and for a while after the browser goes offline if the session probe still reached the server). The label derives only from `authState.status` (`App.tsx` ~2066). F-2 makes the app *usable* despite it. | Wi-Fi on, `Set-ServerUnreachable`, read header. | Derive a "Server unreachable" label from the reachability memory/failed probes; consider a periodic lightweight probe. |
| **I-02** | P1/P2 — **Decision** | Decision | Offline, a system **never opened online** cannot be started ("Reconnect to confirm inspection status before creating a draft"); **new service visits cannot be created offline** (Create disabled). Conflicts with "Offline limits synchronization, not data entry" but protects against duplicating an inspection already accepted elsewhere. | Create a visit online, go offline fresh, tap *Start inspection*. | Owner decision. Options: pre-open/cache all systems of a job when it is loaded online; or allow offline draft creation and rely on server-side acceptance conflict handling. |
| **I-03** | P2 (P1 if field staff forget) | Open | **No automatic sync** on reconnect, app launch or interval — only **Sync Now** (only technician customers auto-sync). Departs from the sync-engine skill #10. The header does show "N inspections waiting to sync". | Submit offline, reconnect, wait 2 min, relaunch: still Pending. | Trigger a guarded sync on `online`, on launch after auth verified, and on a safe interval; keep the single-flight guard. |
| **I-04** | P2 | Open | **No autosave** and no leave-warning: typed-but-unsaved form text is lost on navigation (photos *are* saved immediately, so a photo can survive without its row). Risk: Chrome discards a tab while the technician is in the camera. | Type in a field, `#/jobs`, back: value gone. | Debounced autosave to the Draft record + `beforeunload`/route-leave guard. |
| **I-05** | P2 | Open | No **"Offline Ready"** indicator (pwa-release-testing checklist). Build id is visible. | n/a | Show service-worker-controlled + precache-complete state in the header. |
| **I-06** | P2 | Open | Header **Sign out** is 26 px tall with 10.7 px text; status labels 9.8–11.5 px (build id, "Online", "Sync needs attention", eyebrow). Hard to read/tap outdoors. | `scripts/phone-testing/audit.js` / `audit2.js` | Raise to ≥44 px target and ≥12–14 px text (see `mobile-first-ui` skill). |
| **I-07** | P2 | Open | **Orphaned `Draft` photos** remain in IndexedDB after their parent synced (stale-evidence case), and Synced attachment Blobs are kept indefinitely. | `orphans.js` → "Draft / parent Synced: 2". | Cleanup/retention policy for superseded and synced Blobs. |
| **I-08** | P2 | Open | Caddy sends **no HSTS / CSP / X-Content-Type-Options / X-Frame-Options / Referrer-Policy**. | `curl.exe -k -s -D - -o NUL https://localhost/` | Add headers in `infra/reverse-proxy/Caddyfile` (protected scope — needs explicit task). |
| **I-09** | P2 | Open | **30 Playwright specs fail** (stable, same set before/after our work): 27 manager/supervisor navigation specs wait on a "Services" nav button that no longer matches; `technician-home-ownership` T14, `manager-technicians` search, `manager-home-compliance-reminders`; and **`fire-intercom-v7-offline`** fails a layout check ("exactly one Comments box and no Date Tested / panel / location field") — possible real Fire Intercom form drift. Also dead harnesses: `fire-alarm-local-and-resolution.html` (errors in setup), `hydrant-reload-routing.html` / `hydrant-verified-revalidation.html` (predate the role chooser, not wired to any spec). | `npx playwright test --workers=1`; `scripts/phone-testing/pwfail.ps1` groups failures. | Triage: update stale selectors; decide whether `fire-intercom-v7-offline` reflects a real form regression; wire or delete dead harnesses. |
| **I-10** | P2 | Open | **Sign out with unsynced work shows no warning** (the data stays in that user's DB, but a technician may not realise). | Queue a record, tap Sign out. | Confirm dialog listing unsynced items. |
| **I-11** | — | Blocked | Real **camera capture** untested: Android blocked the permission prompt because of a floating overlay bubble. | Tap *Take Photo* → "This site can't ask for your permission". | User closes the bubble; then test Take Photo ("Allow this time"), capture, verify stored JPEG, remove it. |
| **I-12** | P3 | Open | Test debris: SV-20261007-50 Fire Intercom is stuck `Failed` ("Staged V7 evidence does not exactly match the frozen manifest") and keeps the header on **"Sync needs attention"**; SV-59 `Failed` (duplicate image, intentional). The *correction* path for a rejected parent was never exercised. | Header "Sync needs attention". | Exercise "Edit failed → correction Draft"; clean demo data (owner's call). |
| **I-13** | P3 | Open | The route screen briefly passes through "server unavailable" re-verification before settling (not user-visible after F-3, but the auth state machine still flips through `online-unavailable`). | `timeline.js` shows only OPENING→FORM now. | Optional: avoid the transient auth state when the session probe fails with a network error. |
| I-14 | — | Fixed (F-1) | Staging retry conflict | — | — |
| I-15 | — | Fixed (F-2) | Open-target "Failed to fetch" with server unreachable | — | — |
| I-16 | — | Fixed (F-3) | "Unavailable" flash + 8 s open | — | — |

**Design notes worth keeping**
- Doctrine for resolvers: *unreachable* (network `TypeError`, 502, 504, 3 s timeout) ⇒ behave as offline (local draft opens; no local record ⇒ "not cached", never create a draft blindly). *Deliberate server answer* (400/401/403/404/**500/503**) or integrity failure ⇒ **fail closed**. `503` is intentionally *not* "unreachable" (existing routing harnesses require fail-closed).
- Evidence uniqueness is enforced at **acceptance** (job + system), not staging; the client also blocks duplicates at attach and at submit.
- Staging identity includes `storedSha256`; normalisation is deterministic (verified), so honest retries match.

---

## 6. Test data left behind (local demo DB — safe to ignore or purge at the owner's discretion)

Visits created as `technician-demo`: SV-20261007-50 … -64 (customer "28/9/2026 All Services") plus extra records in
SV-20260924-45/-46. Includes one intentionally rejected record (-50 intercom) and one tampered duplicate (-59).
The installed **"Inspection PWA"** WebAPK (`org.chromium.webapk.ab425dac179d8a50b_v2`, origin `http://localhost:8081`) is on the phone.
The test proxy (`proxy.js`) may still be running on the PC. Nothing is staged or committed.

---

## 7. What is committed, and what is not

| Commit | Contents |
|---|---|
| `10f3bbb` | **API:** `inspections/evidence/v7StagedEvidence.ts`, `fireAlarmV6Evidence.ts`; tests `sync/co2V7.integration.test.ts`, `sync/fireAlarmV6Acceptance.integration.test.ts` |
| `3df96d9` | **Web:** new `jobs/serverReachability.ts`; `App.tsx` (loading headings); `hoseReel/serverMasterSystemInspectionApi.ts` (3 s timeout, 502/504 classification, 5 s unreachable memory); resolvers in `automaticSprinkler/ dryWetRiser/ fireAlarm/ fireIntercom/ fireRatedRollerShutter/ hydrant/ portableFireExtinguisher/ smokeVentilation/`; authority resolvers `co2/ fm200/ hoseReel/ wetChemical/`; tests `authorityOfflineFallback`, `serverReachability`, `route-loading-heading` (+html), `dry-wet-riser-local-and-resolution.html`, `server-sprinkler-resolution.html`; `package.json` script `test:authority-offline-fallback` |
| docs + tooling commit | `docs/testing/PHONE_TESTING_STATUS.md`, `scripts/phone-testing/**` |

**Still uncommitted and not ours** (pre-existing before this work): `HANDOVER.md`, `apps/api/src/reports/finalServiceReport.ts`,
`apps/api/src/reports/finalServiceReport.test.ts`. Do not stage them as part of phone-testing work unless the owner says so.

Commits above were made at the owner's explicit request. `AGENTS.md` otherwise forbids agents from staging/committing;
future chats must not commit unless the owner says so again for that task.

Quick re-verification commands:
```powershell
cd apps\web ; npm run typecheck ; npm run build ; npm run test:authority-offline-fallback
npx playwright test tests/route-loading-heading.spec.ts tests/dry-wet-riser-harnesses.spec.ts --workers=1
# API integration (needs the disposable Postgres on 127.0.0.1:55432 — see .agents/skills/codex-task-brief/SKILL.md):
cd apps\api ; npm run test:v6-integration   # plus the V7 suites listed in that skill
```

---

## 8. Next steps (suggested order)

1. ~~Commit the current work~~ — done (see §7); decide separately what to do with the three pre-existing uncommitted files.
2. **I-03 auto-sync** and **I-04 autosave** — the two items most likely to lose or strand a technician's work (offline-first contract).
3. **I-02 decision** — owner chooses how never-opened systems behave offline; then implement + phone-retest.
4. **I-01 / I-06 / I-05 / I-10** — header honesty, touch/text sizes, Offline-Ready indicator, sign-out warning (one UI pass).
5. **I-09** — triage the 30 failing Playwright specs (especially `fire-intercom-v7-offline`).
6. **I-11 camera test** once the overlay bubble is closed.
7. **I-08** Caddy hardening and the HTTPS/domain acceptance pass at the release checkpoint (Level 3).

---

## 9. Prompts for a new chat

### 9a. Resume (paste at the start of any new chat)
```
Read docs/testing/PHONE_TESTING_STATUS.md and AGENTS.md first, then the project skills that apply to the task
(offline-first-pwa, sync-engine, v7-evidence-acceptance, mobile-first-ui, pwa-release-testing as relevant).
Follow the loop in §1 of that file. Rules: never run git writes (stage/commit/push/stash/restore/etc.); never run
Docker Compose or touch the runtime DB/containers (I rebuild containers myself); no edits to protected scope
(migrations, Dexie schema, package-lock, Docker/Caddy, .env) unless the task says so; tests against the
disposable Postgres on 127.0.0.1:55432 only.
Phone tools: scripts/phone-testing (dot-source phone-env.ps1). My demo logins: <paste technician / supervisor / admin here>.
Current task: <one of the prompts below>
When done: update the status file (register, matrix, "Last updated"), report files changed / tests run / P0-P1-P2 /
limitations, and stop before staging.
```

### 9b. Fix an issue (replace the ID)
```
Fix I-03 (automatic sync on reconnect/launch/interval) from the issue register. Inspect the current implementation first
(apps/web/src/sync/syncEngine.ts, App.tsx handleSync / connectivity recovery), keep the single-flight guard and
exact-UUID confirmation, make the smallest change, and add regression tests that FAIL before and PASS after (prove
by temporarily restoring the original file with `git show HEAD:<path>`, then restore my version). Run web typecheck/
build/unit + the related Playwright specs. Then tell me what to rebuild so I can ask you to retest on the phone.
```

### 9c. Retest on the phone after I rebuild
```
I rebuilt the <web/api> container. Verify the new release is deployed (scripts/phone-testing/relcheck.ps1), update the
phone to the new build (Update now), then retest the steps recorded for I-<nn> in the register, plus a normal-path
regression check. Report before/after numbers, then update the status file.
```

### 9d. Continue testing (find more issues)
```
Continue phone testing from the "Not tested / next" items in docs/testing/PHONE_TESTING_STATUS.md §4 and §8.
Record every new problem in the issue register first (ID, severity, repro, evidence), then summarise. Do not fix
anything in this chat unless I ask.
```

### 9e. Triage the failing Playwright specs (I-09)
```
Work on I-09. Run the full Playwright suite once, group failures with scripts/phone-testing/pwfail.ps1, and for each group
decide: stale selector (update the spec to the current UI, keeping the assertion's intent), real regression (fix the
app), or dead harness (propose wiring or deletion). Do not weaken any assertion to make it pass. Pay special attention to
fire-intercom-v7-offline (possible real form drift). Report per-spec decisions before large edits.
```
