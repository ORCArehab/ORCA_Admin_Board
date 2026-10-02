import type { DefaultSession } from "next-auth";
import type { AdminUser, ApiSession } from "@/lib/session";

declare module "next-auth" {
  interface Session {
    user: AdminUser & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    adminUser?: AdminUser;
    /** Server-side only: never copied into the session the browser can read. */
    orcaApi?: ApiSession;
  }
}
