import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Lock,
  Mic,
} from "lucide-react";
import { requireRole } from "@/modules/auth/session";
import { PROFICIENCY_LEVEL_META } from "@/modules/screening/domain";
import { AppHeader } from "@/shared/components/app-header";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { formatDateTimeInTimeZone } from "@/shared/lib/date";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";
import type {
  ScreeningSubmissionRow,
  SubscriptionRow,
} from "@/shared/types/database";

export const dynamic = "force-dynamic";

const PLAN_LABELS: Record<SubscriptionRow["plan_code"], string> = {
  trial: "Degustação Gratuita (2 aulas piloto)",
  basic_1x: "Basic — 1 aula/semana (R$ 65,90/mês)",
  intermediate_2x: "Intermediate — 2 aulas/semana (R$ 79,90/mês)",
};

export default async function StudentDashboardPage() {
  const { profile } = await requireRole(["student"]);
  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();

  const [
    { data: latestSubmission },
    { data: activeSubscription },
    { count: usedTrialBookings },
    { count: publishedMaterialsCount },
  ] = await Promise.all([
    supabase
      .from("screening_submissions")
      .select("*")
      .eq("student_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("*")
      .eq("student_id", profile.id)
      .in("status", ["active", "cancel_at_period_end"])
      .lte("current_period_start", nowIso)
      .gt("current_period_end", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("bookings")
      .select("id", { head: true, count: "exact" })
      .eq("student_id", profile.id)
      .in("status", ["confirmed", "checked_in", "attended", "no_show"]),
    supabase
      .from("post_class_materials")
      .select("id", { head: true, count: "exact" })
      .eq("student_id", profile.id)
      .eq("status", "published"),
  ]);

  const submission = latestSubmission as ScreeningSubmissionRow | null;
  const subscription = activeSubscription as SubscriptionRow | null;

  const isApproved =
    profile.proficiency_level !== null &&
    profile.proficiency_level !== "REDIRECTED_EXTERNAL";

  const isTrialExhausted =
    subscription?.plan_code === "trial" &&
    (usedTrialBookings ?? 0) >= subscription.weekly_limit;

  const isPaywalled = isApproved && (!subscription || isTrialExhausted);

  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        timezone={profile.timezone}
      />

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Bem-vindo(a), {profile.full_name.split(" ")[0]}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sua área de membros Output 1v2. Acesse triagem, aulas ao vivo e
              atividades pós-aula.
            </p>
          </div>
          {profile.proficiency_level &&
          profile.proficiency_level !== "REDIRECTED_EXTERNAL" ? (
            <Badge variant="success">
              {PROFICIENCY_LEVEL_META[profile.proficiency_level].label}
            </Badge>
          ) : null}
        </div>

        {/* Paywall estilo Mairo Vergara: degustação esgotada ou sem plano pago */}
        {isPaywalled ? (
          <Alert variant="warning">
            <Lock className="mb-1 h-4 w-4" />
            <AlertTitle>
              {isTrialExhausted
                ? "Suas 2 aulas gratuitas foram concluídas!"
                : "Acesso completo bloqueado — Assinatura necessária"}
            </AlertTitle>
            <AlertDescription>
              Para continuar agendando novas aulas 1v2 e recebendo atividades
              personalizadas, ative um dos planos mensais via Pix:{" "}
              <strong>Basic (1x/sem — R$ 65,90/mês)</strong> ou{" "}
              <strong>Intermediate (2x/sem — R$ 79,90/mês)</strong>. Após
              confirmar o Pix com a escola, seu acesso é liberado imediatamente
              aqui.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Card 1: Triagem de Nível */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <Mic className="h-5 w-5 text-primary" />
                <Badge
                  variant={
                    isApproved
                      ? "success"
                      : submission?.status === "pending"
                        ? "warning"
                        : "secondary"
                  }
                >
                  {isApproved
                    ? "Aprovado"
                    : profile.proficiency_level === "REDIRECTED_EXTERNAL"
                      ? "Orientação"
                      : submission?.status === "pending"
                        ? "Em análise"
                        : "Pendente"}
                </Badge>
              </div>
              <CardTitle className="text-base">1. Triagem de Nível</CardTitle>
              <CardDescription>
                Envie seu áudio, interesses reais e escolha se prefere o
                pós-aula na plataforma ou no WhatsApp.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/student/screening">
                <Button variant="outline" className="w-full">
                  {isApproved ? "Ver meu perfil de nível" : "Fazer triagem"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Card 2: Aulas 1v2 & Check-in */}
          <Card className={isPaywalled ? "opacity-85" : undefined}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                {isPaywalled ? (
                  <Lock className="h-5 w-5 text-amber-600" />
                ) : (
                  <CalendarDays className="h-5 w-5 text-primary" />
                )}
                <Badge variant={isPaywalled ? "warning" : "secondary"}>
                  {!isApproved
                    ? "Requer triagem"
                    : isPaywalled
                      ? "Bloqueado"
                      : subscription?.plan_code === "trial"
                        ? `${Math.max(0, subscription.weekly_limit - (usedTrialBookings ?? 0))} grátis`
                        : "Liberado"}
                </Badge>
              </div>
              <CardTitle className="text-base">
                2. Aulas 1v2 e Check-in
              </CardTitle>
              <CardDescription>
                Reserve horários do seu nível e faça check-in 10 min antes para
                abrir o Google Meet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isApproved ? (
                <Link href="/student/schedule">
                  <Button
                    variant={isPaywalled ? "outline" : "default"}
                    className="w-full"
                  >
                    {isPaywalled
                      ? "Ver histórico (Assinar para reservar)"
                      : "Abrir agenda 1v2"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <Button disabled variant="outline" className="w-full">
                  <Lock className="h-4 w-4" />
                  Conclua a triagem primeiro
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Card 3: Atividades Pós-Aula */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <BookOpenCheck className="h-5 w-5 text-primary" />
                <Badge variant="secondary">
                  {publishedMaterialsCount ?? 0} disponíveis
                </Badge>
              </div>
              <CardTitle className="text-base">
                3. Atividades Pós-Aula
              </CardTitle>
              <CardDescription>
                Correções personalizadas, exercício de escrita e gabarito
                (canal:{" "}
                <strong>
                  {profile.post_class_delivery_channel === "whatsapp"
                    ? "WhatsApp"
                    : "Plataforma"}
                </strong>
                ).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/student/activities">
                <Button variant="outline" className="w-full">
                  Abrir atividades
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Resumo do Plano */}
        <Card>
          <CardHeader>
            <CardDescription>Status do seu plano comercial</CardDescription>
            <CardTitle className="text-lg">
              {subscription
                ? PLAN_LABELS[subscription.plan_code]
                : "Sem plano pago ativo (Conta gratuita)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {subscription ? (
              <p>
                Vigência até{" "}
                <strong>
                  {formatDateTimeInTimeZone(
                    subscription.current_period_end,
                    profile.timezone,
                  )}
                </strong>{" "}
                ({profile.timezone}).
              </p>
            ) : (
              <p>
                Faça a triagem para liberar suas 2 aulas gratuitas de
                degustação. Depois, você pode assinar o plano Basic (R$
                65,90/mês) ou Intermediate (R$ 79,90/mês).
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
