import type { ChatEvent, ChatMessage } from "./types";

/**
 * Reads server-sent events from a stream, a line at a time, and hands each parsed event over.
 * Lines that aren't events (comments, keep-alives) or aren't valid JSON are skipped.
 */
export function sseParser(onEvent: (event: ChatEvent) => void) {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as ChatEvent);
      } catch {
        // Not an event: ignore.
      }
    }
  };
}

/** Folds one event into the assistant message being built. Pure. */
export function applyEvent(message: ChatMessage, event: ChatEvent): ChatMessage {
  switch (event.type) {
    case "text":
      return { ...message, text: message.text + event.delta };
    case "block":
      return { ...message, blocks: [...message.blocks, event.block] };
    case "tool": {
      const others = message.tools.filter((t) => t.name !== event.name || t.status !== "running");
      return { ...message, tools: [...others, { name: event.name, label: event.label, status: event.status }] };
    }
    case "done":
      return { ...message, status: "done" };
    case "error":
      return { ...message, status: "error", error: event.message };
  }
}

/** The conversation as the API takes it: words only (tables are shown, not re-sent). */
export function historyFor(messages: ChatMessage[]): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((m) => m.status !== "error" && (m.text.trim() || m.attachment))
    .map((m) => ({ role: m.role, content: m.attachment ? `${m.text}\n\n[Attached schedule "${m.attachment.fileName}", draft import ${m.attachment.importId}]`.trim() : m.text }));
}
