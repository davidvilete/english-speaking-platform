import { redirect } from "next/navigation";
import { getDefaultRedirectForRole } from "@/modules/auth/domain";
import { getCurrentSessionProfile } from "@/modules/auth/session";

export const dynamic = "force-dynamic";

/**
 * Portal fechado de membros: sem conteúdo público na raiz.
 * Usuários autenticados vão para sua área; visitantes caem direto em /login.
 */
export default async function HomePage() {
  try {
    const session = await getCurrentSessionProfile();
    if (session) {
      redirect(getDefaultRedirectForRole(session.profile.role));
    }
  } catch {
    // Fallback seguro caso variáveis de ambiente não estejam presentes.
  }

  redirect("/login");
}
