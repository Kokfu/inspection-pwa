import { shouldWarnAboutTabs, tabNoticeText } from "./otherTabs";

export function OtherTabsNotice({ otherTabs }: { otherTabs: number }) {
  if (!shouldWarnAboutTabs(otherTabs)) return null;
  return (
    <aside className="pwa-update-notice other-tabs-notice" role="status" aria-live="polite" aria-atomic="true">
      <div>
        <strong>Too many open tabs</strong>
        <p>{tabNoticeText(otherTabs)}</p>
      </div>
    </aside>
  );
}
