// I-70: many open tabs of this app on one phone (about 150 MB each) push Chrome into memory pressure, and saves then
// stall for tens of seconds until it discards the oldest tab. Releasing IndexedDB on hide did not help (phone test
// 2026-10-17), so the app only counts its other tabs and tells the technician. A Web Lock lasts exactly as long as its
// page, so frozen tabs are counted too and a discarded tab drops out. No IndexedDB or network is touched here.
export const TAB_LOCK_PREFIX = "inspection-app-tab:";
/** The phone test blocked saves from about the 8th tab; warn from the 4th (3 others). */
export const OTHER_TABS_WARN_AT = 3;

export type LockSnapshot = { held?: ReadonlyArray<{ name?: string | null }> } | null | undefined;
export type LockManagerLike = {
  request(name: string, options: { mode: "shared" }, callback: () => Promise<unknown>): Promise<unknown>;
  query(): Promise<LockSnapshot>;
};

/** Pure: how many tabs other than `selfName` currently hold a presence lock. */
export function countOtherTabs(snapshot: LockSnapshot, selfName: string): number {
  const names = new Set<string>();
  for (const lock of snapshot?.held ?? []) {
    if (typeof lock.name === "string" && lock.name.startsWith(TAB_LOCK_PREFIX) && lock.name !== selfName) names.add(lock.name);
  }
  return names.size;
}

export function shouldWarnAboutTabs(otherTabs: number): boolean {
  return Number.isInteger(otherTabs) && otherTabs >= OTHER_TABS_WARN_AT;
}

export function tabNoticeText(otherTabs: number): string {
  return `This app is open in ${otherTabs} other browser tabs. Too many open tabs can make saving slow or stuck on this phone. Close the extra tabs, or use the installed app, and keep just one open.`;
}

export type TabPresence = { name: string; readOtherTabs(): Promise<number>; stop(): void };

/** Hold a shared presence lock for the life of this page. Returns undefined where Web Locks is unavailable. */
export function startTabPresence(locks: LockManagerLike | undefined, id: string): TabPresence | undefined {
  if (!locks) return undefined;
  const name = `${TAB_LOCK_PREFIX}${id}`;
  let release: () => void = () => undefined;
  let stopped = false;
  // The returned promise settles only when stop() runs or the page goes away, which is what releases the lock.
  void locks.request(name, { mode: "shared" }, () => new Promise<void>((resolve) => { release = resolve; if (stopped) resolve(); })).catch(() => undefined);
  return {
    name,
    async readOtherTabs() { try { return countOtherTabs(await locks.query(), name); } catch { return 0; } },
    stop() { stopped = true; release(); }
  };
}
