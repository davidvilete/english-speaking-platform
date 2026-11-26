import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/modules/auth/session";
import { AppHeader } from "@/shared/components/app-header";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";
import type {
  ProficiencyLevel,
  ScreeningStatus,
} from "@/shared/types/database";
import {
  ScreeningReviewCard,
  type ScreeningReviewItem,
} from "./_components/screening-review-card";

function formatInTimeZone(isoUtc: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone,
    }).format(new Date(isoUtc));
  } catch {
    return isoUtc;
  }
}

interface RawSubmissionRow {
  id: string;
  status: ScreeningStatus;
  created_at: string;
  expires_at: string;
  teacher_notes: string | null;
  student: {
    id: string;
    full_name: string;
    whatsapp_e164: string;
    interests_tags: string[];
    proficiency_level: ProficiencyLevel | null;
  } | null;
}

export const dynamic = "force-dynamic";

export default async function TeacherScreeningPage() {
  const { profile } = await requireRole(["teacher", "admin"]);
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("screening_submissions")
    .select(
      `
      id,
      status,
      created_at,
      expires_at,
      teacher_notes,
      student:profiles!screening_submissions_student_id_fkey (
        id,
        full_name,
        whatsapp_e164,
        interests_tags,
        proficiency_level
      )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as unknown as RawSubmissionRow[];

  const items: ScreeningReviewItem[] = rows
    .filter((row) => row.student !== null)
    .map((row) => ({
      submissionId: row.id,
      status: row.status,
      createdAtFormatted: formatInTimeZone(row.created_at, profile.timezone),
      expiresAtFormatted: formatInTimeZone(row.expires_at, profile.timezone),
      teacherNotes: row.teacher_notes,
      student: {
        id: row.student!.id,
        fullName: row.student!.full_name,
        whatsappE164: row.student!.whatsapp_e164,
        interestsTags: row.student!.interests_tags ?? [],
        proficiencyLevel: row.student!.proficiency_level,
      },
    }));

  const pendingItems = items.filter((item) => item.status === "pending");
  const reviewedItems = items.filter((item) => item.status !== "pending");

  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        timezone={profile.timezone}
      />

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Triagem por Áudio
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Classifique o nível de fala separadamente do plano comercial.
            </p>
          </div>
          <Link href="/teacher">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao painel
            </Button>
          </Link>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">
            Pendentes ({pendingItems.length})
          </h2>
          {pendingItems.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Nenhuma triagem pendente
                </CardTitle>
                <CardDescription>
                  Quando novos alunos enviarem seus áudios, eles aparecerão
                  aqui.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingItems.map((item) => (
                <ScreeningReviewCard key={item.submissionId} item={item} />
              ))}
            </div>
          )}
        </section>

        {reviewedItems.length > 0 ? (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">
              Avaliadas recentemente ({reviewedItems.length})
            </h2>
            <div className="space-y-4">
              {reviewedItems.map((item) => (
                <ScreeningReviewCard key={item.submissionId} item={item} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
