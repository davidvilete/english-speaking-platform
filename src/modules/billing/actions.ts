"use server";

import { revalidatePath } from "next/cache";
import { logSystemError } from "@/modules/audit/logger";
import { requireRole } from "@/modules/auth/session";
import {
  activateManualSubscriptionSchema,
  PLAN_CATALOG,
} from "@/modules/billing/domain";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";

export interface BillingActionState {
  error?: string;
  success?: string;
}

/**
 * Ativação/renovação manual de assinatura (Pix ou Trial) pelo Admin.
 * Contingência permanente e operação custo zero no piloto.
 */
export async function activateManualSubscriptionAction(
  _prevState: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  await requireRole(["admin"]);

  const parsed = activateManualSubscriptionSchema.safeParse({
    studentId: formData.get("studentId"),
    planCode: formData.get("planCode"),
    durationDays: formData.get("durationDays") ?? 30,
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Dados inválidos para ativar assinatura.",
    };
  }

  try {
    const admin = createSupabaseAdminClient();
    const plan = PLAN_CATALOG[parsed.data.planCode];
    const nowUtc = new Date();
    const periodEndUtc = new Date(
      nowUtc.getTime() + parsed.data.durationDays * 24 * 60 * 60 * 1000,
    );

    // Encerra assinatura ativa anterior do mesmo aluno antes de ativar a nova vigência.
    await admin
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("student_id", parsed.data.studentId)
      .in("status", ["active", "cancel_at_period_end"]);

    const { error: insertError } = await admin.from("subscriptions").insert({
      student_id: parsed.data.studentId,
      plan_code: plan.code,
      status: "active",
      weekly_limit: plan.weeklyLimit,
      current_period_start: nowUtc.toISOString(),
      current_period_end: periodEndUtc.toISOString(),
      first_paid_at: plan.isPaid ? nowUtc.toISOString() : null,
      payment_source: "manual_pix",
    });

    if (insertError) {
      await logSystemError({
        severity: "critical",
        module: "billing",
        message: "Falha ao ativar assinatura manual via Admin.",
        context: {
          studentId: parsed.data.studentId,
          planCode: plan.code,
          dbError: insertError.message,
        },
      });
      return { error: "Erro ao ativar assinatura no banco de dados." };
    }

    revalidatePath("/admin/subscriptions");
    revalidatePath("/student");
    revalidatePath("/student/schedule");

    return {
      success: `Plano ${plan.name} ativado com sucesso por ${parsed.data.durationDays} dias!`,
    };
  } catch (err) {
    await logSystemError({
      severity: "critical",
      module: "billing",
      message: "Exceção inesperada na ativação manual de assinatura.",
      context: { error: err instanceof Error ? err.message : String(err) },
    });
    return { error: "Erro inesperado ao ativar assinatura." };
  }
}

/**
 * Cancelamento recorrente estilo Netflix: aluno usa os dias restantes até current_period_end.
 */
export async function cancelSubscriptionAtPeriodEndAction(
  subscriptionId: string,
): Promise<BillingActionState> {
  await requireRole(["admin"]);

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("subscriptions")
      .update({ status: "cancel_at_period_end" })
      .eq("id", subscriptionId);

    if (error) {
      return { error: "Não foi possível agendar cancelamento." };
    }

    revalidatePath("/admin/subscriptions");
    revalidatePath("/student");
    return {
      success:
        "Cancelamento agendado (estilo Netflix): acesso mantido até o fim do ciclo atual.",
    };
  } catch {
    return { error: "Erro inesperado ao atualizar assinatura." };
  }
}

/**
 * Cancelamento imediato com estorno (CDC Art. 49 — 7 dias) ou revogação imediata pelo Admin.
 */
export async function refundAndCancelImmediatelyAction(
  subscriptionId: string,
): Promise<BillingActionState> {
  await requireRole(["admin"]);

  try {
    const admin = createSupabaseAdminClient();
    const nowIso = new Date().toISOString();
    const { error } = await admin
      .from("subscriptions")
      .update({
        status: "canceled",
        current_period_end: nowIso,
      })
      .eq("id", subscriptionId);

    if (error) {
      return { error: "Não foi possível cancelar/estornar a assinatura." };
    }

    revalidatePath("/admin/subscriptions");
    revalidatePath("/student");
    revalidatePath("/student/schedule");
    return {
      success:
        "Assinatura cancelada imediatamente (estorno CDC registrado) e acesso revogado.",
    };
  } catch {
    return { error: "Erro inesperado ao cancelar assinatura." };
  }
}
