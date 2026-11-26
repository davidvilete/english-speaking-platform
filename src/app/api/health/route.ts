import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAtUtc = new Date().toISOString();

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("profiles")
      .select("id", { head: true, count: "exact" })
      .limit(1);

    if (error) {
      return NextResponse.json(
        {
          status: "error",
          database: "unreachable",
          timestampUtc: checkedAtUtc,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        status: "ok",
        database: "connected",
        timestampUtc: checkedAtUtc,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        status: "error",
        database: "not_configured",
        timestampUtc: checkedAtUtc,
      },
      { status: 503 },
    );
  }
}
