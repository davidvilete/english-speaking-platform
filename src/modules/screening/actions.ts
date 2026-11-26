"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { logSystemError } from "@/modules/audit/logger";
import { requireRole } from "@/modules/auth/session";
import { getEmailSender } from "@/modules/notifications/email-sender";
import {
  buildScreeningOutcomeMessage,
  buildScreeningOutcomeWhatsAppUrl,
  buildScreeningStoragePath,
  buildTrialSubscriptionWindowUtc,
  calculateRetentionExpiryUtcIso,
  reviewScreeningSchema,
  SCREENING_BUCKET_NAME,
  SCREENING_SIGNED_URL_TTL_SECONDS,
  screeningInterestsSchema,
  validateAudioFileMeta,
} from "@/modules/screening/domain";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";
import type { ApprovedProficiencyLevel } from "@/shared/types/database";

export interface ScreeningSubmitState {
  error?: string;
  success?: string;
}

export async function submitScreeningAction(
  _prevState: ScreeningSubmitState,
  formData: FormData,
): Promise<ScreeningSubmitState> {
  const session = await requireRole(["student"]);

  const rawInterests = formData.getAll("interests").map((item) => String(item));
  const parsedInterests = screeningInterestsSchema.safeParse(rawInterests);
  if (!parsedInterests.success) {
    return {
      error:
        parsedInterests.error.issues[0]?.message ??
        "Selecione pelo menos um interesse.",
    };
  }

  const audioFile = formData.get("audio");
  if (!(audioFile instanceof File)) {
    return {
      error: "Grave ou selecione um arquivo de áudio em inglês para enviar.",
    };
  }

  const audioValidation = validateAudioFileMeta(audioFile.type, audioFile.size);
  if (
    !audioValidation.valid ||
    !audioValidation.normalizedMime ||
    !audioValidation.extension
  ) {
    return { error: audioValidation.error ?? "Áudio inválido." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const token = `${Date.now()}-${crypto.randomUUID()}`;
    const storagePath = buildScreeningStoragePath(
      session.userId,
      token,
      audioValidation.extension,
    );

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(SCREENING_BUCKET_NAME)
      .upload(storagePath, audioBuffer, {
        contentType: audioValidation.normalizedMime,
        upsert: false,
      });

    if (uploadError) {
      await logSystemError({
        severity: "error",
        module: "screening",
        message: "Falha no upload do áudio de triagem para bucket privado.",
        context: { userId: session.userId, dbError: uploadError.message },
      });
      return {
        error:
          "Não foi possível enviar o áudio agora. Tente novamente em instantes.",
      };
    }

    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({ interests_tags: parsedInterests.data })
      .eq("id", session.userId);

    if (profileUpdateError) {
      await logSystemError({
        severity: "error",
        module: "screening",
        message: "Falha ao atualizar interesses do aluno na triagem.",
        context: {
          userId: session.userId,
          dbError: profileUpdateError.message,
        },
      });
      return { error: "Erro ao salvar seus interesses. Tente novamente." };
    }

    const expiresAtUtc = calculateRetentionExpiryUtcIso();
    const { error: insertError } = await supabase
      .from("screening_submissions")
      .insert({
        student_id: session.userId,
        audio_storage_path: storagePath,
        status: "pending",
        expires_at: expiresAtUtc,
      });

    if (insertError) {
      await logSystemError({
        severity: "critical",
        module: "screening",
        message: "Falha ao registrar submissão de triagem no banco.",
        context: { userId: session.userId, dbError: insertError.message },
      });
      return {
        error: "Erro ao registrar sua triagem. Tente novamente.",
      };
    }

    revalidatePath("/student");
    return {
      success:
        "Triagem enviada com sucesso! O professor ouvirá seu áudio em breve.",
    };
  } catch (err) {
    await logSystemError({
      severity: "critical",
      module: "screening",
      message: "Exceção inesperada no envio de triagem.",
      context: {
        userId: session.userId,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return { error: "Erro inesperado ao enviar triagem." };
  }
}

export interface SignedUrlResult {
  signedUrl?: string;
  expiresInSeconds?: number;
  error?: string;
}

/**
 * Gera Signed URL temporária (5 min) no servidor para ouvir áudio privado de triagem.
 */
export async function getScreeningSignedAudioUrlAction(
  submissionId: string,
): Promise<SignedUrlResult> {
  const session = await requireRole(["student", "teacher", "admin"]);

  try {
    const supabase = await createSupabaseServerClient();
    const { data: submission, error } = await supabase
      .from("screening_submissions")
      .select("id, student_id, audio_storage_path")
      .eq("id", submissionId)
      .maybeSingle();

    if (error || !submission) {
      return { error: "Triagem não encontrada ou sem permissão." };
    }

    if (
      session.profile.role === "student" &&
      submission.student_id !== session.userId
    ) {
      return { error: "Acesso negado a este áudio." };
    }

    const admin = createSupabaseAdminClient();
    const { data: signedData, error: signError } = await admin.storage
      .from(SCREENING_BUCKET_NAME)
      .createSignedUrl(
        submission.audio_storage_path,
        SCREENING_SIGNED_URL_TTL_SECONDS,
      );

    if (signError || !signedData?.signedUrl) {
      await logSystemError({
        severity: "error",
        module: "screening",
        message: "Falha ao gerar Signed URL de áudio privado.",
        context: { submissionId, dbError: signError?.message },
      });
      return { error: "Não foi possível gerar o link temporário do áudio." };
    }

    return {
      signedUrl: signedData.signedUrl,
      expiresInSeconds: SCREENING_SIGNED_URL_TTL_SECONDS,
    };
  } catch (err) {
    await logSystemError({
      severity: "error",
      module: "screening",
      message: "Exceção ao gerar Signed URL de áudio.",
      context: {
        submissionId,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return { error: "Erro interno ao acessar áudio privado." };
  }
}

export interface ReviewScreeningActionState {
  error?: string;
  success?: string;
  whatsappUrl?: string | null;
}

/**
 * Avalia triagem: define proficiency_level separadamente do plano comercial,
 * libera plano `trial` (2 aulas teste) se aprovado, envia e-mail e gera link `wa.me`.
 */
export async function reviewScreeningAction(
  _prevState: ReviewScreeningActionState,
  formData: FormData,
): Promise<ReviewScreeningActionState> {
  const session = await requireRole(["teacher", "admin"]);

  const decision = String(formData.get("decision") ?? "");
  const payload =
    decision === "approved"
      ? {
          submissionId: formData.get("submissionId"),
          decision: "approved" as const,
          proficiencyLevel: formData.get("proficiencyLevel"),
          teacherNotes: formData.get("teacherNotes") ?? "",
        }
      : {
          submissionId: formData.get("submissionId"),
          decision: "redirected" as const,
          teacherNotes: formData.get("teacherNotes") ?? "",
        };

  const parsed = reviewScreeningSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Dados inválidos para avaliação da triagem.",
    };
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: submission, error: fetchError } = await admin
      .from("screening_submissions")
      .select("id, student_id")
      .eq("id", parsed.data.submissionId)
      .maybeSingle();

    if (fetchError || !submission) {
      return { error: "Submissão de triagem não encontrada." };
    }

    const { data: studentProfile, error: studentError } = await admin
      .from("profiles")
      .select("id, full_name, whatsapp_e164")
      .eq("id", submission.student_id)
      .maybeSingle();

    if (studentError || !studentProfile) {
      return { error: "Perfil do aluno não encontrado." };
    }

    const reviewedAtUtc = new Date().toISOString();
    const targetLevel =
      parsed.data.decision === "approved"
        ? parsed.data.proficiencyLevel
        : "REDIRECTED_EXTERNAL";

    const { error: updateSubError } = await admin
      .from("screening_submissions")
      .update({
        status: parsed.data.decision,
        teacher_notes: parsed.data.teacherNotes || null,
        reviewed_by: session.userId,
        reviewed_at: reviewedAtUtc,
      })
      .eq("id", submission.id);

    if (updateSubError) {
      await logSystemError({
        severity: "critical",
        module: "screening",
        message: "Falha ao atualizar status da triagem.",
        context: {
          submissionId: submission.id,
          dbError: updateSubError.message,
        },
      });
      return { error: "Erro ao salvar avaliação da triagem." };
    }

    const { error: updateProfileError } = await admin
      .from("profiles")
      .update({ proficiency_level: targetLevel })
      .eq("id", studentProfile.id);

    if (updateProfileError) {
      await logSystemError({
        severity: "critical",
        module: "screening",
        message: "Falha ao salvar proficiency_level do aluno.",
        context: {
          studentId: studentProfile.id,
          dbError: updateProfileError.message,
        },
      });
      return { error: "Erro ao atualizar nível de fala do aluno." };
    }

    // Separação estrita: plano comercial `trial` é criado na tabela subscriptions,
    // nunca misturado com `proficiency_level`.
    if (parsed.data.decision === "approved") {
      const { data: existingSub } = await admin
        .from("subscriptions")
        .select("id")
        .eq("student_id", studentProfile.id)
        .in("status", ["active", "cancel_at_period_end"])
        .maybeSingle();

      if (!existingSub) {
        const trialWindow = buildTrialSubscriptionWindowUtc();
        const { error: subError } = await admin.from("subscriptions").insert({
          student_id: studentProfile.id,
          plan_code: trialWindow.planCode,
          status: "active",
          weekly_limit: trialWindow.weeklyLimit,
          current_period_start: trialWindow.currentPeriodStartUtc,
          current_period_end: trialWindow.currentPeriodEndUtc,
          payment_source: "manual_pix",
        });

        if (subError) {
          await logSystemError({
            severity: "critical",
            module: "billing",
            message: "Falha ao liberar assinatura trial após aprovação.",
            context: {
              studentId: studentProfile.id,
              dbError: subError.message,
            },
          });
        }
      }
    }

    // E-mail automático ao aluno (contingência: falha de e-mail não bloqueia a avaliação)
    const { data: authUserData } = await admin.auth.admin.getUserById(
      studentProfile.id,
    );
    const studentEmail = authUserData.user?.email;

    const approvedLevel: ApprovedProficiencyLevel | undefined =
      parsed.data.decision === "approved"
        ? parsed.data.proficiencyLevel
        : undefined;

    if (studentEmail) {
      const emailSender = getEmailSender();
      const outcomeText = buildScreeningOutcomeMessage({
        studentName: studentProfile.full_name,
        decision: parsed.data.decision,
        proficiencyLevel: approvedLevel,
      });

      const emailResult = await emailSender.send({
        to: studentEmail,
        subject:
          parsed.data.decision === "approved"
            ? "Output 1v2 — Sua triagem foi aprovada!"
            : "Output 1v2 — Retorno da sua triagem de inglês",
        text: parsed.data.teacherNotes
          ? `${outcomeText}\n\nObservação do professor:\n${parsed.data.teacherNotes}`
          : outcomeText,
      });

      if (!emailResult.sent && emailResult.error) {
        await logSystemError({
          severity: "error",
          module: "notifications",
          message: "Falha ao enviar e-mail de resultado de triagem.",
          context: { studentId: studentProfile.id, error: emailResult.error },
        });
      }
    }

    const whatsappUrl = buildScreeningOutcomeWhatsAppUrl({
      whatsappE164: studentProfile.whatsapp_e164,
      studentName: studentProfile.full_name,
      decision: parsed.data.decision,
      proficiencyLevel: approvedLevel,
    });

    revalidatePath("/teacher");
    revalidatePath("/teacher/screening");
    revalidatePath("/student");

    return {
      success:
        parsed.data.decision === "approved"
          ? "Aluno aprovado! Nível definido e plano Trial (2 aulas teste) liberado."
          : "Candidato redirecionado com orientação de cursos de base.",
      whatsappUrl,
    };
  } catch (err) {
    await logSystemError({
      severity: "critical",
      module: "screening",
      message: "Exceção inesperada na revisão de triagem.",
      context: { error: err instanceof Error ? err.message : String(err) },
    });
    return { error: "Erro inesperado ao salvar avaliação." };
  }
}
