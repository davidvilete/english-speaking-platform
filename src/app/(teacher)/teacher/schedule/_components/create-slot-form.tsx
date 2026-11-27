"use client";

import { useActionState } from "react";
import { CalendarPlus } from "lucide-react";
import {
  createAvailabilitySlotsAction,
  type ScheduleActionState,
} from "@/modules/scheduling/actions";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

const initialState: ScheduleActionState = {};

export function CreateSlotForm({ timezone }: { timezone: string }) {
  const [state, formAction, isPending] = useActionState(
    createAvailabilitySlotsAction,
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarPlus className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">
            Abrir horários na agenda (individual ou em lote)
          </CardTitle>
        </div>
        <CardDescription>
          Informe os horários no seu fuso local (<strong>{timezone}</strong>).
          Todos são salvos em UTC no banco e convertidos automaticamente para o
          fuso de cada aluno.
        </CardDescription>
      </CardHeader>

      <form action={formAction}>
        <input type="hidden" name="timezone" value={timezone} />

        <CardContent className="space-y-4">
          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          {state.success ? (
            <Alert variant="success">
              <AlertDescription>{state.success}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Data (sexta, sábado ou outro dia)</Label>
              <Input id="date" name="date" type="date" required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="times">Horários (separe por vírgula)</Label>
              <Input
                id="times"
                name="times"
                type="text"
                placeholder="18:00, 19:00, 20:00"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="durationMinutes">Duração (30 a 50 min)</Label>
              <Input
                id="durationMinutes"
                name="durationMinutes"
                type="number"
                min={30}
                max={50}
                defaultValue={45}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="meetUrl">Link do Google Meet</Label>
              <Input
                id="meetUrl"
                name="meetUrl"
                type="url"
                placeholder="https://meet.google.com/abc-defg-hij"
                required
              />
              <p className="text-xs text-muted-foreground">
                Aceita apenas links oficiais{" "}
                <code>https://meet.google.com/</code>. Nunca exibido em
                listagens abertas.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="topicTheme">Tema sugerido (opcional)</Label>
              <Input
                id="topicTheme"
                name="topicTheme"
                type="text"
                maxLength={120}
                placeholder="Ex.: Viagens, tecnologia ou tema livre dos alunos"
              />
            </div>
          </div>
        </CardContent>

        <CardFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Salvando horários..." : "Abrir horários na agenda"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
