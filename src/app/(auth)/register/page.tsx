"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { signUpAction, type AuthActionState } from "@/modules/auth/actions";
import { COMMON_TIMEZONES, DEFAULT_TIMEZONE } from "@/modules/auth/domain";
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

const initialState: AuthActionState = {};

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(
    signUpAction,
    initialState,
  );
  const [detectedTimezone, setDetectedTimezone] =
    useState<string>(DEFAULT_TIMEZONE);

  useEffect(() => {
    try {
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (browserTz) {
        setDetectedTimezone(browserTz);
      }
    } catch {
      setDetectedTimezone(DEFAULT_TIMEZONE);
    }
  }, []);

  const timezoneOptions = Array.from(
    new Set([detectedTimezone, ...COMMON_TIMEZONES]),
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Criar conta de aluno</CardTitle>
          <CardDescription>
            Cadastro exclusivo para maiores de 18 anos com base mínima em
            inglês. Após entrar, você enviará seu áudio de triagem.
          </CardDescription>
        </CardHeader>

        <form action={formAction}>
          <CardContent className="space-y-4">
            {state.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="fullName">Nome completo</Label>
              <Input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                placeholder="Seu nome completo"
                required
              />
              {state.fieldErrors?.fullName?.[0] ? (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.fullName[0]}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@exemplo.com"
                required
              />
              {state.fieldErrors?.email?.[0] ? (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.email[0]}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="whatsapp">WhatsApp (com DDD)</Label>
              <Input
                id="whatsapp"
                name="whatsapp"
                type="tel"
                autoComplete="tel"
                placeholder="(11) 99999-9999"
                required
              />
              {state.fieldErrors?.whatsapp?.[0] ? (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.whatsapp[0]}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="timezone">Fuso horário</Label>
              <select
                id="timezone"
                name="timezone"
                value={detectedTimezone}
                onChange={(e) => setDetectedTimezone(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Detectado automaticamente do seu navegador. Todos os horários de
                aula são salvos em UTC e exibidos no seu fuso.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Senha (mínimo 8 caracteres)</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
              {state.fieldErrors?.password?.[0] ? (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.password[0]}
                </p>
              ) : null}
            </div>

            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  name="isAdultConfirmed"
                  required
                  className="mt-1 h-4 w-4 rounded border-input"
                />
                <span>
                  Confirmo que tenho <strong>18 anos ou mais</strong>.
                </span>
              </label>
              {state.fieldErrors?.isAdultConfirmed?.[0] ? (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.isAdultConfirmed[0]}
                </p>
              ) : null}

              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  name="lgpdConsentAccepted"
                  required
                  className="mt-1 h-4 w-4 rounded border-input"
                />
                <span>
                  Aceito o <strong>Termo de Consentimento LGPD</strong>:
                  autorizo o uso dos meus dados de contato, interesses e áudio
                  de triagem exclusivamente para classificação de nível e
                  pareamento 1v2, ciente de que áudios e materiais pós-aula são
                  retidos por no máximo <strong>30 dias</strong>.
                </span>
              </label>
              {state.fieldErrors?.lgpdConsentAccepted?.[0] ? (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.lgpdConsentAccepted[0]}
                </p>
              ) : null}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Criando conta..." : "Criar conta e continuar"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Já possui conta?{" "}
              <Link
                href="/login"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Entrar
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
