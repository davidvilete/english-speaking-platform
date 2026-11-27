import { requireRole } from "@/modules/auth/session";
import { buildPostClassDeliveryWhatsAppUrl } from "@/modules/post-class/domain";
import { AppHeader } from "@/shared/components/app-header";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { formatWeekdayAndTimeInTimeZone } from "@/shared/lib/date";
import { createSupabaseServerClient } from "@/shared/lib/supabase/server";
import type {
  PostClassDeliveryChannel,
  PostClassMaterialRow,
  ProficiencyLevel,
} from "@/shared/types/database";
import {
  PostClassEditorCard,
  type PostClassEditorItem,
} from "./_components/post-class-editor-card";

export const dynamic = "force-dynamic";

interface RawBookingForPostClass {
  id: string;
  session_id: string;
  student_id: string;
  session: {
    id: string;
    teacher_id: string;
    starts_at_utc: string;
  } | null;
  student: {
    id: string;
    full_name: string;
    whatsapp_e164: string;
    proficiency_level: ProficiencyLevel | null;
    post_class_delivery_channel: PostClassDeliveryChannel;
  } | null;
}

export default async function TeacherPostClassPage() {
  const { profile } = await requireRole(["teacher", "admin"]);
  const supabase = await createSupabaseServerClient();

  const [{ data: bookingRows }, { data: materialRows }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `
        id,
        session_id,
        student_id,
        session:class_sessions!bookings_session_id_fkey (
          id,
          teacher_id,
          starts_at_utc
        ),
        student:profiles!bookings_student_id_fkey (
          id,
          full_name,
          whatsapp_e164,
          proficiency_level,
          post_class_delivery_channel
        )
      `,
      )
      .in("status", ["confirmed", "checked_in", "attended"])
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("post_class_materials")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  const rawBookings = (bookingRows ??
    []) as unknown as RawBookingForPostClass[];
  const materials = (materialRows ?? []) as PostClassMaterialRow[];
  const materialMap = new Map<string, PostClassMaterialRow>();
  for (const m of materials) {
    materialMap.set(`${m.session_id}:${m.student_id}`, m);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const items: PostClassEditorItem[] = rawBookings
    .filter((b) => {
      if (!b.session || !b.student) return false;
      if (profile.role === "teacher" && b.session.teacher_id !== profile.id) {
        return false;
      }
      return true;
    })
    .map((b) => {
      const existing = materialMap.get(`${b.session_id}:${b.student_id}`);
      const deliveryChannel =
        b.student!.post_class_delivery_channel ?? "platform";

      const existingWhatsAppUrl =
        existing && existing.status === "published"
          ? buildPostClassDeliveryWhatsAppUrl({
              whatsappE164: b.student!.whatsapp_e164,
              studentName: b.student!.full_name,
              deliveryChannel,
              contentMarkdown: existing.final_content_markdown,
              appUrl,
            })
          : null;

      return {
        sessionId: b.session_id,
        studentId: b.student_id,
        studentName: b.student!.full_name,
        studentLevel: b.student!.proficiency_level,
        deliveryChannel,
        sessionStartsAtFormatted: formatWeekdayAndTimeInTimeZone(
          b.session!.starts_at_utc,
          profile.timezone,
        ),
        initialRawNotes: existing?.teacher_raw_notes ?? "",
        initialAiDraft: existing?.ai_generated_draft ?? null,
        initialFinalContent: existing?.final_content_markdown ?? "",
        initialStatus: existing?.status ?? null,
        existingWhatsAppUrl,
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
            Pós-Aula com IA e Contingência Manual
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Registre notas rápidas da aula, gere o rascunho de atividade escrita
            com gabarito via Gemini (zero PII) ou edite manualmente e publique.
          </p>
        </div>

        {items.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Nenhuma aula com alunos para registrar pós-aula
              </CardTitle>
              <CardDescription>
                Assim que alunos reservarem e participarem de sessões 1v2, eles
                aparecerão aqui para envio do feedback e atividade escrita.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-6">
            {items.map((item) => (
              <PostClassEditorCard
                key={`${item.sessionId}:${item.studentId}`}
                item={item}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
