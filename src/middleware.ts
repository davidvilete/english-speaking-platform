import type { NextRequest } from "next/server";
import { updateSessionAndEnforceRbac } from "@/shared/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSessionAndEnforceRbac(request);
}

export const config = {
  matcher: [
    "/student/:path*",
    "/teacher/:path*",
    "/admin/:path*",
    "/login",
    "/register",
  ],
};
