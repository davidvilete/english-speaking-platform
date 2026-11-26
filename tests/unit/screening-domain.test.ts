import { describe, expect, it } from "vitest";
import { buildWhatsAppDeepLink } from "@/modules/notifications/whatsapp";
import {
  buildScreeningOutcomeWhatsAppUrl,
  buildScreeningStoragePath,
  buildTrialSubscriptionWindowUtc,
  calculateRetentionExpiryUtcIso,
  normalizeAudioMimeType,
  reviewScreeningSchema,
  SCREENING_MAX_AUDIO_BYTES,
  validateAudioFileMeta,
} from "@/modules/screening/domain";

describe("screening/domain & notifications/whatsapp", () => {
  describe("validateAudioFileMeta", () => {
    it("accepts audio/webm with codecs suffix within 5 MB limit", () => {
      const result = validateAudioFileMeta(
        "audio/webm;codecs=opus",
        1024 * 500,
      );
      expect(result.valid).toBe(true);
      expect(result.normalizedMime).toBe("audio/webm");
      expect(result.extension).toBe("webm");
    });

    it("normalizes mime type by stripping codec parameters", () => {
      expect(normalizeAudioMimeType("AUDIO/OGG; codecs=opus")).toBe(
        "audio/ogg",
      );
    });

    it("rejects files larger than 5 MB", () => {
      const result = validateAudioFileMeta(
        "audio/mpeg",
        SCREENING_MAX_AUDIO_BYTES + 1,
      );
      expect(result.valid).toBe(false);
    });

    it("rejects empty files and unsupported formats", () => {
      expect(validateAudioFileMeta("audio/mpeg", 0).valid).toBe(false);
      expect(validateAudioFileMeta("application/pdf", 1024).valid).toBe(false);
    });
  });

  describe("storage path, retention (30d UTC) and trial plan separation", () => {
    it("prefixes private storage path with student ID for RLS alignment", () => {
      const path = buildScreeningStoragePath(
        "student-uuid-123",
        "1700000000-abc",
        "webm",
      );
      expect(path).toBe("student-uuid-123/1700000000-abc.webm");
    });

    it("calculates 30-day LGPD expiration in UTC ISO format", () => {
      const base = new Date("2026-01-01T12:00:00.000Z");
      const expiry = calculateRetentionExpiryUtcIso(base, 30);
      expect(expiry).toBe("2026-01-31T12:00:00.000Z");
    });

    it("builds trial subscription window separately from proficiency level", () => {
      const base = new Date("2026-01-01T12:00:00.000Z");
      const trial = buildTrialSubscriptionWindowUtc(base);
      expect(trial.planCode).toBe("trial");
      expect(trial.weeklyLimit).toBe(2);
      expect(trial.currentPeriodStartUtc).toBe("2026-01-01T12:00:00.000Z");
      expect(trial.currentPeriodEndUtc).toBe("2026-01-31T12:00:00.000Z");
    });
  });

  describe("reviewScreeningSchema", () => {
    const submissionId = "11111111-1111-4111-8111-111111111111";

    it("accepts approved decision with valid proficiency level", () => {
      const parsed = reviewScreeningSchema.safeParse({
        submissionId,
        decision: "approved",
        proficiencyLevel: "B1_INTERMEDIATE",
        teacherNotes: "Boa fluidez para B1.",
      });
      expect(parsed.success).toBe(true);
    });

    it("requires cordial guidance notes when redirecting absolute beginner", () => {
      const invalid = reviewScreeningSchema.safeParse({
        submissionId,
        decision: "redirected",
        teacherNotes: "curto",
      });
      expect(invalid.success).toBe(false);

      const valid = reviewScreeningSchema.safeParse({
        submissionId,
        decision: "redirected",
        teacherNotes:
          "Recomendamos fortalecer a base das 4 habilidades antes do formato 1v2.",
      });
      expect(valid.success).toBe(true);
    });
  });

  describe("WhatsApp wa.me deep-link sanitization", () => {
    it("encodes message text safely and strips non-digits from phone", () => {
      const url = buildWhatsAppDeepLink(
        "+55 (11) 98765-4321",
        "Olá! Nível B1 & Trial liberado?",
      );
      expect(url).toBe(
        "https://wa.me/5511987654321?text=Ol%C3%A1!%20N%C3%ADvel%20B1%20%26%20Trial%20liberado%3F",
      );
    });

    it("returns null for invalid phone numbers", () => {
      expect(buildWhatsAppDeepLink("123", "Oi")).toBeNull();
    });

    it("builds screening outcome wa.me link for approved students", () => {
      const url = buildScreeningOutcomeWhatsAppUrl({
        whatsappE164: "+5511999998888",
        studentName: "Carlos Eduardo",
        decision: "approved",
        proficiencyLevel: "B1_INTERMEDIATE",
      });
      expect(url).toContain("https://wa.me/5511999998888?text=");
      expect(decodeURIComponent(url ?? "")).toContain("Olá Carlos!");
      expect(decodeURIComponent(url ?? "")).toContain("B1 — Intermediário");
    });
  });
});
