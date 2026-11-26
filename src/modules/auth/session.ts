import { redirect } from "next/navigation";
import { getDefaultRedirectForRole } from "@/modules/auth/domain";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";
import type { ProfileRow, UserRole } from "@/shared/types/database";

export interface AuthenticatedContext {
  userId: string;
  email: string;
  profile: ProfileRow;
}

export async function getCurrentSessionProfile(): Promise<AuthenticatedContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    profile: profile as ProfileRow,
  };
}

/**
 * Defesa em profundidade (além do middleware e RLS):
 * garante que o Server Component ou Server Action só execute para papéis autorizados.
 */
export async function requireRole(
  allowedRoles: readonly UserRole[],
): Promise<AuthenticatedContext> {
  const session = await getCurrentSessionProfile();

  if (!session) {
    redirect("/login");
  }

  if (!allowedRoles.includes(session.profile.role)) {
    redirect(getDefaultRedirectForRole(session.profile.role));
  }

  return session;
}
