"use server";

import { revalidatePath } from "next/cache";
import { logSystemError } from "@/modules/audit/logger";
import { requireRole } from "@/modules/auth/session";
import { getEmailSender } from "@/modules/notifications/email-sender";
import { getAIActivityGenerator } from "@/modules/post-class/ai-generator";
import {
  buildPostClassDeliveryWhatsAppUrl,
  buildPostClassManualTemplate,
  buildSanitizedAiPromptPayload,
  generateDraftSchema,
  POST_CLASS_RETENTION_DAYS,
  savePostClassMaterialSchema,
} from "@/modules/post-class/domain";
import { calculateRetentionExpiryUtcIso } from "@/modules/screening/domain";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";
import type {
  PostClassDeliveryChannel,
  ProficiencyLevel,
} from "@/shared/types/database";

export interface GenerateDraftActionResult {
  draftMarkdown?: string;
  usedFallback?: boolean;
  warning?: string;
  error?: string;
}

/**
 * Gera rascunho de atividade pós-aula via IA (zero PII) com fallback manual imediato.
 */
export async function generatePostClassDraftAction(input: {
  sessionId: string;
  studentId: string;
  teacherRawNotes: string;
}): Promise<GenerateDraftActionResult> {
  await requireRole(["teacher", "admin"]);

  const parsed = generateDraftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Informe as notas da aula antes de gerar com IA.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: student } = await supabase
      .from("profiles")
      .select("proficiency_level, interests_tags")
      .eq("id", parsed.data.studentId)
      .maybeSingle();

    const sanitizedPayload = buildSanitizedAiPromptPayload({
      proficiencyLevel:
        (student?.proficiency_level as ProficiencyLevel | null) ?? null,
      interestsTags: (student?.interests_tags as string[] | undefined) ?? [],
      teacherRawNotes: parsed.data.teacherRawNotes,
    });

    const generator = getAIActivityGenerator();
    const result = await generator.generate(sanitizedPayload);

    if (!result.ok || !result.draftMarkdown) {
      if (result.provider === "gemini") {
        await logSystemError({
          severity: "error",
          module: "post-class",
          message: "Falha ao gerar rascunho pós-aula via Gemini API.",
          context: {
            sessionId: parsed.data.sessionId,
            error: result.error,
          },
        });
      }

      return {
        draftMarkdown: buildPostClassManualTemplate(
          parsed.data.teacherRawNotes,
        ),
        usedFallback: true,
        warning:
          result.error ??
          "IA indisponível no momento. Modelo manual carregado para você continuar sem bloqueios.",
      };
    }

    return {
      draftMarkdown: result.draftMarkdown,
      usedFallback: false,
    };
  } catch (err) {
    await logSystemError({
      severity: "error",
      module: "post-class",
      message: "Exceção inesperada ao gerar rascunho com IA.",
      context: { error: err instanceof Error ? err.message : String(err) },
    });
    return {
      draftMarkdown: buildPostClassManualTemplate(parsed.data.teacherRawNotes),
      usedFallback: true,
      warning:
        "Erro inesperado ao contatar a IA. Modelo manual carregado para você editar e publicar.",
    };
  }
}

export interface SaveMaterialActionResult {
  error?: string;
  success?: string;
  whatsappUrl?: string | null;
}

/**
 * Salva rascunho ou publica o material pós-aula (expira em +30 dias UTC).
 * Ao publicar: envia e-mail automático (não bloqueante) e gera botão wa.me 1-clique
 * adaptado ao canal escolhido pelo aluno na triagem (`platform` ou `whatsapp`).
 */
export async function savePostClassMaterialAction(input: {
  sessionId: string;
  studentId: string;
  teacherRawNotes: string;
  aiGeneratedDraft?: string | null;
  finalContentMarkdown: string;
  status: "draft" | "published";
}): Promise<SaveMaterialActionResult> {
  await requireRole(["teacher", "admin"]);

  const parsed = savePostClassMaterialSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Verifique o conteúdo do material antes de salvar.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const nowUtc = new Date();
    const expiresAtUtc = calculateRetentionExpiryUtcIso(
      nowUtc,
      POST_CLASS_RETENTION_DAYS,
    );

    const { error: upsertError } = await supabase
      .from("post_class_materials")
      .upsert(
        {
          session_id: parsed.data.sessionId,
          student_id: parsed.data.studentId,
          teacher_raw_notes: parsed.data.teacherRawNotes,
          ai_generated_draft: parsed.data.aiGeneratedDraft ?? null,
          final_content_markdown: parsed.data.finalContentMarkdown,
          status: parsed.data.status,
          published_at:
            parsed.data.status === "published" ? nowUtc.toISOString() : null,
          expires_at: expiresAtUtc,
        },
        { onConflict: "session_id,student_id" },
      );

    if (upsertError) {
      await logSystemError({
        severity: "critical",
        module: "post-class",
        message: "Falha ao salvar material pós-aula no banco.",
        context: {
          sessionId: parsed.data.sessionId,
          studentId: parsed.data.studentId,
          dbError: upsertError.message,
        },
      });
      return { error: "Não foi possível salvar o material pós-aula." };
    }

    let whatsappUrl: string | null = null;

    if (parsed.data.status === "published") {
      const admin = createSupabaseAdminClient();
      const [{ data: studentProfile }, { data: authUser }] = await Promise.all([
        admin
          .from("profiles")
          .select("full_name, whatsapp_e164, post_class_delivery_channel")
          .eq("id", parsed.data.studentId)
          .maybeSingle(),
        admin.auth.admin.getUserById(parsed.data.studentId),
      ]);

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

      if (studentProfile) {
        const deliveryChannel =
          (studentProfile.post_class_delivery_channel as PostClassDeliveryChannel) ??
          "platform";

        whatsappUrl = buildPostClassDeliveryWhatsAppUrl({
          whatsappE164: studentProfile.whatsapp_e164,
          studentName: studentProfile.full_name,
          deliveryChannel,
          contentMarkdown: parsed.data.finalContentMarkdown,
          appUrl,
        });
      }

      const studentEmail = authUser.user?.email;
      if (studentEmail && studentProfile) {
        const emailSender = getEmailSender();
        const emailResult = await emailSender.send({
          to: studentEmail,
          subject: "Output 1v2 — Sua atividade pós-aula está disponível!",
          text: `Olá ${studentProfile.full_name}!\n\nSeu professor publicou as correções e a atividade personalizada da sua aula.\nAcesse na plataforma (disponível por 30 dias): ${appUrl.replace(/\/+$/, "")}/student/activities`,
        });

        if (!emailResult.sent && emailResult.error) {
          await logSystemError({
            severity: "error",
            module: "notifications",
            message:
              "Falha ao enviar e-mail de liberação de material pós-aula.",
            context: {
              studentId: parsed.data.studentId,
              error: emailResult.error,
            },
          });
        }
      }
    }

    revalidatePath("/teacher/post-class");
    revalidatePath("/student");
    revalidatePath("/student/activities");

    return {
      success:
        parsed.data.status === "published"
          ? "Material pós-aula publicado com sucesso!"
          : "Rascunho salvo com sucesso.",
      whatsappUrl,
    };
  } catch (err) {
    await logSystemError({
      severity: "critical",
      module: "post-class",
      message: "Exceção inesperada ao salvar material pós-aula.",
      context: { error: err instanceof Error ? err.message : String(err) },
    });
    return { error: "Erro inesperado ao salvar material pós-aula." };
  }
}
