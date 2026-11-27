import { buildWhatsAppDeepLink } from "@/modules/notifications/whatsapp";

export const CHECKIN_WINDOW_BEFORE_MINUTES = 10;
export const CHECKIN_WINDOW_AFTER_MINUTES = 10;

export type CheckInWindowState = "too_early" | "open" | "closed";

/**
 * Avalia a janela de check-in [starts_at - 10min, starts_at + 10min]
 * sempre usando o relógio do servidor/banco em UTC (nunca o relógio do navegador).
 */
export function getCheckInWindowState(
  startsAtUtc: string,
  serverNowUtc: Date,
): CheckInWindowState {
  const startMs = new Date(startsAtUtc).getTime();
  const nowMs = serverNowUtc.getTime();

  const openAtMs = startMs - CHECKIN_WINDOW_BEFORE_MINUTES * 60 * 1000;
  const closeAtMs = startMs + CHECKIN_WINDOW_AFTER_MINUTES * 60 * 1000;

  if (nowMs < openAtMs) {
    return "too_early";
  }
  if (nowMs > closeAtMs) {
    return "closed";
  }
  return "open";
}

/**
 * Gera deep-link `wa.me` sanitizado (1 clique) para o professor/admin enviar
 * lembrete de check-in + link do Google Meet ao aluno confirmado.
 */
export function buildCheckInReminderWhatsAppUrl(params: {
  whatsappE164: string;
  studentName: string;
  startsAtFormatted: string;
  meetUrl: string;
}): string | null {
  const firstName = params.studentName.trim().split(/\s+/)[0] ?? "aluno";
  const message = `Olá ${firstName}! Sua aula 1v2 na Output 1v2 começa em breve (${params.startsAtFormatted}). Faça seu check-in no painel e acesse a sala pelo Google Meet: ${params.meetUrl}`;
  return buildWhatsAppDeepLink(params.whatsappE164, message);
}
