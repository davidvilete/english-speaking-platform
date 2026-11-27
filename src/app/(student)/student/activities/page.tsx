import { BookOpenCheck, ChevronDown } from "lucide-react";
import { requireRole } from "@/modules/auth/session";
import { splitActivityAndAnswerKey } from "@/modules/post-class/domain";
import { AppHeader } from "@/shared/components/app-header";
import { Badge } from "@/shared/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  formatDateTimeInTimeZone,
  formatWeekdayAndTimeInTimeZone,
} from "@/shared/lib/date";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RawStudentMaterial {
  id: string;
  final_content_markdown: string;
  published_at: string | null;
  expires_at: string;
  session: {
    starts_at_utc: string;
    topic_theme: string | null;
  } | null;
}

export default async function StudentActivitiesPage() {
  const { profile } = await requireRole(["student"]);
  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();

  const { data } = await supabase
    .from("post_class_materials")
    .select(
      `
      id,
      final_content_markdown,
      published_at,
      expires_at,
      session:class_sessions!post_class_materials_session_id_fkey (
        starts_at_utc,
        topic_theme
      )
    `,
    )
    .eq("student_id", profile.id)
    .eq("status", "published")
    .gt("expires_at", nowIso)
    .order("published_at", { ascending: false })
    .limit(20);

  const materials = (data ?? []) as unknown as RawStudentMaterial[];

  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        timezone={profile.timezone}
      />

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Minhas Aulas e Atividades Pós-Aula
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Correções personalizadas e exercícios de escrita para prática
              autônoma (retidos por 30 dias conforme LGPD).
            </p>
          </div>
          <Badge variant="secondary">
            Canal preferido:{" "}
            {profile.post_class_delivery_channel === "whatsapp"
              ? "WhatsApp"
              : "Plataforma"}
          </Badge>
        </div>

        {materials.length === 0 ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BookOpenCheck className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">
                  Nenhuma atividade publicada ainda
                </CardTitle>
              </div>
              <CardDescription>
                Após cada aula 1v2, seu professor publicará suas correções e uma
                atividade escrita personalizada aqui.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-6">
            {materials.map((material) => {
              const { mainContent, answerKey } = splitActivityAndAnswerKey(
                material.final_content_markdown,
              );

              return (
                <Card key={material.id}>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {material.session
                        ? `Aula de ${formatWeekdayAndTimeInTimeZone(
                            material.session.starts_at_utc,
                            profile.timezone,
                          )}`
                        : "Material Pós-Aula"}
                    </CardTitle>
                    <CardDescription>
                      {material.published_at
                        ? `Publicado em ${formatDateTimeInTimeZone(
                            material.published_at,
                            profile.timezone,
                            "short",
                          )} • `
                        : ""}
                      Disponível até{" "}
                      {formatDateTimeInTimeZone(
                        material.expires_at,
                        profile.timezone,
                        "short",
                      )}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="whitespace-pre-wrap rounded-md border bg-background p-4 text-sm leading-relaxed">
                      {mainContent}
                    </div>

                    {answerKey ? (
                      <details className="group rounded-md border bg-muted/40 p-4">
                        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
                          <span>
                            Ver Gabarito e Notas de Correção (abra após
                            praticar)
                          </span>
                          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="mt-3 whitespace-pre-wrap border-t pt-3 text-sm leading-relaxed text-muted-foreground">
                          {answerKey}
                        </div>
                      </details>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
