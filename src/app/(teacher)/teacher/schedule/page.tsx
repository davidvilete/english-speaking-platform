import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/modules/auth/session";
import { computeTopicAffinity } from "@/modules/scheduling/domain";
import { AppHeader } from "@/shared/components/app-header";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import {
  formatDateTimeInTimeZone,
  formatWeekdayAndTimeInTimeZone,
} from "@/shared/lib/date";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";
import type {
  BookingStatus,
  ClassSessionStatus,
  ProficiencyLevel,
} from "@/shared/types/database";
import { CreateSlotForm } from "./_components/create-slot-form";
import {
  TeacherSessionCard,
  type TeacherSessionBookingView,
  type TeacherSessionView,
} from "./_components/teacher-session-card";

export const dynamic = "force-dynamic";

interface RawTeacherSessionRow {
  id: string;
  starts_at_utc: string;
  duration_minutes: number;
  capacity: number;
  locked_level: ProficiencyLevel | null;
  topic_theme: string | null;
  meet_url: string;
  status: ClassSessionStatus;
  bookings: {
    id: string;
    status: BookingStatus;
    checked_in_at: string | null;
    student: {
      full_name: string;
      whatsapp_e164: string;
      interests_tags: string[];
    } | null;
  }[];
}

export default async function TeacherSchedulePage() {
  const { profile } = await requireRole(["teacher", "admin"]);
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("class_sessions")
    .select(
      `
      id,
      starts_at_utc,
      duration_minutes,
      capacity,
      locked_level,
      topic_theme,
      meet_url,
      status,
      bookings (
        id,
        status,
        checked_in_at,
        student:profiles!bookings_student_id_fkey (
          full_name,
          whatsapp_e164,
          interests_tags
        )
      )
    `,
    )
    .neq("status", "canceled")
    .order("starts_at_utc", { ascending: true })
    .limit(40);

  if (profile.role === "teacher") {
    query = query.eq("teacher_id", profile.id);
  }

  const { data } = await query;
  const rows = (data ?? []) as unknown as RawTeacherSessionRow[];

  const sessions: TeacherSessionView[] = rows.map((row) => {
    const bookings: TeacherSessionBookingView[] = (row.bookings ?? [])
      .filter((b) => b.student !== null)
      .map((b) => ({
        bookingId: b.id,
        status: b.status,
        checkedInAtFormatted: b.checked_in_at
          ? formatDateTimeInTimeZone(b.checked_in_at, profile.timezone, "short")
          : null,
        studentName: b.student!.full_name,
        whatsappE164: b.student!.whatsapp_e164,
        interestsTags: b.student!.interests_tags ?? [],
      }));

    const active = bookings.filter((b) => b.status !== "canceled");
    const sharedInterests =
      active.length >= 2
        ? computeTopicAffinity(
            active[0]?.interestsTags ?? [],
            active[1]?.interestsTags ?? [],
          )
        : [];

    return {
      sessionId: row.id,
      startsAtFormatted: formatWeekdayAndTimeInTimeZone(
        row.starts_at_utc,
        profile.timezone,
      ),
      durationMinutes: row.duration_minutes,
      capacity: row.capacity,
      lockedLevel: row.locked_level,
      topicTheme: row.topic_theme,
      meetUrl: row.meet_url,
      status: row.status,
      sharedInterests,
      bookings,
    };
  });

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
              Agenda e Presença (1v2)
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Abra seus horários de sexta/sábado, acompanhe check-ins em tempo
              real e envie lembretes via WhatsApp.
            </p>
          </div>
          <Link href="/teacher">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao painel
            </Button>
          </Link>
        </div>

        <CreateSlotForm timezone={profile.timezone} />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">
            Sessões ativas ({sessions.length})
          </h2>

          {sessions.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Nenhum horário aberto ainda
                </CardTitle>
                <CardDescription>
                  Use o formulário acima para disponibilizar sua grade de aulas
                  1v2.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <TeacherSessionCard key={session.sessionId} session={session} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
