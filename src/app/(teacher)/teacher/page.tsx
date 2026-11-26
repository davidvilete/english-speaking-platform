import Link from "next/link";
import { ArrowRight, Headphones } from "lucide-react";
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
    { count: redirectedCount },
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
      .from("screening_submissions")
      .select("id", { head: true, count: "exact" })
      .eq("status", "redirected"),
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
            Gerencie as triagens por áudio e classifique o nível de fala dos
            candidatos para o pareamento 1v2.
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
              <CardDescription>Redirecionados (Base)</CardDescription>
              <CardTitle className="text-3xl">{redirectedCount ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Headphones className="h-5 w-5 text-primary" />
              <CardTitle>Fila de Triagem por Áudio</CardTitle>
            </div>
            <CardDescription>
              Ouça os áudios privados via Signed URL temporária (5 min), defina
              o nível de fala (A2, B1 ou B2) liberando o plano Trial, ou oriente
              iniciantes absolutos para cursos externos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/teacher/screening">
              <Button>
                Abrir painel de triagem
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
