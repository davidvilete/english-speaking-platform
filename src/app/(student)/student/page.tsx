import { CheckCircle2, Clock, Compass } from "lucide-react";
import { requireRole } from "@/modules/auth/session";
import {
  EXTERNAL_FOUNDATION_COURSES,
  PROFICIENCY_LEVEL_META,
} from "@/modules/screening/domain";
import { AppHeader } from "@/shared/components/app-header";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";
import type {
  ScreeningSubmissionRow,
  SubscriptionRow,
} from "@/shared/types/database";
import { ScreeningSubmissionForm } from "./_components/screening-submission-form";

function formatDateInTimeZone(isoUtc: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(isoUtc));
  } catch {
    return isoUtc;
  }
}

const PLAN_LABELS: Record<SubscriptionRow["plan_code"], string> = {
  trial: "Piloto Gratuito (2 aulas teste)",
  basic_1x: "Basic — 1 aula/semana (R$ 65,90/mês)",
  intermediate_2x: "Intermediate — 2 aulas/semana (R$ 79,90/mês)",
};

export const dynamic = "force-dynamic";

export default async function StudentDashboardPage() {
  const { profile } = await requireRole(["student"]);
  const supabase = await createSupabaseServerClient();

  const [{ data: latestSubmission }, { data: activeSubscription }] =
    await Promise.all([
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
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const submission = latestSubmission as ScreeningSubmissionRow | null;
  const subscription = activeSubscription as SubscriptionRow | null;

  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        timezone={profile.timezone}
      />

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Olá, {profile.full_name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe sua triagem, nível de fala para pareamento 1v2 e status do
            seu plano.
          </p>
        </div>

        {/* Caso 1: Candidato sem base mínima -> orientação cordial e bloqueio 1v2 */}
        {profile.proficiency_level === "REDIRECTED_EXTERNAL" ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-amber-600" />
                <CardTitle>Recomendação antes de iniciar no 1v2</CardTitle>
              </div>
              <CardDescription>
                Nossas aulas 1v2 exigem base mínima para sustentar conversação
                ao vivo com outro aluno.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {submission?.teacher_notes ? (
                <Alert variant="warning">
                  <AlertTitle>Mensagem do professor</AlertTitle>
                  <AlertDescription>
                    {submission.teacher_notes}
                  </AlertDescription>
                </Alert>
              ) : null}

              <p className="text-sm text-muted-foreground">
                Para evoluir com segurança nas 4 habilidades (listening,
                reading, speaking e writing) antes de voltar para a nossa
                prática intensiva de output, recomendamos:
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {EXTERNAL_FOUNDATION_COURSES.map((course) => (
                  <div
                    key={course.name}
                    className="rounded-md border bg-background p-4"
                  >
                    <p className="font-medium">{course.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {course.reason}
                    </p>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                O agendamento de sessões 1v2 permanece indisponível enquanto sua
                classificação estiver como iniciante absoluto. Assim que
                construir sua base, teremos prazer em reavaliar você!
              </p>
            </CardContent>
          </Card>
        ) : profile.proficiency_level ? (
          /* Caso 2: Aluno aprovado com nível de fala definido */
          <div className="space-y-4">
            <Alert variant="success">
              <CheckCircle2 className="mb-1 h-4 w-4" />
              <AlertTitle>Triagem aprovada!</AlertTitle>
              <AlertDescription>
                Seu nível de fala já foi classificado para o pareamento 1v2.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardDescription>
                    Nível de Fala (Pareamento 1v2)
                  </CardDescription>
                  <CardTitle className="text-lg">
                    {PROFICIENCY_LEVEL_META[profile.proficiency_level].label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    {
                      PROFICIENCY_LEVEL_META[profile.proficiency_level]
                        .description
                    }
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardDescription>Plano Comercial Ativo</CardDescription>
                  <CardTitle className="text-lg">
                    {subscription
                      ? PLAN_LABELS[subscription.plan_code]
                      : "Aguardando ativação"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {subscription ? (
                    <p className="text-xs text-muted-foreground">
                      Vigência até{" "}
                      <strong>
                        {formatDateInTimeZone(
                          subscription.current_period_end,
                          profile.timezone,
                        )}
                      </strong>{" "}
                      ({profile.timezone}).
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Entre em contato com a administração para ativar seu
                      plano.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {profile.interests_tags.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Seus interesses cadastrados
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {profile.interests_tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base">
                  Agenda de Aulas 1v2 (Próxima entrega — Sprint 2)
                </CardTitle>
                <CardDescription>
                  Em breve você poderá escolher horários de sexta e sábado
                  filtrados automaticamente pelo seu nível{" "}
                  <strong>{profile.proficiency_level}</strong> e fazer check-in
                  10 minutos antes da aula.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        ) : submission && submission.status === "pending" ? (
          /* Caso 3: Triagem enviada e aguardando análise do professor */
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <CardTitle>Triagem em análise pelo professor</CardTitle>
              </div>
              <CardDescription>
                Recebemos seu áudio e seus interesses. Assim que o professor
                avaliar, você receberá um e-mail e o status será atualizado
                aqui.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Enviado em:{" "}
                <strong>
                  {formatDateInTimeZone(
                    submission.created_at,
                    profile.timezone,
                  )}
                </strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Política LGPD: seu áudio de triagem expira automaticamente em{" "}
                {formatDateInTimeZone(submission.expires_at, profile.timezone)}.
              </p>
              {profile.interests_tags.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  {profile.interests_tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          /* Caso 4: Novo aluno ainda sem triagem */
          <ScreeningSubmissionForm initialInterests={profile.interests_tags} />
        )}
      </main>
    </div>
  );
}
