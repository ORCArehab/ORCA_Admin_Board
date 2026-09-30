import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { AdminIdentity, Authenticator } from "./auth/authenticator.js";
import { AppError } from "./lib/errors.js";
import { providerRoutes } from "./routes/dashboard/providers.js";
import type { ProviderDashboardService } from "./services/providerDashboard.js";

declare module "fastify" {
  interface FastifyRequest {
    admin?: AdminIdentity;
  }
}

export interface AppDeps {
  authenticator: Authenticator;
  providerDashboard: ProviderDashboardService;
}

/**
 * Builds the Fastify app from injected dependencies (no env or Google access here),
 * so tests can supply fakes. Future routes (/api/dashboard/scribes, /trends,
 * /facilities, /audit, /api/ai/chat) register inside the authenticated /api scope.
 */
export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify(options);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) request.log.error({ err: error, cause: error.cause }, error.message);
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({ error: { code: "BAD_REQUEST", message: (error as Error).message } });
    }
    request.log.error({ err: error }, "Unhandled error");
    return reply.status(500).send({ error: { code: "INTERNAL", message: "Internal server error" } });
  });

  // Unauthenticated liveness probe for Cloud Run.
  app.get("/healthz", async () => ({ ok: true }));

  // Everything under /api requires an authorized admin.
  app.register(
    async (api) => {
      api.addHook("onRequest", async (request) => {
        request.admin = await deps.authenticator.authenticate(request);
      });

      api.register(providerRoutes, { prefix: "/dashboard", providerDashboard: deps.providerDashboard });
    },
    { prefix: "/api" },
  );

  return app;
}
