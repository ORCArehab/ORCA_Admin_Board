/** Error with an HTTP status and a stable machine-readable code for API responses. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AppError";
  }
}

/** Translate Google API failures into actionable errors without leaking internals. */
export function fromGoogleError(err: unknown, sourceLabel: string): AppError {
  const status = (err as { code?: number; status?: number })?.code ?? (err as { status?: number })?.status;
  if (status === 403 || status === 404) {
    return new AppError(
      502,
      "SOURCE_ACCESS_DENIED",
      `Cannot read "${sourceLabel}". Check the spreadsheet ID and that it is shared (Viewer) with the service account.`,
      { cause: err },
    );
  }
  if (status === 429) {
    return new AppError(503, "SOURCE_RATE_LIMITED", `Google Sheets rate limit reached reading "${sourceLabel}".`, {
      cause: err,
    });
  }
  return new AppError(502, "SOURCE_UNAVAILABLE", `Failed to read "${sourceLabel}" from Google Sheets.`, { cause: err });
}
