"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "@/components/ui";
import {
  applicable,
  applyImport,
  confirmSuggestions,
  discardImport,
  effectiveStatus,
  getImport,
  LAYOUT_LABELS,
  STATUS_LABELS,
  summaryLine,
  timeLabel,
  typeLabel,
  updateImportRow,
  type ImportDraft,
  type ImportRow,
  type RowStatus,
  type Unmatched,
} from "@/lib/ai/imports";
import { formatDate } from "@/lib/format";
import { listFacilities, listStaff } from "@/lib/org/api";
import type { Facility, Staff } from "@/lib/org/types";

type Filter = RowStatus | "excluded" | "attention" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "attention", label: "Needs attention" },
  { key: "ready", label: "Ready" },
  { key: "warning", label: "Warnings" },
  { key: "needs_review", label: "Needs review" },
  { key: "conflict", label: "Conflicts" },
  { key: "duplicate", label: "Already scheduled" },
  { key: "skipped", label: "Skipped" },
  { key: "excluded", label: "Excluded" },
  { key: "applied", label: "Added" },
  { key: "all", label: "All" },
];
const ATTENTION = new Set(["needs_review", "conflict", "warning"]);

/**
 * Review of an uploaded schedule (a workbook, or a picture transcribed by the vision model). Every proposed assignment keeps its sheet and cell.
 * Unmatched names are fixed once for all their rows; rows can be inspected, corrected,
 * accepted as read or excluded; Apply adds only approved rows, through the schedule's own checks.
 */
