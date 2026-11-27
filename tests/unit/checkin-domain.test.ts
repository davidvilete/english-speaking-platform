import { describe, expect, it } from "vitest";
import {
  buildCheckInReminderWhatsAppUrl,
  getCheckInWindowState,
} from "@/modules/checkin/domain";

describe("checkin/domain", () => {
  const sessionStartUtc = "2026-11-27T22:00:00.000Z";

  describe("getCheckInWindowState (server UTC clock)", () => {
    it("returns too_early before -10 minutes", () => {
      const serverNow = new Date("2026-11-27T21:49:59.000Z");
      expect(getCheckInWindowState(sessionStartUtc, serverNow)).toBe(
        "too_early",
      );
    });

    it("returns open at exactly -10 minutes", () => {
      const serverNow = new Date("2026-11-27T21:50:00.000Z");
      expect(getCheckInWindowState(sessionStartUtc, serverNow)).toBe("open");
    });

    it("returns open at start time and up to +10 minutes", () => {
      expect(
        getCheckInWindowState(
          sessionStartUtc,
          new Date("2026-11-27T22:00:00.000Z"),
        ),
      ).toBe("open");
      expect(
        getCheckInWindowState(
          sessionStartUtc,
          new Date("2026-11-27T22:10:00.000Z"),
        ),
      ).toBe("open");
    });

    it("returns closed after +10 minutes tolerance", () => {
      const serverNow = new Date("2026-11-27T22:10:01.000Z");
      expect(getCheckInWindowState(sessionStartUtc, serverNow)).toBe("closed");
    });
  });

  describe("buildCheckInReminderWhatsAppUrl", () => {
    it("generates sanitized wa.me deep-link with Meet URL and student first name", () => {
      const url = buildCheckInReminderWhatsAppUrl({
        whatsappE164: "+5511988887777",
        studentName: "Ana Paula",
        startsAtFormatted: "sex., 27/11, 19:00",
        meetUrl: "https://meet.google.com/abc-defg-hij",
      });

      expect(url).toContain("https://wa.me/5511988887777?text=");
      const decoded = decodeURIComponent(url ?? "");
      expect(decoded).toContain("Olá Ana!");
      expect(decoded).toContain("https://meet.google.com/abc-defg-hij");
    });
  });
});
