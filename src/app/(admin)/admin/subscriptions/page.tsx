import { requireRole } from "@/modules/auth/session";
import { evaluateCdcRefundWindow } from "@/modules/billing/domain";
import { AppHeader } from "@/shared/components/app-header";
import { formatDateTimeInTimeZone } from "@/shared/lib/date";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/admin";
import type {
  PlanCode,
  ProficiencyLevel,
  SubscriptionStatus,
} from "@/shared/types/database";
import {
  AdminSubscriptionsClient,
  type AdminStudentOption,
  type AdminSubscriptionView,
} from "./_components/admin-subscriptions-client";

export const dynamic = "force-dynamic";

interface RawSubscriptionAdminRow {
  id: string;
  plan_code: PlanCode;
  status: SubscriptionStatus;
  weekly_limit: number;
  current_period_start: string;
  current_period_end: string;
  first_paid_at: string | null;
  student: {
    full_name: string;
    proficiency_level: ProficiencyLevel | null;
  } | null;
}

export default async function AdminSubscriptionsPage() {
  const { profile } = await requireRole(["admin"]);
  const admin = createSupabaseAdminClient();
  const nowUtc = new Date();

  const [{ data: studentRows }, { data: subRows }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, proficiency_level")
      .eq("role", "student")
      .order("full_name", { ascending: true })
      .limit(200),
    admin
      .from("subscriptions")
      .select(
        `
        id,
        plan_code,
        status,
        weekly_limit,
        current_period_start,
        current_period_end,
        first_paid_at,
        student:profiles!subscriptions_student_id_fkey (
          full_name,
          proficiency_level
        )
      `,
      )
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const students: AdminStudentOption[] = (studentRows ?? []).map((row) => ({
    id: String(row.id),
    fullName: String(row.full_name),
    proficiencyLevel:
      (row.proficiency_level as ProficiencyLevel | null) ?? null,
  }));

  const rawSubs = (subRows ?? []) as unknown as RawSubscriptionAdminRow[];
  const subscriptions: AdminSubscriptionView[] = rawSubs
    .filter((row) => row.student !== null)
    .map((row) => {
      const cdc = evaluateCdcRefundWindow(row.first_paid_at, nowUtc);
      return {
        id: row.id,
        studentName: row.student!.full_name,
        studentLevel: row.student!.proficiency_level,
        planCode: row.plan_code,
        status: row.status,
        weeklyLimit: row.weekly_limit,
        periodStartFormatted: formatDateTimeInTimeZone(
          row.current_period_start,
          profile.timezone,
          "short",
        ),
        periodEndFormatted: formatDateTimeInTimeZone(
          row.current_period_end,
          profile.timezone,
          "short",
        ),
        withinCdcWindow: cdc.withinWindow,
        cdcDaysRemaining: cdc.daysRemaining,
      };
    });

  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        timezone={profile.timezone}
      />

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Gestão de Assinaturas e Planos (Pix / CDC 7 dias)
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ative, renove, agende cancelamento (estilo Netflix) ou processe
            estorno imediato dentro da janela legal de 7 dias do CDC Art. 49.
          </p>
        </div>

        <AdminSubscriptionsClient
          students={students}
          subscriptions={subscriptions}
        />
      </main>
    </div>
  );
}
