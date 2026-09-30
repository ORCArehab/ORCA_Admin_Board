import type { FastifyPluginAsync } from "fastify";
import type { ProviderDashboardService } from "../../services/providerDashboard.js";

export interface ProviderRoutesOptions {
  providerDashboard: ProviderDashboardService;
}

/** GET /api/dashboard/providers[?refresh=true] */
export const providerRoutes: FastifyPluginAsync<ProviderRoutesOptions> = async (app, opts) => {
  app.get<{ Querystring: { refresh?: boolean } }>(
    "/providers",
    {
      schema: {
        querystring: {
          type: "object",
          properties: { refresh: { type: "boolean", default: false } },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const { data, cached } = await opts.providerDashboard.getDashboard({ refresh: request.query.refresh });
      return { ...data, meta: { ...data.meta, cached } };
    },
  );
};
