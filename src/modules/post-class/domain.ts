import { z } from "zod";
import { buildWhatsAppDeepLink } from "@/modules/notifications/whatsapp";
import type {
  PostClassDeliveryChannel,
  ProficiencyLevel,
} from "@/shared/types/database";

export const POST_CLASS_RETENTION_DAYS = 30;

export interface SanitizedAiPromptPayload {
  proficiencyLevel: Exclude<ProficiencyLevel, "REDIRECTED_EXTERNAL">;
  interestsTags: string[];
  sanitizedTeacherNotes: string;
}

/**
 * Remove potenciais PIIs (e-mails, CPFs e telefones) das notas do professor
 * antes de qualquer chamada externa à API de IA.
 * Regra inviolável: ZERO PII enviado à API de IA.
 */
export function stripPiiFromText(rawText: string): string {
  return rawText
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[REDACTED_CPF]")
    .replace(
      /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,3}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}\b/g,
      "[REDACTED_PHONE]",
    )
    .trim();
}

export function buildSanitizedAiPromptPayload(params: {
  proficiencyLevel: ProficiencyLevel | null;
  interestsTags: readonly string[];
  teacherRawNotes: string;
}): SanitizedAiPromptPayload {
  const safeLevel: Exclude<ProficiencyLevel, "REDIRECTED_EXTERNAL"> =
    params.proficiencyLevel && params.proficiencyLevel !== "REDIRECTED_EXTERNAL"
      ? params.proficiencyLevel
      : "B1_INTERMEDIATE";

  return {
    proficiencyLevel: safeLevel,
    interestsTags: params.interestsTags
      .map((tag) => stripPiiFromText(tag))
      .filter(Boolean)
      .slice(0, 6),
    sanitizedTeacherNotes: stripPiiFromText(params.teacherRawNotes),
  };
}

/**
 * Fallback manual imediato: garante que falha na API de IA nunca trave o professor.
 */
export function buildPostClassManualTemplate(teacherRawNotes: string): string {
  const cleanNotes =
    teacherRawNotes.trim() || "(Adicione aqui os pontos da aula)";
  return [
    "## 1. Feedback e Correções da Aula",
    cleanNotes,
    "",
    "## 2. Atividade de Escrita Personalizada",
    "Escreva 5 frases em inglês aplicando as expressões e estruturas revisadas hoje.",
    "",
    "## 3. Gabarito e Notas de Correção",
    "- Revise tempos verbais, preposições e ordem natural das frases.",
    "- Leia suas respostas em voz alta para fixar o output.",
  ].join("\n");
}

/**
 * Separa o conteúdo principal (Feedback + Atividade) da seção final de Gabarito/Correção
 * para exibição expansível e mobile-friendly no painel do aluno.
 */
export function splitActivityAndAnswerKey(markdown: string): {
  mainContent: string;
  answerKey: string | null;
} {
  const match = markdown.match(
    /(^|\n)(#{2,3}\s*(?:3\.\s*)?(?:Gabarito|Notas de Correção|Answer Key)[^\n]*[\s\S]*$)/i,
  );
  if (!match || match.index === undefined) {
    return { mainContent: markdown.trim(), answerKey: null };
  }

  const splitIndex = match.index + (match[1]?.length ?? 0);
  const mainContent = markdown.slice(0, splitIndex).trim();
  const answerKey = markdown.slice(splitIndex).trim();
  return { mainContent, answerKey: answerKey || null };
}

export const generateDraftSchema = z.object({
  sessionId: z.string().uuid("Sessão inválida."),
  studentId: z.string().uuid("Aluno inválido."),
  teacherRawNotes: z
    .string()
    .trim()
    .min(10, "Escreva ao menos algumas notas rápidas (mínimo 10 caracteres).")
    .max(4000, "Notas muito longas."),
});

export const savePostClassMaterialSchema = z.object({
  sessionId: z.string().uuid("Sessão inválida."),
  studentId: z.string().uuid("Aluno inválido."),
  teacherRawNotes: z.string().trim().max(4000).default(""),
  aiGeneratedDraft: z.string().max(12000).nullable().optional(),
  finalContentMarkdown: z
    .string()
    .trim()
    .min(10, "O material final precisa ter pelo menos 10 caracteres.")
    .max(12000, "O material final excede o limite permitido."),
  status: z.enum(["draft", "published"]),
});

export function buildPostClassDeliveryWhatsAppUrl(params: {
  whatsappE164: string;
  studentName: string;
  deliveryChannel: PostClassDeliveryChannel;
  contentMarkdown: string;
  appUrl: string;
}): string | null {
  const firstName = params.studentName.trim().split(/\s+/)[0] ?? "aluno";
  const activitiesLink = `${params.appUrl.replace(/\/+$/, "")}/student/activities`;

  if (params.deliveryChannel === "whatsapp") {
    const snippet =
      params.contentMarkdown.length > 900
        ? `${params.contentMarkdown.slice(0, 900).trim()}...\n\nVeja completo (com gabarito) na plataforma: ${activitiesLink}`
        : `${params.contentMarkdown.trim()}\n\n(Também disponível na plataforma por 30 dias: ${activitiesLink})`;

    return buildWhatsAppDeepLink(
      params.whatsappE164,
      `Olá ${firstName}! Aqui está seu feedback e atividade personalizada da aula de hoje na Output 1v2:\n\n${snippet}`,
    );
  }

  return buildWhatsAppDeepLink(
    params.whatsappE164,
    `Olá ${firstName}! Seu feedback e atividade personalizada pós-aula já estão disponíveis na plataforma Output 1v2 (por 30 dias): ${activitiesLink}`,
  );
}
