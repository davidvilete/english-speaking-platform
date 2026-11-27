import { z } from "zod";
import { isValidIanaTimeZone } from "@/modules/auth/domain";
import type {
  ClassSessionStatus,
  PlanCode,
  ProficiencyLevel,
} from "@/shared/types/database";

export const MIN_SESSION_DURATION_MINUTES = 30;
export const MAX_SESSION_DURATION_MINUTES = 50;
export const DEFAULT_SESSION_CAPACITY = 2;
export const CANCELLATION_MIN_HOURS = 12;

/**
 * Valida estritamente URLs do Google Meet (https://meet.google.com/xxx-xxxx-xxx).
 */
export function isValidGoogleMeetUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith("https://meet.google.com/")) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" || parsed.hostname !== "meet.google.com") {
      return false;
    }
    const slug = parsed.pathname.replace(/^\/+|\/+$/g, "");
    return /^[a-z0-9-]{3,64}$/i.test(slug);
  } catch {
    return false;
  }
}

export const createSlotsSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida (AAAA-MM-DD)."),
  times: z
    .array(
      z
        .string()
        .regex(/^\d{2}:\d{2}$/, "Informe horários válidos no formato HH:MM."),
    )
    .min(1, "Informe pelo menos 1 horário para abrir na agenda.")
    .max(12, "Crie no máximo 12 horários por lote."),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(MIN_SESSION_DURATION_MINUTES, "Duração mínima de 30 minutos por aula.")
    .max(
      MAX_SESSION_DURATION_MINUTES,
      "Duração máxima de 50 minutos por aula.",
    ),
  meetUrl: z
    .string()
    .trim()
    .refine(
      isValidGoogleMeetUrl,
      "Informe um link válido do Google Meet (ex.: https://meet.google.com/abc-defg-hij).",
    ),
  topicTheme: z
    .string()
    .trim()
    .max(120, "Tema muito longo (máx. 120 caracteres).")
    .optional()
    .default(""),
  timezone: z
    .string()
    .trim()
    .refine(isValidIanaTimeZone, "Fuso horário inválido."),
});

export type CreateSlotsInput = z.infer<typeof createSlotsSchema>;

export interface SessionInterval {
  startsAtUtc: string;
  durationMinutes: number;
}

/**
 * Detecta sobreposição entre um novo slot e sessões ativas existentes do mesmo professor.
 */
export function hasSessionOverlap(
  candidate: SessionInterval,
  existingSessions: readonly SessionInterval[],
): boolean {
  const candStart = new Date(candidate.startsAtUtc).getTime();
  const candEnd = candStart + candidate.durationMinutes * 60 * 1000;

  return existingSessions.some((existing) => {
    const exStart = new Date(existing.startsAtUtc).getTime();
    const exEnd = exStart + existing.durationMinutes * 60 * 1000;
    return candStart < exEnd && candEnd > exStart;
  });
}

/**
 * Regra pura de visibilidade e compatibilidade 1v2:
 * - Usa exclusivamente `proficiency_level` (NUNCA `plan_code`).
 * - Bloqueia `null` e `REDIRECTED_EXTERNAL`.
 * - Exige sessão aberta, com vaga (< capacity) e nível livre ou igual ao aluno.
 */
export function canStudentViewAndBookSlot(params: {
  studentLevel: ProficiencyLevel | null;
  slotLockedLevel: ProficiencyLevel | null;
  slotStatus: ClassSessionStatus;
  slotCapacity: number;
  activeBookingsCount: number;
}): boolean {
  if (!params.studentLevel || params.studentLevel === "REDIRECTED_EXTERNAL") {
    return false;
  }

  if (params.slotStatus !== "open") {
    return false;
  }

  if (params.activeBookingsCount >= params.slotCapacity) {
    return false;
  }

  if (
    params.slotLockedLevel !== null &&
    params.slotLockedLevel !== params.studentLevel
  ) {
    return false;
  }

  return true;
}

/**
 * Calcula interseção de temas/interesses entre dois alunos pareados em 1v2
 * para apoiar o professor na condução da aula.
 */
export function computeTopicAffinity(
  interestsA: readonly string[],
  interestsB: readonly string[],
): string[] {
  const normalizedB = new Set(
    interestsB.map((tag) => tag.trim().toLowerCase()),
  );
  return interestsA.filter((tag) => normalizedB.has(tag.trim().toLowerCase()));
}

/**
 * Regra de cancelamento: apenas >= 12 horas antes do início devolve saldo semanal.
 */
export function canCancelWithQuotaRefund(
  startsAtUtc: string,
  nowUtc: Date = new Date(),
): boolean {
  const startMs = new Date(startsAtUtc).getTime();
  const diffHours = (startMs - nowUtc.getTime()) / (1000 * 60 * 60);
  return diffHours >= CANCELLATION_MIN_HOURS;
}

/**
 * Verifica se o aluno ainda possui saldo no plano comercial ativo.
 * Regra inviolável: completamente separado de `proficiency_level`.
 */
export function hasAvailablePlanQuota(params: {
  planCode: PlanCode;
  weeklyLimit: number;
  usedInCanonicalWeek: number;
  usedInTrialTotal: number;
}): boolean {
  if (params.planCode === "trial") {
    return params.usedInTrialTotal < params.weeklyLimit;
  }
  return params.usedInCanonicalWeek < params.weeklyLimit;
}

export function mapRpcErrorToPortuguese(rawMessage: string): string {
  const knownPrefixes: [string, string][] = [
    [
      "TEACHER_SESSION_OVERLAP",
      "Já existe outro horário ativo seu neste mesmo intervalo.",
    ],
    [
      "LEVEL_MISMATCH",
      "Este horário já foi reservado por um aluno de outro nível de fala.",
    ],
    ["SESSION_FULL", "Este horário já atingiu o limite de 2 alunos."],
    ["SESSION_NOT_OPEN", "Este horário não está mais aberto para reserva."],
    ["SESSION_IN_PAST", "Não é possível reservar um horário que já começou."],
    ["ALREADY_BOOKED", "Você já possui reserva confirmada neste horário."],
    [
      "NO_ACTIVE_SUBSCRIPTION",
      "Você não possui uma assinatura ativa vigente no momento.",
    ],
    [
      "QUOTA_EXCEEDED",
      "Você atingiu o limite de aulas do seu plano neste período.",
    ],
    [
      "LATE_CANCELLATION_NOT_ALLOWED",
      "Cancelamentos com reposição só são permitidos com mínimo de 12 horas de antecedência.",
    ],
    [
      "CHECKIN_TOO_EARLY",
      "O check-in abre exatamente 10 minutos antes do início da aula.",
    ],
    [
      "CHECKIN_CLOSED",
      "A janela de check-in (até 10 minutos após o início) foi encerrada.",
    ],
    [
      "NOT_ELIGIBLE_LEVEL",
      "Sua triagem precisa ser aprovada antes de agendar aulas 1v2.",
    ],
  ];

  for (const [code, friendly] of knownPrefixes) {
    if (rawMessage.includes(code)) {
      return friendly;
    }
  }

  return "Não foi possível concluir a operação agora. Tente novamente.";
}
