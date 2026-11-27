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
import { formatDateTimeInTimeZone } from "@/shared/lib/date";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";
import type { ScreeningSubmissionRow } from "@/shared/types/database";
import { ScreeningSubmissionForm } from "../_components/screening-submission-form";

export const dynamic = "force-dynamic";

export default async function StudentScreeningPage() {
  const { profile } = await requireRole(["student"]);
  const supabase = await createSupabaseServerClient();

  const { data: latestSubmission } = await supabase
    .from("screening_submissions")
    .select("*")
    .eq("student_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const submission = latestSubmission as ScreeningSubmissionRow | null;

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
            Triagem de Nível
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Preencha seu perfil de interesses, escolha como prefere receber o
            pós-aula e envie seu áudio em inglês para definirmos seu nível 1v2.
          </p>
        </div>

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
            </CardContent>
          </Card>
        ) : profile.proficiency_level ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <CardTitle>Triagem aprovada!</CardTitle>
              </div>
              <CardDescription>
                Nível de fala:{" "}
                <strong>
                  {PROFICIENCY_LEVEL_META[profile.proficiency_level].label}
                </strong>{" "}
                • Entrega pós-aula preferida:{" "}
                <strong>
                  {profile.post_class_delivery_channel === "whatsapp"
                    ? "WhatsApp"
                    : "Dentro da plataforma"}
                </strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {PROFICIENCY_LEVEL_META[profile.proficiency_level].description}
              </p>
              {profile.interests_tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.interests_tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : submission && submission.status === "pending" ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <CardTitle>Triagem em análise pelo professor</CardTitle>
              </div>
              <CardDescription>
                Recebemos seu áudio e preferências. Assim que o professor
                avaliar, você poderá agendar suas aulas 1v2.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Enviado em:{" "}
                <strong>
                  {formatDateTimeInTimeZone(
                    submission.created_at,
                    profile.timezone,
                  )}
                </strong>
              </p>
              <p className="text-xs">
                Retenção LGPD: expira em{" "}
                {formatDateTimeInTimeZone(
                  submission.expires_at,
                  profile.timezone,
                )}
                .
              </p>
            </CardContent>
          </Card>
        ) : (
          <ScreeningSubmissionForm
            initialInterests={profile.interests_tags}
            initialDeliveryChannel={profile.post_class_delivery_channel}
          />
        )}
      </main>
    </div>
  );
}
