import { useEffect, useState, type ReactNode } from "react";

export function matchesOpenWork(query: string, fields: Array<string | undefined | null>) {
  return fields.some(field => field?.toLowerCase().includes(query));
}

/** UI preferences only: no visit identifiers, search text or business data. */
export function OpenWorkSection({ userId, section, title, count, matchCount, query, children }: {
  userId?: number; section: "service" | "repair"; title: string;
  count: number; matchCount: number; query: string; children: ReactNode;
}) {
  const storageKey = userId === undefined ? undefined : `inspection-pwa:open-work:v1:user:${userId}:${section}:collapsed`;
  const [collapsed, setCollapsed] = useState(() => {
    try { return storageKey ? localStorage.getItem(storageKey) === "true" : false; }
    catch { return false; }
  });
  const [searchOverride, setSearchOverride] = useState<{ query: string; collapsed: boolean }>();
  useEffect(() => setSearchOverride(undefined), [query]);
  // Search expansion is temporary; clearing search restores the device preference.
  const hidden = query && matchCount > 0
    ? searchOverride?.query === query ? searchOverride.collapsed : false
    : collapsed;
  const contentId = `open-work-${section}-content`;
  return <section aria-labelledby={`open-work-${section}-title`}>
    <div className="open-work-section-heading">
      <h3 id={`open-work-${section}-title`}>{title} ({count}){query ? ` — ${matchCount} matches` : ""}</h3>
      <button type="button" className="secondary-command" aria-expanded={!hidden} aria-controls={contentId}
        aria-label={`${hidden ? "Show" : "Hide"} ${title.toLowerCase()}`} onClick={() => {
          if (query && matchCount > 0) { setSearchOverride({ query, collapsed: !hidden }); return; }
          setCollapsed(!hidden);
          try { if (storageKey) localStorage.setItem(storageKey, String(!hidden)); } catch { /* Storage is optional. */ }
        }}>{hidden ? "Show" : "Hide"}</button>
    </div>
    <div id={contentId} hidden={hidden}>{children}</div>
  </section>;
}
