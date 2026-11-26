import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";
import type { ErrorSeverity } from "@/shared/types/database";

export interface SystemErrorPayload {
  severity: ErrorSeverity;
  module: string;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Grava erros estruturados em `system_error_logs` e emite JSON nos logs da Vercel.
 * Nunca lança exceção secundária para não mascarar o fluxo principal.
 */
export async function logSystemError(
  payload: SystemErrorPayload,
): Promise<void> {
  const entry = {
    timestampUtc: new Date().toISOString(),
    severity: payload.severity,
    module: payload.module,
    message: payload.message,
    context: payload.context ?? {},
  };

  console.error(JSON.stringify(entry));

  try {
    const admin = createSupabaseAdminClient();
    await admin.from("system_error_logs").insert({
      severity: payload.severity,
      module: payload.module,
      message: payload.message,
      context_json: payload.context ?? {},
    });
  } catch {
    // Evita falha em cascata caso o banco esteja indisponível ou não configurado.
  }
}
