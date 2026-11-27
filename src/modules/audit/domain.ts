import crypto from "node:crypto";

export const CRITICAL_ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutos

export const EXPORTABLE_TABLES = [
  "profiles",
  "screening_submissions",
  "subscriptions",
  "class_sessions",
  "bookings",
  "post_class_materials",
  "system_error_logs",
] as const;

export type ExportableTable = (typeof EXPORTABLE_TABLES)[number];

export function isExportableTable(name: string): name is ExportableTable {
  return (EXPORTABLE_TABLES as readonly string[]).includes(name);
}

/**
 * Deduplicação simples para impedir flood de e-mails de alerta crítico.
 */
export function shouldSendCriticalAlert(
  alertKey: string,
  lastSentByKey: Map<string, number>,
  nowMs: number = Date.now(),
  cooldownMs: number = CRITICAL_ALERT_COOLDOWN_MS,
): boolean {
  const previous = lastSentByKey.get(alertKey);
  if (previous !== undefined && nowMs - previous < cooldownMs) {
    return false;
  }
  lastSentByKey.set(alertKey, nowMs);
  return true;
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/**
 * Converte linhas tabulares em CSV (RFC-4180) para exportação manual pelo Admin.
 */
export function convertRowsToCsv(
  rows: readonly Record<string, unknown>[],
): string {
  const firstRow = rows[0];
  if (!firstRow) {
    return "";
  }

  const headers = Object.keys(firstRow);
  const headerLine = headers.map(escapeCsvCell).join(",");
  const dataLines = rows.map((row) =>
    headers.map((header) => escapeCsvCell(row[header])).join(","),
  );

  return [headerLine, ...dataLines].join("\n");
}

/**
 * Valida o token Bearer de rotas internas/cron em tempo constante.
 */
export function isValidCronSecret(
  providedToken: string | null | undefined,
  expectedSecret: string | null | undefined,
): boolean {
  if (!providedToken || !expectedSecret) {
    return false;
  }

  const a = Buffer.from(providedToken, "utf8");
  const b = Buffer.from(expectedSecret, "utf8");
  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}
