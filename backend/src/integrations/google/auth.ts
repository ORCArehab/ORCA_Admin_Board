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
