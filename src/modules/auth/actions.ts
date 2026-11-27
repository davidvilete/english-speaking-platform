"use server";

import { redirect } from "next/navigation";
import { logSystemError } from "@/modules/audit/logger";
import {
  DEFAULT_TIMEZONE,
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

    // Quando o e-mail já existe no Supabase Auth com confirmação ativa,
    // o Supabase retorna um usuário ofuscado com `identities: []`.
    if (authData.user.identities && authData.user.identities.length === 0) {
      return {
        error:
          "Este e-mail já está cadastrado. Volte para a tela de login para entrar.",
      };
    }

    const adminClient = createSupabaseAdminClient();
    const nowUtc = new Date().toISOString();

    const { error: profileError } = await adminClient.from("profiles").upsert(
      {
        id: authData.user.id,
        role: "student",
        full_name: fullName,
        whatsapp_e164: whatsapp,
        timezone,
        proficiency_level: null,
        interests_tags: [],
        lgpd_consent_at: nowUtc,
        is_adult_confirmed: true,
      },
      { onConflict: "id" },
    );

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

    // Se a confirmação de e-mail estiver ativa no Supabase, ainda não há sessão.
    if (!authData.session) {
      return {
        error:
          "Conta criada! Verifique sua caixa de entrada para confirmar o e-mail antes de entrar.",
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
      if (error?.message.toLowerCase().includes("email not confirmed")) {
        return {
          error:
            "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada ou desative 'Confirm email' no painel do Supabase.",
        };
      }
      return {
        error: "E-mail ou senha inválidos.",
      };
    }

    const adminClient = createSupabaseAdminClient();
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!existingProfile) {
      const fallbackName =
        (data.user.user_metadata?.full_name as string | undefined) ||
        data.user.email?.split("@")[0] ||
        "Aluno";

      await adminClient.from("profiles").insert({
        id: data.user.id,
        role: "student",
        full_name: fallbackName,
        whatsapp_e164: "+5500000000000",
        timezone: DEFAULT_TIMEZONE,
        proficiency_level: null,
        interests_tags: [],
        lgpd_consent_at: new Date().toISOString(),
        is_adult_confirmed: true,
      });
    }

    const role = (existingProfile?.role as UserRole | undefined) ?? "student";
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
