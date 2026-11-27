import { describe, expect, it } from "vitest";
import {
  convertRowsToCsv,
  isExportableTable,
  isValidCronSecret,
  shouldSendCriticalAlert,
} from "@/modules/audit/domain";

describe("audit/domain", () => {
  describe("shouldSendCriticalAlert (anti-flood deduplication)", () => {
    it("allows first alert, suppresses duplicate within cooldown, and allows again after cooldown", () => {
      const store = new Map<string, number>();
      const t0 = 1_000_000;

      expect(
        shouldSendCriticalAlert("billing:db_down", store, t0, 60_000),
      ).toBe(true);
      expect(
        shouldSendCriticalAlert("billing:db_down", store, t0 + 30_000, 60_000),
      ).toBe(false);
      expect(
        shouldSendCriticalAlert("billing:db_down", store, t0 + 60_001, 60_000),
      ).toBe(true);
    });
  });

  describe("isExportableTable (allowlist)", () => {
    it("accepts allowlisted domain tables and rejects unknown tables", () => {
      expect(isExportableTable("profiles")).toBe(true);
      expect(isExportableTable("subscriptions")).toBe(true);
      expect(isExportableTable("auth.users")).toBe(false);
      expect(isExportableTable("pg_shadow")).toBe(false);
    });
  });

  describe("convertRowsToCsv", () => {
    it("escapes quotes, commas, newlines, and serializes nested objects", () => {
      const csv = convertRowsToCsv([
        {
          id: "1",
          note: 'He said "hi", then\nleft',
          meta: { ok: true },
        },
      ]);

      expect(csv).toBe(
        'id,note,meta\n1,"He said ""hi"", then\nleft","{""ok"":true}"',
      );
    });

    it("returns empty string for empty row arrays", () => {
      expect(convertRowsToCsv([])).toBe("");
    });
  });

  describe("isValidCronSecret", () => {
    it("matches identical secrets and rejects mismatched or missing values", () => {
      expect(isValidCronSecret("super-secret-123", "super-secret-123")).toBe(
        true,
      );
      expect(isValidCronSecret("super-secret-124", "super-secret-123")).toBe(
        false,
      );
      expect(isValidCronSecret("short", "super-secret-123")).toBe(false);
      expect(isValidCronSecret(null, "super-secret-123")).toBe(false);
      expect(isValidCronSecret("abc", "")).toBe(false);
    });
  });
});
