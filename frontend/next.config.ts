import type { NextConfig } from "next";

/**
 * API access model:
 *  - Local dev: /api/* is proxied to the Fastify backend (BACKEND_DEV_URL, default
 *    http://127.0.0.1:8080), which runs with AUTH_MODE=disabled on loopback only.
 *  - Production: NO proxy. An HTTPS load balancer with Cloud IAP routes /api/* to the backend
 *    Cloud Run service and everything else to this app. Each service verifies its own IAP
 *    identity, so the frontend never forwards credentials and the backend's auth is unchanged.
 */
const isDev = process.env.NODE_ENV !== "production";
const backendDevUrl = process.env.BACKEND_DEV_URL ?? "http://127.0.0.1:8080";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return isDev ? [{ source: "/api/:path*", destination: `${backendDevUrl}/api/:path*` }] : [];
  },
};

export default nextConfig;
