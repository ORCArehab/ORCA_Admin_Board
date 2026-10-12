import "server-only";
import { errorResponse, upstreamError } from "@/lib/apiRoute";
import { OrcaApiError } from "@/lib/orcaApi";

/**
 * QuickBooks Time problems the ORCA API explains itself (not connected, token refused, rate
 * limited, calendar not chosen, bad link id): the API's message and code go through to the dialog.
 */
export function quickbooksError(error: unknown) {
  if (error instanceof OrcaApiError && [400, 409, 502, 503].includes(error.status)) {
    const body = (error.body ?? {}) as { error?: unknown; code?: unknown; calendars?: unknown };
    if (typeof body.error === "string") {
      return errorResponse(error.status, typeof body.code === "string" ? body.code.toUpperCase() : "QUICKBOOKS", body.error, { calendars: body.calendars ?? [] });
    }
  }
  return upstreamError(error, "quickbooks-time");
}
