---
name: mobile-first-ui
description: Project UI/layout rules for the inspection PWA — mobile-first sizing, breakpoints, design tokens, touch targets, form and status patterns, and future native-app readiness. Use before changing any screen, component, or apps/web/src/styles/app.css.
---

# Mobile-First UI Skill

## Purpose

Technicians use this app on phones, outdoors, often one-handed, often offline.
Managers use it on desktop. Every screen must work at 360px wide first, then
scale up. The same screens must later be wrappable as a mobile app
(installed PWA / Capacitor-style shell) without redesign.

Pair with:
- `web-design-guidelines` (`.claude/skills/`) — audit against Web Interface Guidelines.
- `vercel-react-best-practices` (`.claude/skills/`) — React performance rules.
- `offline-first-pwa` — offline never disables inputs; this skill never overrides that.

## Non-Negotiable Rules

1. **Tokens only.** Colour, spacing, radius, shadow, type and tap size come from
   the `:root` tokens in `apps/web/src/styles/app.css`. No new raw hex, px
   spacing, or font sizes in rules. If a token is missing, add it to `:root`
   first and explain why.
2. **Canonical breakpoints only** (media queries cannot read custom properties):
   - base styles = phone (≥360px) — write these first, no media query
   - `@media (min-width: 521px)` — large phone / small tablet
   - `@media (min-width: 768px)` — tablet / desktop layouts (multi-column)
   - `@media (min-width: 1200px)` — wide desktop
   New code uses **min-width (mobile-first)**. Existing `max-width: 520px` /
   `max-width: 767px` blocks are tolerated; do not add new odd values
   (560, 600, 640, 1024…). When touching a block using an odd value, migrate it
   to the nearest canonical breakpoint only if the change is in scope.
3. **Touch targets ≥ `var(--tap)` (44px)** tall and wide for every button,
   link-button, checkbox/radio label, segmented option, and icon button.
   Keep ≥ `var(--space-2)` between adjacent targets.
4. **Inputs stay at `font-size: 1rem` (16px) or larger** — smaller triggers iOS
   auto-zoom on focus.
5. **No horizontal page scroll at 360px.** Tables become stacked cards or a
   contained `overflow-x: auto` wrapper; long IDs/emails use
   `overflow-wrap: anywhere`.
6. **Fluid, not fixed.** Use `max-width` + `width: 100%`, `minmax()`,
   `clamp()`, flex-wrap and `auto-fit` grids. Never set fixed pixel widths on
   containers; never use `100vh` for full-height (use `100dvh` with a `100vh`
   fallback).
7. **Primary action reachable by thumb.** On phone, the main action of a form
   (Save / Submit / Next) sits at the bottom of the content or in a sticky
   bottom bar that respects `env(safe-area-inset-bottom)`.
8. **Status is never colour-only.** Good / Poor / Not Relevant, Pending /
   Syncing / Synced / Failed / Conflict always show text (and optionally an
   icon) plus the semantic token colour. Contrast ≥ 4.5:1 for text (use
   `--muted-on-sunken` on sunken surfaces).
9. **Visible focus** via `--focus-ring` / `--focus-outline`; never remove
   outlines without a replacement.
10. **Respect `prefers-reduced-motion`**; animations only inside
    `@media (prefers-reduced-motion: no-preference)`.

## Layout Patterns

- **Page:** single column on phone, `max-width: var(--page-width)` centred,
  side padding `var(--space-4)` phone → `var(--space-6)` ≥768px.
- **Navigation:** phone = compact top bar and/or bottom tab bar (max 5 items);
  ≥768px = the persistent left sidebar. Same routes, same labels.
- **Cards/KPI tiles:** `grid-template-columns: repeat(auto-fit, minmax(160px, 1fr))`.
- **Forms:** one field per row on phone; label above input (never placeholder as
  label); error text directly under the field, linked with `aria-describedby`.
  Two columns allowed only ≥768px.
- **Check rows (Good / Poor / Not Relevant):** full-width segmented options on
  phone, each ≥ `--tap`; Poor reveals remark + photo inline beneath the row.
- **Lists/tables:** phone = stacked cards with the key field (customer / job)
  as the title; desktop = table.
- **Empty / loading / error states:** every list and dashboard panel has all
  three; loading uses skeletons sized like the final content (no layout jump).
- **Offline/sync banner:** informational, non-blocking, never covers inputs or
  the primary action.

## Future Mobile-App Readiness

- `index.html` viewport should include `viewport-fit=cover`; fixed top/bottom
  bars pad with `env(safe-area-inset-*)`.
- Never rely on hover for essential information; hover effects stay inside
  `@media (hover: hover)`.
- Keep screens route-driven and component-scoped so a native shell can reuse
  them unchanged; no desktop-only interactions (right-click, drag-only).
- Camera/file inputs use `accept="image/*"` and `capture` where appropriate.

## Verification (per UI change)

1. Check the changed screens at **360×800, 768×1024, 1280×800** in the browser
   preview (`resize_window`); screenshot phone + desktop.
2. Confirm: no horizontal scroll at 360px, targets ≥44px, no text clipping,
   focus visible, primary action visible without zooming.
3. Run the `web-design-guidelines` audit on the changed files for larger UI work.
4. Existing Playwright specs for the touched screens still pass; typecheck;
   `git diff --check`.
5. Final Report web view must stay pixel-identical unless the task changes it.
