# CR-06 option B — keep the open Draft mounted during a same-user re-verification

Paste to Terra. Level 2 (auth / data integrity). Do NOT start before the CR-06 phone retest result is known: if the scroll-continuity
fix (`11570ea`) is good enough on the phone, this task may not be needed.

```
Follow .agents/skills/codex-task-brief/SKILL.md. Read offline-first-pwa, sync-engine, backend-api-security, pwa-release-testing,
mobile-first-ui. Read docs/testing/CR06_FORM_SCROLL_JUMP.md first.

CONTEXT
A phone network hand-over (window "offline" then "online") calls beginServerVerification() (App.tsx), which revokes the verified
authority and sets authState "verifying". Every form route then drops its open record and shows an "Opening … inspection…"
placeholder (route effects: Hydrant, Smoke Ventilation, Fire Intercom, Roller Shutter, Portable, Riser, Sprinkler, Fire Alarm;
CO2 / FM200 / Wet Chemical authority states; Hose Reel), and the canRenderLocal* gates (src/*/…Resolution.ts) hide the local Draft.
CR-06 (commit 11570ea) only restores the scroll position afterwards. The form still disappears for the duration, focus and the
on-screen keyboard are lost, and "Reconnecting…" flashes. Goal: for the SAME user, a re-verification must not unmount an open
Draft form.

TASK
1. Design first (print it before editing): a single shared mechanism, not 12 copies. Suggested: while authState is "verifying" for
   the same user id that was settled before, route effects and gates keep using the last settled {status, generation, verifiedAt};
   on completion the route re-resolves as a REFRESH of the same record (isRouteRefresh true) and mergeResolvedRecord keeps the
   newer local version. Reuse src/jobs/routeRefresh.ts; do not invent a parallel mechanism.
2. Keep fail-closed for everything that is not a same-user re-check:
   - different user, logged-out, online-unavailable, restoring, sign-out  -> form hidden as today
   - re-resolution finds a server Accepted record for the job/system -> switch to the read-only server view (Accepted wins over a stale Draft)
   - re-resolution errors or returns malformed data -> Draft hidden again (no silent fallback to stale data)
   - job closed/completed -> read-only as today
3. Offline contract: typing and autosave must keep working during the window. handleSave*/handleSubmit* use the active record state;
   it must NOT be cleared (otherwise autosave silently does nothing). Prove it with a test that types during the window.
4. Do not touch Dexie, PostgreSQL, migrations, API, Docker, Caddy, .env, V1–V7 templates. No new migration.
5. Keep src/jobs/formScrollContinuity.ts as a backstop for the cases that still hide the form (error / Accepted switch). Do not remove it.
6. Tests that must be UPDATED deliberately (not weakened): tests/routeRefresh.test.ts (re-verification of the same user becomes a refresh;
   other changes still reset), tests/hydrant-app-resolution.html "Reconnect A. prior verified authority result cannot survive a new
   verification" (restate: cannot survive for a different user or a failed/accepted re-resolution). Explain each change in the report.
7. New tests (fail before, pass after; prove by running them on `git archive HEAD` of the pre-change commit, never git stash):
   - tests/result-tap-scroll.spec.ts hand-over group: assert the SAME DOM element survives (mark an input, flap, same element, still focused,
     typed text kept, scrollY unchanged) for all 11 result-bearing forms.
   - flap with the server returning an Accepted record -> read-only server view, no editable Draft.
   - flap where /api/auth/me returns 401 -> logged-out, form hidden. Different user -> hidden.
   - flap where the resolution request fails/malformed -> Draft hidden, not stale.
   - autosave during the window saves exactly once; no lost typing; no duplicate outbox item.
   - existing: connectivity-recovery, hydrant-app-resolution, hydrant-verified-revalidation, hydrant-reload-routing,
     server-summary-refresh-authority, form-stays-mounted-on-autosave, draft-autosave-submit, offline-start-readiness,
     technician-offline-regression, test:route-refresh, test:auth-probe-gateway, test:authority-offline-fallback.

DoD ADDITIONS (Level 2): idempotency, stale callers, exact-UUID confirmation untouched; server authority tests green; existing-system
behaviour unchanged; web typecheck, build (to a scratch outDir if the owner is phone-testing from dist), git diff --check.
Update HANDOVER.md and docs/testing/CR06_FORM_SCROLL_JUMP.md. Report P0/P1/P2.

RISKS TO CALL OUT IN THE REPORT
- A stale Draft is editable for the duration of the re-check; state the exact maximum window and what happens to edits if the
  re-check then finds an Accepted record (they stay in the local Draft; nothing is synced as Accepted).
- Other agents edit App.tsx concurrently (CR-09/CR-08 hunks): keep edits small, do not reformat.
STOP when the DoD table is green. Do NOT commit.
```
