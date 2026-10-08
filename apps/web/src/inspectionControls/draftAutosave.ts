/**
 * I-04: debounced autosave of an open Draft form. Framework-free so the rules can be tested without a browser.
 *
 * Rules that keep it safe:
 * - Nothing is written until the technician has actually interacted (`noteUserEvent` captures the baseline), so merely
 *   opening a Draft never rewrites it.
 * - Saves go through the form's own Save Draft callback, one at a time (the repositories use optimistic concurrency on
 *   `localUpdatedAt`, so two overlapping saves would collide).
 * - A failed save keeps the form dirty (leave warning stays on) and is retried on the next change or flush.
 */
export type DraftAutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export type DraftAutosaverOptions<T> = {
  delayMs: number;
  getLatest: () => { value: T; enabled: boolean };
  save: (value: T) => Promise<void>;
  serialize?: (value: T) => string;
  /** What the record will look like after a save of this value, when the save stores a canonical copy (I-18). */
  echoOf?: (value: T) => T;
  onStatus?: (status: DraftAutosaveStatus) => void;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export const DRAFT_AUTOSAVE_DELAY_MS = 1500;

export class DraftAutosaver<T> {
  private baseline: string | null = null;
  private lastSaved: string | null = null;
  private lastEcho: string | null = null;
  private timer: unknown;
  private inFlight: Promise<void> | null = null;
  private failed = false;
  /** Number of saves that completed successfully; lets a caller tell whether a flush actually wrote something. */
  saveCount = 0;
  private readonly serialize: (value: T) => string;

  constructor(private readonly options: DraftAutosaverOptions<T>) {
    this.serialize = options.serialize ?? ((value) => JSON.stringify(value));
  }

  /** Called from a capture-phase listener, i.e. before the form applies the user's change. */
  noteUserEvent() {
    if (this.baseline === null) this.baseline = this.serialize(this.options.getLatest().value);
  }

  isDirty() {
    const { value, enabled } = this.options.getLatest();
    return enabled && this.baseline !== null && this.serialize(value) !== this.baseline;
  }

  /** The form value changed (or a retry is due): schedule a debounced save when there is unsaved typing. */
  valueChanged() {
    this.clear();
    if (!this.isDirty()) { if (!this.inFlight && !this.failed) this.options.onStatus?.("idle"); return; }
    this.options.onStatus?.("pending");
    this.timer = (this.options.setTimer ?? ((cb, ms) => setTimeout(cb, ms)))(() => { this.timer = undefined; void this.flush(); }, this.options.delayMs);
  }

  /**
   * The `record` prop changed. If it is the echo of our own save, keep any newer typing (the form's reset effect has
   * just replaced it with the saved snapshot); otherwise it is an outside change, so start a fresh baseline.
   */
  recordChanged(record: T, previousLocalValue: T, restore: (value: T) => void) {
    const own = this.lastEcho !== null && this.serialize(record) === this.lastEcho;
    if (own) {
      if (this.serialize(previousLocalValue) !== this.lastSaved) {
        if (this.options.getLatest().enabled) restore(previousLocalValue);
      } else if (this.lastEcho !== this.lastSaved) {
        // Nothing was typed after the save and the form now shows the canonical copy: that is the saved state.
        this.baseline = this.lastEcho;
      }
    } else {
      this.baseline = null;
      this.lastSaved = null;
      this.lastEcho = null;
      this.failed = false;
    }
  }

  /** Save now if dirty. Never throws. Used by the debounce, tab hide, unmount and beforeunload. */
  async flush(): Promise<void> {
    this.clear();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (this.inFlight) { await this.inFlight; continue; }
      if (!this.isDirty()) return;
      const { value } = this.options.getLatest();
      const snapshot = this.serialize(value);
      this.options.onStatus?.("saving");
      const run = this.options.save(value).then(
        () => { this.baseline = snapshot; this.lastSaved = snapshot; this.lastEcho = this.options.echoOf ? this.serialize(this.options.echoOf(value)) : snapshot; this.failed = false; this.saveCount += 1; },
        () => { this.failed = true; }
      );
      this.inFlight = run;
      await run;
      this.inFlight = null;
      if (this.failed) { this.options.onStatus?.("error"); return; }
      if (!this.isDirty()) { this.options.onStatus?.("saved"); return; }
    }
  }

  dispose() { this.clear(); }

  private clear() {
    if (this.timer !== undefined) { (this.options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)))(this.timer); this.timer = undefined; }
  }
}
