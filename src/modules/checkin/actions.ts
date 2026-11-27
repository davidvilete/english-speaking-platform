"use server";

import { revalidatePath } from "next/cache";
import { logSystemError } from "@/modules/audit/logger";
import { requireRole } from "@/modules/auth/session";
import { mapRpcErrorToPortuguese } from "@/modules/scheduling/domain";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export interface CheckInActionResult {
  error?: string;
  checkedInAt?: string;
  meetUrl?: string;
}

/**
 * Executa check-in validado no relógio UTC do banco via RPC `checkin_booking_atomic`.
 * Só libera `meet_url` se o aluno estiver confirmado e dentro de [-10min, +10min].
 */
export async function performCheckInAction(
  bookingId: string,
): Promise<CheckInActionResult> {
  const session = await requireRole(["student"]);

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("checkin_booking_atomic", {
      p_booking_id: bookingId,
    });

    if (error) {
      if (
        !error.message.includes("CHECKIN_TOO_EARLY") &&
        !error.message.includes("CHECKIN_CLOSED")
      ) {
        await logSystemError({
          severity: "critical",
          module: "checkin",
          message: "Falha crítica em checkin_booking_atomic.",
          context: {
            studentId: session.userId,
            bookingId,
            dbError: error.message,
          },
        });
      }
      return { error: mapRpcErrorToPortuguese(error.message) };
    }

    const payload = data as {
      checked_in_at?: string;
      meet_url?: string;
    } | null;

    revalidatePath("/student");
    revalidatePath("/student/schedule");
    revalidatePath("/teacher/schedule");

    return {
      checkedInAt: payload?.checked_in_at,
      meetUrl: payload?.meet_url,
    };
  } catch (err) {
    await logSystemError({
      severity: "critical",
      module: "checkin",
      message: "Exceção inesperada em performCheckInAction.",
      context: {
        studentId: session.userId,
        bookingId,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return { error: "Erro inesperado ao realizar check-in." };
  }
}

export interface AttendanceActionResult {
  error?: string;
  success?: string;
}

/**
 * Marca presença (`attended`) ou falta (`no_show`, sem reposição) pelo professor.
 * Se apenas 1 aluno comparecer, o presente faz aula 1v1 sem custo extra.
 */
export async function markBookingAttendanceAction(
  bookingId: string,
  status: "attended" | "no_show",
): Promise<AttendanceActionResult> {
  const session = await requireRole(["teacher", "admin"]);

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("bookings")
      .update({ status })
      .eq("id", bookingId);

    if (error) {
      await logSystemError({
        severity: "error",
        module: "checkin",
        message: "Falha ao atualizar status de presença da reserva.",
        context: {
          teacherId: session.userId,
          bookingId,
          status,
          dbError: error.message,
        },
      });
      return { error: "Não foi possível atualizar a presença." };
    }

    revalidatePath("/teacher/schedule");
    revalidatePath("/student/schedule");
    return {
      success:
        status === "attended"
          ? "Presença confirmada."
          : "Falta (no_show) registrada sem reposição.",
    };
  } catch {
    return { error: "Erro inesperado ao registrar presença." };
  }
}
