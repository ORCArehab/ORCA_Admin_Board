import Link from "next/link";
import { summaryLine, type ImportSummary } from "@/lib/ai/imports";
import type { Block } from "@/lib/ai/types";
import { formatDate } from "@/lib/format";

/** Structured results under an assistant message: tables, notices and the import card. */
export function BlockView({ block }: { block: Block }) {
  if (block.type === "notice") return <p className={`ai-notice ai-notice-${block.tone}`}>{block.text}</p>;
  if (block.type === "import") return <ImportCard block={block} />;
  return (
    <figure className="ai-table">
      <figcaption>{block.title}</figcaption>
      <div className="ai-table-scroll">
        <table>
          {block.columns.some((c) => c.label) && (
            <thead>
              <tr>
                {block.columns.map((c) => (
                  <th key={c.key} scope="col">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i}>
                {block.columns.map((c, j) => {
                  const value = row[c.key];
                  return j === 0 && !c.label ? (
                    <th key={c.key} scope="row">
                      {value ?? ""}
                    </th>
                  ) : (
                    <td key={c.key} className={c.key === "severity" && value === "conflict" ? "ai-cell-conflict" : undefined}>
                      {value ?? <span className="muted">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.note && <p className="ai-table-note">{block.note}</p>}
    </figure>
  );
}

function ImportCard({ block }: { block: Extract<Block, { type: "import" }> }) {
  const range = block.dateRange.from ? `${formatDate(block.dateRange.from)}${block.dateRange.to && block.dateRange.to !== block.dateRange.from ? ` – ${formatDate(block.dateRange.to)}` : ""}` : null;
  return (
    <div className="ai-import-card">
      <div className="ai-import-head">
        <span className="ai-import-kind">Proposed schedule changes</span>
        <span className="ai-import-file">{block.fileName}</span>
      </div>
      <p className="ai-import-line">
        {summaryLine(block.counts as ImportSummary["counts"])}
        {range && <span className="muted"> · {range}</span>}
      </p>
      <p className="ai-import-hint">Nothing is added to the schedule until you review it and press Apply.</p>
      <Link className="button button-primary-sm" href={block.href}>
        Review and apply
      </Link>
    </div>
  );
}
