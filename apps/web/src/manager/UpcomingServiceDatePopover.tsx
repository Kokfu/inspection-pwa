import { useEffect, useRef, useState, type KeyboardEvent } from "react";

/** Small non-modal date picker for one row. An empty date is allowed and clears the due date. */
export function UpcomingServiceDatePopover({ customerName, initial, busy, onSave, onCancel }: {
  customerName: string;
  initial: string;
  busy: boolean;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
  }
  return <div className="upcoming-popover" role="dialog" aria-label={`Service date for ${customerName}`} onKeyDown={onKeyDown}>
    <label>Next service due<input ref={inputRef} type="date" aria-label={`Next service due for ${customerName}`} value={value} disabled={busy} onChange={(event) => setValue(event.target.value)} /></label>
    <div className="upcoming-popover-actions">
      <button type="button" disabled={busy} onClick={() => onSave(value)}>Save</button>
      <button type="button" className="secondary-command" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}
