/** What ORCA AI streams back for one turn (ORCA_Backend_API src/ai/orchestrator.ts). */
export type Block =
  | { type: "table"; title: string; columns: { key: string; label: string }[]; rows: Record<string, string | number | null>[]; note?: string }
  | { type: "notice"; tone: "info" | "warning"; text: string }
  | { type: "import"; importId: string; fileName: string; counts: Record<string, number>; dateRange: { from: string | null; to: string | null }; href: string };

export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; label: string; status: "running" | "done" | "failed" }
  | { type: "block"; block: Block }
  | { type: "done" }
  | { type: "error"; message: string };

export interface ToolProgress {
  name: string;
  label: string;
  status: "running" | "done" | "failed";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  blocks: Block[];
  tools: ToolProgress[];
  /** For a user message that attached a workbook. */
  attachment?: { fileName: string; importId: string };
  status: "streaming" | "done" | "error";
  error?: string;
}

export interface AiStatus {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  demo: boolean;
  tools: string[];
}
