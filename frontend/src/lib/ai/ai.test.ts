import { describe, expect, it } from "vitest";
import { applicable, effectiveStatus, isPicture, summaryLine, timeLabel, uploadProblem } from "./imports";
import { applyEvent, historyFor, sseParser } from "./stream";
import type { ChatEvent, ChatMessage } from "./types";

const assistant = (o: Partial<ChatMessage> = {}): ChatMessage => ({ id: "a", role: "assistant", text: "", blocks: [], tools: [], status: "streaming", ...o });

describe("streaming", () => {
  it("parses server-sent events split across chunks, skipping noise", () => {
    const events: ChatEvent[] = [];
    const feed = sseParser((e) => events.push(e));
    feed('data: {"type":"text","del');
    feed('ta":"Hel"}\n\n: keep-alive\ndata: {"type":"text","delta":"lo"}\n');
    feed("data: not json\n\ndata: {\"type\":\"done\"}\n");
    expect(events).toEqual([{ type: "text", delta: "Hel" }, { type: "text", delta: "lo" }, { type: "done" }]);
  });

  it("builds the assistant message from events: text, tables, tool progress, done/error", () => {
    let m = assistant();
    m = applyEvent(m, { type: "tool", name: "get_provider_schedule", label: "Checking", status: "running" });
    m = applyEvent(m, { type: "block", block: { type: "notice", tone: "info", text: "x" } });
    m = applyEvent(m, { type: "tool", name: "get_provider_schedule", label: "Checking", status: "done" });
    m = applyEvent(m, { type: "text", delta: "All " });
    m = applyEvent(m, { type: "text", delta: "set." });
    m = applyEvent(m, { type: "done" });
    expect([m.text, m.blocks.length, m.tools, m.status]).toEqual(["All set.", 1, [{ name: "get_provider_schedule", label: "Checking", status: "done" }], "done"]);
    expect(applyEvent(assistant(), { type: "error", message: "busy" })).toMatchObject({ status: "error", error: "busy" });
  });

  it("sends words only, with attachments named, and leaves failed turns out", () => {
    const history = historyFor([
      { id: "1", role: "user", text: "Check this", blocks: [], tools: [], status: "done", attachment: { fileName: "Oct.xlsx", importId: "abc" } },
      assistant({ text: "It has 12 rows.", status: "done", blocks: [{ type: "notice", tone: "info", text: "t" }] }),
      assistant({ text: "", status: "error" }),
    ]);
    expect(history).toEqual([
      { role: "user", content: 'Check this\n\n[Attached schedule "Oct.xlsx", draft import abc]' },
      { role: "assistant", content: "It has 12 rows." },
    ]);
  });
});

describe("import review helpers", () => {
  const row = (status: string, excluded = false) => ({ status, excluded }) as never;
  it("counts what Apply would add and how rows read", () => {
    expect(applicable([row("ready"), row("ready", true), row("warning"), row("conflict")])).toEqual({ ready: 1, warning: 1 });
    expect(effectiveStatus({ status: "ready", excluded: true })).toBe("excluded");
    expect(effectiveStatus({ status: "applied", excluded: true })).toBe("applied");
    expect(timeLabel({ timeBlock: "custom", startTime: "09:00", endTime: "11:00" })).toBe("09:00–11:00");
    expect(timeLabel({ timeBlock: "all_day", startTime: null, endTime: null })).toBe("All day");
    expect(summaryLine({ ready: 12, warning: 0, conflict: 1, duplicate: 3, needs_review: 2, skipped: 0, applied: 0, excluded: 0, total: 18 })).toBe("12 ready · 2 need review · 1 conflict · 3 already scheduled");
  });
});

describe("uploads", () => {
  it("takes workbooks and pictures, explains HEIC, and refuses anything else or anything over 4 MB", () => {
    for (const name of ["Week.xlsx", "photo.JPG", "shot.jpeg", "scan.png", "x.webp"]) expect(uploadProblem({ name, size: 1000 })).toBeNull();
    expect(uploadProblem({ name: "IMG_1234.HEIC", size: 1000 })).toMatch(/HEIC/);
    expect(uploadProblem({ name: "notes.pdf", size: 1000 })).toMatch(/isn't an \.xlsx/);
    expect(uploadProblem({ name: "big.png", size: 5 * 1024 * 1024 })).toMatch(/4 MB/);
    expect([isPicture("a.png"), isPicture("a.xlsx")]).toEqual([true, false]);
  });
});
