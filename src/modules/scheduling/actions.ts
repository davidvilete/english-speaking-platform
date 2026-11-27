"use server";

import { revalidatePath } from "next/cache";
import { logSystemError } from "@/modules/audit/logger";
import { requireRole } from "@/modules/auth/session";
import { getEmailSender } from "@/modules/notifications/email-sender";
import {
  createSlotsSchema,
  DEFAULT_SESSION_CAPACITY,
  hasSessionOverlap,
  mapRpcErrorToPortuguese,
  type SessionInterval,
} from "@/modules/scheduling/domain";
import {
  formatDateTimeInTimeZone,
  localDateTimeToUtcIso,
} from "@/shared/lib/date";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export interface ScheduleActionState {
  error?: string;
  success?: string;
}

/**
 * Cria 1 ou múltiplos slots de disponibilidade do professor (em UTC no banco),
 * validando link Google Meet e impedindo sobreposição de horários.
 */
export async function createAvailabilitySlotsAction(
  _prevState: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const session = await requireRole(["teacher", "admin"]);

  const rawTimesText = String(formData.get("times") ?? "");
  const times = Array.from(
    new Set(
      rawTimesText
        .split(/[\s,;]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  );

  const parsed = createSlotsSchema.safeParse({
    date: formData.get("date"),
    times,
    durationMinutes: formData.get("durationMinutes"),
    meetUrl: formData.get("meetUrl"),
    topicTheme: formData.get("topicTheme") ?? "",
    timezone: formData.get("timezone") ?? session.profile.timezone,
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Verifique os campos para abrir os horários.",
    };
  }

  const nowMs = Date.now();
  const candidates: SessionInterval[] = [];

  for (const timeStr of parsed.data.times) {
    const utcIso = localDateTimeToUtcIso(
      parsed.data.date,
      timeStr,
      parsed.data.timezone,
    );
    if (!utcIso) {
      return { error: `Horário inválido: ${timeStr}.` };
    }
    if (new Date(utcIso).getTime() <= nowMs) {
      return {
        error: `O horário ${timeStr} precisa estar no futuro.`,
      };
    }

    const candidate: SessionInterval = {
      startsAtUtc: utcIso,
      durationMinutes: parsed.data.durationMinutes,
    };

    if (hasSessionOverlap(candidate, candidates)) {
      return {
        error: `Os horários informados no lote se sobrepõem (conflito em ${timeStr}).`,
      };
    }

    candidates.push(candidate);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const rowsToInsert = candidates.map((c) => ({
      teacher_id: session.userId,
      starts_at_utc: c.startsAtUtc,
      duration_minutes: c.durationMinutes,
      capacity: DEFAULT_SESSION_CAPACITY,
      topic_theme: parsed.data.topicTheme || null,
      meet_url: parsed.data.meetUrl,
      status: "open" as const,
    }));

    const { error } = await supabase
      .from("class_sessions")
      .insert(rowsToInsert);

    if (error) {
      if (error.message.includes("TEACHER_SESSION_OVERLAP")) {
        return { error: mapRpcErrorToPortuguese(error.message) };
      }
      await logSystemError({
        severity: "error",
        module: "scheduling",
        message: "Falha ao criar slots de disponibilidade do professor.",
        context: { teacherId: session.userId, dbError: error.message },
      });
      return { error: "Não foi possível salvar os horários agora." };
    }

    revalidatePath("/teacher");
    revalidatePath("/teacher/schedule");
    revalidatePath("/student/schedule");

    return {
      success:
        rowsToInsert.length === 1
          ? "Horário aberto com sucesso na sua agenda!"
          : `${rowsToInsert.length} horários abertos com sucesso na sua agenda!`,
    };
  } catch (err) {
    await logSystemError({
      severity: "critical",
      module: "scheduling",
      message: "Exceção inesperada ao criar slots de disponibilidade.",
      context: {
        teacherId: session.userId,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return { error: "Erro inesperado ao abrir horários." };
  }
}

export async function cancelTeacherSessionAction(
  sessionId: string,
): Promise<ScheduleActionState> {
  const session = await requireRole(["teacher", "admin"]);

  try {
    const supabase = await createSupabaseServerClient();
    const { count: activeCount } = await supabase
      .from("bookings")
      .select("id", { head: true, count: "exact" })
      .eq("session_id", sessionId)
      .in("status", ["confirmed", "checked_in", "attended"]);

    if ((activeCount ?? 0) > 0 && session.profile.role !== "admin") {
      return {
        error:
          "Não é possível cancelar um horário que já possui aluno confirmado.",
      };
    }

    const query = supabase
      .from("class_sessions")
      .update({ status: "canceled" })
      .eq("id", sessionId);

    const { error } =
      session.profile.role === "admin"
        ? await query
        : await query.eq("teacher_id", session.userId);

    if (error) {
      return { error: "Não foi possível cancelar este horário." };
    }

    revalidatePath("/teacher/schedule");
    revalidatePath("/student/schedule");
    return { success: "Horário cancelado." };
  } catch {
    return { error: "Erro inesperado ao cancelar horário." };
  }
}

/**
 * Reserva atômica 1v2 via RPC PostgreSQL `book_session_atomic` (`SELECT ... FOR UPDATE`).
 */
export async function bookSessionAction(
  sessionId: string,
): Promise<ScheduleActionState> {
  const session = await requireRole(["student"]);

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("book_session_atomic", {
      p_session_id: sessionId,
    });

    if (error) {
      if (
        !error.message.includes("QUOTA_EXCEEDED") &&
        !error.message.includes("SESSION_FULL") &&
        !error.message.includes("LEVEL_MISMATCH") &&
        !error.message.includes("ALREADY_BOOKED")
      ) {
        await logSystemError({
          severity: "critical",
          module: "scheduling",
          message: "Falha na RPC book_session_atomic.",
          context: {
            studentId: session.userId,
            sessionId,
            dbError: error.message,
          },
        });
      }
      return { error: mapRpcErrorToPortuguese(error.message) };
    }

    // E-mail de confirmação (não bloqueante)
    const { data: sessionMeta } = await supabase
      .from("class_sessions")
      .select("starts_at_utc, duration_minutes")
      .eq("id", sessionId)
      .maybeSingle();

    if (session.email && sessionMeta?.starts_at_utc) {
      const formatted = formatDateTimeInTimeZone(
        sessionMeta.starts_at_utc,
        session.profile.timezone,
      );
      const emailSender = getEmailSender();
      const emailResult = await emailSender.send({
        to: session.email,
        subject: "Output 1v2 — Reserva de aula confirmada!",
        text: `Olá ${session.profile.full_name}!\n\nSua aula 1v2 está confirmada para ${formatted} (${session.profile.timezone}), duração de ${sessionMeta.duration_minutes} minutos.\n\nO botão de check-in e o link do Google Meet serão liberados no seu painel 10 minutos antes do início.\nLembrete: cancelamentos com devolução de saldo exigem mínimo de 12 horas de antecedência.`,
      });

      if (!emailResult.sent && emailResult.error) {
        await logSystemError({
          severity: "error",
          module: "notifications",
          message: "Falha ao enviar e-mail de confirmação de reserva.",
          context: { studentId: session.userId, error: emailResult.error },
        });
      }
    }

    revalidatePath("/student");
    revalidatePath("/student/schedule");
    revalidatePath("/teacher/schedule");
    return {
      success:
        "Reserva confirmada! O check-in e o link do Google Meet abrem 10 minutos antes da aula.",
    };
  } catch (err) {
    await logSystemError({
      severity: "critical",
      module: "scheduling",
      message: "Exceção inesperada em bookSessionAction.",
      context: {
        studentId: session.userId,
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return { error: "Erro inesperado ao confirmar reserva." };
  }
}

/**
 * Cancelamento atômico via RPC `cancel_booking_atomic` (regra de 12h + reset de locked_level).
 */
export async function cancelBookingAction(
  bookingId: string,
): Promise<ScheduleActionState> {
  const session = await requireRole(["student"]);

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("cancel_booking_atomic", {
      p_booking_id: bookingId,
    });

    if (error) {
      return { error: mapRpcErrorToPortuguese(error.message) };
    }

    revalidatePath("/student");
    revalidatePath("/student/schedule");
    revalidatePath("/teacher/schedule");
    return {
      success: "Reserva cancelada e saldo devolvido ao seu plano.",
    };
  } catch (err) {
    await logSystemError({
      severity: "critical",
      module: "scheduling",
      message: "Exceção inesperada em cancelBookingAction.",
      context: {
        studentId: session.userId,
        bookingId,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return { error: "Erro inesperado ao cancelar reserva." };
  }
}
