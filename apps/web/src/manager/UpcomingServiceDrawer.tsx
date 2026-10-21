import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

/** Right-side modal drawer: labelled by the customer name, traps Tab, Escape or the backdrop closes it. */
export function UpcomingServiceDrawer({ kindLabel, customerName, onClose, children }: {
  kindLabel: string;
  customerName: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { panelRef.current?.querySelector<HTMLElement>("button")?.focus(); }, []);
  // I-80: Android Back should close the drawer, not leave the screen. The drawer owns one history entry (same URL, so no
  // route change); Back pops it and closes, and closing any other way pops it so the history stays clean. The push is
  // deferred one tick so React's development double-mount never leaves a stray entry.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    let pushed = false;
    let poppedByBack = false;
    const timer = window.setTimeout(() => { history.pushState({ ...(history.state as object | null), upcomingDrawer: true }, ""); pushed = true; }, 0);
    const onPop = () => { if (!pushed) return; poppedByBack = true; pushed = false; closeRef.current(); };
    window.addEventListener("popstate", onPop);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", onPop);
      if (pushed && !poppedByBack && (history.state as { upcomingDrawer?: boolean } | null)?.upcomingDrawer) history.back();
    };
  }, []);
  // Keep the page behind the modal drawer from scrolling.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !(element as HTMLButtonElement).disabled && element.getClientRects().length > 0);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !event.currentTarget.contains(active))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (active === last || !event.currentTarget.contains(active))) { event.preventDefault(); first.focus(); }
  }
  return <div className="upcoming-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panelRef} className="upcoming-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className="upcoming-drawer-head">
        <h3 id={titleId}>{kindLabel}: {customerName}</h3>
        <button type="button" className="secondary-command" onClick={onClose}>Close</button>
      </div>
      <div className="upcoming-drawer-body">{children}</div>
    </div>
  </div>;
}
