import Link from "next/link";
import { ArrowRight, Mic, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-4 py-12 sm:px-6">
      <div className="space-y-4 text-center">
        <Badge variant="secondary">Piloto MVP • Conversação 1v2 (18+)</Badge>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Destrave sua fala e escrita em inglês com aulas ao vivo 1v2
        </h1>
        <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">
          Sessões de 30 a 50 minutos com 1 professor brasileiro e 2 alunos do
          mesmo nível de fala, baseadas nos seus interesses reais e com
          atividade escrita personalizada após cada aula.
        </p>

        <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
          <Link href="/register" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto">
              Criar conta e iniciar triagem
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/login" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="w-full sm:w-auto">
              Já tenho conta
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <Mic className="mb-1 h-5 w-5 text-primary" />
            <CardTitle className="text-base">1. Triagem por Áudio</CardTitle>
            <CardDescription>
              Envie um áudio curto em inglês e seus interesses reais para
              pareamento por nível equivalente.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <Users className="mb-1 h-5 w-5 text-primary" />
            <CardTitle className="text-base">2. Aulas ao Vivo 1v2</CardTitle>
            <CardDescription>
              Desconforto controlado com outro aluno do mesmo nível via Google
              Meet nas sextas e sábados.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <ShieldCheck className="mb-1 h-5 w-5 text-primary" />
            <CardTitle className="text-base">3. Pós-Aula Sob Medida</CardTitle>
            <CardDescription>
              Receba correções organizadas e atividade escrita personalizada com
              retenção segura de 30 dias (LGPD).
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card className="mt-6 bg-muted/40">
        <CardContent className="p-4 text-center text-xs text-muted-foreground">
          A plataforma atende exclusivamente adultos (18+) que já possuem base
          mínima para sustentar diálogo em inglês. Não ensinamos inglês do zero.
        </CardContent>
      </Card>
    </main>
  );
}
