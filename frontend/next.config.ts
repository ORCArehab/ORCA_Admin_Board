import type { NextConfig } from "next";

/**
 * The browser only calls this app's own /api/* routes. Those run on the server and call the
 * shared ORCA API with this app's key and the signed-in admin's user token (see src/lib/orcaApi.ts).
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
