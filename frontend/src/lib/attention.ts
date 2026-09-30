import { formatCount, formatDays, formatPercent } from "./format";
import type { ProviderEntry } from "./types";

/**
 * Explicit, documented criteria for "Needs attention". This is not a severity score:
 * a provider is listed if it meets any criterion, the reasons are shown verbatim, and
 * providers keep the backend's order (outstanding notes, then oldest outstanding age).
 * Change the thresholds here; the UI prints them in the section footnote.
 */
export const ATTENTION_CRITERIA = {
  /** The N providers with the most outstanding notes (backend order) qualify on volume alone. */
  topOutstandingCount: 5,
  /** An outstanding batch at least this old. */
  oldOutstandingDays: 30,
  /** Status coverage below this means completion describes only part of the workload. */
  lowCoveragePercent: 90,
  /** Show at most this many providers; the full list is in the table. */
  maxItems: 8,
} as const;

export type AttentionReasonKind = "outstanding" | "old" | "coverage" | "source";

export interface AttentionReason {
  kind: AttentionReasonKind;
  label: string;
}

export interface AttentionItem {
  provider: ProviderEntry;
  reasons: AttentionReason[];
}

/** Completion covers only part of the expected workload (some notes have unknown status). */
export function hasLimitedCoverage(p: ProviderEntry): boolean {
  return p.statusCoveragePercent !== null && p.statusCoveragePercent < ATTENTION_CRITERIA.lowCoveragePercent;
}

/**
 * Reasons a provider needs attention; empty if none.
 * @param outstandingRank 0-based position among providers with outstanding notes (backend order).
 */
export function attentionReasons(p: ProviderEntry, outstandingRank = Infinity): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  const hasOld = p.oldestOutstandingDays !== null && p.oldestOutstandingDays >= ATTENTION_CRITERIA.oldOutstandingDays;
  const topOutstanding = p.outstandingNotes > 0 && outstandingRank < ATTENTION_CRITERIA.topOutstandingCount;
  const qualifies = topOutstanding || hasOld || hasLimitedCoverage(p) || p.dataStatus === "incomplete";
  if (!qualifies) return reasons;

  if (p.outstandingNotes > 0) reasons.push({ kind: "outstanding", label: `${formatCount(p.outstandingNotes)} outstanding` });
  if (hasOld) reasons.push({ kind: "old", label: `Oldest outstanding: ${formatDays(p.oldestOutstandingDays)}` });
  if (hasLimitedCoverage(p)) reasons.push({ kind: "coverage", label: `${formatPercent(p.statusCoveragePercent)} status coverage` });
  if (p.dataStatus === "incomplete") reasons.push({ kind: "source", label: "Some source data needs review" });
  return reasons;
}

/** Providers needing attention, in the backend's order. */
export function needsAttention(providers: ProviderEntry[]): { items: AttentionItem[]; total: number } {
  let rank = 0;
  const all = providers
    .map((provider) => ({ provider, reasons: attentionReasons(provider, provider.outstandingNotes > 0 ? rank++ : Infinity) }))
    .filter((i) => i.reasons.length > 0);
  return { items: all.slice(0, ATTENTION_CRITERIA.maxItems), total: all.length };
}
