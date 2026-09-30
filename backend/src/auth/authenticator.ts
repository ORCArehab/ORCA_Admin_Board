import type { FastifyRequest } from "fastify";
import { OAuth2Client } from "google-auth-library";
import { splitList, type Env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

/**
 * Admin authentication/authorization for the API. Kept entirely separate from
 * Google Sheets access (which uses the service account) and from metric logic.
 */
export interface AdminIdentity {
  email: string;
  /** How the identity was established. */
  method: "iap" | "disabled";
}

export interface Authenticator {
  authenticate(request: FastifyRequest): Promise<AdminIdentity>;
}

/** Local development only; env validation forbids it in production. */
export class DisabledAuthenticator implements Authenticator {
  async authenticate(): Promise<AdminIdentity> {
    return { email: "local-dev@localhost", method: "disabled" };
  }
}

export interface AccessPolicy {
  allowedDomains: string[];
  allowedEmails: string[];
}

export function isAllowed(email: string, policy: AccessPolicy): boolean {
  const normalized = email.trim().toLowerCase();
  if (policy.allowedEmails.includes(normalized)) return true;
  const domain = normalized.split("@")[1] ?? "";
  return policy.allowedDomains.includes(domain);
}

/**
 * Verifies the signed JWT Cloud IAP attaches to each request (x-goog-iap-jwt-assertion),
 * then checks the Workspace account against the admin allowlist. The unsigned
 * x-goog-authenticated-user-email header is never trusted on its own.
 */
export class IapAuthenticator implements Authenticator {
  private readonly client = new OAuth2Client();

  constructor(
    private readonly audience: string,
    private readonly policy: AccessPolicy,
  ) {}

  async authenticate(request: FastifyRequest): Promise<AdminIdentity> {
    const assertion = request.headers["x-goog-iap-jwt-assertion"];
    if (typeof assertion !== "string" || !assertion) {
      throw new AppError(401, "UNAUTHENTICATED", "Missing IAP identity.");
    }
    let email: string | undefined;
    try {
      const { pubkeys } = await this.client.getIapPublicKeys();
      const ticket = await this.client.verifySignedJwtWithCertsAsync(assertion, pubkeys, this.audience, [
        "https://cloud.google.com/iap",
      ]);
      email = ticket.getPayload()?.email;
    } catch (err) {
      throw new AppError(401, "UNAUTHENTICATED", "Invalid IAP identity.", { cause: err });
    }
    if (!email || !isAllowed(email, this.policy)) {
      throw new AppError(403, "FORBIDDEN", "This account is not authorized for the ORCA admin API.");
    }
    return { email, method: "iap" };
  }
}

export function createAuthenticator(env: Env): Authenticator {
  if (env.AUTH_MODE === "iap") {
    return new IapAuthenticator(env.IAP_AUDIENCE!, {
      allowedDomains: splitList(env.ADMIN_ALLOWED_DOMAINS),
      allowedEmails: splitList(env.ADMIN_ALLOWED_EMAILS),
    });
  }
  return new DisabledAuthenticator();
}
