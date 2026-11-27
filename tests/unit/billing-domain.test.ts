import { describe, expect, it } from "vitest";
import {
  activateManualSubscriptionSchema,
  evaluateCdcRefundWindow,
  PLAN_CATALOG,
} from "@/modules/billing/domain";

describe("billing/domain", () => {
  describe("PLAN_CATALOG", () => {
    it("defines Trial, Basic (R$ 65,90 / 1x) and Intermediate (R$ 79,90 / 2x)", () => {
      expect(PLAN_CATALOG.trial.priceBrl).toBe(0);
      expect(PLAN_CATALOG.trial.weeklyLimit).toBe(2);
      expect(PLAN_CATALOG.basic_1x.priceBrl).toBe(65.9);
      expect(PLAN_CATALOG.basic_1x.weeklyLimit).toBe(1);
      expect(PLAN_CATALOG.intermediate_2x.priceBrl).toBe(79.9);
      expect(PLAN_CATALOG.intermediate_2x.weeklyLimit).toBe(2);
    });
  });

  describe("evaluateCdcRefundWindow (CDC Art. 49 — 7 days)", () => {
    it("returns withinWindow true on day 1 with 6 days remaining", () => {
      const firstPaidAt = "2026-11-20T12:00:00.000Z";
      const now = new Date("2026-11-21T12:00:00.000Z");
      const res = evaluateCdcRefundWindow(firstPaidAt, now);
      expect(res.withinWindow).toBe(true);
      expect(res.daysRemaining).toBe(6);
    });

    it("returns withinWindow false after 7 days", () => {
      const firstPaidAt = "2026-11-20T12:00:00.000Z";
      const now = new Date("2026-11-27T12:00:01.000Z");
      const res = evaluateCdcRefundWindow(firstPaidAt, now);
      expect(res.withinWindow).toBe(false);
      expect(res.daysRemaining).toBe(0);
    });

    it("returns false for unpaid / trial subscriptions (null firstPaidAt)", () => {
      expect(evaluateCdcRefundWindow(null).withinWindow).toBe(false);
    });
  });

  describe("activateManualSubscriptionSchema", () => {
    it("accepts valid manual Pix activation payload", () => {
      const parsed = activateManualSubscriptionSchema.safeParse({
        studentId: "11111111-1111-4111-8111-111111111111",
        planCode: "intermediate_2x",
        durationDays: 30,
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects invalid durationDays", () => {
      const parsed = activateManualSubscriptionSchema.safeParse({
        studentId: "11111111-1111-4111-8111-111111111111",
        planCode: "basic_1x",
        durationDays: 2,
      });
      expect(parsed.success).toBe(false);
    });
  });
});
