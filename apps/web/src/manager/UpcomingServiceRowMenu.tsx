import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export type UpcomingServiceAction = "reminders" | "routine";

/** "More actions" menu for one customer row: keyboard operable, Escape closes and returns focus to the trigger. */
export function UpcomingServiceRowMenu({ customerName, hasDueDate, onSelect }: {
  customerName: string;
  hasDueDate: boolean;
  onSelect: (action: UpcomingServiceAction, opener: HTMLElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    wrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);
  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
    else if (event.key === "Tab") setOpen(false);
    else if (event.key === "ArrowDown") { event.preventDefault(); items[(index + 1) % items.length]?.focus(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus(); }
    else if (event.key === "Home") { event.preventDefault(); items[0]?.focus(); }
    else if (event.key === "End") { event.preventDefault(); items.at(-1)?.focus(); }
  }
  function choose(action: UpcomingServiceAction) { setOpen(false); onSelect(action, triggerRef.current); }
  return <div className="upcoming-menu" ref={wrapRef}>
    <button ref={triggerRef} type="button" className="secondary-command upcoming-menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      aria-label={`More actions for ${customerName}`} onClick={() => setOpen(!open)}
      onKeyDown={(event) => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); setOpen(true); } }}><span aria-hidden="true">⋯</span></button>
    {open && <div id={menuId} role="menu" aria-label={`Actions for ${customerName}`} className="upcoming-menu-list" onKeyDown={onMenuKeyDown}>
      {hasDueDate && <button type="button" role="menuitem" onClick={() => choose("reminders")}>Reminder recipients</button>}
      <button type="button" role="menuitem" onClick={() => choose("routine")}>Service routine</button>
    </div>}
  </div>;
}
