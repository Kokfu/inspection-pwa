import type { ReactNode } from "react";

const ICONS: Record<string, ReactNode> = {
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
  "manager-company-profile": <path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16M15 21h5M9 7h4M9 11h4M9 15h4" />
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
  children
}: {
  navLinks: Array<[label: string, routeName: TRouteName]>;
  activeRouteName: string;
  onNavigate: (routeName: TRouteName) => void;
  mobileNavigation?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="app-shell-split">
      {mobileNavigation ? <details className="app-mobile-navigation"><summary>Menu</summary><nav aria-label="Mobile navigation">
        {navLinks.map(([label, routeName]) => <button key={routeName} type="button"
          aria-current={routeName === activeRouteName ? "page" : undefined}
          onClick={() => onNavigate(routeName)}>{label}</button>)}
      </nav></details> : null}
      <nav className="app-sidebar" aria-label="Primary navigation">
        {navLinks.map(([label, routeName]) => {
          const active = routeName === activeRouteName;
          return (
            <button
              key={routeName}
              type="button"
              className={active ? "app-sidebar-link active" : "app-sidebar-link"}
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(routeName)}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {ICONS[routeName] ?? FALLBACK_ICON}
              </svg>
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
      <div className="app-shell-content">{children}</div>
    </div>
  );
}
