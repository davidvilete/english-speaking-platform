import { describe, expect, it } from "vitest";
import {
  buildPostClassDeliveryWhatsAppUrl,
  buildPostClassManualTemplate,
  buildSanitizedAiPromptPayload,
  splitActivityAndAnswerKey,
  stripPiiFromText,
} from "@/modules/post-class/domain";

describe("post-class/domain", () => {
  describe("PII stripping for AI calls", () => {
    it("redacts emails, CPFs, and phone numbers from teacher notes", () => {
      const raw =
        "Aluno falou sobre trabalho. Contato: maria@teste.com, CPF 123.456.789-00, tel +55 (11) 98888-7777.";
      const sanitized = stripPiiFromText(raw);

      expect(sanitized).not.toContain("maria@teste.com");
      expect(sanitized).not.toContain("123.456.789-00");
      expect(sanitized).not.toContain("98888-7777");
      expect(sanitized).toContain("[REDACTED_EMAIL]");
      expect(sanitized).toContain("[REDACTED_CPF]");
      expect(sanitized).toContain("[REDACTED_PHONE]");
    });

    it("builds zero-PII prompt payload with fallback level when null", () => {
      const payload = buildSanitizedAiPromptPayload({
        proficiencyLevel: null,
        interestsTags: ["Viagens", "Tecnologia e IA"],
        teacherRawNotes: "Confundiu make e do. Email teste@a.com",
      });

      expect(payload.proficiencyLevel).toBe("B1_INTERMEDIATE");
      expect(payload.interestsTags).toEqual(["Viagens", "Tecnologia e IA"]);
      expect(payload.sanitizedTeacherNotes).not.toContain("teste@a.com");
    });
  });

  describe("manual fallback template and answer key splitting", () => {
    it("generates structured 3-section manual fallback template", () => {
      const tpl = buildPostClassManualTemplate("Usou 'I have 25 years'");
      expect(tpl).toContain("## 1. Feedback e Correções da Aula");
      expect(tpl).toContain("## 2. Atividade de Escrita Personalizada");
      expect(tpl).toContain("## 3. Gabarito e Notas de Correção");
    });

    it("splits main activity content from expandable answer key section", () => {
      const md = [
        "## 1. Feedback e Correções da Aula",
        "- Erro 1",
        "",
        "## 2. Atividade de Escrita Personalizada",
        "Escreva 3 frases.",
        "",
        "## 3. Gabarito e Notas de Correção",
        "- Modelo de resposta",
      ].join("\n");

      const { mainContent, answerKey } = splitActivityAndAnswerKey(md);
      expect(mainContent).toContain("## 2. Atividade de Escrita Personalizada");
      expect(mainContent).not.toContain("## 3. Gabarito");
      expect(answerKey).toContain("## 3. Gabarito e Notas de Correção");
    });
  });

  describe("WhatsApp delivery link based on student channel choice", () => {
    it("includes activity snippet when student chose whatsapp channel", () => {
      const url = buildPostClassDeliveryWhatsAppUrl({
        whatsappE164: "+5511999990000",
        studentName: "Lucas Ferreira",
        deliveryChannel: "whatsapp",
        contentMarkdown: "## 1. Feedback\nUse 'take a trip'.",
        appUrl: "https://app.example.com",
      });

      expect(url).toContain("https://wa.me/5511999990000?text=");
      const decoded = decodeURIComponent(url ?? "");
      expect(decoded).toContain("Olá Lucas!");
      expect(decoded).toContain("Use 'take a trip'.");
    });

    it("sends concise platform link notification when student chose platform channel", () => {
      const url = buildPostClassDeliveryWhatsAppUrl({
        whatsappE164: "+5511999990000",
        studentName: "Lucas Ferreira",
        deliveryChannel: "platform",
        contentMarkdown: "## 1. Feedback\nTexto longo...",
        appUrl: "https://app.example.com/",
      });

      const decoded = decodeURIComponent(url ?? "");
      expect(decoded).toContain("https://app.example.com/student/activities");
      expect(decoded).not.toContain("Texto longo...");
    });
  });
});
