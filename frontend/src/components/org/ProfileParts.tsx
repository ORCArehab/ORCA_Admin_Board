import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate } from "@/lib/format";
import { initials, type DetailItem } from "@/lib/org/profile";
import type { OrgEvent } from "@/lib/org/types";

/** Building blocks for the read-only Employee and Facility profiles. */

export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function ProfileHeader({
  back,
  badge,
  title,
  subtitle,
  meta,
  action,
}: {
  back: ReactNode;
  badge: ReactNode;
  title: string;
  subtitle?: string | null;
  meta: (string | null | false | undefined)[];
  action?: ReactNode;
}) {
  const facts = meta.filter((m): m is string => !!m);
  return (
    <header className="profile-header">
      {back}
      <div className="profile-identity">
        {badge}
        <div className="profile-names">
          <h1>{title}</h1>
          {subtitle && <p className="profile-subtitle">{subtitle}</p>}
          {facts.length > 0 && (
            <p className="profile-meta">
              {facts.map((f, i) => (
                <span key={f}>
                  {i > 0 && <span aria-hidden="true"> · </span>}
                  {f}
                </span>
              ))}
            </p>
          )}
        </div>
        {action && <div className="profile-action">{action}</div>}
      </div>
    </header>
  );
}

export function ProfileSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="profile-section">
      <div className="profile-section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Label/value pairs. Callers pass only the fields that have values. */
export function DetailList({ items, empty }: { items: DetailItem[]; empty?: string }) {
  if (items.length === 0) return empty ? <p className="profile-empty">{empty}</p> : null;
  return (
    <dl className="detail-list">
      {items.map((item) => (
        <div key={item.label} className="detail-item">
          <dt>{item.label}</dt>
          <dd>{item.href ? <a className="text-link" href={item.href}>{item.value}</a> : item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface LinkRow {
  id: string;
  label: string;
  /** Omitted when the viewer can't open the linked page; the row is shown as plain text. */
  href?: string;
  detail?: string;
}

/** A short list of related records (assignments) as quiet link rows. */
export function LinkRows({ rows, empty }: { rows: LinkRow[]; empty: string }) {
  if (rows.length === 0) return <p className="profile-empty">{empty}</p>;
  return (
    <ul className="link-rows">
      {rows.map((r) => (
        <li key={r.id}>
          {r.href ? (
            <Link href={r.href}>
              <span className="link-rows-label">{r.label}</span>
              {r.detail && <span className="link-rows-detail">{r.detail}</span>}
            </Link>
          ) : (
            <span className="link-rows-plain">
              <span className="link-rows-label">{r.label}</span>
              {r.detail && <span className="link-rows-detail">{r.detail}</span>}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Where the record came from. Secondary: it shouldn't compete with the record itself. */
export function SourceNote({ source }: { source: string }) {
  return (
    <p className="profile-source">
      First imported from {source}. If that spreadsheet is imported again, anything changed here shows up as a proposed update for review, never applied on its own.
    </p>
  );
}

const ACTION_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Changed",
  alias_added: "Name added",
  alias_removed: "Name removed",
  person_linked: "Sign-in account linked",
  person_unlinked: "Sign-in account unlinked",
  login_updated: "Login changed",
  login_revealed: "Password revealed",
  facility_access_added: "Hospital login added",
  facility_access_updated: "Hospital login changed",
  facility_access_revealed: "Hospital login password revealed",
  facility_access_deleted: "Hospital login deleted",
  documents_folder_linked: "Document folder set up",
  document_added: "Document added",
};

/** Who changed what, and when. The API records field names only, never values. */
export function History({ events }: { events: OrgEvent[] }) {
  const recent = events.slice(0, 12);
  return (
    <section className="profile-history">
      <h2>Activity</h2>
      {recent.length === 0 ? (
        <p className="profile-empty">No changes recorded.</p>
      ) : (
        <ul>
          {recent.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span>
                {ACTION_LABELS[e.action] ?? e.action}
                {e.action === "updated" && e.fields.length > 0 && <span className="muted"> {e.fields.map((f) => f.replace(/_/g, " ")).join(", ")}</span>}
                {e.action === "document_added" && e.fields.length > 0 && <span className="muted"> to {e.fields.join(", ")}</span>}
              </span>
              <span className="muted">
                {e.actor.startsWith("import:") ? "Import" : e.actor} · {formatDate(e.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
