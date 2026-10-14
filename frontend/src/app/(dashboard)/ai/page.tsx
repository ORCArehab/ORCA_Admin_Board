import type { Metadata } from "next";
import { AiWorkspace } from "@/components/ai/AiWorkspace";

export const metadata: Metadata = { title: "ORCA AI · ORCA Admin" };

/** ORCA AI (admins): questions about ORCA's data, and schedule workbook uploads. */
export default function AiPage() {
  return <AiWorkspace />;
}
