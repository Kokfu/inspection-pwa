# CR-06 — result option "jumps to the top"

Status 2026-10-10: **fixed for the reproduced cause (scroll continuity); phone retest pending. One design decision left to the owner (below).**

## Reproduction (real `App`, 360×800, touch emulation, healthy mock server)

Harness: `apps/web/tests/result-tap-scroll.html` (seeds a Draft per system through its real repository using the V7 template,
then routes the real `App` to it) + `result-tap-scroll.spec.ts`.

| Scenario | Result |
|---|---|
| Tap Not Good / Good / N.A. (and native `<select>` in Fire Alarm), wait past the 1.5 s autosave | **No scroll change in any of the 12 forms** (Portable Fire Extinguisher has no result controls) |
| Same, then a connectivity hand-over (`offline` immediately followed by `online`) | **11 of 11 forms with result controls jumped to the top**: scrollY 886–2346 → 108, form replaced by a placeholder |

Timeline (Hydrant): form at scrollY 1412 → "Reconnecting for …" (page height 7313 → 924) → "Opening Hydrant inspection…" → form back at scrollY 108.

Candidates ruled out: remount from autosave (I-23 holds), content above changing height, `scrollIntoView`/`focus()` (only after a failed Submit), Not Good block stealing focus, autosave/sync refreshing the record.

## Root cause

`window` `offline`/`online` → `revalidateForConnectivityRecovery` / `beginOnlineConnectivityRecovery`
(`App.tsx` `handleOffline`/`handleOnline`) → `beginServerVerification()` revokes the verified authority and sets
`authState` to `"verifying"` (`auth/authRestoration.ts:28`). Every form route then drops its open record and shows a
placeholder (route effects for Hydrant, Smoke Ventilation, Fire Intercom, Roller Shutter, Portable, Riser, Sprinkler, Fire Alarm,
the `canRenderLocal*` gates, and the CO2 / FM200 / Wet Chemical authority states). The page collapses to ~900 px, the browser
clamps `scrollY` to the top, and the form returns at the top.

This hiding is **intentional fail-closed authority behaviour**: `tests/routeRefresh.test.ts` ("anything that changes authority …
resets as before") and `tests/hydrant-app-resolution.html` ("prior verified authority result cannot survive a new verification",
"resolution error keeps local Draft hidden"). So it was not removed.

## Fix (scroll continuity only)

- `src/jobs/formScrollContinuity.ts` (new): remembers `scrollY` when a re-verification begins while a Draft form is open and
  puts it back when the form reappears (same route, within 2 minutes; any route change drops it).
- `App.tsx`: three lines — import, `useFormScrollContinuity()`, `holdFormScroll()` first in `beginServerVerification()`.
- `inspectionControls/autosaveStatus.ts`: `useAutosaveActive()` (re-renders only when a form opens/closes, not on save ticks).
- No Dexie/PostgreSQL/API/auth-rule change.

Regression proof: the hand-over test fails on pristine HEAD (11/11, scroll moved 778–2238 px) and passes with the fix
(11/11, scroll difference 0 px). Run: `npm run test:form-scroll` in `apps/web`.

## Limits / owner decision

- During the re-verification (usually well under a second; longer on a slow link) the technician still sees
  "Reconnecting…" / "Opening … inspection…" instead of the form, and the on-screen keyboard closes. Typed text is safe
  (autosave flushes on unmount).
- **Option B (not done — Level 2, your call):** keep the open Draft mounted during a same-user re-verification. That removes
  the flash and the keyboard loss but relaxes the existing "re-resolve authority before showing a local Draft" rule and needs
  the authority tests re-baselined.
- Not proven: that a phone's tap on Not Good coincides with a network hand-over. The jump needs a connectivity event.

## Phone retest

1. Open any inspection form, scroll to the middle, tap Not Good on a field (note which form).
2. Quickly toggle Wi-Fi off and on (or switch Wi-Fi ↔ mobile data) while still scrolled down.
3. Expected: "Reconnecting…" flashes, then the form returns **at the same place**. Previously it returned at the top.
4. Repeat with airplane mode on then off. Also confirm normal taps and the autosave line behave as before.
5. If it still jumps with **no** network change: note the form, the option, whether the autosave line changed, Android Chrome version.
