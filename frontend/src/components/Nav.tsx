"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  /** Not built yet: shown so the structure is visible, but not navigable. */
  soon?: boolean;
  isActive?: (path: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", isActive: (p) => p === "/" },
  { label: "Providers", href: "/providers", isActive: (p) => p.startsWith("/providers") },
  { label: "Scribes", href: "/scribes", isActive: (p) => p.startsWith("/scribes") },
  { label: "Schedule", href: "/schedule", isActive: (p) => p.startsWith("/schedule") },
  { label: "Employees", href: "/employees", isActive: (p) => p.startsWith("/employees") },
  { label: "Facilities", href: "/facilities", isActive: (p) => p.startsWith("/facilities") },
  { label: "ORCA AI", href: "/ai", soon: true },
];

/** The employee portal, linked from the nav so admins can get back to it. */
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.orcarehab.com";

export function Nav({ userLabel, signOutAction }: { userLabel: string; signOutAction: () => Promise<void> }) {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav-brand">
        ORCA Admin
        <small>Rehab operations</small>
      </div>
      <ul className="nav-list">
        {NAV_ITEMS.map((item) =>
          item.soon ? (
            <li key={item.href}>
              <span className="nav-link" aria-disabled="true">
                {item.label}
                <span className="nav-soon">Soon</span>
              </span>
            </li>
          ) : (
            <li key={item.href}>
              <Link className="nav-link" href={item.href} aria-current={item.isActive?.(pathname) ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          ),
        )}
      </ul>
      <div className="nav-footer">
        <span className="nav-user" title={userLabel}>
          {userLabel}
        </span>
        <div className="nav-footer-links">
          <a href={PORTAL_URL}>Employee portal</a>
          <form action={signOutAction}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </div>
    </nav>
  );
}
