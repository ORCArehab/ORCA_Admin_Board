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
  groupByCell,
  splitBlock,
  type RowIssue,
  type RowStatus,
  type RowTime,
  type Unmatched,
} from "@/lib/ai/imports";
import { formatDate } from "@/lib/format";
import { SearchPicker } from "@/components/SearchPicker";
import { listFacilities, listStaff } from "@/lib/org/api";
import type { PickerOption } from "@/lib/search";
import { fetchQuickBooksStatus } from "@/lib/schedule/quickbooks";

/** Pickers search current employees and facilities that aren't archived; loaded on first use, once per page. */
type Loaders = { staff: () => Promise<PickerOption[]>; facilities: () => Promise<PickerOption[]> };
function makeLoaders(): Loaders {
  let staff: Promise<PickerOption[]> | null = null;
  let facilities: Promise<PickerOption[]> | null = null;
  return {
    staff: () =>
      (staff ??= listStaff().then((list) =>
        list.filter((x) => x.employmentStatus !== "separated").map((x) => ({ id: x.id, label: x.displayName, keywords: [x.firstName, x.lastName, x.preferredName ?? ""] })),
      )),
    facilities: () =>
      (facilities ??= listFacilities().then((list) => list.filter((x) => !x.archivedAt).map((x) => ({ id: x.id, label: x.name, detail: x.abbreviation, keywords: [x.abbreviation ?? ""] })))),
  };
}

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
  // A row reached from another row's conflict: scrolled to and highlighted.
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [includeWarnings, setIncludeWarnings] = useState(false);
  const [loaders] = useState(makeLoaders);
  // With QuickBooks Time as the schedule of record, ORCA doesn't add entries itself: review only.
  const [fromQbt, setFromQbt] = useState(false);
  useEffect(() => {
    void fetchQuickBooksStatus().then((s) => setFromQbt(s?.scheduleSource === "quickbooks_time"));
  }, []);

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
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    if (!target) return;
    const el = document.getElementById(`row-${target}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = window.setTimeout(() => setTarget(null), 2500);
    return () => window.clearTimeout(t);
  }, [target, filter]);

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
  const cells = new Map(groupByCell(draft.rows).map((g) => [g.key, g.rows]));
  const oneSheet = summary.sheets.filter((x) => x.layout).length <= 1;
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

  /** Opens another row in this file (the other side of a conflict) and scrolls to it. */
  function goTo(rowId: string) {
    const other = draft?.rows.find((x) => x.id === rowId);
    if (!other) return;
    const st = effectiveStatus(other);
    if (!(filter === "all" || (filter === "attention" ? ATTENTION.has(st) : st === filter))) setFilter("all");
    setOpen(rowId);
    setTarget(rowId);
  }

  /** "KW & BV (AM)": gives the places in one cell consecutive times within their shared block. */
  async function split(rowsInCell: ImportRow[]) {
    const block = rowsInCell[0]?.timeBlock ?? "";
    const times = splitBlock(block, rowsInCell.length);
    if (!times) return;
    setBusy(true);
    setNotice(null);
    try {
      let next = draft;
      for (const [i, row] of rowsInCell.entries()) next = await updateImportRow(id, row.id, { time: { block: "custom", ...times[i]! } });
      setDraft(next);
      setNotice({ tone: "ok", text: `Split the ${block === "all_day" ? "day" : block.toUpperCase()} between them: ${rowsInCell.map((row, i) => `${row.facility.name ?? row.facilityLabel} ${times[i]!.start}–${times[i]!.end}`).join(", ")}. Change any of them in the row.` });
    } catch (e) {
      setNotice({ tone: "warn", text: e instanceof Error ? e.message : "The times couldn't be saved." });
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
              <LabelMatcher key={`p-${u.label}`} kind="provider" item={u} load={loaders.staff} disabled={busy}
                onPick={(pick) => {
                  const row = draft.rows.find((r) => r.providerLabel === u.label && r.status !== "applied");
                  if (row) void change(row, { staffId: pick, sameLabel: true }, `"${u.label}" matched for ${u.rows} ${u.rows === 1 ? "row" : "rows"}.`);
                }}
              />
            ))}
            {summary.unmatchedFacilities.map((u) => (
              <LabelMatcher key={`f-${u.label}`} kind="facility" item={u} load={loaders.facilities} disabled={busy}
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
        <ul className="review-cells">
          {groupByCell(rows).map((g) => {
            const all = cells.get(g.key) ?? g.rows;
            return (
              <li key={g.key} className="review-cell">
                <div className="review-cell-head">
                  <span className="review-where" title={g.key}>
                    {oneSheet ? g.cellRef : g.key}
                  </span>
                  <span className="review-date">{g.date ? formatDate(g.date) : "—"}</span>
                  <code className="review-cell-source" title={summary.source === "image" ? "As read from the picture" : "As written in the workbook"}>
                    {g.sourceText}
                  </code>
                  <span className="review-cell-count">
                    {all.length > 1 ? `${all.length} assignments from this cell${g.rows.length < all.length ? ` · ${g.rows.length} shown` : ""}` : ""}
                  </span>
                </div>
                <ul className="review-rows">
                  {g.rows.map((r) => (
                    <RowItem
                      key={r.id}
                      row={r}
                      cellRows={all}
                      picture={summary.source === "image"}
                      open={open === r.id}
                      target={target === r.id}
                      onToggle={() => setOpen(open === r.id ? null : r.id)}
                      editable={editable}
                      busy={busy}
                      loaders={loaders}
                      onChange={change}
                      onGoTo={goTo}
                      onSplit={split}
                    />
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}

      {editable && (
        <footer className="review-actions">
          <span className="muted">
            {fromQbt
              ? "The schedule is kept in QuickBooks Time, so nothing is added from here: use this review to check the file, then make the changes on QuickBooks Time's schedule calendar and press Update on the Schedule page."
              : `${toApply.ready} ready${toApply.warning ? `, ${toApply.warning} with warnings` : ""}. Excluded, unmatched, conflicting and already-scheduled rows are never added.`}
          </span>
          <span className="review-actions-main">
            <button type="button" className="button" onClick={discard} disabled={busy}>
              Discard
            </button>
            {!fromQbt && (
              <button type="button" className="button button-primary-sm" onClick={() => setConfirming(true)} disabled={busy || toApply.ready + toApply.warning === 0}>
                Apply approved changes
              </button>
            )}
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

function LabelMatcher({ kind, item, load, disabled, onPick }: { kind: "provider" | "facility"; item: Unmatched; load: () => Promise<PickerOption[]>; disabled: boolean; onPick: (id: string) => void }) {
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
        <SearchPicker
          ariaLabel={`Match for ${item.label}`}
          value={value || null}
          valueLabel={item.suggestion && value === item.suggestion.id ? item.suggestion.name : undefined}
          placeholder={kind === "provider" ? "Search employees…" : "Search facilities…"}
          load={load}
          disabled={disabled}
          onChange={(o) => setValue(o.id)}
        />
        <button type="button" className="button" disabled={disabled || !value} onClick={() => onPick(value)}>
          {confirming ? "Confirm" : "Match"}
        </button>
      </span>
    </div>
  );
}

function RowItem({
  row: r,
  cellRows,
  picture,
  open,
  target,
  onToggle,
  editable,
  busy,
  loaders,
  onChange,
  onGoTo,
  onSplit,
}: {
  row: ImportRow;
  /** Every assignment read from the same cell, this one included. */
  cellRows: ImportRow[];
  picture: boolean;
  open: boolean;
  /** Reached from another row's conflict: highlighted for a moment. */
  target: boolean;
  onToggle: () => void;
  editable: boolean;
  busy: boolean;
  loaders: Loaders;
  onChange: (row: ImportRow, change: Parameters<typeof updateImportRow>[2], message?: string) => void;
  onGoTo: (rowId: string) => void;
  onSplit: (rows: ImportRow[]) => void;
}) {
  const status = effectiveStatus(r);
  const canEdit = editable && r.status !== "applied";
  const who = r.staff.name ?? r.providerLabel ?? "—";
  const where = r.type === "facility" || r.type === "coverage" ? (r.facility.name ?? r.facilityLabel ?? "—") : typeLabel(r.type);
  const unclear = r.issues.some((i) => i.kind === "source");
  return (
    <li id={`row-${r.id}`} className={`review-row status-${status}${target ? " is-target" : ""}`}>
      <button type="button" className="review-row-head" onClick={onToggle} aria-expanded={open}>
        <span className={`review-who match-${r.staff.match}`}>{who}</span>
        <span className={`review-what match-${r.type === "facility" || r.type === "coverage" ? r.facility.match : "matched"}`}>
          {r.type === "coverage" ? "Coverage · " : ""}
          {where} <span className="muted">{timeLabel(r)}</span>
          {r.notes && <span className="review-with"> · {r.notes}</span>}
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
            {r.issues.some((i) => !i.other) && (
              <>
                <dt>Why</dt>
                <dd>
                  <ul className="review-issues">
                    {r.issues
                      .filter((i) => !i.other)
                      .map((i, n) => (
                        <li key={n} className={`issue-${i.kind}`}>
                          {i.message}
                        </li>
                      ))}
                  </ul>
                </dd>
              </>
            )}
            {r.issues.some((i) => i.other) && (
              <>
                <dt>{r.issues.some((i) => i.other && i.kind === "conflict") ? "Conflict" : r.issues.some((i) => i.other && (i.kind === "warning" || i.kind === "duplicate")) ? "Compared with" : "Related"}</dt>
                <dd className="review-conflicts">
                  {r.issues
                    .filter((i) => i.other)
                    .map((i, n) => (
                      <ConflictCard key={n} row={r} issue={i} cellRows={cellRows} editable={editable && r.status !== "applied"} busy={busy} onGoTo={onGoTo} onSplit={onSplit} />
                    ))}
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
                  {r.notes && <small className="review-note">{r.notes}</small>}
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
              <label className="review-picker">
                <span>Provider</span>
                <SearchPicker ariaLabel="Provider" value={r.staff.id} valueLabel={r.staff.name} placeholder="Search employees…" load={loaders.staff} disabled={busy} onChange={(o) => onChange(r, { staffId: o.id })} />
              </label>
              {(r.type === "facility" || r.type === "coverage") && (
                <label className="review-picker">
                  <span>Facility</span>
                  <SearchPicker ariaLabel="Facility" value={r.facility.id} valueLabel={r.facility.name} placeholder="Search facilities…" load={loaders.facilities} disabled={busy} onChange={(o) => onChange(r, { facilityId: o.id })} />
                </label>
              )}
              <TimeEditor row={r} disabled={busy} onSave={(time) => onChange(r, { time }, "Time updated.")} />
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

/** The row's time, editable: a block, or a start and end (e.g. the real end of a visit whose end was assumed). */
function TimeEditor({ row, disabled, onSave }: { row: ImportRow; disabled: boolean; onSave: (time: RowTime) => void }) {
  const [block, setBlock] = useState<RowTime["block"]>((row.timeBlock as RowTime["block"]) ?? "all_day");
  const [start, setStart] = useState(row.startTime ?? "08:00");
  const [end, setEnd] = useState(row.endTime ?? "17:00");
  const assumed = row.issues.some((i) => i.kind === "assumed");
  const changed = block !== row.timeBlock || (block === "custom" && (start !== row.startTime || end !== row.endTime));
  const invalid = block === "custom" && (!start || !end || end <= start);
  return (
    <div className={`review-time${assumed ? " is-assumed" : ""}`}>
      <span className="review-time-label">{assumed ? "Set the real end time" : "Time"}</span>
      <select aria-label="Time block" value={block} onChange={(e) => setBlock(e.target.value as RowTime["block"])} disabled={disabled}>
        <option value="am">AM (8–12)</option>
        <option value="pm">PM (1–5)</option>
        <option value="all_day">All day</option>
        <option value="custom">Set times</option>
      </select>
      {block === "custom" && (
        <>
          <input type="time" aria-label="Start" value={start} onChange={(e) => setStart(e.target.value)} disabled={disabled} />
          <span className="muted">to</span>
          <input type="time" aria-label="End" value={end} onChange={(e) => setEnd(e.target.value)} disabled={disabled} />
        </>
      )}
      <button type="button" className="button" disabled={disabled || invalid || (!changed && !assumed)} onClick={() => onSave(block === "custom" ? { block, start, end } : { block })}>
        {assumed && !changed ? "Keep this time" : "Save time"}
      </button>
      {invalid && <span className="record-error">The end must be after the start.</span>}
    </div>
  );
}

const PLACE_TYPES = new Set(["facility", "coverage"]);

/**
 * One conflict, warning or related row, side by side: this assignment and the other one, where
 * the other comes from (the same cell, elsewhere in this file, or the schedule), a link to it in
 * this file, and for places sharing a block in one cell, an offer to split the block between them.
 */
function ConflictCard({
  row: r,
  issue,
  cellRows,
  editable,
  busy,
  onGoTo,
  onSplit,
}: {
  row: ImportRow;
  issue: RowIssue;
  cellRows: ImportRow[];
  editable: boolean;
  busy: boolean;
  onGoTo: (rowId: string) => void;
  onSplit: (rows: ImportRow[]) => void;
}) {
  const o = issue.other!;
  const mine = r.type === "facility" || r.type === "coverage" ? (r.facility.name ?? r.facilityLabel ?? "—") : typeLabel(r.type);
  const theirs = o.type === "facility" ? (o.facility ?? "a facility") : o.type === "coverage" ? `Coverage · ${o.facility ?? "a facility"}` : typeLabel(o.type);
  const origin = o.source === "schedule" ? "Already on the schedule" : o.sameCell ? `Same cell (${o.cellRef})` : `In this file · ${o.sheet}!${o.cellRef}`;
  // Places in this cell sharing this row's block: offered consecutive times.
  const sharing = cellRows.filter((x) => !x.excluded && x.status !== "applied" && PLACE_TYPES.has(x.type ?? "") && x.timeBlock === r.timeBlock);
  const canSplit = editable && issue.code === "overlap" && o.sameCell && r.timeBlock !== "custom" && sharing.length > 1 && !!splitBlock(r.timeBlock ?? "", sharing.length);
  const tone = issue.kind === "conflict" ? "conflict" : issue.kind === "related" ? "related" : "warning";
  return (
    <div className={`review-conflict tone-${tone}`}>
      <p className="review-conflict-text">{issue.message}</p>
      <div className="review-conflict-pair">
        <div className="review-conflict-side">
          <small>This assignment</small>
          <strong>{mine}</strong>
          <span>
            {timeLabel(r)} · {r.date ? formatDate(r.date) : "—"}
          </span>
        </div>
        <span className="review-conflict-vs" aria-hidden="true">
          {issue.kind === "conflict" ? "✕" : "↔"}
        </span>
        <div className="review-conflict-side">
          <small>{origin}</small>
          <strong>{theirs}</strong>
          <span>
            {o.time} · {o.date ? formatDate(o.date) : "—"}
            {o.provider ? ` · ${o.provider}` : ""}
          </span>
          {o.source === "workbook" && !o.sameCell && o.sourceText && <code>{o.sourceText}</code>}
        </div>
      </div>
      {(o.rowId || canSplit) && (
        <div className="review-conflict-actions">
          {o.rowId && (
            <button type="button" className="button" onClick={() => onGoTo(o.rowId!)}>
              Go to {o.sameCell ? theirs : `${o.cellRef}`}
            </button>
          )}
          {canSplit && (
            <button type="button" className="button button-primary-sm" disabled={busy} onClick={() => onSplit(sharing)}>
              Split the {r.timeBlock === "all_day" ? "day" : (r.timeBlock ?? "").toUpperCase()} between {sharing.length === 2 ? "both" : `all ${sharing.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
