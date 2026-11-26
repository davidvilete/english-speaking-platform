import { z } from "zod";
import type { UserRole } from "@/shared/types/database";

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

export const COMMON_TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Recife",
  "America/Fortaleza",
  "America/Belem",
  "America/Cuiaba",
  "America/Rio_Branco",
  "Europe/Lisbon",
  "Europe/London",
  "America/New_York",
  "America/Toronto",
  "UTC",
] as const;

/**
 * Valida se uma string representa um fuso horário IANA válido usando Intl.
 */
export function isValidIanaTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.trim().length === 0) {
    return false;
  }
  try {
    Intl.DateTimeFormat("pt-BR", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normaliza números brasileiros ou internacionais de WhatsApp para formato E.164.
 * Exemplos:
 *  - "(11) 98765-4321" -> "+5511987654321"
 *  - "+55 11 98765-4321" -> "+5511987654321"
 *  - "+351 912 345 678" -> "+351912345678"
 */
export function normalizeWhatsAppToE164(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");

  if (hasLeadingPlus) {
    if (digits.length < 10 || digits.length > 15) {
      return null;
    }
    return `+${digits}`;
  }

  // Número brasileiro sem DDI (DDD + 8 ou 9 dígitos)
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  // Número brasileiro já com DDI 55 sem sinal '+'
  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith("55")
  ) {
    return `+${digits}`;
  }

  return null;
}

export const signUpSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, "Informe seu nome completo (mínimo 3 caracteres).")
    .max(120, "Nome muito longo."),
  email: z.string().trim().email("Informe um e-mail válido."),
  password: z
    .string()
    .min(8, "A senha deve ter pelo menos 8 caracteres.")
    .max(72, "A senha deve ter no máximo 72 caracteres."),
  whatsapp: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const normalized = normalizeWhatsAppToE164(value);
      if (!normalized) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Informe um WhatsApp válido com DDD (ex.: (11) 99999-9999 ou +5511999999999).",
        });
        return z.NEVER;
      }
      return normalized;
    }),
  timezone: z
    .string()
    .trim()
    .refine(isValidIanaTimeZone, "Fuso horário inválido."),
  isAdultConfirmed: z.literal(true, {
    errorMap: () => ({
      message:
        "A plataforma é exclusiva para maiores de 18 anos. Confirme sua maioridade.",
    }),
  }),
  lgpdConsentAccepted: z.literal(true, {
    errorMap: () => ({
      message:
        "É obrigatório aceitar o Termo de Consentimento LGPD (uso de dados/áudio e retenção de 30 dias).",
    }),
  }),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe sua senha."),
});

export type SignInInput = z.infer<typeof signInSchema>;

export function getDefaultRedirectForRole(role: UserRole): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "teacher":
      return "/teacher";
    case "student":
      return "/student";
  }
}

export function isProtectedRoute(pathname: string): boolean {
  return (
    pathname === "/student" ||
    pathname.startsWith("/student/") ||
    pathname === "/teacher" ||
    pathname.startsWith("/teacher/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}

/**
 * Matriz estrita de RBAC para rotas protegidas.
 * - student: apenas /student/*
 * - teacher: /teacher/*
 * - admin: /admin/* e /teacher/* (supervisão operacional)
 */
export function canRoleAccessPath(role: UserRole, pathname: string): boolean {
  if (pathname === "/student" || pathname.startsWith("/student/")) {
    return role === "student";
  }
  if (pathname === "/teacher" || pathname.startsWith("/teacher/")) {
    return role === "teacher" || role === "admin";
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return role === "admin";
  }
  return true;
}
