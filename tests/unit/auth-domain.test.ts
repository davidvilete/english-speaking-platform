import { describe, expect, it } from "vitest";
import {
  canRoleAccessPath,
  getDefaultRedirectForRole,
  isProtectedRoute,
  isValidIanaTimeZone,
  normalizeWhatsAppToE164,
  signUpSchema,
} from "@/modules/auth/domain";

describe("auth/domain", () => {
  describe("normalizeWhatsAppToE164", () => {
    it("normalizes Brazilian mobile number with mask to +55 E.164", () => {
      expect(normalizeWhatsAppToE164("(11) 98765-4321")).toBe("+5511987654321");
    });

    it("normalizes Brazilian number already starting with 55", () => {
      expect(normalizeWhatsAppToE164("5511987654321")).toBe("+5511987654321");
    });

    it("preserves valid international numbers with leading +", () => {
      expect(normalizeWhatsAppToE164("+351 912 345 678")).toBe("+351912345678");
    });

    it("rejects invalid or too short numbers", () => {
      expect(normalizeWhatsAppToE164("12345")).toBeNull();
    });
  });

  describe("isValidIanaTimeZone", () => {
    it("accepts valid IANA timezones", () => {
      expect(isValidIanaTimeZone("America/Sao_Paulo")).toBe(true);
      expect(isValidIanaTimeZone("Europe/Lisbon")).toBe(true);
      expect(isValidIanaTimeZone("UTC")).toBe(true);
    });

    it("rejects invalid timezone strings", () => {
      expect(isValidIanaTimeZone("Mars/Olympus")).toBe(false);
      expect(isValidIanaTimeZone("")).toBe(false);
    });
  });

  describe("signUpSchema (18+ and LGPD)", () => {
    const validPayload = {
      fullName: "Maria Silva",
      email: "maria@example.com",
      password: "Password123!",
      whatsapp: "(11) 99999-8888",
      timezone: "America/Sao_Paulo",
      isAdultConfirmed: true as const,
      lgpdConsentAccepted: true as const,
    };

    it("accepts valid adult student signup with LGPD consent", () => {
      const parsed = signUpSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.whatsapp).toBe("+5511999998888");
      }
    });

    it("blocks signup when adult confirmation (18+) is false", () => {
      const parsed = signUpSchema.safeParse({
        ...validPayload,
        isAdultConfirmed: false,
      });
      expect(parsed.success).toBe(false);
    });

    it("blocks signup when LGPD consent is false", () => {
      const parsed = signUpSchema.safeParse({
        ...validPayload,
        lgpdConsentAccepted: false,
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe("RBAC route rules", () => {
    it("identifies protected route prefixes", () => {
      expect(isProtectedRoute("/student")).toBe(true);
      expect(isProtectedRoute("/teacher/screening")).toBe(true);
      expect(isProtectedRoute("/admin")).toBe(true);
      expect(isProtectedRoute("/login")).toBe(false);
      expect(isProtectedRoute("/")).toBe(false);
    });

    it("enforces strict role isolation across portals", () => {
      expect(canRoleAccessPath("student", "/student")).toBe(true);
      expect(canRoleAccessPath("student", "/teacher")).toBe(false);
      expect(canRoleAccessPath("student", "/admin")).toBe(false);

      expect(canRoleAccessPath("teacher", "/teacher/screening")).toBe(true);
      expect(canRoleAccessPath("teacher", "/student")).toBe(false);
      expect(canRoleAccessPath("teacher", "/admin")).toBe(false);

      expect(canRoleAccessPath("admin", "/admin")).toBe(true);
      expect(canRoleAccessPath("admin", "/teacher/screening")).toBe(true);
      expect(canRoleAccessPath("admin", "/student")).toBe(false);
    });

    it("returns default portal path per role", () => {
      expect(getDefaultRedirectForRole("student")).toBe("/student");
      expect(getDefaultRedirectForRole("teacher")).toBe("/teacher");
      expect(getDefaultRedirectForRole("admin")).toBe("/admin");
    });
  });
});
