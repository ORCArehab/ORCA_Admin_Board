import { OrgError } from "./api";

/**
 * Employee documents, as the ORCA API returns them (GET /v1/staff-documents/:id). The files
 * live in Google Drive; this app only shows them and links to them.
 */

export const DOCUMENT_CATEGORIES = [
  { key: "credentials", label: "Credentials" },
  { key: "contracts", label: "Contracts" },
  { key: "other", label: "Other" },
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]["key"];

/** Same limit as the API: uploads pass through Vercel, which caps a request at ~4.5 MB. */
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const ACCEPTED_TYPES = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx,.xls,.xlsx,.txt";

export interface DocumentFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  size: number | null;
  url: string;
}

export type EmployeeDocuments =
  | { status: "not_configured" | "not_linked" | "folder_missing" | "unavailable" }
  | {
      status: "ok";
      folderId: string;
      folderUrl: string;
      categories: { key: DocumentCategory; label: string; folderId: string | null; files: DocumentFile[] }[];
      unfiled: DocumentFile[];
      missingSubfolders: DocumentCategory[];
    };

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store", headers: { accept: "application/json", ...init.headers } });
  } catch {
    throw new OrgError(0, "NETWORK", "ORCA Admin couldn't be reached.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    // Vercel rejects an oversized body with its own (non-JSON) page before our route runs.
    if (res.status === 413 && !body?.error?.message) throw new OrgError(413, "TOO_LARGE", "Files must be 4 MB or smaller.");
    throw new OrgError(res.status, body?.error?.code ?? "HTTP_ERROR", body?.error?.message ?? `Request failed (${res.status}).`);
  }
  return (await res.json()) as T;
}

const base = (staffId: string) => `/api/staff-documents/${encodeURIComponent(staffId)}`;
export const getEmployeeDocuments = (staffId: string) => request<EmployeeDocuments>(base(staffId));
export const setUpEmployeeFolder = (staffId: string) => request<{ folderId: string; folderUrl: string; created: boolean }>(`${base(staffId)}/folder`, { method: "POST" });
export function addEmployeeDocument(staffId: string, category: DocumentCategory, file: File) {
  const body = new FormData();
  body.set("category", category);
  body.set("file", file, file.name);
  return request<{ file: DocumentFile }>(`${base(staffId)}/files`, { method: "POST", body });
}

/** "PDF · 1.2 MB · Oct 5, 2026" (parts that aren't known are left out). */
export function fileDetail(file: Pick<DocumentFile, "mimeType" | "size" | "modifiedTime">): string {
  return [fileKind(file.mimeType), file.size === null ? null : fileSize(file.size), file.modifiedTime ? shortDate(file.modifiedTime) : null].filter(Boolean).join(" · ");
}

export function fileKind(mimeType: string): string | null {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.includes("wordprocessingml") || mimeType === "application/msword" || mimeType === "application/vnd.google-apps.document") return "Document";
  if (mimeType.includes("spreadsheetml") || mimeType === "application/vnd.ms-excel" || mimeType === "application/vnd.google-apps.spreadsheet") return "Spreadsheet";
  if (mimeType === "text/plain") return "Text";
  return null;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

/** Problems the form can see before uploading (the API checks again). */
export function uploadProblem(file: File | null, category: string | null): string | null {
  if (!file) return "Choose a file.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_DOCUMENT_BYTES) return `Files must be 4 MB or smaller (this one is ${fileSize(file.size)}).`;
  if (!DOCUMENT_CATEGORIES.some((c) => c.key === category)) return "Choose Credentials, Contracts or Other.";
  return null;
}
