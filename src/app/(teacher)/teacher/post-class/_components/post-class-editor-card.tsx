"use client";

import { useState, useTransition } from "react";
import {
  ExternalLink,
  MessageCircle,
  Save,
  Send,
  Sparkles,
} from "lucide-react";
import {
  generatePostClassDraftAction,
  savePostClassMaterialAction,
} from "@/modules/post-class/actions";
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
  PostClassDeliveryChannel,
  PostClassStatus,
  ProficiencyLevel,
} from "@/shared/types/database";

export interface PostClassEditorItem {
  sessionId: string;
  studentId: string;
  studentName: string;
  studentLevel: ProficiencyLevel | null;
  deliveryChannel: PostClassDeliveryChannel;
  sessionStartsAtFormatted: string;
  initialRawNotes: string;
  initialAiDraft: string | null;
  initialFinalContent: string;
  initialStatus: PostClassStatus | null;
  existingWhatsAppUrl: string | null;
}

export function PostClassEditorCard({ item }: { item: PostClassEditorItem }) {
  const [rawNotes, setRawNotes] = useState(item.initialRawNotes);
  const [aiDraft, setAiDraft] = useState<string | null>(item.initialAiDraft);
  const [finalContent, setFinalContent] = useState(item.initialFinalContent);
  const [status, setStatus] = useState<PostClassStatus | null>(
    item.initialStatus,
  );
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(
    item.existingWhatsAppUrl,
  );
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isGenerating, startGenerateTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();

  function handleGenerateWithAi() {
    setError(null);
    setWarning(null);
    setSuccess(null);

    startGenerateTransition(async () => {
      const res = await generatePostClassDraftAction({
        sessionId: item.sessionId,
        studentId: item.studentId,
        teacherRawNotes: rawNotes,
      });

      if (res.error) {
        setError(res.error);
        return;
      }

      if (res.warning) {
        setWarning(res.warning);
      }

      if (res.draftMarkdown) {
        if (!res.usedFallback) {
          setAiDraft(res.draftMarkdown);
        }
        setFinalContent(res.draftMarkdown);
      }
    });
  }

  function handleSave(targetStatus: "draft" | "published") {
    setError(null);
    setWarning(null);
    setSuccess(null);

    startSaveTransition(async () => {
      const res = await savePostClassMaterialAction({
        sessionId: item.sessionId,
        studentId: item.studentId,
        teacherRawNotes: rawNotes,
        aiGeneratedDraft: aiDraft,
        finalContentMarkdown: finalContent,
        status: targetStatus,
      });

      if (res.error) {
        setError(res.error);
        return;
      }

      setStatus(targetStatus);
      setSuccess(res.success ?? "Salvo com sucesso.");
      if (res.whatsappUrl) {
        setWhatsappUrl(res.whatsappUrl);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{item.studentName}</CardTitle>
            <CardDescription>
              Aula em {item.sessionStartsAtFormatted}
              {item.studentLevel ? ` • Nível: ${item.studentLevel}` : ""}
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                item.deliveryChannel === "whatsapp" ? "warning" : "outline"
              }
            >
              Preferência:{" "}
              {item.deliveryChannel === "whatsapp" ? "WhatsApp" : "Plataforma"}
            </Badge>
            <Badge
              variant={
                status === "published"
                  ? "success"
                  : status === "draft"
                    ? "secondary"
                    : "outline"
              }
            >
              {status === "published"
                ? "Publicado"
                : status === "draft"
                  ? "Rascunho"
                  : "Pendente"}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {warning ? (
          <Alert variant="warning">
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        ) : null}

        {success ? (
          <Alert variant="success">
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor={`raw-${item.sessionId}-${item.studentId}`}>
            1. Anotações rápidas da aula (erros observados, vocabulário e temas)
          </Label>
          <Textarea
            id={`raw-${item.sessionId}-${item.studentId}`}
            value={rawNotes}
            onChange={(e) => setRawNotes(e.target.value)}
            placeholder="Ex.: Trocou 'make a travel' por 'take a trip'; dificuldade em passado simples com verbos irregulares (went, bought); tema discutido: viagem de férias."
          />
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-xs text-muted-foreground">
              Segurança LGPD: nenhum nome, e-mail ou WhatsApp é enviado à IA.
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isGenerating || rawNotes.trim().length < 10}
              onClick={handleGenerateWithAi}
            >
              <Sparkles className="h-4 w-4" />
              {isGenerating
                ? "Gerando rascunho..."
                : "Gerar rascunho com IA (Gemini)"}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`final-${item.sessionId}-${item.studentId}`}>
            2. Material final revisável (Feedback + Atividade Escrita +
            Gabarito)
          </Label>
          <Textarea
            id={`final-${item.sessionId}-${item.studentId}`}
            className="min-h-[220px] font-mono text-xs"
            value={finalContent}
            onChange={(e) => setFinalContent(e.target.value)}
            placeholder="Revise o rascunho gerado pela IA ou escreva manualmente (fallback sempre disponível)..."
          />
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isSaving || finalContent.trim().length < 10}
          onClick={() => handleSave("draft")}
        >
          <Save className="h-4 w-4" />
          Salvar rascunho
        </Button>

        <Button
          type="button"
          disabled={isSaving || finalContent.trim().length < 10}
          onClick={() => handleSave("published")}
        >
          <Send className="h-4 w-4" />
          {isSaving ? "Publicando..." : "Publicar para o aluno"}
        </Button>

        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 text-sm font-medium text-emerald-900 transition-colors hover:bg-emerald-100"
          >
            <MessageCircle className="h-4 w-4" />
            {item.deliveryChannel === "whatsapp"
              ? "Enviar atividade no WhatsApp (escolha do aluno)"
              : "Avisar no WhatsApp (1 clique)"}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </CardFooter>
    </Card>
  );
}
