/**
 * Shared Drive connectivity check (no RAG, no content access).
 *
 *   npm run check:drive
 *
 * Confirms the service account can see ORCA's Shared Drive(s) through the Drive API
 * and prints a non-sensitive summary: drive names/IDs and file/folder counts by type.
 * File names are never requested or printed; file contents are never downloaded.
 */
import { loadEnv } from "../src/config/env.js";
import { createGoogleAuth, DRIVE_READONLY_SCOPE } from "../src/integrations/google/auth.js";
import { GoogleDriveReader } from "../src/integrations/google/drive.js";

/** Safety cap so the check never turns into a crawl of a very large drive. */
const MAX_ITEMS = 20_000;

function typeLabel(mime: string): string {
  const known: Record<string, string> = {
    "application/vnd.google-apps.folder": "folder",
    "application/vnd.google-apps.document": "Google Doc",
    "application/vnd.google-apps.spreadsheet": "Google Sheet",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/vnd.google-apps.form": "Google Form",
    "application/vnd.google-apps.shortcut": "shortcut",
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word (.docx)",
    "application/msword": "Word (.doc)",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel (.xlsx)",
    "application/vnd.ms-excel": "Excel (.xls)",
    "text/csv": "CSV",
    "text/plain": "text",
  };
  if (known[mime]) return known[mime];
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "other";
}

async function main() {
  const env = loadEnv();
  const drive = new GoogleDriveReader(createGoogleAuth([DRIVE_READONLY_SCOPE]));

  const drives = await drive.listSharedDrives();
  console.log(`Shared Drives visible to the service account: ${drives.length}`);
  for (const d of drives) console.log(`  ${d.name}  (id: ${d.id})`);

  const targets = env.ORCA_SHARED_DRIVE_ID ? drives.filter((d) => d.id === env.ORCA_SHARED_DRIVE_ID) : drives;
  if (env.ORCA_SHARED_DRIVE_ID && targets.length === 0) {
    throw new Error("ORCA_SHARED_DRIVE_ID is set but that Shared Drive is not visible to the service account.");
  }

  for (const d of targets) {
    const counts: Record<string, number> = {};
    let total = 0;
    let pageToken: string | undefined;
    do {
      // Request mimeType only — no names, no contents.
      const page = await drive.listFiles({ driveId: d.id, pageToken, fileFields: "mimeType" });
      for (const f of page.files) counts[typeLabel(f.mimeType)] = (counts[typeLabel(f.mimeType)] ?? 0) + 1;
      total += page.files.length;
      pageToken = page.nextPageToken;
    } while (pageToken && total < MAX_ITEMS);

    console.log(`\n"${d.name}": ${total}${pageToken ? "+ (stopped at safety cap)" : ""} items`);
    for (const [label, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${label.padEnd(16)} ${n}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
