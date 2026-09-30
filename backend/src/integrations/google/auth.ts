import { google } from "googleapis";

/**
 * The only module that knows how Google credentials are obtained.
 *
 * Uses Application Default Credentials (ADC):
 *  - Cloud Run: the service account attached to the service (no key file).
 *  - Local dev: `gcloud auth application-default login --impersonate-service-account=...`
 *    or GOOGLE_APPLICATION_CREDENTIALS pointing at a key file outside the repo.
 *
 * Scopes are read-only. Access is further limited by which spreadsheets are
 * explicitly shared (Viewer) with the service account.
 */
export const SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

export type GoogleAuthClient = InstanceType<typeof google.auth.GoogleAuth>;

export function createGoogleAuth(scopes: string[] = [SHEETS_READONLY_SCOPE]): GoogleAuthClient {
  return new google.auth.GoogleAuth({ scopes });
}

/**
 * Read-only Drive scope. Needed to enumerate Shared Drives (drives.list does not accept
 * drive.metadata.readonly). Access is still bounded by what is shared with the service
 * account (Viewer), and the application only requests metadata fields until the RAG
 * allowlist exists; no code path downloads file contents yet.
 */
export const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
