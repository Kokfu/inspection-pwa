import { Fragment, useState, type ReactNode } from "react";

const ICONS: Record<string, ReactNode> = {
  "manager-approvals": <><path d="M9 3h6v4H9zM9 5H5v16h14V5h-4" /><path d="m8 14 3 3 5-6" /></>,
  "manager-settings": <path d="M4 7h16M4 17h16M8 4v6M16 14v6" />,
  "manager-report-approvals": <><path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8m-8 4 2 2 5-4" /></>,
  "manager-repairs": <path d="M14 6a4 4 0 0 0-5 5L3 17a2 2 0 0 0 4 4l6-6a4 4 0 0 0 5-5l-3 3-4-4 3-3Z" />,
  "repair-visits": <path d="M14 6a4 4 0 0 0-5 5L3 17a2 2 0 0 0 4 4l6-6a4 4 0 0 0 5-5l-3 3-4-4 3-3Z" />,
  "repair-visit-new": <path d="M12 5v14M5 12h14" />,
  "manager-home": <path d="m3 10 9-7 9 7M5 9v10a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V9" />,
  "manager-technicians": <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  "manager-customers": <path d="M3 4h18v16H3zM3 10h18" />,
  "manager-operations": <path d="M9 11H1l3-8 5 5-4 3M15 13l8-8-5-5-8 8M14 12h7" />,
  "manager-add-customer": <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 15v3M8 21v-2a4 4 0 0 1 8 0v2" />,
  "manager-services-done": <path d="m9 12 2 2 4-4M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />,
  "manager-upcoming-services": <path d="M3 4h18v18H3zM16 2v4M8 2v4M3 10h18" />,
  "new-service-visit": <path d="M12 5v14M5 12h14" />,
  "technician-add-customer": <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 15v3M8 21v-2a4 4 0 0 1 8 0v2" />,
  "technician-completed-services": <path d="m9 12 2 2 4-4M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />,
  "technician-upcoming-services": <path d="M3 4h18v18H3zM16 2v4M8 2v4M3 10h18" />,
  "manager-common-remarks": <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
  "manager-service-catalog": <path d="M9 11H5a2 2 0 0 0-2 2v7h6M9 5v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4" />,
  "manager-company-profile": <path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16M15 21h5M9 7h4M9 11h4M9 15h4" />,
  "manager-email-reminders": <><path d="M3 6h18v12H3z" /><path d="m3 7 9 7 9-7" /></>
};

const FALLBACK_ICON = <circle cx="12" cy="12" r="4" />;

/**
 * Persistent left-sidebar layout shared by every manager (and, later, technician) screen.
 * Purely presentational: `onNavigate` is expected to be the same `navigate()` the pages
 * below it already use, so no routing/API behavior changes by wrapping a screen in this.
 */
export function AppShell<TRouteName extends string>({
  navLinks,
  activeRouteName,
  onNavigate,
  mobileNavigation = false,
  sections = {},
  pinned = [],
  children
}: {
  navLinks: Array<[label: string, routeName: TRouteName]>;
  activeRouteName: string;
  onNavigate: (routeName: TRouteName) => void;
  mobileNavigation?: boolean;
  /** Heading rendered above the keyed route (desktop sidebar only). */
  sections?: Record<string, string>;
  /** Routes pushed to the bottom of the sidebar. */
  pinned?: string[];
  children: ReactNode;
}) {
  // I-36: the phone menu closes itself once a destination is chosen, so the new page is not pushed down by an open menu.
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="app-shell-split">
      {mobileNavigation ? <details className="app-mobile-navigation" open={menuOpen} onToggle={(event) => setMenuOpen(event.currentTarget.open)}><summary>Menu</summary><nav aria-label="Mobile navigation">
        {navLinks.map(([label, routeName]) => <button key={routeName} type="button"
          aria-current={routeName === activeRouteName ? "page" : undefined}
          onClick={() => { setMenuOpen(false); onNavigate(routeName); }}>{label}</button>)}
      </nav></details> : null}
      <nav className="app-sidebar" aria-label="Primary navigation">
        {[...navLinks.filter(([, name]) => !pinned.includes(name)), ...navLinks.filter(([, name]) => pinned.includes(name))].map(([label, routeName]) => {
          const active = routeName === activeRouteName;
          const pinnedFirst = pinned.includes(routeName) && routeName === pinned[0];
          return (
            <Fragment key={routeName}>
              {sections[routeName] ? <span className="app-sidebar-section" role="presentation">{sections[routeName]}</span> : null}
              <button
                type="button"
                className={[active ? "app-sidebar-link active" : "app-sidebar-link", pinnedFirst ? "pinned" : ""].filter(Boolean).join(" ")}
                aria-current={active ? "page" : undefined}
                onClick={() => onNavigate(routeName)}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {ICONS[routeName] ?? FALLBACK_ICON}
                </svg>
                <span>{label}</span>
              </button>
            </Fragment>
          );
        })}
      </nav>
      <div className="app-shell-content">{children}</div>
    </div>
  );
}
