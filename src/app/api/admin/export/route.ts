import { NextResponse, type NextRequest } from "next/server";
import {
  convertRowsToCsv,
  EXPORTABLE_TABLES,
  isExportableTable,
} from "@/modules/audit/domain";
import { getCurrentSessionProfile } from "@/modules/auth/session";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getCurrentSessionProfile();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (session.profile.role !== "admin") {
    return NextResponse.json(
      { error: "Acesso restrito ao Admin." },
      { status: 403 },
    );
  }

  const format = request.nextUrl.searchParams.get("format") ?? "json";
  const tableParam = request.nextUrl.searchParams.get("table") ?? "all";
  const dateStamp = new Date().toISOString().slice(0, 10);

  try {
    const admin = createSupabaseAdminClient();

    if (format === "csv") {
      if (!isExportableTable(tableParam)) {
        return NextResponse.json(
          { error: "Tabela inválida para exportação CSV." },
          { status: 400 },
        );
      }

      const { data, error } = await admin
        .from(tableParam)
        .select("*")
        .limit(5000);

      if (error) {
        return NextResponse.json(
          { error: "Erro ao consultar dados para CSV." },
          { status: 500 },
        );
      }

      const csv = convertRowsToCsv((data ?? []) as Record<string, unknown>[]);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="output1v2-${tableParam}-${dateStamp}.csv"`,
        },
      });
    }

    // Exportação JSON completa (todas as tabelas essenciais) ou de uma tabela específica.
    const tablesToExport =
      tableParam === "all"
        ? [...EXPORTABLE_TABLES]
        : isExportableTable(tableParam)
          ? [tableParam]
          : null;

    if (!tablesToExport) {
      return NextResponse.json(
        { error: "Tabela inválida para exportação JSON." },
        { status: 400 },
      );
    }

    const exported: Record<string, unknown[]> = {};
    for (const table of tablesToExport) {
      const { data, error } = await admin.from(table).select("*").limit(5000);
      if (error) {
        return NextResponse.json(
          { error: `Falha ao exportar tabela ${table}.` },
          { status: 500 },
        );
      }
      exported[table] = data ?? [];
    }

    const payload = JSON.stringify(
      {
        exportedAtUtc: new Date().toISOString(),
        tables: exported,
      },
      null,
      2,
    );

    return new NextResponse(payload, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="output1v2-${tableParam}-${dateStamp}.json"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Erro interno ao gerar exportação." },
      { status: 500 },
    );
  }
}
