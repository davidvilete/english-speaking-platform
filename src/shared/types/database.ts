export type UserRole = "student" | "teacher" | "admin";

/**
 * Nível de fala definido na triagem por áudio.
 * Regra inviolável: NUNCA fundir com PlanCode (plano comercial).
 */
export type ProficiencyLevel =
  "A2_BASE" | "B1_INTERMEDIATE" | "B2_UPPER" | "REDIRECTED_EXTERNAL";

export type ApprovedProficiencyLevel = Exclude<
  ProficiencyLevel,
  "REDIRECTED_EXTERNAL"
>;

export type ScreeningStatus = "pending" | "approved" | "redirected";

/**
 * Plano comercial que determina exclusivamente franquia semanal e cobrança.
 */
export type PlanCode = "trial" | "basic_1x" | "intermediate_2x";

export type SubscriptionStatus =
  "active" | "cancel_at_period_end" | "canceled" | "suspended";

export type PaymentSource = "manual_pix" | "gateway";

export type ClassSessionStatus =
  "open" | "full" | "in_progress" | "completed" | "canceled";

export type BookingStatus =
  "confirmed" | "checked_in" | "attended" | "no_show" | "canceled";

export type PostClassStatus = "draft" | "published";

export type ErrorSeverity = "error" | "critical";

export interface ProfileRow {
  id: string;
  role: UserRole;
  full_name: string;
  whatsapp_e164: string;
  timezone: string;
  proficiency_level: ProficiencyLevel | null;
  interests_tags: string[];
  lgpd_consent_at: string;
  is_adult_confirmed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScreeningSubmissionRow {
  id: string;
  student_id: string;
  audio_storage_path: string;
  status: ScreeningStatus;
  teacher_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  expires_at: string;
}

export interface SubscriptionRow {
  id: string;
  student_id: string;
  plan_code: PlanCode;
  status: SubscriptionStatus;
  weekly_limit: number;
  current_period_start: string;
  current_period_end: string;
  first_paid_at: string | null;
  payment_source: PaymentSource;
  external_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SystemErrorLogRow {
  id: string;
  severity: ErrorSeverity;
  module: string;
  message: string;
  context_json: Record<string, unknown>;
  resolved: boolean;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: {
          id: string;
          role?: UserRole;
          full_name: string;
          whatsapp_e164: string;
          timezone?: string;
          proficiency_level?: ProficiencyLevel | null;
          interests_tags?: string[];
          lgpd_consent_at: string;
          is_adult_confirmed: boolean;
        };
        Update: {
          role?: UserRole;
          full_name?: string;
          whatsapp_e164?: string;
          timezone?: string;
          proficiency_level?: ProficiencyLevel | null;
          interests_tags?: string[];
          lgpd_consent_at?: string;
          is_adult_confirmed?: boolean;
        };
      };
      screening_submissions: {
        Row: ScreeningSubmissionRow;
        Insert: {
          id?: string;
          student_id: string;
          audio_storage_path: string;
          status?: ScreeningStatus;
          teacher_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          expires_at?: string;
        };
        Update: {
          status?: ScreeningStatus;
          teacher_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
        };
      };
      subscriptions: {
        Row: SubscriptionRow;
        Insert: {
          id?: string;
          student_id: string;
          plan_code: PlanCode;
          status?: SubscriptionStatus;
          weekly_limit: number;
          current_period_start: string;
          current_period_end: string;
          first_paid_at?: string | null;
          payment_source?: PaymentSource;
          external_subscription_id?: string | null;
        };
        Update: {
          plan_code?: PlanCode;
          status?: SubscriptionStatus;
          weekly_limit?: number;
          current_period_start?: string;
          current_period_end?: string;
          first_paid_at?: string | null;
          payment_source?: PaymentSource;
          external_subscription_id?: string | null;
        };
      };
      system_error_logs: {
        Row: SystemErrorLogRow;
        Insert: {
          id?: string;
          severity?: ErrorSeverity;
          module: string;
          message: string;
          context_json?: Record<string, unknown>;
          resolved?: boolean;
        };
        Update: {
          resolved?: boolean;
        };
      };
    };
  };
}
