import type { Metadata } from "next";
import { ImportReview } from "@/components/ai/ImportReview";

export const metadata: Metadata = { title: "Review schedule import · ORCA Admin" };

/** Review of an uploaded schedule workbook, and the explicit Apply. */
export default async function ImportReviewPage({ params }: PageProps<"/ai/imports/[id]">) {
  const { id } = await params;
  return <ImportReview id={id} />;
}
