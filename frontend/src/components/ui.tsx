import type { ReactNode } from "react";
import type { ApiError } from "@/lib/api";

/** Small presentational building blocks shared by every dashboard page. */

export function PageHeader({ title, description, aside, back }: { title: string; description?: ReactNode; aside?: ReactNode; back?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {back}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {aside && <div className="page-header-aside">{aside}</div>}
    </header>
  );
}

export interface MetricItem {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}

export function MetricStrip({ items }: { items: MetricItem[] }) {
  return (
    <section className="metrics" aria-label="Summary">
      {items.map((m) => (
        <div className="metric" key={m.label}>
          <div className="metric-label">{m.label}</div>
          <div className="metric-value num">{m.value}</div>
          {m.note && <div className="metric-note">{m.note}</div>}
        </div>
      ))}
    </section>
  );
}

export function Section({ title, aside, note, children }: { title: string; aside?: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
      {note && <p className="section-note">{note}</p>}
    </section>
  );
}

/** Subtle, non-technical indicator that source data needs review. Details belong in a future data-quality view. */
export function SourceNote({ children = "Some source data needs review" }: { children?: ReactNode }) {
  return (
    <span className="source-note" role="note">
      <span className="coverage-flag" aria-hidden="true" />
      {children}
    </span>
  );
}

export function LoadingState() {
  return (
    <div className="state" aria-busy="true" aria-live="polite">
      <div className="skeleton" style={{ width: "40%" }} />
      <div className="skeleton" style={{ width: "70%" }} />
      <div className="skeleton" style={{ width: "55%" }} />
    </div>
  );
}

export function ErrorState({ error }: { error: ApiError }) {
  if (error.isAuthError) {
    return (
      <div className="state" role="alert">
        <h2>Sign-in required</h2>
        This dashboard is limited to authorized ORCA Google Workspace accounts. Sign in with your ORCA account, or ask an
        administrator for access.
      </div>
    );
  }
  return (
    <div className="state" role="alert">
      <h2>Provider data is unavailable</h2>
      {error.message}
    </div>
  );
}
