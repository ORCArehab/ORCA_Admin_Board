import Link from "next/link";
import { Section } from "@/components/ui";
import { ATTENTION_CRITERIA, needsAttention } from "@/lib/attention";
import { providerHref } from "@/lib/format";
import type { ProviderEntry } from "@/lib/types";

export function AttentionList({ providers }: { providers: ProviderEntry[] }) {
  const { items, total } = needsAttention(providers);
  const c = ATTENTION_CRITERIA;
  return (
    <Section
      title="Needs attention"
      aside={total > items.length ? <span className="table-count">Showing {items.length} of {total} · all providers below</span> : undefined}
      note={`Listed when a provider is among the ${c.topOutstandingCount} with the most outstanding notes, has an outstanding batch ${c.oldOutstandingDays}+ days old, has status coverage below ${c.lowCoveragePercent}%, or has source data that needs review. Ordered by outstanding notes.`}
    >
      {items.length === 0 ? (
        <p className="muted">Nothing needs attention right now.</p>
      ) : (
        <ul className="attention">
          {items.map(({ provider, reasons }) => (
            <li key={provider.name}>
              <Link href={providerHref(provider.name)}>
                <span className="attention-name">{provider.name}</span>
                <span className="attention-reasons">
                  {reasons.map((r) => (
                    <span key={r.kind} className={`num reason-${r.kind}`}>
                      {r.label}
                    </span>
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
