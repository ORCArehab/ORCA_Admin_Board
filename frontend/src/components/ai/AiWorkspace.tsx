"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { isPicture, summaryLine, UPLOAD_ACCEPT, uploadProblem, uploadSchedule } from "@/lib/ai/imports";
import { applyEvent, historyFor, sseParser } from "@/lib/ai/stream";
import type { AiStatus, ChatEvent, ChatMessage } from "@/lib/ai/types";
import { BlockView } from "./Blocks";

const SUGGESTIONS = [
  "Which providers have scheduling conflicts in the next two weeks?",
  "Which facilities have no assigned provider next week?",
  "Which providers have the most outstanding documentation?",
  "Show me the scribes with the highest notes per hour.",
  "Who is scheduled at Alpha Post Acute on Friday?",
  "Compare documentation completion across providers.",
];

let counter = 0;
const newId = () => `m${Date.now()}-${counter++}`;

/**
 * ORCA AI: ask about employees, facilities, the schedule and operational metrics, or upload a
 * schedule (a workbook or a picture) to review. Answers come from ORCA's own data through the ORCA API's tools;
 * tables appear under each answer. The conversation lasts for this visit. ORCA AI never changes
 * anything: an uploaded schedule is applied by an admin on its review screen.
 */
export function AiWorkspace() {
  const [status, setStatus] = useState<AiStatus | null | "error">(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [pending, setPending] = useState<File | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/ai/status", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<AiStatus>) : Promise.reject(new Error())))
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus("error"));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const enabled = status !== null && status !== "error" && status.enabled;
  const patch = (id: string, change: (m: ChatMessage) => ChatMessage) => setMessages((all) => all.map((m) => (m.id === id ? change(m) : m)));

  async function ask(text: string, prior: ChatMessage[], extra?: Partial<ChatMessage>) {
    const user: ChatMessage = { id: newId(), role: "user", text, blocks: [], tools: [], status: "done", ...extra };
    const reply: ChatMessage = { id: newId(), role: "assistant", text: "", blocks: [], tools: [], status: "streaming" };
    const conversation = [...prior, user];
    setMessages([...conversation, reply]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: historyFor(conversation) }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "ORCA AI couldn't answer that. Try again.");
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      const feed = sseParser((event: ChatEvent) => patch(reply.id, (m) => applyEvent(m, event)));
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        feed(value);
      }
      patch(reply.id, (m) => (m.status === "streaming" ? { ...m, status: "done" } : m));
    } catch (error) {
      const stopped = error instanceof DOMException && error.name === "AbortError";
      patch(reply.id, (m) => ({ ...m, status: stopped ? "done" : "error", text: stopped && m.text ? `${m.text}\n\n(Stopped.)` : m.text, error: stopped ? undefined : error instanceof Error ? error.message : "Something went wrong." }));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (busy) return;
    if (pending) {
      // The attached file goes with whatever was typed, as one message.
      const file = pending;
      setPending(null);
      setInput("");
      void sendFile(file, text);
      return;
    }
    if (!text || !enabled) return;
    setInput("");
    void ask(text, messages);
  }

  /** Attaching only stages the file in the composer; it's read when the message is sent. */
  function stage(file: File) {
    const problem = uploadProblem(file);
    if (problem) return addLocal(problem);
    setPending(file);
    textRef.current?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  async function sendFile(file: File, text: string) {
    const picture = isPicture(file.name);
    const placeholder: ChatMessage = { id: newId(), role: "assistant", text: picture ? `Reading the schedule in "${file.name}"… (pictures take a few seconds)` : `Reading "${file.name}"…`, blocks: [], tools: [], status: "streaming" };
    setMessages((all) => [...all, placeholder]);
    setBusy(true);
    try {
      const draft = await uploadSchedule(file);
      setMessages((all) => all.filter((m) => m.id !== placeholder.id));
      const prior = messages;
      if (enabled) {
        setBusy(false);
        await ask(text || `Here's a schedule ${picture ? "picture" : "workbook"}. Summarize what's ready, what needs my attention, and why.`, prior, { attachment: { fileName: file.name, importId: draft.summary.id } });
      } else {
        // Without a language model, the deterministic summary and review screen still work.
        setMessages((all) => [
          ...all,
          { id: newId(), role: "user", text: text || `Uploaded a schedule ${picture ? "picture" : "workbook"}.`, blocks: [], tools: [], status: "done", attachment: { fileName: file.name, importId: draft.summary.id } },
          {
            id: newId(),
            role: "assistant",
            text: `I read "${file.name}": ${summaryLine(draft.summary.counts)}.`,
            blocks: [{ type: "import", importId: draft.summary.id, fileName: draft.summary.fileName, source: draft.summary.source, counts: draft.summary.counts, dateRange: draft.summary.dateRange, href: `/ai/imports/${draft.summary.id}` }],
            tools: [],
            status: "done",
          },
        ]);
        setBusy(false);
      }
    } catch (error) {
      setMessages((all) => all.filter((m) => m.id !== placeholder.id));
      addLocal(error instanceof Error ? error.message : "That file couldn't be read.");
      setBusy(false);
    }
  }

  function addLocal(text: string) {
    setMessages((all) => [...all, { id: newId(), role: "assistant", text, blocks: [], tools: [], status: "error", error: text }]);
  }

  return (
    <div className="ai">
      <header className="ai-header">
        <div>
          <h1>ORCA AI</h1>
          <p>Ask about employees, facilities, the schedule and documentation, or upload a schedule to review.</p>
        </div>
        <StatusPill status={status} />
      </header>

      {status === "error" && <p className="ai-banner">ORCA AI&apos;s status couldn&apos;t be checked. Try reloading the page.</p>}
      {status && status !== "error" && !status.enabled && (
        <p className="ai-banner">
          ORCA AI isn&apos;t connected to a language model yet, so questions are off. You can still upload an .xlsx schedule: it&apos;s read, matched and checked without AI. Pictures need the model.
        </p>
      )}

      <div className="ai-thread" aria-live="polite">
        {messages.length === 0 ? (
          <div className="ai-empty">
            <h2>What would you like to know?</h2>
            <p>
              Answers come from ORCA&apos;s records: the schedule, employees, facilities and the operations dashboard. ORCA AI can&apos;t change anything. To import a schedule, attach an .xlsx
              or a picture of it with the paperclip below.
            </p>
            <div className="ai-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="ai-suggestion" onClick={() => void ask(s, [])} disabled={!enabled || busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <Message key={m.id} message={m} />)
        )}
        <div ref={endRef} />
      </div>

      <form className="ai-composer" onSubmit={submit}>
        <input
          ref={fileRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) stage(file);
          }}
        />
        <button type="button" className="ai-attach" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Attach a schedule" title="Attach a schedule: .xlsx, or a PNG / JPEG picture">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" />
          </svg>
        </button>
        <div className={`ai-input${pending ? " has-file" : ""}`}>
          {pending && (
            <span className="ai-file-chip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5" />
              </svg>
              <span className="ai-file-name">{pending.name}</span>
              <button type="button" className="ai-file-remove" onClick={() => setPending(null)} aria-label={`Remove ${pending.name}`} disabled={busy}>
                ×
              </button>
            </span>
          )}
        <textarea
          ref={textRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder={
            pending
              ? enabled
                ? "Add a note for ORCA AI (optional), e.g. \"this is next week; Dr. Kim is Ann\""
                : "Press send to read this file"
              : enabled
                ? "Ask about a provider, a facility, the schedule…"
                : "Questions are off until ORCA AI is connected"
          }
          disabled={!enabled && !pending}
          aria-label="Message ORCA AI"
          maxLength={4000}
        />
        </div>
        {busy && abortRef.current ? (
          <button type="button" className="ai-send ai-stop" onClick={() => abortRef.current?.abort()} aria-label="Stop" title="Stop">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
          </button>
        ) : (
          <button type="submit" className="ai-send" disabled={busy || (pending ? false : !enabled || !input.trim())} aria-label="Send" title="Send">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}

function StatusPill({ status }: { status: AiStatus | null | "error" }) {
  if (status === null) return <span className="ai-pill">Checking…</span>;
  if (status === "error" || !status.enabled) return <span className="ai-pill ai-pill-off">Not connected</span>;
  if (status.demo) return <span className="ai-pill ai-pill-demo" title="No language model: a scripted planner calls the real tools">Demo mode</span>;
  return <span className="ai-pill ai-pill-on" title={`${status.provider} · ${status.model}`}>Connected</span>;
}

function Message({ message: m }: { message: ChatMessage }) {
  if (m.role === "user") {
    return (
      <div className="ai-msg ai-msg-user">
        <div className="ai-bubble">
          {m.text}
          {m.attachment && <span className="ai-attachment">📎 {m.attachment.fileName}</span>}
        </div>
      </div>
    );
  }
  const running = m.tools.filter((t) => t.status === "running");
  return (
    <div className="ai-msg ai-msg-assistant">
      <div className="ai-avatar" aria-hidden="true">
        AI
      </div>
      <div className="ai-answer">
        {m.tools.length > 0 && (
          <ul className="ai-tools" aria-label="Steps">
            {m.tools.map((t) => (
              <li key={t.name} className={`ai-tool ai-tool-${t.status}`}>
                {t.status === "running" ? <span className="ai-spinner" aria-hidden="true" /> : t.status === "done" ? "✓" : "!"} {t.label}
              </li>
            ))}
          </ul>
        )}
        {m.text ? <Prose text={m.text} /> : m.status === "streaming" && running.length === 0 && <p className="ai-thinking">Thinking…</p>}
        {m.blocks.map((b, i) => (
          <BlockView key={i} block={b} />
        ))}
        {m.status === "error" && m.error && (
          <p className="ai-error" role="alert">
            {m.error}
          </p>
        )}
      </div>
    </div>
  );
}

/** Plain text with paragraphs, "- " bullets and **bold**. The model's text is never rendered as HTML. */
function Prose({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
  return (
    <div className="ai-prose">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-•*]\s+/.test(l)))
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-•*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        return <p key={i}>{lines.map((l, j) => (j ? [<br key={j} />, ...inline(l)] : inline(l)))}</p>;
      })}
    </div>
  );
}
