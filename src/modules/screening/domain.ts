import { z } from "zod";
import { buildWhatsAppDeepLink } from "@/modules/notifications/whatsapp";
import type {
  ApprovedProficiencyLevel,
  ProficiencyLevel,
} from "@/shared/types/database";

export const SCREENING_BUCKET_NAME = "screening-audios";
export const SCREENING_MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB
export const SCREENING_SIGNED_URL_TTL_SECONDS = 300; // 5 minutos
export const SCREENING_RETENTION_DAYS = 30;
export const TRIAL_WEEKLY_LIMIT = 2; // 2 aulas teste no piloto

export const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
] as const;

export type AllowedAudioMimeType = (typeof ALLOWED_AUDIO_MIME_TYPES)[number];

const MIME_TO_EXTENSION: Record<AllowedAudioMimeType, string> = {
  "audio/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
};

export const INTEREST_OPTIONS = [
  "Séries e filmes",
  "Tecnologia e IA",
  "Viagens",
  "Carreira e negócios",
  "Música e podcasts",
  "Games",
  "Esportes e saúde",
  "Livros e cultura",
  "Gastronomia",
  "Finanças pessoais",
  "Atualidades",
] as const;

export const PROFICIENCY_LEVEL_META: Record<
  ProficiencyLevel,
  { label: string; description: string }
> = {
  A2_BASE: {
    label: "A2 — Base Comunicativa",
    description:
      "Consegue sustentar frases simples e responder perguntas cotidianas com apoio pontual.",
  },
  B1_INTERMEDIATE: {
    label: "B1 — Intermediário",
    description:
      "Mantém conversas sobre temas familiares, expressa opiniões e precisa destravar fluidez.",
  },
  B2_UPPER: {
    label: "B2 — Intermediário Avançado",
    description:
      "Debate temas variados com boa autonomia e busca refinar naturalidade e vocabulário.",
  },
  REDIRECTED_EXTERNAL: {
    label: "Sem base mínima (Redirecionado)",
    description:
      "Ainda precisa construir base das 4 habilidades antes de ingressar na dinâmica 1v2.",
  },
};

export const EXTERNAL_FOUNDATION_COURSES = [
  {
    name: "Curso de Inglês Mairo Vergara",
    reason:
      "Forte em aquisição de vocabulário, listening e construção de base estruturada.",
  },
  {
    name: "Fluency Academy",
    reason:
      "Trilhas guiadas para desenvolver as 4 habilidades (ouvir, ler, falar e escrever) do zero.",
  },
] as const;

/**
 * Remove parâmetros extras de codecs (ex.: "audio/webm;codecs=opus" -> "audio/webm").
 */
export function normalizeAudioMimeType(rawMime: string): string {
  const base = rawMime.split(";")[0]?.trim().toLowerCase() ?? "";
  return base;
}

export interface AudioValidationResult {
  valid: boolean;
  normalizedMime?: AllowedAudioMimeType;
  extension?: string;
  error?: string;
}

