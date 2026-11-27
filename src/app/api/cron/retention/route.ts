import { NextResponse, type NextRequest } from "next/server";
import { isValidCronSecret } from "@/modules/audit/domain";
import { logSystemError } from "@/modules/audit/logger";
import { SCREENING_BUCKET_NAME } from "@/modules/screening/domain";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Rotina diária LGPD (retenção de 30 dias):
 * - Remove áudios de triagem expirados no bucket privado `screening-audios`.
 * - Remove registros expirados de `screening_submissions` e `post_class_materials`.
 * - Remove logs de erro resolvidos com mais de 30 dias.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  if (!isValidCronSecret(token, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const nowUtc = new Date();
  const nowIso = nowUtc.toISOString();
  const logsCutoffIso = new Date(
    nowUtc.getTime() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  try {
    const admin = createSupabaseAdminClient();

    // 1. Áudios e submissões de triagem expirados (> 30 dias)
    const { data: expiredScreenings } = await admin
      .from("screening_submissions")
      .select("id, audio_storage_path")
      .lt("expires_at", nowIso)
      .limit(200);

    const audioPaths = (expiredScreenings ?? [])
      .map((row) => String(row.audio_storage_path))
      .filter(Boolean);

    let deletedAudios = 0;
    if (audioPaths.length > 0) {
      const { error: removeError } = await admin.storage
        .from(SCREENING_BUCKET_NAME)
        .remove(audioPaths);
      if (!removeError) {
        deletedAudios = audioPaths.length;
      }
    }

    const expiredScreeningIds = (expiredScreenings ?? []).map((row) =>
      String(row.id),
    );
    let deletedScreenings = 0;
    if (expiredScreeningIds.length > 0) {
      const { error: delScreenErr } = await admin
        .from("screening_submissions")
        .delete()
        .in("id", expiredScreeningIds);
      if (!delScreenErr) {
        deletedScreenings = expiredScreeningIds.length;
      }
    }

    // 2. Materiais pós-aula expirados (> 30 dias)
    const { count: deletedMaterials } = await admin
      .from("post_class_materials")
      .delete({ count: "exact" })
      .lt("expires_at", nowIso);

    // 3. Logs de erro resolvidos com mais de 30 dias
    const { count: deletedLogs } = await admin
      .from("system_error_logs")
      .delete({ count: "exact" })
      .eq("resolved", true)
      .lt("created_at", logsCutoffIso);

    return NextResponse.json(
      {
        ok: true,
        executedAtUtc: nowIso,
        deletedAudios,
        deletedScreenings,
        deletedMaterials: deletedMaterials ?? 0,
        deletedLogs: deletedLogs ?? 0,
      },
      { status: 200 },
    );
  } catch (err) {
    await logSystemError({
      severity: "critical",
      module: "audit",
      message: "Falha na rotina diária de retenção LGPD (30 dias).",
      context: { error: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json(
      { ok: false, error: "Erro ao executar expurgo de retenção." },
      { status: 500 },
    );
  }
}
