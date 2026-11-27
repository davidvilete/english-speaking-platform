import { z } from "zod";
import type { PlanCode } from "@/shared/types/database";

export const CDC_REFUND_WINDOW_DAYS = 7;

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  priceBrl: number;
  priceLabel: string;
  weeklyLimit: number;
  durationDays: number;
  isPaid: boolean;
}

export const PLAN_CATALOG: Record<PlanCode, PlanDefinition> = {
  trial: {
    code: "trial",
    name: "Trial (Piloto Gratuito)",
    priceBrl: 0,
    priceLabel: "Grátis (2 aulas teste)",
    weeklyLimit: 2,
    durationDays: 30,
    isPaid: false,
  },
  basic_1x: {
    code: "basic_1x",
    name: "Basic (1 aula/semana)",
    priceBrl: 65.9,
    priceLabel: "R$ 65,90/mês",
    weeklyLimit: 1,
    durationDays: 30,
    isPaid: true,
  },
  intermediate_2x: {
    code: "intermediate_2x",
    name: "Intermediate (2 aulas/semana)",
    priceBrl: 79.9,
    priceLabel: "R$ 79,90/mês",
    weeklyLimit: 2,
    durationDays: 30,
    isPaid: true,
  },
};

/**
 * Avalia se a assinatura paga está dentro da janela legal de 7 dias
 * de arrependimento com estorno integral (CDC Art. 49).
 */
export function evaluateCdcRefundWindow(
  firstPaidAtUtc: string | null,
  nowUtc: Date = new Date(),
): { withinWindow: boolean; daysRemaining: number } {
  if (!firstPaidAtUtc) {
    return { withinWindow: false, daysRemaining: 0 };
  }

  const paidMs = new Date(firstPaidAtUtc).getTime();
  if (Number.isNaN(paidMs)) {
    return { withinWindow: false, daysRemaining: 0 };
  }

  const elapsedMs = nowUtc.getTime() - paidMs;
  const windowMs = CDC_REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  if (elapsedMs < 0 || elapsedMs > windowMs) {
    return { withinWindow: false, daysRemaining: 0 };
  }

  const remainingMs = windowMs - elapsedMs;
  const daysRemaining = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  return { withinWindow: true, daysRemaining };
}

export const activateManualSubscriptionSchema = z.object({
  studentId: z.string().uuid("Selecione um aluno válido."),
  planCode: z.enum(["trial", "basic_1x", "intermediate_2x"]),
  durationDays: z.coerce
    .number()
    .int()
    .min(7, "Duração mínima de 7 dias.")
    .max(365, "Duração máxima de 365 dias.")
    .default(30),
});

export type ActivateManualSubscriptionInput = z.infer<
  typeof activateManualSubscriptionSchema
>;
