import Link from "next/link";
import { ArrowRight, CalendarDays, Headphones } from "lucide-react";
import { requireRole } from "@/modules/auth/session";
import { AppHeader } from "@/shared/components/app-header";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeacherDashboardPage() {
  const { profile } = await requireRole(["teacher", "admin"]);
  const supabase = await createSupabaseServerClient();

  const [
    { count: pendingCount },
    { count: approvedCount },
    { count: openSessionsCount },
  ] = await Promise.all([
    supabase
      .from("screening_submissions")
      .select("id", { head: true, count: "exact" })
      .eq("status", "pending"),
    supabase
      .from("screening_submissions")
      .select("id", { head: true, count: "exact" })
      .eq("status", "approved"),
    supabase
      .from("class_sessions")
      .select("id", { head: true, count: "exact" })
      .in("status", ["open", "full", "in_progress"]),
  ]);

  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        timezone={profile.timezone}
      />

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Painel do Professor
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie triagens por áudio, horários disponíveis 1v2 e check-ins de
            presença.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Triagens Pendentes</CardDescription>
              <CardTitle className="text-3xl">{pendingCount ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Alunos Aprovados</CardDescription>
              <CardTitle className="text-3xl">{approvedCount ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Sessões Ativas na Agenda</CardDescription>
              <CardTitle className="text-3xl">
                {openSessionsCount ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                <CardTitle>Agenda e Presença (1v2)</CardTitle>
              </div>
              <CardDescription>
                Abra horários de sexta/sábado com link do Google Meet, acompanhe
                check-ins (10 min antes) e marque presença ou falta.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/teacher/schedule">
                <Button>
                  Gerenciar agenda
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Headphones className="h-5 w-5 text-primary" />
                <CardTitle>Fila de Triagem por Áudio</CardTitle>
              </div>
              <CardDescription>
                Ouça os áudios privados via Signed URL temporária (5 min),
                defina o nível de fala (A2, B1 ou B2) ou oriente iniciantes
                absolutos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/teacher/screening">
                <Button variant="outline">
                  Abrir painel de triagem
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
