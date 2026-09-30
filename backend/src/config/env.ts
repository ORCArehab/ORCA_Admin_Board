import { z } from "zod";

/**
 * Environment configuration, validated once at startup.
 * Secrets (service-account keys) are never read here — Google credentials are
 * resolved by Application Default Credentials inside integrations/google/auth.ts.
 */
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(8080),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

    /** IANA timezone used to decide "today" when computing outstanding age. */
    DASHBOARD_TIMEZONE: z.string().default("America/Los_Angeles"),

    /** How long computed dashboard data is cached in memory (seconds). */
    CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(300),

    /** Spreadsheet ID of "ORCA-NP/Scribe Tracker 2026". */
    PROVIDER_TRACKER_SPREADSHEET_ID: z.string().min(1).optional(),
    /** Path to the provider-tracker JSON config (tab → provider mapping, exclusions). */
    PROVIDER_TRACKER_CONFIG_PATH: z.string().default("config/provider-tracker.json"),
    /** Alternative to the file: the same JSON inline (handy for Cloud Run env/secrets). */
    PROVIDER_TRACKER_CONFIG_JSON: z.string().optional(),

    /** "iap" verifies Cloud IAP identity headers; "disabled" is only allowed outside production. */
    AUTH_MODE: z.enum(["disabled", "iap"]).default("disabled"),
    /** IAP JWT audience, e.g. /projects/PROJECT_NUMBER/global/backendServices/SERVICE_ID */
    IAP_AUDIENCE: z.string().optional(),
    /** Comma-separated Workspace domains whose accounts may use the API, e.g. "orcarehab.com". */
    ADMIN_ALLOWED_DOMAINS: z.string().default(""),
    /** Comma-separated explicit admin emails (optional, narrows or extends domain access). */
    ADMIN_ALLOWED_EMAILS: z.string().default(""),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.AUTH_MODE === "disabled") {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_MODE"],
        message: "AUTH_MODE=disabled is not allowed in production",
      });
    }
    if (env.AUTH_MODE === "iap") {
      if (!env.IAP_AUDIENCE) {
        ctx.addIssue({ code: "custom", path: ["IAP_AUDIENCE"], message: "required when AUTH_MODE=iap" });
      }
      if (!env.ADMIN_ALLOWED_DOMAINS && !env.ADMIN_ALLOWED_EMAILS) {
        ctx.addIssue({
          code: "custom",
          path: ["ADMIN_ALLOWED_DOMAINS"],
          message: "set ADMIN_ALLOWED_DOMAINS and/or ADMIN_ALLOWED_EMAILS when AUTH_MODE=iap",
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}

export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
