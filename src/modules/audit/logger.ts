import { shouldSendCriticalAlert } from "@/modules/audit/domain";
import { getEmailSender } from "@/modules/notifications/email-sender";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";
import type { ErrorSeverity } from "@/shared/types/database";

export interface SystemErrorPayload {
  severity: ErrorSeverity;
  module: string;
  message: string;
  context?: Record<string, unknown>;
}

const recentCriticalAlerts = new Map<string, number>();

/**
 * Grava erros estruturados em `system_error_logs`, emite JSON nos logs da Vercel
 * e dispara alerta por e-mail ao Admin em falhas críticas (com anti-flood de 15 min).
 * Nunca lança exceção secundária para não mascarar o fluxo principal.
 */
export async function logSystemError(
  payload: SystemErrorPayload,
): Promise<void> {
  const timestampUtc = new Date().toISOString();
  const entry = {
    timestampUtc,
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

  if (payload.severity === "critical") {
    const adminEmail = process.env.ADMIN_ALERT_EMAIL;
    const alertKey = `${payload.module}:${payload.message}`;

    if (adminEmail && shouldSendCriticalAlert(alertKey, recentCriticalAlerts)) {
      try {
        const emailSender = getEmailSender();
        await emailSender.send({
          to: adminEmail,
          subject: `[CRÍTICO] Output 1v2 — Erro no módulo ${payload.module}`,
          text: [
            `Alerta crítico detectado em ${timestampUtc} (UTC).`,
            `Módulo: ${payload.module}`,
            `Mensagem: ${payload.message}`,
            `Contexto: ${JSON.stringify(payload.context ?? {}, null, 2)}`,
          ].join("\n\n"),
        });
      } catch {
        // Nunca propaga erro de envio de alerta.
      }
    }
  }
}
