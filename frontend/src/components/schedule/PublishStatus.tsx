"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { fetchPublication, publicationLine, type PublicationStatus } from "@/lib/schedule/quickbooks";
import { SCHEDULE_TIMEZONE } from "@/lib/schedule/week";

/**
 * Under the board: whether providers can see this week in the employee portal, and whether what
 * they see matches the board. The board is a working copy; a week reaches providers when it's
 * sent to QuickBooks Time. `revision` changes whenever the board's entries do, so this re-checks.
 */
export function PublishStatus({ weekStart, entries, revision }: { weekStart: string; entries: number; revision: unknown }) {
  const [status, setStatus] = useState<PublicationStatus | null>(null);

  useEffect(() => {
    let live = true;
    void fetchPublication(weekStart).then((next) => live && setStatus(next));
    return () => {
      live = false;
    };
  }, [weekStart, revision]);

  if (!status || status.weekStart !== weekStart) return null;
  const line = publicationLine(status, status.publishedAt ? formatDateTime(status.publishedAt, SCHEDULE_TIMEZONE) : null, entries);
  return (
    <p className={`publish-status${line.attention ? " needs-send" : ""}`} role="status">
      {line.text}
    </p>
  );
}
