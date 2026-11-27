"use client";

import { useState, useTransition } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Video,
  XCircle,
} from "lucide-react";
import { performCheckInAction } from "@/modules/checkin/actions";
import type { CheckInWindowState } from "@/modules/checkin/domain";
import {
  bookSessionAction,
  cancelBookingAction,
} from "@/modules/scheduling/actions";
import { PROFICIENCY_LEVEL_META } from "@/modules/screening/domain";
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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import type { BookingStatus, ProficiencyLevel } from "@/shared/types/database";

/**
 * Slot aberto exibido ao aluno: NUNCA contém meet_url.
 */
export interface StudentOpenSlotView {
  sessionId: string;
  startsAtFormatted: string;
  durationMinutes: number;
  capacity: number;
  activeBookingsCount: number;
  lockedLevel: ProficiencyLevel | null;
  topicTheme: string | null;
}

export interface StudentBookingView {
  bookingId: string;
  sessionId: string;
  status: BookingStatus;
  startsAtFormatted: string;
  durationMinutes: number;
  topicTheme: string | null;
  canCancelWithRefund: boolean;
  checkInWindowState: CheckInWindowState;
  checkedInAtFormatted: string | null;
  /** Só preenchido quando o aluno já fez check-in confirmado. */
  meetUrl: string | null;
}

interface StudentScheduleClientProps {
  studentLevel: ProficiencyLevel;
  openSlots: StudentOpenSlotView[];
  myBookings: StudentBookingView[];
  hasActiveSubscription: boolean;
}

