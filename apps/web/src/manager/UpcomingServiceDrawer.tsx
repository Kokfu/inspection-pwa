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
