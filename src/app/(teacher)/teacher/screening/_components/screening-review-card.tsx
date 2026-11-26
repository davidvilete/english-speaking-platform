"use client";

import { useActionState, useState, useTransition } from "react";
import { ExternalLink, Headphones, MessageCircle } from "lucide-react";
import {
  getScreeningSignedAudioUrlAction,
  reviewScreeningAction,
  type ReviewScreeningActionState,
} from "@/modules/screening/actions";
import {
  buildScreeningOutcomeWhatsAppUrl,
  PROFICIENCY_LEVEL_META,
} from "@/modules/screening/domain";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
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
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import type {
  ApprovedProficiencyLevel,
  ProficiencyLevel,
  ScreeningStatus,
} from "@/shared/types/database";

export interface ScreeningReviewItem {
  submissionId: string;
  status: ScreeningStatus;
  createdAtFormatted: string;
  expiresAtFormatted: string;
  teacherNotes: string | null;
  student: {
    id: string;
    fullName: string;
    whatsappE164: string;
    interestsTags: string[];
    proficiencyLevel: ProficiencyLevel | null;
  };
}

const initialReviewState: ReviewScreeningActionState = {};

export function ScreeningReviewCard({ item }: { item: ScreeningReviewItem }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isLoadingAudio, startAudioTransition] = useTransition();
  const [decision, setDecision] = useState<"approved" | "redirected">(
    item.status === "redirected" ? "redirected" : "approved",
  );
  const [state, formAction, isSaving] = useActionState(
    reviewScreeningAction,
    initialReviewState,
  );

  function handleLoadAudio() {
    setAudioError(null);
    startAudioTransition(async () => {
      const response = await getScreeningSignedAudioUrlAction(
        item.submissionId,
      );
      if (response.error || !response.signedUrl) {
        setAudioError(
          response.error ?? "Não foi possível carregar o áudio temporário.",
        );
        return;
      }
      setSignedUrl(response.signedUrl);
    });
  }

  const existingWhatsAppUrl =
    item.status !== "pending"
      ? buildScreeningOutcomeWhatsAppUrl({
          whatsappE164: item.student.whatsappE164,
          studentName: item.student.fullName,
          decision: item.status === "approved" ? "approved" : "redirected",
          proficiencyLevel:
            item.student.proficiencyLevel &&
            item.student.proficiencyLevel !== "REDIRECTED_EXTERNAL"
              ? (item.student.proficiencyLevel as ApprovedProficiencyLevel)
              : undefined,
        })
      : null;

  const whatsappUrl = state.whatsappUrl ?? existingWhatsAppUrl;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{item.student.fullName}</CardTitle>
            <CardDescription>
              Enviado em {item.createdAtFormatted} • Expira em{" "}
              {item.expiresAtFormatted}
            </CardDescription>
          </div>

          <Badge
            variant={
              item.status === "pending"
                ? "warning"
                : item.status === "approved"
                  ? "success"
                  : "secondary"
            }
          >
            {item.status === "pending"
              ? "Pendente"
              : item.status === "approved"
                ? `Aprovado (${item.student.proficiencyLevel ?? ""})`
                : "Redirecionado"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {item.student.interestsTags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {item.student.interestsTags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        ) : null}

        {/* Reprodução segura via Signed URL temporária (5 min) */}
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          {!signedUrl ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleLoadAudio}
              disabled={isLoadingAudio}
            >
              <Headphones className="h-4 w-4" />
              {isLoadingAudio
                ? "Gerando link temporário..."
                : "Ouvir áudio de triagem (link expira em 5 min)"}
            </Button>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                Link privado temporário ativo por 5 minutos:
              </p>
              <audio controls src={signedUrl} className="w-full" />
            </div>
          )}

          {audioError ? (
            <p className="text-xs text-destructive">{audioError}</p>
          ) : null}
        </div>

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

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="submissionId" value={item.submissionId} />
          <input type="hidden" name="decision" value={decision} />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={decision === "approved" ? "default" : "outline"}
              onClick={() => setDecision("approved")}
            >
              Aprovar e classificar nível
            </Button>
            <Button
              type="button"
              size="sm"
              variant={decision === "redirected" ? "destructive" : "outline"}
              onClick={() => setDecision("redirected")}
            >
              Sem base mínima (Redirecionar)
            </Button>
          </div>

          {decision === "approved" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`level-${item.submissionId}`}>
                Nível de fala para pareamento 1v2 (libera plano Trial
                automaticamente)
              </Label>
              <select
                id={`level-${item.submissionId}`}
                name="proficiencyLevel"
                defaultValue={
                  item.student.proficiencyLevel &&
                  item.student.proficiencyLevel !== "REDIRECTED_EXTERNAL"
                    ? item.student.proficiencyLevel
                    : "B1_INTERMEDIATE"
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="A2_BASE">
                  {PROFICIENCY_LEVEL_META.A2_BASE.label}
                </option>
                <option value="B1_INTERMEDIATE">
                  {PROFICIENCY_LEVEL_META.B1_INTERMEDIATE.label}
                </option>
                <option value="B2_UPPER">
                  {PROFICIENCY_LEVEL_META.B2_UPPER.label}
                </option>
              </select>
            </div>
          ) : (
            <Alert variant="warning">
              <AlertDescription>
                O candidato verá uma orientação cordial recomendando cursos de
                base das 4 habilidades (Mairo Vergara, Fluency Academy) e não
                poderá agendar sessões 1v2.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`notes-${item.submissionId}`}>
              {decision === "redirected"
                ? "Orientação cordial para o candidato (obrigatória)"
                : "Observações da triagem (opcional)"}
            </Label>
            <Textarea
              id={`notes-${item.submissionId}`}
              name="teacherNotes"
              defaultValue={item.teacherNotes ?? ""}
              required={decision === "redirected"}
              placeholder={
                decision === "redirected"
                  ? "Ex.: Parabéns pela iniciativa! Para aproveitar melhor o formato 1v2, recomendamos fortalecer a base de listening e vocabulário..."
                  : "Ex.: Boa compreensão, precisa destravar tempos verbais no passado."
              }
            />
          </div>

          <CardFooter className="flex flex-wrap items-center gap-3 p-0 pt-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Salvando avaliação..." : "Salvar avaliação"}
            </Button>

            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 transition-colors hover:bg-emerald-100"
              >
                <MessageCircle className="h-4 w-4" />
                Avisar no WhatsApp (1 clique)
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