export function validateAudioFileMeta(
  mimeType: string,
  sizeBytes: number,
): AudioValidationResult {
  if (sizeBytes <= 0) {
    return {
      valid: false,
      error:
        "O arquivo de áudio está vazio. Grave ou selecione um áudio válido.",
    };
  }

  if (sizeBytes > SCREENING_MAX_AUDIO_BYTES) {
    return {
      valid: false,
      error: "O áudio excede o limite máximo de 5 MB.",
    };
  }

  const normalized = normalizeAudioMimeType(mimeType);
  if (!(ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(normalized)) {
    return {
      valid: false,
      error: "Formato de áudio não suportado. Use webm, mp3, m4a ou ogg.",
    };
  }

  const allowedMime = normalized as AllowedAudioMimeType;
  return {
    valid: true,
    normalizedMime: allowedMime,
    extension: MIME_TO_EXTENSION[allowedMime],
  };
}

/**
 * Caminho no bucket privado sempre prefixado pelo ID do aluno para alinhamento com RLS do Storage.
 */
export function buildScreeningStoragePath(
  studentId: string,
  uniqueToken: string,
  extension: string,
): string {
  const safeExt = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "webm";
  return `${studentId}/${uniqueToken}.${safeExt}`;
}

/**
 * Calcula data de expiração em UTC (+30 dias por padrão, conforme retenção LGPD).
 */
export function calculateRetentionExpiryUtcIso(
  fromDate: Date = new Date(),
  days: number = SCREENING_RETENTION_DAYS,
): string {
  const expiresAt = new Date(fromDate.getTime() + days * 24 * 60 * 60 * 1000);
  return expiresAt.toISOString();
}

/**
 * Janela padrão do plano comercial `trial` (separado do nível de fala).
 */
export function buildTrialSubscriptionWindowUtc(fromDate: Date = new Date()): {
  planCode: "trial";
  weeklyLimit: number;
  currentPeriodStartUtc: string;
  currentPeriodEndUtc: string;
} {
  return {
    planCode: "trial",
    weeklyLimit: TRIAL_WEEKLY_LIMIT,
    currentPeriodStartUtc: fromDate.toISOString(),
    currentPeriodEndUtc: calculateRetentionExpiryUtcIso(fromDate, 30),
  };
}

export const screeningInterestsSchema = z
  .array(z.string().trim().min(2).max(50))
  .min(1, "Selecione pelo menos 1 interesse real para personalizar suas aulas.")
  .max(6, "Selecione no máximo 6 interesses.");

export const reviewScreeningSchema = z.discriminatedUnion("decision", [
  z.object({
    submissionId: z.string().uuid("ID de triagem inválido."),
    decision: z.literal("approved"),
    proficiencyLevel: z.enum(["A2_BASE", "B1_INTERMEDIATE", "B2_UPPER"]),
    teacherNotes: z
      .string()
      .trim()
      .max(1000, "Observações muito longas.")
      .optional()
      .default(""),
  }),
  z.object({
    submissionId: z.string().uuid("ID de triagem inválido."),
    decision: z.literal("redirected"),
    teacherNotes: z
      .string()
      .trim()
      .min(
        10,
        "Escreva uma orientação cordial breve (mínimo 10 caracteres) para o candidato.",
      )
      .max(1000, "Observações muito longas."),
  }),
]);

export type ReviewScreeningInput = z.infer<typeof reviewScreeningSchema>;

export function buildScreeningOutcomeMessage(params: {
  studentName: string;
  decision: "approved" | "redirected";
  proficiencyLevel?: ApprovedProficiencyLevel;
}): string {
  const firstName = params.studentName.trim().split(/\s+/)[0] ?? "aluno";

  if (params.decision === "approved" && params.proficiencyLevel) {
    const levelLabel = PROFICIENCY_LEVEL_META[params.proficiencyLevel].label;
    return `Olá ${firstName}! Sua triagem na plataforma Output 1v2 foi aprovada no nível ${levelLabel}. Seu plano piloto gratuito (2 aulas teste) já está liberado no seu painel!`;
  }

  return `Olá ${firstName}! Obrigado por enviar seu áudio na Output 1v2. Como nossa dinâmica 1v2 exige base mínima para diálogo, recomendamos desenvolver primeiro as 4 habilidades em cursos de base (como Mairo Vergara ou Fluency Academy) e voltar quando estiver pronto. Confira os detalhes no seu painel!`;
}

export function buildScreeningOutcomeWhatsAppUrl(params: {
  whatsappE164: string;
  studentName: string;
  decision: "approved" | "redirected";
  proficiencyLevel?: ApprovedProficiencyLevel;
}): string | null {
  const message = buildScreeningOutcomeMessage({
    studentName: params.studentName,
    decision: params.decision,
    proficiencyLevel: params.proficiencyLevel,
  });
  return buildWhatsAppDeepLink(params.whatsappE164, message);
}
