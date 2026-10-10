import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { getAutosaveStatus, useAutosaveActive } from "../inspectionControls/autosaveStatus";

/**
 * CR-06: re-verifying the session (a phone's Wi-Fi / mobile-data hand-over fires `offline` then `online`) deliberately
 * hides every open inspection form until its authority has been re-resolved. For that moment the page is only a short
 * placeholder, so the browser clamps the scroll position to the top, and the form comes back at the top.
 *
 * The hiding is the fail-closed authority rule (see routeRefresh.ts), so it stays. This only remembers where the
 * technician was when the re-verification began and puts the form back there when it reappears.
 */
export type ScrollHold = { y: number; hash: string; at: number };

/** Long enough for a slow reconnect, short enough that a form opened much later is never scrolled by a stale hold. */
export const SCROLL_HOLD_MAX_AGE_MS = 120_000;

/**
 * The hold to keep when a re-verification begins. While a form is on screen its scroll position is the truth. Once the
 * form is already gone (a second hand-over during the same recovery) the page has collapsed, so keep what was captured.
 */
export function captureScrollHold(formOpen: boolean, y: number, hash: string, now: number, existing: ScrollHold | null): ScrollHold | null {
  if (formOpen && Number.isFinite(y) && y > 0) return { y, hash, at: now };
  return existing && now - existing.at <= SCROLL_HOLD_MAX_AGE_MS ? existing : null;
}

/** Restore only for the same route, soon after, once the form is back. */
export function shouldRestoreScroll(hold: ScrollHold | null, hash: string, now: number): hold is ScrollHold {
  return hold !== null && hold.hash === hash && now - hold.at <= SCROLL_HOLD_MAX_AGE_MS;
}

/** Call the returned function just before a re-verification starts. */
export function useFormScrollContinuity() {
  const formOpen = useAutosaveActive();
  const hold = useRef<ScrollHold | null>(null);

  useLayoutEffect(() => {
    if (!formOpen || !hold.current) return;
    const held = hold.current;
    hold.current = null;
    if (shouldRestoreScroll(held, window.location.hash, Date.now())) window.scrollTo({ top: held.y, left: 0, behavior: "instant" });
  }, [formOpen]);

  // Any route change ends the hold: a form opened later must start at its own top.
  useEffect(() => {
    const drop = () => { hold.current = null; };
    window.addEventListener("hashchange", drop);
    return () => window.removeEventListener("hashchange", drop);
  }, []);

  return useCallback(() => {
    hold.current = captureScrollHold(getAutosaveStatus().active, window.scrollY, window.location.hash, Date.now(), hold.current);
  }, []);
}
