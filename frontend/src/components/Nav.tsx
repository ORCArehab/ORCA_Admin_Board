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
  { label: "Scribes", href: "/scribes", soon: true },
  { label: "Facilities", href: "/facilities", soon: true },
  { label: "ORCA AI", href: "/ai", soon: true },
];

export function Nav() {
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
    </nav>
  );
}
