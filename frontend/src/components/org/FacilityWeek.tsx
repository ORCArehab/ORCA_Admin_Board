"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchBoard } from "@/lib/schedule/api";
import { timeText, TYPE_LABELS } from "@/lib/schedule/format";
import type { ScheduleBoardData } from "@/lib/schedule/types";
import { addDays, dayHeading, today, weekDays, weekLabel, weekStart } from "@/lib/schedule/week";

/**
 * Who's scheduled at this facility, one week at a time (Operations' schedule, read-only here).
 * Coverage and admin/clinic entries at the facility count too. Editing stays on the schedule board.
 */
export function FacilityWeek({ facilityId }: { facilityId: string }) {
  const thisWeek = weekStart(today());
  const [start, setStart] = useState(thisWeek);
  const [state, setState] = useState<{ status: "loading" } | { status: "error" } | { status: "ready"; data: ScheduleBoardData }>({ status: "loading" });

  useEffect(() => {
    let live = true;
    fetchBoard(start)
      .then((data) => live && setState({ status: "ready", data }))
      .catch(() => live && setState({ status: "error" }));
    return () => {
      live = false;
    };
  }, [start]);

  const go = (next: string) => {
    setState({ status: "loading" });
    setStart(next);
  };
  const staff = state.status === "ready" ? new Map(state.data.staff.map((s) => [s.id, s.displayName])) : new Map<string, string>();
  const entries = state.status === "ready" ? state.data.assignments.filter((a) => a.facilityId === facilityId) : [];
  const now = today();

  return (
    <div className="facility-week">
      <div className="facility-week-toolbar">
        <h3>{weekLabel(start)}</h3>
        <span className="facility-week-nav">
          <button type="button" className="button" onClick={() => go(addDays(start, -7))} aria-label="Previous week">
            ←
          </button>
          {start !== thisWeek && (
            <button type="button" className="button" onClick={() => go(thisWeek)}>
              This week
            </button>
          )}
          <button type="button" className="button" onClick={() => go(addDays(start, 7))} aria-label="Next week">
            →
          </button>
          <Link className="text-link facility-week-board" href={`/schedule?view=facilities&facility=${encodeURIComponent(facilityId)}&week=${start}`}>
            Open schedule board
          </Link>
        </span>
      </div>
      {state.status === "loading" && <p className="profile-empty">Loading the schedule…</p>}
      {state.status === "error" && <p className="profile-empty">The schedule couldn&apos;t be loaded. Try again in a moment.</p>}
      {state.status === "ready" && (
        <ol className="facility-days">
          {weekDays(start).map((day) => {
            const heading = dayHeading(day);
            const todays = entries.filter((e) => e.date === day);
            return (
              <li key={day} className={`facility-day${day === now ? " is-today" : ""}`}>
                <span className="facility-day-date">
                  <span>{heading.weekday}</span> {heading.day}
                </span>
                {todays.length === 0 ? (
                  <span className="muted">No one scheduled</span>
                ) : (
                  <ul className="facility-day-entries">
                    {todays.map((e) => (
                      <li key={e.id}>
                        <span className="facility-day-who">{staff.get(e.staffId) ?? "Unknown provider"}</span>
                        <span className="muted">
                          {[e.type !== "facility" && TYPE_LABELS[e.type], timeText(e) || "All day", e.coveringStaffId && staff.get(e.coveringStaffId) && `covering ${staff.get(e.coveringStaffId)}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
