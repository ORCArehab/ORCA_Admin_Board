import { google, type drive_v3 } from "googleapis";
import type { GoogleAuthClient } from "./auth.js";

/**
 * Thin, metadata-only Google Drive access for the future ORCA AI/RAG pipeline.
 *
 * Security layering (see README "Google Workspace access and the RAG boundary"):
 *   Workspace permissions (service account = Shared Drive Viewer)   ← outer boundary
 *   → application RAG allowlist (explicit drives/folders/files)      ← retrieval boundary
 *   → retrieval / indexing → OpenAI API
 *
 * Shared Drive support: every call passes supportsAllDrives / includeItemsFromAllDrives
 * and lists within an explicit `driveId` (corpora=drive), never the whole corpus the
 * account can see. Callers choose which drive/folder to list — there is no
 * "crawl everything" helper. File *content* access is intentionally not implemented yet.
 */

export interface SharedDriveInfo {
  id: string;
  name: string;
}

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  modifiedTime?: string;
}

export interface ListFilesOptions {
  /** Shared Drive to list within (required: we never list across all drives). */
  driveId: string;
  /** Restrict to direct children of this folder. */
  folderId?: string;
  pageToken?: string;
  pageSize?: number;
  /** Drive API fields for each file; defaults to basic metadata. */
  fileFields?: string;
}

export interface DriveReader {
  listSharedDrives(): Promise<SharedDriveInfo[]>;
  listFiles(opts: ListFilesOptions): Promise<{ files: DriveFileMeta[]; nextPageToken?: string }>;
}

export class GoogleDriveReader implements DriveReader {
  private readonly api: drive_v3.Drive;

  constructor(auth: GoogleAuthClient) {
    this.api = google.drive({ version: "v3", auth, retry: true });
  }

  async listSharedDrives(): Promise<SharedDriveInfo[]> {
    const drives: SharedDriveInfo[] = [];
    let pageToken: string | undefined;
    do {
      const res = await this.api.drives.list({ pageSize: 100, pageToken, fields: "nextPageToken, drives(id, name)" });
      for (const d of res.data.drives ?? []) drives.push({ id: d.id ?? "", name: d.name ?? "" });
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return drives;
  }

  async listFiles(opts: ListFilesOptions): Promise<{ files: DriveFileMeta[]; nextPageToken?: string }> {
    const q = ["trashed = false", opts.folderId ? `'${opts.folderId.replace(/'/g, "\\'")}' in parents` : undefined]
      .filter(Boolean)
      .join(" and ");
    const res = await this.api.files.list({
      corpora: "drive",
      driveId: opts.driveId,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      q,
      pageSize: opts.pageSize ?? 1000,
      pageToken: opts.pageToken,
      fields: `nextPageToken, files(${opts.fileFields ?? "id, name, mimeType, parents, modifiedTime"})`,
    });
    return {
      files: (res.data.files ?? []).map((f) => ({
        id: f.id ?? "",
        name: f.name ?? "",
        mimeType: f.mimeType ?? "",
        parents: f.parents ?? [],
        modifiedTime: f.modifiedTime ?? undefined,
      })),
      nextPageToken: res.data.nextPageToken ?? undefined,
    };
  }
}