export function ImportReview({ id }: { id: string }) {
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("attention");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [includeWarnings, setIncludeWarnings] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);

  useEffect(() => {
    let live = true;
    getImport(id).then(
      (d) => {
        if (!live) return;
        setDraft(d);
        if (!d.rows.some((r) => ATTENTION.has(effectiveStatus(r)))) setFilter("all");
      },
      (e) => live && setError(e instanceof Error ? e.message : "The import couldn't be loaded."),
    );
    // Pickers: everyone current, and facilities that aren't archived.
    listStaff().then((s) => live && setStaff(s.filter((x) => x.employmentStatus !== "separated").sort((a, b) => a.displayName.localeCompare(b.displayName))), () => {});
    listFacilities().then((f) => live && setFacilities(f.filter((x) => !x.archivedAt).sort((a, b) => a.name.localeCompare(b.name))), () => {});
    return () => {
      live = false;
    };
  }, [id]);

  const rows = useMemo(() => {
    if (!draft) return [];
    return draft.rows.filter((r) => {
      const s = effectiveStatus(r);
      if (filter === "all") return true;
      if (filter === "attention") return ATTENTION.has(s);
      return s === filter;
    });
  }, [draft, filter]);

  if (error) return <ErrorState error={{ message: error } as never} />;
  if (!draft) return <LoadingState />;
  const { summary } = draft;
  const editable = summary.status === "draft";
  const counts = (key: Filter) => (key === "all" ? draft.rows.length : key === "attention" ? draft.rows.filter((r) => ATTENTION.has(effectiveStatus(r))).length : draft.rows.filter((r) => effectiveStatus(r) === key).length);
  const toApply = applicable(draft.rows);
  const unmatchedCount = summary.unmatchedProviders.length + summary.unmatchedFacilities.length;
  const suggestions = [...summary.unmatchedProviders, ...summary.unmatchedFacilities].filter((u) => u.suggestion).length;

  async function change(row: ImportRow, update: Parameters<typeof updateImportRow>[2], message?: string) {
    setBusy(true);
    setNotice(null);
    try {
      setDraft(await updateImportRow(id, row.id, update));
      if (message) setNotice({ tone: "ok", text: message });
    } catch (e) {
      setNotice({ tone: "warn", text: e instanceof Error ? e.message : "That change couldn't be saved." });
    } finally {
      setBusy(false);
    }
  }

  async function confirmAll() {
    setBusy(true);
    setNotice(null);
    try {
      const next = await confirmSuggestions(id);
      setDraft(next);
      setNotice({ tone: "ok", text: `${suggestions} ${suggestions === 1 ? "match" : "matches"} confirmed.` });
    } catch (e) {
      setNotice({ tone: "warn", text: e instanceof Error ? e.message : "The matches couldn't be confirmed." });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setNotice(null);
    try {
      const { result, draft: next } = await applyImport(id, includeWarnings);
      setDraft(next);
      setConfirming(false);
      setFilter(result.failed.length ? "conflict" : "applied");
      setNotice({
        tone: result.failed.length ? "warn" : "ok",
        text:
          `${result.applied} ${result.applied === 1 ? "entry was" : "entries were"} added to the schedule.` +
          (result.failed.length ? ` ${result.failed.length} couldn't be added because the schedule changed meanwhile; they're listed as conflicts.` : "") +
          " Providers see them in the portal once the week is sent to QuickBooks Time from the Schedule page.",
      });
    } catch (e) {
      setNotice({ tone: "warn", text: e instanceof Error ? e.message : "The import couldn't be applied." });
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (!window.confirm("Discard this import? Nothing from it has been added to the schedule, and nothing will be.")) return;
    setBusy(true);
    try {
      await discardImport(id);
      setDraft(await getImport(id));
    } catch (e) {
      setNotice({ tone: "warn", text: e instanceof Error ? e.message : "Couldn't discard." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="review">
      <Link className="back-link" href="/ai">
        ← ORCA AI
      </Link>
      <header className="review-header">
        <div>
          <h1>{summary.fileName}</h1>
          <p className="review-meta">
            Uploaded by {summary.createdBy} · {formatDate(summary.createdAt)}
            {summary.dateRange.from && ` · ${formatDate(summary.dateRange.from)} – ${formatDate(summary.dateRange.to ?? summary.dateRange.from)}`}
          </p>
          <p className="review-line">{summaryLine(summary.counts)}</p>
        </div>
        <span className={`review-state review-state-${summary.status === "draft" && summary.counts.applied ? "applied" : summary.status}`}>
          {summary.status === "applied" ? "Applied" : summary.status === "discarded" ? "Discarded" : summary.counts.applied ? `${summary.counts.applied} added · rest still in review` : "Draft: nothing added yet"}
        </span>
      </header>

      {notice && (
        <p className={`review-notice review-notice-${notice.tone}`} role="status">
          {notice.text}
        </p>
      )}

      {summary.source === "image" && (
        <p className="review-picture">
          Read from a picture. Compare names, dates and times with the original before applying; cells that were hard to read, or rows that may have lost a cell, are marked Needs review.
        </p>
      )}

      <section className="review-sheets" aria-label="Sheets">
        {summary.sheets.map((s) => (
          <span key={s.name} className={`review-sheet${s.layout ? "" : " is-skipped"}`} title={s.reason ?? undefined}>
            <strong>{s.name}</strong> {s.layout ? `${LAYOUT_LABELS[s.layout] ?? s.layout} · ${s.items} cells` : `skipped: ${s.reason}`}
          </span>
        ))}
      </section>

      {editable && (summary.unmatchedProviders.length > 0 || summary.unmatchedFacilities.length > 0) && (
        <section className="review-unmatched" aria-labelledby="unmatched-title">
          <div className="review-unmatched-head">
            <div>
              <h2 id="unmatched-title">Names to match</h2>
              <p className="muted">
                {suggestions > 0
                  ? `ORCA AI suggested a match for ${suggestions} of ${unmatchedCount} ${unmatchedCount === 1 ? "name" : "names"}. Confirm them, or change any that are wrong first.`
                  : "Choose who or where each name in the file is. It applies to every row with that name."}
              </p>
            </div>
            {suggestions > 0 && (
              <button type="button" className="button button-primary-sm" onClick={confirmAll} disabled={busy}>
                {suggestions === 1 ? "Confirm suggestion" : `Confirm all ${suggestions} suggestions`}
              </button>
            )}
          </div>
          <div className="review-unmatched-grid">
            {summary.unmatchedProviders.map((u) => (
              <LabelMatcher key={`p-${u.label}`} kind="provider" item={u} options={staff.map((s) => ({ id: s.id, name: s.displayName }))} disabled={busy}
                onPick={(pick) => {
                  const row = draft.rows.find((r) => r.providerLabel === u.label && r.status !== "applied");
                  if (row) void change(row, { staffId: pick, sameLabel: true }, `"${u.label}" matched for ${u.rows} ${u.rows === 1 ? "row" : "rows"}.`);
                }}
              />
            ))}
            {summary.unmatchedFacilities.map((u) => (
              <LabelMatcher key={`f-${u.label}`} kind="facility" item={u} options={facilities.map((f) => ({ id: f.id, name: f.name }))} disabled={busy}
                onPick={(pick) => {
                  const row = draft.rows.find((r) => r.facilityLabel === u.label && r.status !== "applied");
                  if (row) void change(row, { facilityId: pick, sameLabel: true }, `"${u.label}" matched for ${u.rows} ${u.rows === 1 ? "row" : "rows"}.`);
                }}
              />
            ))}
          </div>
        </section>
      )}

      <div className="review-filters" role="tablist" aria-label="Show">
        {FILTERS.filter((f) => f.key === "all" || f.key === "attention" || counts(f.key) > 0).map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className="review-filter" onClick={() => setFilter(f.key)}>
            {f.label} <span className="tab-count">{counts(f.key)}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="profile-empty">{filter === "attention" ? "Nothing needs your attention." : "No rows here."}</p>
      ) : (
        <ul className="review-rows">
          {rows.map((r) => (
            <RowItem key={r.id} row={r} picture={summary.source === "image"} oneSheet={summary.sheets.filter((x) => x.layout).length <= 1} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} editable={editable} busy={busy} staff={staff} facilities={facilities} onChange={change} />
          ))}
        </ul>
      )}

      {editable && (
        <footer className="review-actions">
          <span className="muted">
            {toApply.ready} ready{toApply.warning ? `, ${toApply.warning} with warnings` : ""}. Excluded, unmatched, conflicting and already-scheduled rows are never added.
          </span>
          <span className="review-actions-main">
            <button type="button" className="button" onClick={discard} disabled={busy}>
              Discard
            </button>
            <button type="button" className="button button-primary-sm" onClick={() => setConfirming(true)} disabled={busy || toApply.ready + toApply.warning === 0}>
              Apply approved changes
            </button>
          </span>
        </footer>
      )}

      {confirming && (
        <div className="review-confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="review-confirm-card">
            <h2 id="confirm-title">Add to the schedule?</h2>
            <p>
              {toApply.ready} {toApply.ready === 1 ? "entry" : "entries"} will be added to the schedule board. Each is checked again as it&apos;s added.
            </p>
            {toApply.warning > 0 && (
              <label className="check">
                <input type="checkbox" checked={includeWarnings} onChange={(e) => setIncludeWarnings(e.target.checked)} />
                Also add {toApply.warning} {toApply.warning === 1 ? "entry" : "entries"} with warnings (I&apos;ve read them)
              </label>
            )}
            <p className="muted">Providers see changes in the portal after the week is sent to QuickBooks Time.</p>
            <div className="review-confirm-actions">
              <button type="button" className="button" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="button button-primary-sm" onClick={apply} disabled={busy || toApply.ready + (includeWarnings ? toApply.warning : 0) === 0}>
                {busy ? "Adding…" : `Add ${toApply.ready + (includeWarnings ? toApply.warning : 0)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LabelMatcher({ kind, item, options, disabled, onPick }: { kind: "provider" | "facility"; item: Unmatched; options: { id: string; name: string }[]; disabled: boolean; onPick: (id: string) => void }) {
  // The best guess is preselected; nothing is saved until the admin confirms (here or with Confirm all).
  const [value, setValue] = useState(item.suggestion?.id ?? "");
  const confirming = !!item.suggestion && value === item.suggestion.id;
  return (
    <div className={`review-label${item.suggestion ? " has-suggestion" : ""}`}>
      <span className="review-label-name">
        &ldquo;{item.label}&rdquo; <span className="muted">· {item.rows} {item.rows === 1 ? "row" : "rows"}</span>
        <span className="review-label-why">
          {item.suggestion
            ? `Suggested: ${item.suggestion.name}${item.suggestion.reason ? ` (${item.suggestion.reason})` : ""}`
            : item.status === "ambiguous"
              ? "More than one possible match: choose one."
              : `No ${kind} with a similar name. Choose one, or exclude these rows.`}
        </span>
      </span>
      <span className="review-label-pick">
        <select aria-label={`Match for ${item.label}`} value={value} onChange={(e) => setValue(e.target.value)} disabled={disabled}>
          <option value="">Choose a {kind}…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button type="button" className="button" disabled={disabled || !value} onClick={() => onPick(value)}>
          {confirming ? "Confirm" : "Match"}
        </button>
      </span>
    </div>
  );
}

function RowItem({
  row: r,
  picture,
  oneSheet,
  open,
  onToggle,
  editable,
  busy,
  staff,
  facilities,
  onChange,
}: {
  row: ImportRow;
  picture: boolean;
  /** With one sheet read, the cell alone says where a row came from. */
  oneSheet: boolean;
  open: boolean;
  onToggle: () => void;
  editable: boolean;
  busy: boolean;
  staff: Staff[];
  facilities: Facility[];
  onChange: (row: ImportRow, change: Parameters<typeof updateImportRow>[2], message?: string) => void;
}) {
  const status = effectiveStatus(r);
  const canEdit = editable && r.status !== "applied";
  const who = r.staff.name ?? r.providerLabel ?? "—";
  const where = r.type === "facility" || r.type === "coverage" ? (r.facility.name ?? r.facilityLabel ?? "—") : typeLabel(r.type);
  const unclear = r.issues.some((i) => i.kind === "source");
  return (
    <li className={`review-row status-${status}`}>
      <button type="button" className="review-row-head" onClick={onToggle} aria-expanded={open}>
        <span className="review-where" title={`${r.sheet}!${r.cellRef}`}>
          {oneSheet ? r.cellRef : `${r.sheet}!${r.cellRef}`}
        </span>
        <span className="review-date">{r.date ? formatDate(r.date) : "—"}</span>
        <span className={`review-who match-${r.staff.match}`}>{who}</span>
        <span className={`review-what match-${r.type === "facility" || r.type === "coverage" ? r.facility.match : "matched"}`}>
          {r.type === "coverage" ? "Coverage · " : ""}
          {where} <span className="muted">{timeLabel(r)}</span>
        </span>
        <span className={`review-badge badge-${status}`}>{STATUS_LABELS[status]}</span>
      </button>
      {open && (
        <div className="review-detail">
          <dl>
            <dt>{picture ? "In the picture" : "In the workbook"}</dt>
            <dd>
              <code>{r.sourceText}</code>
            </dd>
            {r.issues.length > 0 && (
              <>
                <dt>Why</dt>
                <dd>
                  <ul className="review-issues">
                    {r.issues.map((i, n) => (
                      <li key={n} className={`issue-${i.kind}`}>
                        {i.message}
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
            <dt>Compared with the schedule</dt>
            <dd className="review-compare">
              <span>
                <small>Already scheduled that day</small>
                {r.existing.length ? r.existing.map((e) => <span key={e.id}>{e.label}</span>) : <span className="muted">Nothing</span>}
              </span>
              <span>
                <small>This row would add</small>
                <span>
                  {r.type === "coverage" ? "Coverage · " : ""}
                  {where} ({timeLabel(r)}){r.coveringLabel ? `, covering ${r.coveringLabel}` : ""}
                </span>
              </span>
            </dd>
          </dl>
          {canEdit && (
            <div className="review-edit">
              {(r.staff.match === "suggested" || r.staff.match === "ambiguous") &&
                r.staff.candidates.map((c) => (
                  <button key={c.id} type="button" className="button" disabled={busy} onClick={() => onChange(r, { staffId: c.id }, `Matched to ${c.name}.`)}>
                    {c.best ? "Suggested provider" : "Provider"}: {c.name}
                  </button>
                ))}
              {(r.facility.match === "suggested" || r.facility.match === "ambiguous") &&
                r.facility.candidates.map((c) => (
                  <button key={c.id} type="button" className="button" disabled={busy} onClick={() => onChange(r, { facilityId: c.id }, `Matched to ${c.name}.`)}>
                    {c.best ? "Suggested facility" : "Facility"}: {c.name}
                  </button>
                ))}
              <Picker label="Provider" value={r.staff.id} options={staff.map((s) => ({ id: s.id, name: s.displayName }))} disabled={busy} onPick={(v) => onChange(r, { staffId: v })} />
              {(r.type === "facility" || r.type === "coverage") && <Picker label="Facility" value={r.facility.id} options={facilities.map((f) => ({ id: f.id, name: f.name }))} disabled={busy} onPick={(v) => onChange(r, { facilityId: v })} />}
              {unclear && (
                <button type="button" className="button" disabled={busy} onClick={() => onChange(r, { accepted: !r.accepted })}>
                  {r.accepted ? "Undo accept" : "Accept as read"}
                </button>
              )}
              <button type="button" className="button button-quiet" disabled={busy} onClick={() => onChange(r, { excluded: !r.excluded })}>
                {r.excluded ? "Include this row" : "Exclude this row"}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Picker({ label, value, options, disabled, onPick }: { label: string; value: string | null; options: { id: string; name: string }[]; disabled: boolean; onPick: (id: string) => void }) {
  return (
    <label className="review-picker">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(e) => e.target.value && onPick(e.target.value)} disabled={disabled}>
        <option value="">{value ? "Change…" : "Choose…"}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
