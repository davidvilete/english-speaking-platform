import Link from "next/link";
import {
  Activity,
  CreditCard,
  Download,
  Headphones,
  ShieldAlert,
} from "lucide-react";
import { EXPORTABLE_TABLES } from "@/modules/audit/domain";
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
            Supervisão operacional, comercial e observabilidade da plataforma
            Output 1v2.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Assinaturas e Pix</CardTitle>
              </div>
              <CardDescription>
                Ative planos, cancelamento Netflix e controle CDC 7 dias.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/admin/subscriptions">
                <Button className="w-full">Gerenciar</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Logs de Erro</CardTitle>
              </div>
              <CardDescription>
                Monitore erros críticos e alertas do servidor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/admin/logs">
                <Button variant="outline" className="w-full">
                  Ver logs
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Headphones className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Triagens</CardTitle>
              </div>
              <CardDescription>
                Acompanhe a fila de triagem por áudio.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/teacher/screening">
                <Button variant="outline" className="w-full">
                  Abrir fila
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Health Check</CardTitle>
              </div>
              <CardDescription>
                Status do banco usado pelo keep-alive preventivo.
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

        {/* Exportação Manual CSV / JSON (Contingência de Backup) */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">
                Exportação Manual de Dados (CSV / JSON)
              </CardTitle>
            </div>
            <CardDescription>
              Baixe um snapshot imediato das tabelas essenciais em JSON completo
              ou CSV individual para auditoria e backup manual.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <a href="/api/admin/export?format=json&table=all">
                <Button>
                  <Download className="h-4 w-4" />
                  Baixar Backup Completo (JSON)
                </Button>
              </a>
            </div>

            <div className="flex flex-wrap gap-2">
              {EXPORTABLE_TABLES.map((table) => (
                <a
                  key={table}
                  href={`/api/admin/export?format=csv&table=${table}`}
                >
                  <Button variant="outline" size="sm">
                    CSV: {table}
                  </Button>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
