import { GoogleGenAI } from "@google/genai";
import type { SanitizedAiPromptPayload } from "@/modules/post-class/domain";

export interface AiGenerationResult {
  ok: boolean;
  draftMarkdown?: string;
  provider: "gemini" | "fallback";
  error?: string;
}

/**
 * Abstração de provedor de IA para evitar vendor lock-in.
 */
export interface AIActivityGenerator {
  generate(payload: SanitizedAiPromptPayload): Promise<AiGenerationResult>;
}

function buildSystemPrompt(payload: SanitizedAiPromptPayload): string {
  const interests =
    payload.interestsTags.length > 0
      ? payload.interestsTags.join(", ")
      : "everyday conversation";

  return [
    "You are an experienced Brazilian English teacher focused on adult output (speaking and writing).",
    "NEVER ask for or include any personal identifying information.",
    `Student speaking level: ${payload.proficiencyLevel}.`,
    `Student real-life interests: ${interests}.`,
    "Based ONLY on the teacher's anonymous linguistic notes below, produce a concise, mobile-friendly Markdown document in Portuguese (with English examples/exercises) containing EXACTLY these 3 headings:",
    "## 1. Feedback e Correções da Aula",
    "(Organize the main grammar, vocabulary, or pronunciation corrections cleanly in bullet points: 'Como foi dito' -> 'Forma mais natural'.)",
    "## 2. Atividade de Escrita Personalizada",
    "(Create a short, engaging 5-to-8 minute writing exercise connected to the student's interests and the exact errors from class. No submission needed — self-practice.)",
    "## 3. Gabarito e Notas de Correção",
    "(Provide clear model answers and self-check notes so the student can verify their own writing.)",
    "",
    "Anonymous teacher notes:",
    payload.sanitizedTeacherNotes,
  ].join("\n");
}

class GeminiActivityGenerator implements AIActivityGenerator {
  async generate(
    payload: SanitizedAiPromptPayload,
  ): Promise<AiGenerationResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        provider: "fallback",
        error:
          "Chave GEMINI_API_KEY não configurada no servidor. Você pode continuar editando manualmente abaixo.",
      };
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: buildSystemPrompt(payload),
      });

      const text = response.text?.trim();
      if (!text) {
        return {
          ok: false,
          provider: "gemini",
          error:
            "A IA retornou uma resposta vazia. Você pode continuar editando manualmente.",
        };
      }

      return {
        ok: true,
        draftMarkdown: text,
        provider: "gemini",
      };
    } catch (err) {
      return {
        ok: false,
        provider: "gemini",
        error:
          err instanceof Error
            ? `Falha temporária na API Gemini (${err.message}). Use o editor manual normalmente.`
            : "Falha temporária na API Gemini. Use o editor manual normalmente.",
      };
    }
  }
}

export function getAIActivityGenerator(): AIActivityGenerator {
  return new GeminiActivityGenerator();
}
