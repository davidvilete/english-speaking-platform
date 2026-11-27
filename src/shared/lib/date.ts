export const CANONICAL_OPERATIONAL_TIMEZONE = "America/Sao_Paulo";

/**
 * Formata uma data UTC (ISO) no fuso horário local do usuário.
 */
export function formatDateTimeInTimeZone(
  isoUtc: string,
  timeZone: string,
  dateStyle: "short" | "medium" | "long" = "medium",
): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle,
      timeStyle: "short",
      timeZone,
    }).format(new Date(isoUtc));
  } catch {
    return isoUtc;
  }
}

export function formatWeekdayAndTimeInTimeZone(
  isoUtc: string,
  timeZone: string,
): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(new Date(isoUtc));
  } catch {
    return isoUtc;
  }
}

/**
 * Converte data ("YYYY-MM-DD") + hora ("HH:MM") informadas no fuso local IANA
 * para string ISO em UTC (ex.: "2026-11-27T22:00:00.000Z").
 */
export function localDateTimeToUtcIso(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): string | null {
  const dateParts = dateStr.split("-").map(Number);
  const timeParts = timeStr.split(":").map(Number);

  const year = dateParts[0];
  const month = dateParts[1];
  const day = dateParts[2];
  const hour = timeParts[0];
  const minute = timeParts[1];

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    [year, month, day, hour, minute].some((n) => Number.isNaN(n))
  ) {
    return null;
  }

  // Estimativa inicial tratando os componentes como UTC
  const utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const parts = formatter.formatToParts(new Date(utcGuessMs));
    const getPart = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? "0");

    const renderedHour = getPart("hour") === 24 ? 0 : getPart("hour");
    const renderedAsUtcMs = Date.UTC(
      getPart("year"),
      getPart("month") - 1,
      getPart("day"),
      renderedHour,
      getPart("minute"),
      getPart("second"),
    );

    const offsetMs = renderedAsUtcMs - utcGuessMs;
    return new Date(utcGuessMs - offsetMs).toISOString();
  } catch {
    return null;
  }
}

/**
 * Calcula os limites (Segunda 00:00 até próxima Segunda 00:00 exclusiva)
 * da semana operacional canônica em America/Sao_Paulo, retornados em UTC.
 */
export function getCanonicalSaoPauloWeekBoundsUtc(referenceDate: Date): {
  weekStartUtc: Date;
  weekEndExclusiveUtc: Date;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CANONICAL_OPERATIONAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const parts = formatter.formatToParts(referenceDate);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";

  const daysSinceMondayMap: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const daysSinceMonday = daysSinceMondayMap[weekday] ?? 0;

  const localMondayDate = new Date(
    Date.UTC(year, month - 1, day - daysSinceMonday),
  );
  const mondayStr = [
    localMondayDate.getUTCFullYear(),
    String(localMondayDate.getUTCMonth() + 1).padStart(2, "0"),
    String(localMondayDate.getUTCDate()).padStart(2, "0"),
  ].join("-");

  const weekStartIso = localDateTimeToUtcIso(
    mondayStr,
    "00:00",
    CANONICAL_OPERATIONAL_TIMEZONE,
  );
  const weekStartUtc = new Date(weekStartIso ?? referenceDate.toISOString());
  const weekEndExclusiveUtc = new Date(
    weekStartUtc.getTime() + 7 * 24 * 60 * 60 * 1000,
  );

  return { weekStartUtc, weekEndExclusiveUtc };
}
