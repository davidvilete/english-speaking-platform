import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/modules/auth/session";
import { getCheckInWindowState } from "@/modules/checkin/domain";
import {
  canCancelWithQuotaRefund,
  canStudentViewAndBookSlot,
} from "@/modules/scheduling/domain";
import { AppHeader } from "@/shared/components/app-header";
import { Button } from "@/shared/components/ui/button";
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
import {
  StudentScheduleClient,
  type StudentBookingView,
  type StudentOpenSlotView,
} from "./_components/student-schedule-client";

export const dynamic = "force-dynamic";

interface RawOpenSessionRow {
  id: string;
  starts_at_utc: string;
  duration_minutes: number;
  capacity: number;
  locked_level: ProficiencyLevel | null;
  topic_theme: string | null;
  status: ClassSessionStatus;
  bookings: { id: string; status: BookingStatus; student_id: string }[];
}

interface RawMyBookingRow {
  id: string;
  session_id: string;
  status: BookingStatus;
  checked_in_at: string | null;
  session: {
    id: string;
    starts_at_utc: string;
    duration_minutes: number;
    topic_theme: string | null;
    meet_url: string;
    status: ClassSessionStatus;
  } | null;
}

export default async function StudentSchedulePage() {
  const { profile } = await requireRole(["student"]);

  if (
    !profile.proficiency_level ||
    profile.proficiency_level === "REDIRECTED_EXTERNAL"
  ) {
    redirect("/student");
  }

  const supabase = await createSupabaseServerClient();
  const serverNowUtc = new Date();
  const serverNowIso = serverNowUtc.toISOString();

  // Regra inviolável de segurança: listagem aberta NUNCA seleciona `meet_url`.
  const [{ data: openRows }, { data: bookingRows }, { data: activeSub }] =
    await Promise.all([
      supabase
        .from("class_sessions")
        .select(
          `
          id,
          starts_at_utc,
          duration_minutes,
          capacity,
          locked_level,
          topic_theme,
          status,
          bookings ( id, status, student_id )
        `,
        )
        .eq("status", "open")
        .gt("starts_at_utc", serverNowIso)
        .order("starts_at_utc", { ascending: true })
        .limit(40),
      supabase
        .from("bookings")
        .select(
          `
          id,
          session_id,
          status,
          checked_in_at,
          session:class_sessions!bookings_session_id_fkey (
            id,
            starts_at_utc,
            duration_minutes,
            topic_theme,
            meet_url,
            status
          )
        `,
        )
        .eq("student_id", profile.id)
        .neq("status", "canceled")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("subscriptions")
        .select("id")
        .eq("student_id", profile.id)
        .in("status", ["active", "cancel_at_period_end"])
        .lte("current_period_start", serverNowIso)
        .gt("current_period_end", serverNowIso)
        .limit(1)
        .maybeSingle(),
    ]);

  const rawOpen = (openRows ?? []) as unknown as RawOpenSessionRow[];
  const rawBookings = (bookingRows ?? []) as unknown as RawMyBookingRow[];

  const myBookedSessionIds = new Set(rawBookings.map((b) => b.session_id));

  const openSlots: StudentOpenSlotView[] = rawOpen
    .filter((row) => !myBookedSessionIds.has(row.id))
    .map((row) => {
      const activeBookingsCount = (row.bookings ?? []).filter((b) =>
        ["confirmed", "checked_in", "attended"].includes(b.status),
      ).length;
      return { row, activeBookingsCount };
    })
    .filter(({ row, activeBookingsCount }) =>
      canStudentViewAndBookSlot({
        studentLevel: profile.proficiency_level,
        slotLockedLevel: row.locked_level,
        slotStatus: row.status,
        slotCapacity: row.capacity,
        activeBookingsCount,
      }),
    )
    .map(({ row, activeBookingsCount }) => ({
      sessionId: row.id,
      startsAtFormatted: formatWeekdayAndTimeInTimeZone(
        row.starts_at_utc,
        profile.timezone,
      ),
      durationMinutes: row.duration_minutes,
      capacity: row.capacity,
      activeBookingsCount,
      lockedLevel: row.locked_level,
      topicTheme: row.topic_theme,
    }));

  const myBookings: StudentBookingView[] = rawBookings
    .filter((b) => b.session !== null && b.session.status !== "canceled")
    .map((b) => {
      const sess = b.session!;
      const checkInWindowState = getCheckInWindowState(
        sess.starts_at_utc,
        serverNowUtc,
      );
      return {
        bookingId: b.id,
        sessionId: b.session_id,
        status: b.status,
        startsAtFormatted: formatWeekdayAndTimeInTimeZone(
          sess.starts_at_utc,
          profile.timezone,
        ),
        durationMinutes: sess.duration_minutes,
        topicTheme: sess.topic_theme,
        canCancelWithRefund: canCancelWithQuotaRefund(
          sess.starts_at_utc,
          serverNowUtc,
        ),
        checkInWindowState,
        checkedInAtFormatted: b.checked_in_at
          ? formatDateTimeInTimeZone(b.checked_in_at, profile.timezone, "short")
          : null,
        // Segurança: meet_url só é entregue ao cliente após check-in confirmado.
        meetUrl: b.status === "checked_in" ? sess.meet_url : null,
      };
    });

  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        timezone={profile.timezone}
      />

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Agendar Aulas 1v2 e Check-in
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Horários exibidos no seu fuso local (
              <strong>{profile.timezone}</strong>).
            </p>
          </div>
          <Link href="/student">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao início
            </Button>
          </Link>
        </div>

        <StudentScheduleClient
          studentLevel={profile.proficiency_level}
          openSlots={openSlots}
          myBookings={myBookings}
          hasActiveSubscription={Boolean(activeSub)}
        />
      </main>
    </div>
  );
}
