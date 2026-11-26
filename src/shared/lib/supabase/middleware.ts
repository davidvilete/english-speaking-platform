import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  canRoleAccessPath,
  getDefaultRedirectForRole,
  isProtectedRoute,
} from "@/modules/auth/domain";
import type { UserRole } from "@/shared/types/database";

export async function updateSessionAndEnforceRbac(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Permite que o app suba mesmo antes da configuração de .env.local
  if (!url || !anonKey) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: CookieOptions;
        }[],
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (!user) {
    if (isProtectedRoute(pathname)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile?.role as UserRole | undefined) ?? "student";

  // Redireciona usuário já logado que acessa /login ou /register
  if (pathname === "/login" || pathname === "/register") {
    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = getDefaultRedirectForRole(role);
    targetUrl.search = "";
    return NextResponse.redirect(targetUrl);
  }

  // Bloqueia acesso cruzado entre áreas /student, /teacher e /admin
  if (isProtectedRoute(pathname) && !canRoleAccessPath(role, pathname)) {
    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = getDefaultRedirectForRole(role);
    targetUrl.search = "";
    return NextResponse.redirect(targetUrl);
  }

  return response;
}
