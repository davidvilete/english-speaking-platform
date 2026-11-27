import { describe, expect, it } from "vitest";
import {
  canCancelWithQuotaRefund,
  canStudentViewAndBookSlot,
  computeTopicAffinity,
  hasAvailablePlanQuota,
  hasSessionOverlap,
  isValidGoogleMeetUrl,
  mapRpcErrorToPortuguese,
} from "@/modules/scheduling/domain";
import {
  formatDateTimeInTimeZone,
  getCanonicalSaoPauloWeekBoundsUtc,
  localDateTimeToUtcIso,
} from "@/shared/lib/date";

describe("scheduling/domain & shared/lib/date", () => {
  describe("isValidGoogleMeetUrl", () => {
    it("accepts valid https://meet.google.com/ URLs", () => {
      expect(isValidGoogleMeetUrl("https://meet.google.com/abc-defg-hij")).toBe(
        true,
      );
    });

    it("rejects non-Meet URLs, http links, and javascript URIs", () => {
      expect(isValidGoogleMeetUrl("http://meet.google.com/abc-defg-hij")).toBe(
        false,
      );
      expect(isValidGoogleMeetUrl("https://zoom.us/j/123456")).toBe(false);
      expect(isValidGoogleMeetUrl("javascript:alert(1)")).toBe(false);
      expect(isValidGoogleMeetUrl("https://meet.google.com/")).toBe(false);
    });
  });

  describe("1v2 pairing rules (canStudentViewAndBookSlot)", () => {
    it("allows student to book open unlocked slot (1st student locks level)", () => {
      expect(
        canStudentViewAndBookSlot({
          studentLevel: "B1_INTERMEDIATE",
          slotLockedLevel: null,
          slotStatus: "open",
          slotCapacity: 2,
          activeBookingsCount: 0,
        }),
      ).toBe(true);
    });

    it("allows 2nd student of the SAME proficiency level", () => {
      expect(
        canStudentViewAndBookSlot({
          studentLevel: "B1_INTERMEDIATE",
          slotLockedLevel: "B1_INTERMEDIATE",
          slotStatus: "open",
          slotCapacity: 2,
          activeBookingsCount: 1,
        }),
      ).toBe(true);
    });

    it("blocks student of a DIFFERENT proficiency level", () => {
      expect(
        canStudentViewAndBookSlot({
          studentLevel: "A2_BASE",
          slotLockedLevel: "B1_INTERMEDIATE",
          slotStatus: "open",
          slotCapacity: 2,
          activeBookingsCount: 1,
        }),
      ).toBe(false);
    });

    it("blocks 3rd student when capacity (2) is reached", () => {
      expect(
        canStudentViewAndBookSlot({
          studentLevel: "B1_INTERMEDIATE",
          slotLockedLevel: "B1_INTERMEDIATE",
          slotStatus: "open",
          slotCapacity: 2,
          activeBookingsCount: 2,
        }),
      ).toBe(false);
    });

    it("blocks redirected or unclassified students", () => {
      expect(
        canStudentViewAndBookSlot({
          studentLevel: "REDIRECTED_EXTERNAL",
          slotLockedLevel: null,
          slotStatus: "open",
          slotCapacity: 2,
          activeBookingsCount: 0,
        }),
      ).toBe(false);
      expect(
        canStudentViewAndBookSlot({
          studentLevel: null,
          slotLockedLevel: null,
          slotStatus: "open",
          slotCapacity: 2,
          activeBookingsCount: 0,
        }),
      ).toBe(false);
    });
  });

  describe("session overlap detection", () => {
    const existing = [
      { startsAtUtc: "2026-11-27T21:00:00.000Z", durationMinutes: 45 },
    ];

    it("detects overlapping slot intervals", () => {
      expect(
        hasSessionOverlap(
          { startsAtUtc: "2026-11-27T21:30:00.000Z", durationMinutes: 40 },
          existing,
        ),
      ).toBe(true);
    });

    it("allows back-to-back non-overlapping slots", () => {
      expect(
        hasSessionOverlap(
          { startsAtUtc: "2026-11-27T21:45:00.000Z", durationMinutes: 45 },
          existing,
        ),
      ).toBe(false);
    });
  });

  describe("12-hour cancellation rule", () => {
    it("allows quota refund when cancelled >= 12 hours before start", () => {
      const start = "2026-11-28T15:00:00.000Z";
      const nowExactly12hBefore = new Date("2026-11-28T03:00:00.000Z");
      expect(canCancelWithQuotaRefund(start, nowExactly12hBefore)).toBe(true);
    });

    it("blocks quota refund when cancelled < 12 hours before start", () => {
      const start = "2026-11-28T15:00:00.000Z";
      const now11h59mBefore = new Date("2026-11-28T03:01:00.000Z");
      expect(canCancelWithQuotaRefund(start, now11h59mBefore)).toBe(false);
    });
  });

  describe("plan quota separation (trial, basic_1x, intermediate_2x)", () => {
    it("enforces 2 total classes for trial", () => {
      expect(
        hasAvailablePlanQuota({
          planCode: "trial",
          weeklyLimit: 2,
          usedInCanonicalWeek: 0,
          usedInTrialTotal: 1,
        }),
      ).toBe(true);
      expect(
        hasAvailablePlanQuota({
          planCode: "trial",
          weeklyLimit: 2,
          usedInCanonicalWeek: 0,
          usedInTrialTotal: 2,
        }),
      ).toBe(false);
    });

    it("enforces weekly limits for basic_1x (1/wk) and intermediate_2x (2/wk)", () => {
      expect(
        hasAvailablePlanQuota({
          planCode: "basic_1x",
          weeklyLimit: 1,
          usedInCanonicalWeek: 1,
          usedInTrialTotal: 0,
        }),
      ).toBe(false);
      expect(
        hasAvailablePlanQuota({
          planCode: "intermediate_2x",
          weeklyLimit: 2,
          usedInCanonicalWeek: 1,
          usedInTrialTotal: 0,
        }),
      ).toBe(true);
    });
  });

  describe("UTC <-> local timezone and canonical Sao Paulo week", () => {
    it("converts America/Sao_Paulo local time to UTC ISO (+3h)", () => {
      const utcIso = localDateTimeToUtcIso(
        "2026-11-27",
        "19:00",
        "America/Sao_Paulo",
      );
      expect(utcIso).toBe("2026-11-27T22:00:00.000Z");
    });

    it("formats UTC timestamp into target timezone without throwing", () => {
      const formatted = formatDateTimeInTimeZone(
        "2026-11-27T22:00:00.000Z",
        "America/Sao_Paulo",
      );
      expect(formatted).toContain("19:00");
    });

    it("computes Monday 00:00 to next Monday 00:00 in America/Sao_Paulo as UTC", () => {
      // 2026-11-27 é sexta-feira; segunda da mesma semana é 2026-11-23 00:00 BRT = 03:00Z
      const { weekStartUtc, weekEndExclusiveUtc } =
        getCanonicalSaoPauloWeekBoundsUtc(new Date("2026-11-27T22:00:00.000Z"));
      expect(weekStartUtc.toISOString()).toBe("2026-11-23T03:00:00.000Z");
      expect(weekEndExclusiveUtc.toISOString()).toBe(
        "2026-11-30T03:00:00.000Z",
      );
    });
  });

  describe("topic affinity and RPC error mapping", () => {
    it("highlights shared interests between paired students", () => {
      expect(
        computeTopicAffinity(
          ["Tecnologia e IA", "Viagens", "Games"],
          ["viagens", "Música e podcasts", "Games"],
        ),
      ).toEqual(["Viagens", "Games"]);
    });

    it("maps known PostgreSQL RPC error codes to user-friendly Portuguese", () => {
      expect(mapRpcErrorToPortuguese("LEVEL_MISMATCH: detail")).toContain(
        "outro nível de fala",
      );
      expect(
        mapRpcErrorToPortuguese("LATE_CANCELLATION_NOT_ALLOWED: detail"),
      ).toContain("12 horas");
    });
  });
});
