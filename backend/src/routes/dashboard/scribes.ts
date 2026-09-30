import type { FastifyPluginAsync } from "fastify";
import type { ScribeDashboardService } from "../../services/scribeDashboard.js";

export interface ScribeRoutesOptions {
  scribeDashboard: ScribeDashboardService;
}

/** GET /api/dashboard/scribes[?refresh=true] */
export const scribeRoutes: FastifyPluginAsync<ScribeRoutesOptions> = async (app, opts) => {
  app.get<{ Querystring: { refresh?: boolean } }>(
    "/scribes",
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
      const { data, cached } = await opts.scribeDashboard.getDashboard({ refresh: request.query.refresh });
      return { ...data, meta: { ...data.meta, cached } };
    },
  );
};
