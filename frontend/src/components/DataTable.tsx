"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Accessible description of the column, shown as a tooltip on the header. */
  description?: string;
}

/**
 * Generic, unstyled-by-feature table used for providers now and scribes/facilities later.
 * Rows with an href are clickable; the first column should also contain a real link for
 * keyboard and screen-reader users.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  emptyMessage = "No results.",
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  emptyMessage?: ReactNode;
  caption?: string;
}) {
  const router = useRouter();
  return (
    <div className="table-wrap">
      <table className="table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.align === "right" ? "align-right" : undefined} title={c.description}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="table-empty" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr
                  key={rowKey(row)}
                  className={href ? "is-link" : undefined}
                  onClick={
                    href
                      ? (e) => {
                          // Let real links / modifier-clicks behave natively.
                          if ((e.target as HTMLElement).closest("a") || e.metaKey || e.ctrlKey) return;
                          router.push(href);
                        }
                      : undefined
                  }
                >
                  {columns.map((c) => (
                    <td key={c.key} className={c.align === "right" ? "align-right num" : undefined}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
