import Link from "next/link";
import { Activity, CreditCard, Headphones } from "lucide-react";
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

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const { profile } = await requireRole(["admin"]);

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
            Painel Administrativo
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Supervisão operacional e comercial da plataforma Output 1v2.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Assinaturas e Pix</CardTitle>
              </div>
              <CardDescription>
                Ative planos Trial, Basic (R$ 65,90) e Intermediate (R$ 79,90),
                cancelamento Netflix e controle CDC 7 dias.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/admin/subscriptions">
                <Button className="w-full">Gerenciar assinaturas</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Headphones className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Triagens por Áudio</CardTitle>
              </div>
              <CardDescription>
                Acompanhe e avalie triagens junto ao professor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/teacher/screening">
                <Button variant="outline" className="w-full">
                  Abrir fila de triagem
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">
                  Health Check do Banco
                </CardTitle>
              </div>
              <CardDescription>
                Verifique o status do endpoint /api/health usado pelo keep-alive
                preventivo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a href="/api/health" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full">
                  Consultar /api/health
                </Button>
              </a>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
