"use client";

import { useRef, useState, useTransition } from "react";
import { Mic, Square, Upload } from "lucide-react";
import {
  submitScreeningAction,
  type ScreeningSubmitState,
} from "@/modules/screening/actions";
import {
  INTEREST_OPTIONS,
  SCREENING_MAX_AUDIO_BYTES,
} from "@/modules/screening/domain";
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
import { Label } from "@/shared/components/ui/label";
import type { PostClassDeliveryChannel } from "@/shared/types/database";

function pickSupportedRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    return "audio/webm";
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "audio/webm";
}

interface ScreeningSubmissionFormProps {
  initialInterests: string[];
  initialDeliveryChannel?: PostClassDeliveryChannel;
}

export function ScreeningSubmissionForm({
  initialInterests,
  initialDeliveryChannel = "platform",
}: ScreeningSubmissionFormProps) {
  const [selectedInterests, setSelectedInterests] =
    useState<string[]>(initialInterests);
  const [deliveryChannel, setDeliveryChannel] =
    useState<PostClassDeliveryChannel>(initialDeliveryChannel);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const [result, setResult] = useState<ScreeningSubmitState>({});
  const [isPending, startTransition] = useTransition();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function toggleInterest(interest: string) {
    setSelectedInterests((prev) => {
      if (prev.includes(interest)) {
        return prev.filter((item) => item !== interest);
      }
      if (prev.length >= 6) {
        return prev;
      }
      return [...prev, interest];
    });
  }

  async function startRecording() {
    setRecorderError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickSupportedRecorderMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.includes("mp4")
          ? "m4a"
          : mimeType.includes("ogg")
            ? "ogg"
            : "webm";
        const recordedFile = new File([blob], `triagem.${ext}`, {
          type: mimeType,
        });

        if (audioPreviewUrl) {
          URL.revokeObjectURL(audioPreviewUrl);
        }
        setAudioFile(recordedFile);
        setAudioPreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setRecorderError(
        "Não foi possível acessar o microfone. Você pode enviar um arquivo de áudio gravado no celular logo abaixo.",
      );
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    setRecorderError(null);
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > SCREENING_MAX_AUDIO_BYTES) {
      setRecorderError("O arquivo selecionado ultrapassa o limite de 5 MB.");
      return;
    }

    if (audioPreviewUrl) {
      URL.revokeObjectURL(audioPreviewUrl);
    }
    setAudioFile(file);
    setAudioPreviewUrl(URL.createObjectURL(file));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult({});

    if (!audioFile) {
      setResult({
        error:
          "Grave ou selecione um arquivo de áudio em inglês antes de enviar.",
      });
      return;
    }

    if (selectedInterests.length === 0) {
      setResult({
        error: "Selecione pelo menos 1 interesse real para suas aulas.",
      });
      return;
    }

    const formData = new FormData();
    formData.append("audio", audioFile);
    formData.append("deliveryChannel", deliveryChannel);
    selectedInterests.forEach((interest) =>
      formData.append("interests", interest),
    );

    startTransition(async () => {
      const response = await submitScreeningAction({}, formData);
      setResult(response);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Triagem de Nível e Preferências</CardTitle>
        <CardDescription>
          Fale por 30 a 60 segundos em inglês sobre sua rotina, trabalho ou algo
          que você gosta. O áudio fica em armazenamento privado e expira em 30
          dias (LGPD).
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          {result.error ? (
            <Alert variant="destructive">
              <AlertDescription>{result.error}</AlertDescription>
            </Alert>
          ) : null}

          {result.success ? (
            <Alert variant="success">
              <AlertDescription>{result.success}</AlertDescription>
            </Alert>
          ) : null}

          {recorderError ? (
            <Alert variant="warning">
              <AlertDescription>{recorderError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-3">
            <Label>1. Grave seu áudio ou envie um arquivo (máx. 5 MB)</Label>
            <div className="flex flex-col gap-3 sm:flex-row">
              {!isRecording ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={startRecording}
                  className="w-full sm:w-auto"
                >
                  <Mic className="h-4 w-4" />
                  Gravar no navegador
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={stopRecording}
                  className="w-full sm:w-auto"
                >
                  <Square className="h-4 w-4" />
                  Parar gravação
                </Button>
              )}

              <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground sm:w-auto">
                <Upload className="h-4 w-4" />
                Enviar arquivo (mp3, m4a, webm, ogg)
                <input
                  type="file"
                  accept="audio/webm,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/ogg"
                  onChange={handleFileSelect}
                  className="sr-only"
                />
              </label>
            </div>

            {audioPreviewUrl && audioFile ? (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  Áudio pronto: <strong>{audioFile.name}</strong> (
                  {(audioFile.size / 1024).toFixed(0)} KB)
                </p>
                <audio controls src={audioPreviewUrl} className="w-full" />
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>2. Escolha de 1 a 6 temas do seu interesse real</Label>
              <span className="text-xs text-muted-foreground">
                {selectedInterests.length}/6 selecionados
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((interest) => {
                const active = selectedInterests.includes(interest);
                return (
                  <button
                    key={interest}
                    type="button"
                    onClick={() => toggleInterest(interest)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background text-foreground hover:bg-accent"
                    }`}
                  >
                    {interest}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5">
            <Label>
              3. Onde você prefere receber o material pós-aula gerado com IA?
            </Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDeliveryChannel("platform")}
                className={`rounded-md border p-3 text-left transition-colors ${
                  deliveryChannel === "platform"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                <p className="text-sm font-medium">Dentro da plataforma</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Leia suas correções, exercício de escrita e gabarito na aba
                  Atividades.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setDeliveryChannel("whatsapp")}
                className={`rounded-md border p-3 text-left transition-colors ${
                  deliveryChannel === "whatsapp"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                <p className="text-sm font-medium">No meu WhatsApp</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Receba o resumo e a atividade no WhatsApp (também fica salvo
                  na plataforma por 30 dias).
                </p>
              </button>
            </div>
          </div>
        </CardContent>

        <CardFooter>
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={isPending || isRecording}
          >
            {isPending
              ? "Enviando triagem..."
              : "Enviar triagem para avaliação"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
