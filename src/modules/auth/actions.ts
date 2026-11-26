"use server";

import { redirect } from "next/navigation";
import { logSystemError } from "@/modules/audit/logger";
import {
  getDefaultRedirectForRole,
  signInSchema,
  signUpSchema,
} from "@/modules/auth/domain";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";
import type { UserRole } from "@/shared/types/database";

export interface AuthActionState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    whatsapp: formData.get("whatsapp"),
    timezone: formData.get("timezone"),
    isAdultConfirmed: formData.get("isAdultConfirmed") === "on",
    lgpdConsentAccepted: formData.get("lgpdConsentAccepted") === "on",
  });

  if (!parsed.success) {
    return {
      error: "Verifique os campos obrigatórios abaixo.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { fullName, email, password, whatsapp, timezone } = parsed.data;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (signUpError || !authData.user) {
      return {
        error:
          signUpError?.message ??
          "Não foi possível concluir o cadastro. Verifique os dados informados.",
      };
    }

    const adminClient = createSupabaseAdminClient();
    const nowUtc = new Date().toISOString();

    const { error: profileError } = await adminClient.from("profiles").insert({
      id: authData.user.id,
      role: "student",
      full_name: fullName,
      whatsapp_e164: whatsapp,
      timezone,
      proficiency_level: null,
      interests_tags: [],
      lgpd_consent_at: nowUtc,
      is_adult_confirmed: true,
    });

    if (profileError) {
      await logSystemError({
        severity: "critical",
        module: "auth",
        message: "Falha ao criar perfil do aluno após signUp.",
        context: { userId: authData.user.id, dbError: profileError.message },
      });
      return {
        error:
          "Conta criada, mas houve falha ao salvar seu perfil. Tente novamente ou contate o suporte.",
      };
    }
  } catch (err) {
    await logSystemError({
      severity: "critical",
      module: "auth",
      message: "Exceção inesperada no cadastro de aluno.",
      context: { error: err instanceof Error ? err.message : String(err) },
    });
    return {
      error:
        "Erro interno ao realizar cadastro. Verifique se o Supabase está configurado.",
    };
  }

  redirect("/student");
}

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      error: "Informe um e-mail e senha válidos.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  let destination = "/student";

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error || !data.user) {
      return {
        error: "E-mail ou senha inválidos.",
      };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    const role = (profile?.role as UserRole | undefined) ?? "student";
    destination = getDefaultRedirectForRole(role);
  } catch (err) {
    await logSystemError({
      severity: "error",
      module: "auth",
      message: "Exceção inesperada no login.",
      context: { error: err instanceof Error ? err.message : String(err) },
    });
    return {
      error: "Não foi possível entrar agora. Tente novamente em instantes.",
    };
  }

  redirect(destination);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