export function StudentScheduleClient({
  studentLevel,
  openSlots,
  myBookings,
  hasActiveSubscription,
}: StudentScheduleClientProps) {
  const [feedback, setFeedback] = useState<{
    error?: string;
    success?: string;
  }>({});
  const [unlockedMeetByBooking, setUnlockedMeetByBooking] = useState<
    Record<string, string>
  >({});
  const [isPending, startTransition] = useTransition();

  function handleBook(sessionId: string) {
    setFeedback({});
    startTransition(async () => {
      const res = await bookSessionAction(sessionId);
      setFeedback(res);
    });
  }

  function handleCancel(bookingId: string) {
    setFeedback({});
    startTransition(async () => {
      const res = await cancelBookingAction(bookingId);
      setFeedback(res);
    });
  }

  function handleCheckIn(bookingId: string) {
    setFeedback({});
    startTransition(async () => {
      const res = await performCheckInAction(bookingId);
      if (res.error) {
        setFeedback({ error: res.error });
        return;
      }
      if (res.meetUrl) {
        setUnlockedMeetByBooking((prev) => ({
          ...prev,
          [bookingId]: res.meetUrl!,
        }));
      }
      setFeedback({
        success:
          "Check-in confirmado! O link do Google Meet está liberado abaixo.",
      });
    });
  }

  return (
    <div className="space-y-8">
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

      {!hasActiveSubscription ? (
        <Alert variant="warning">
          <AlertTitle>Assinatura inativa ou expirada</AlertTitle>
          <AlertDescription>
            Você não possui uma assinatura ativa vigente no momento para novas
            reservas.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Seção 1: Minhas Reservas e Check-in (10 min antes) */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          Minhas Reservas e Check-in ({myBookings.length})
        </h2>

        {myBookings.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Você ainda não tem aulas agendadas
              </CardTitle>
              <CardDescription>
                Escolha abaixo um horário compatível com o seu nível{" "}
                <strong>{PROFICIENCY_LEVEL_META[studentLevel].label}</strong>.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-4">
            {myBookings.map((booking) => {
              const effectiveMeetUrl =
                unlockedMeetByBooking[booking.bookingId] ?? booking.meetUrl;
              const isCheckedIn =
                booking.status === "checked_in" ||
                Boolean(unlockedMeetByBooking[booking.bookingId]);

              return (
                <Card key={booking.bookingId}>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">
                          {booking.startsAtFormatted} ({booking.durationMinutes}{" "}
                          min)
                        </CardTitle>
                        {booking.topicTheme ? (
                          <CardDescription>
                            Tema sugerido: {booking.topicTheme}
                          </CardDescription>
                        ) : null}
                      </div>

                      <Badge
                        variant={
                          isCheckedIn || booking.status === "attended"
                            ? "success"
                            : booking.status === "no_show"
                              ? "destructive"
                              : "warning"
                        }
                      >
                        {isCheckedIn
                          ? "Check-in realizado"
                          : booking.status === "attended"
                            ? "Presente"
                            : booking.status === "no_show"
                              ? "Falta (sem reposição)"
                              : "Reserva confirmada"}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {/* Link do Google Meet destacado imediatamente após check-in */}
                    {effectiveMeetUrl ? (
                      <div className="flex flex-col justify-between gap-3 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-2 text-emerald-950">
                          <Video className="h-5 w-5" />
                          <div>
                            <p className="font-semibold">
                              Sala Google Meet liberada!
                            </p>
                            <p className="text-xs text-emerald-800">
                              Clique ao lado para entrar na aula ao vivo 1v2.
                            </p>
                          </div>
                        </div>
                        <a
                          href={effectiveMeetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-800"
                        >
                          Entrar no Google Meet
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    ) : booking.status === "confirmed" ? (
                      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                        {booking.checkInWindowState === "too_early" ? (
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4" />O botão de check-in e o
                            link do Google Meet abrem exatamente{" "}
                            <strong>10 minutos antes</strong> do início da aula.
                          </span>
                        ) : booking.checkInWindowState === "open" ? (
                          <span className="font-medium text-primary">
                            Janela de check-in aberta! Confirme sua presença
                            agora para liberar o link do Google Meet.
                          </span>
                        ) : (
                          <span>
                            A janela de check-in (até 10 min após o início) foi
                            encerrada.
                          </span>
                        )}
                      </div>
                    ) : null}
                  </CardContent>

                  {booking.status === "confirmed" && !isCheckedIn ? (
                    <CardFooter className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        disabled={
                          isPending || booking.checkInWindowState !== "open"
                        }
                        onClick={() => handleCheckIn(booking.bookingId)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Fazer check-in e abrir Meet
                      </Button>

                      {booking.canCancelWithRefund ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => handleCancel(booking.bookingId)}
                        >
                          <XCircle className="h-4 w-4" />
                          Cancelar reserva (devolve saldo)
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Cancelamento bloqueado (&lt; 12h para a aula).
                        </span>
                      )}
                    </CardFooter>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Seção 2: Horários Disponíveis Compatíveis com o Nível */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">
            Horários disponíveis para o seu nível ({openSlots.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Exibindo apenas janelas abertas compatíveis com{" "}
            <strong>{PROFICIENCY_LEVEL_META[studentLevel].label}</strong>.
          </p>
        </div>

        {openSlots.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Nenhum horário compatível aberto agora
              </CardTitle>
              <CardDescription>
                Novas janelas de sexta e sábado são abertas periodicamente pelo
                professor.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {openSlots.map((slot) => (
              <Card key={slot.sessionId}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">
                      {slot.startsAtFormatted}
                    </CardTitle>
                    <Badge variant="secondary">
                      {slot.activeBookingsCount}/{slot.capacity} vagas
                    </Badge>
                  </div>
                  <CardDescription>
                    Duração: {slot.durationMinutes} min
                    {slot.topicTheme ? ` • ${slot.topicTheme}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    {slot.lockedLevel
                      ? `1 aluno do seu nível (${slot.lockedLevel}) já reservou — última vaga 1v2!`
                      : "Horário livre — você será o 1º aluno e travará este horário para o seu nível."}
                  </p>
                </CardContent>
                <CardFooter>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={isPending || !hasActiveSubscription}
                    onClick={() => handleBook(slot.sessionId)}
                  >
                    <CalendarCheck className="h-4 w-4" />
                    Reservar vaga 1v2
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
