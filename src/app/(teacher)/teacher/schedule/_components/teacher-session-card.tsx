"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  Sparkles,
  Trash2,
  UserX,
  Video,
} from "lucide-react";
import { markBookingAttendanceAction } from "@/modules/checkin/actions";
import { buildCheckInReminderWhatsAppUrl } from "@/modules/checkin/domain";
import { cancelTeacherSessionAction } from "@/modules/scheduling/actions";
import { PROFICIENCY_LEVEL_META } from "@/modules/screening/domain";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import type {
  BookingStatus,
  ClassSessionStatus,
  ProficiencyLevel,
} from "@/shared/types/database";

export interface TeacherSessionBookingView {
  bookingId: string;
  status: BookingStatus;
  checkedInAtFormatted: string | null;
  studentName: string;
  whatsappE164: string;
  interestsTags: string[];
}

export interface TeacherSessionView {
  sessionId: string;
  startsAtFormatted: string;
  durationMinutes: number;
  capacity: number;
  lockedLevel: ProficiencyLevel | null;
  topicTheme: string | null;
  meetUrl: string;
  status: ClassSessionStatus;
  sharedInterests: string[];
  bookings: TeacherSessionBookingView[];
}

const BOOKING_STATUS_BADGE: Record<
  BookingStatus,
  {
    label: string;
    variant: "secondary" | "success" | "destructive" | "warning" | "outline";
  }
> = {
  confirmed: { label: "Confirmado (aguardando check-in)", variant: "warning" },
  checked_in: { label: "Check-in realizado", variant: "success" },
  attended: { label: "Presente", variant: "success" },
  no_show: { label: "Falta (no_show)", variant: "destructive" },
  canceled: { label: "Cancelado", variant: "outline" },
};

export function TeacherSessionCard({
  session,
}: {
  session: TeacherSessionView;
}) {
  const [feedback, setFeedback] = useState<{
    error?: string;
    success?: string;
  }>({});
  const [isPending, startTransition] = useTransition();

  const activeBookings = session.bookings.filter(
    (b) => b.status !== "canceled",
  );

  function handleAttendance(bookingId: string, status: "attended" | "no_show") {
    setFeedback({});
    startTransition(async () => {
      const res = await markBookingAttendanceAction(bookingId, status);
      setFeedback(res);
    });
  }

  function handleCancelSession() {
    setFeedback({});
    startTransition(async () => {
      const res = await cancelTeacherSessionAction(session.sessionId);
      setFeedback(res);
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">
              {session.startsAtFormatted} ({session.durationMinutes} min)
            </CardTitle>
            <CardDescription>
              Vagas ocupadas: {activeBookings.length}/{session.capacity}
              {session.topicTheme ? ` • Tema: ${session.topicTheme}` : ""}
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {session.lockedLevel ? (
              <Badge variant="default">
                {PROFICIENCY_LEVEL_META[session.lockedLevel].label}
              </Badge>
            ) : (
              <Badge variant="outline">Nível aberto (1º aluno define)</Badge>
            )}

            <Badge
              variant={
                session.status === "full"
                  ? "success"
                  : session.status === "in_progress"
                    ? "warning"
                    : "secondary"
              }
            >
              {session.status}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {feedback.error ? (
          <Alert variant="destructive">
            <AlertDescription>{feedback.error}</AlertDescription>
          </Alert>
        ) : null}

        {feedback.success ? (
          <Alert variant="success">
            <AlertDescription>{feedback.success}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Video className="h-4 w-4 text-primary" />
            <span className="font-medium">Google Meet da sessão</span>
          </div>
          <a
            href={session.meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Abrir sala
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {session.sharedInterests.length > 0 ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
            <p className="flex items-center gap-1.5 font-semibold">
              <Sparkles className="h-3.5 w-3.5" />
              Afinidade de interesses entre a dupla 1v2:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {session.sharedInterests.map((tag) => (
                <Badge key={tag} variant="success">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {activeBookings.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            <span>Nenhum aluno reservado neste horário ainda.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={handleCancelSession}
            >
              <Trash2 className="h-4 w-4" />
              Cancelar horário
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {activeBookings.map((booking) => {
              const statusInfo = BOOKING_STATUS_BADGE[booking.status];
              const whatsappUrl = buildCheckInReminderWhatsAppUrl({
                whatsappE164: booking.whatsappE164,
                studentName: booking.studentName,
                startsAtFormatted: session.startsAtFormatted,
                meetUrl: session.meetUrl,
              });

              return (
                <div
                  key={booking.bookingId}
                  className="space-y-2 rounded-md border bg-background p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{booking.studentName}</p>
                      {booking.checkedInAtFormatted ? (
                        <p className="text-xs text-muted-foreground">
                          Check-in às {booking.checkedInAtFormatted}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant={statusInfo.variant}>
                      {statusInfo.label}
                    </Badge>
                  </div>

                  {booking.interestsTags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {booking.interestsTags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        booking.status === "attended" ? "default" : "outline"
                      }
                      disabled={isPending}
                      onClick={() =>
                        handleAttendance(booking.bookingId, "attended")
                      }
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Presente
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant={
                        booking.status === "no_show" ? "destructive" : "outline"
                      }
                      disabled={isPending}
                      onClick={() =>
                        handleAttendance(booking.bookingId, "no_show")
                      }
                    >
                      <UserX className="h-3.5 w-3.5" />
                      Falta (no_show)
                    </Button>

                    {whatsappUrl ? (
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 text-xs font-medium text-emerald-900 transition-colors hover:bg-emerald-100"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Lembrete + Meet (wa.me)
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}

            <p className="text-xs text-muted-foreground">
              Regra de falta 1v2: se apenas 1 aluno comparecer, conduza 1v1 sem
              custo extra ao presente e marque o ausente como{" "}
              <strong>no_show</strong> (sem reposição).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
