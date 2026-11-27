"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/modules/auth/session";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";

export async function toggleErrorLogResolvedAction(
  logId: string,
  resolved: boolean,
): Promise<{ error?: string }> {
  await requireRole(["admin"]);

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("system_error_logs")
      .update({ resolved })
      .eq("id", logId);

    if (error) {
      return { error: "Não foi possível atualizar o status do log." };
    }

    revalidatePath("/admin/logs");
    return {};
  } catch {
    return { error: "Erro inesperado ao atualizar log." };
  }
}
