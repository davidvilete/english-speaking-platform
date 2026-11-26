-- ============================================================================
-- Sprint 1 — Schema Inicial, Bucket Privado de Triagem e Políticas RLS
-- Referência: .ai/PROJECT_DNA.md (Seções 4, 9 e 10)
-- Regra inviolável: todas as colunas de data/hora usam timestamptz (UTC).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. TIPOS ENUMERADOS DE DOMÍNIO
-- ============================================================================

create type public.user_role as enum ('student', 'teacher', 'admin');

-- Nível de fala definido na triagem (NUNCA confundir com plan_code).
create type public.proficiency_level as enum (
  'A2_BASE',
  'B1_INTERMEDIATE',
  'B2_UPPER',
  'REDIRECTED_EXTERNAL'
);

create type public.screening_status as enum ('pending', 'approved', 'redirected');

-- Plano comercial controla apenas franquia semanal e cobrança.
create type public.plan_code as enum ('trial', 'basic_1x', 'intermediate_2x');

create type public.subscription_status as enum (
  'active',
  'cancel_at_period_end',
  'canceled',
  'suspended'
);

create type public.payment_source as enum ('manual_pix', 'gateway');

create type public.class_session_status as enum (
  'open',
  'full',
  'in_progress',
  'completed',
  'canceled'
);

create type public.booking_status as enum (
  'confirmed',
  'checked_in',
  'attended',
  'no_show',
  'canceled'
);

create type public.post_class_status as enum ('draft', 'published');

create type public.error_severity as enum ('error', 'critical');

-- ============================================================================
-- 2. TABELAS PRINCIPAIS
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'student',
  full_name text not null,
  whatsapp_e164 text not null,
  timezone text not null default 'America/Sao_Paulo',
  proficiency_level public.proficiency_level,
  interests_tags text[] not null default '{}',
  lgpd_consent_at timestamptz not null,
  is_adult_confirmed boolean not null check (is_adult_confirmed = true),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.screening_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  audio_storage_path text not null,
  status public.screening_status not null default 'pending',
  teacher_notes text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '30 days')
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  plan_code public.plan_code not null,
  status public.subscription_status not null default 'active',
  weekly_limit smallint not null check (weekly_limit between 1 and 2),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  first_paid_at timestamptz,
  payment_source public.payment_source not null default 'manual_pix',
  external_subscription_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (current_period_end > current_period_start)
);

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete restrict,
  starts_at_utc timestamptz not null,
  duration_minutes smallint not null check (duration_minutes between 30 and 50),
  capacity smallint not null default 2 check (capacity between 1 and 2),
  locked_level public.proficiency_level check (
    locked_level is null or locked_level <> 'REDIRECTED_EXTERNAL'
  ),
  topic_theme text,
  meet_url text not null check (meet_url like 'https://meet.google.com/%'),
  status public.class_session_status not null default 'open',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  status public.booking_status not null default 'confirmed',
  checked_in_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (session_id, student_id)
);

create table public.post_class_materials (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  teacher_raw_notes text not null default '',
  ai_generated_draft text,
  final_content_markdown text not null default '',
  status public.post_class_status not null default 'draft',
  published_at timestamptz,
  expires_at timestamptz not null default (timezone('utc', now()) + interval '30 days'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (session_id, student_id)
);

create table public.system_error_logs (
  id uuid primary key default gen_random_uuid(),
  severity public.error_severity not null default 'error',
  module text not null,
  message text not null,
  context_json jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

-- ============================================================================
-- 3. ÍNDICES ESSENCIAIS
-- ============================================================================

create index idx_profiles_role on public.profiles (role);
create index idx_screening_submissions_student on public.screening_submissions (student_id, created_at desc);
create index idx_screening_submissions_status on public.screening_submissions (status, created_at asc);
create index idx_screening_submissions_expires on public.screening_submissions (expires_at);
create index idx_subscriptions_student_status on public.subscriptions (student_id, status);
create index idx_class_sessions_starts_at on public.class_sessions (starts_at_utc, status);
create index idx_bookings_student on public.bookings (student_id, created_at desc);
create index idx_bookings_session on public.bookings (session_id, status);
create index idx_post_class_student on public.post_class_materials (student_id, published_at desc);
create index idx_post_class_expires on public.post_class_materials (expires_at);
create index idx_system_error_logs_created on public.system_error_logs (created_at desc, resolved);

-- ============================================================================
-- 4. TRIGGERS DE UPDATED_AT E FUNÇÃO HELPER DE PAPEL (RBAC)
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create trigger trg_class_sessions_updated_at
  before update on public.class_sessions
  for each row execute function public.set_updated_at();

create trigger trg_bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create trigger trg_post_class_materials_updated_at
  before update on public.post_class_materials
  for each row execute function public.set_updated_at();

-- Helper SECURITY DEFINER para consultar o papel do usuário sem recursão de RLS.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ============================================================================
-- 5. ROW-LEVEL SECURITY (RLS) EM TODAS AS TABELAS
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.screening_submissions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.class_sessions enable row level security;
alter table public.bookings enable row level security;
alter table public.post_class_materials enable row level security;
alter table public.system_error_logs enable row level security;

-- ---------- profiles ----------
create policy "profiles_select_own_or_staff"
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or public.current_user_role() in ('teacher', 'admin')
  );

create policy "profiles_insert_own_student"
  on public.profiles
  for insert
  to authenticated
  with check (
    id = auth.uid()
    and role = 'student'
    and proficiency_level is null
  );

-- Aluno pode atualizar apenas dados básicos do próprio perfil, nunca role ou proficiency_level.
create policy "profiles_update_own_safe_fields"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and proficiency_level is not distinct from (
      select p.proficiency_level from public.profiles p where p.id = auth.uid()
    )
  );

create policy "profiles_update_staff"
  on public.profiles
  for update
  to authenticated
  using (public.current_user_role() in ('teacher', 'admin'))
  with check (public.current_user_role() in ('teacher', 'admin'));

-- ---------- screening_submissions ----------
create policy "screening_select_own_or_staff"
  on public.screening_submissions
  for select
  to authenticated
  using (
    student_id = auth.uid()
    or public.current_user_role() in ('teacher', 'admin')
  );

create policy "screening_insert_own_student"
  on public.screening_submissions
  for insert
  to authenticated
  with check (
    student_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
  );

create policy "screening_update_staff"
  on public.screening_submissions
  for update
  to authenticated
  using (public.current_user_role() in ('teacher', 'admin'))
  with check (public.current_user_role() in ('teacher', 'admin'));

-- ---------- subscriptions ----------
create policy "subscriptions_select_own_or_staff"
  on public.subscriptions
  for select
  to authenticated
  using (
    student_id = auth.uid()
    or public.current_user_role() in ('teacher', 'admin')
  );

create policy "subscriptions_manage_staff"
  on public.subscriptions
  for all
  to authenticated
  using (public.current_user_role() in ('teacher', 'admin'))
  with check (public.current_user_role() in ('teacher', 'admin'));

-- ---------- class_sessions ----------
-- Nota: meet_url nunca deve ser exposto em listagens abertas ao aluno (controlado na camada server).
create policy "class_sessions_select_authenticated"
  on public.class_sessions
  for select
  to authenticated
  using (
    public.current_user_role() in ('teacher', 'admin')
    or status in ('open', 'full', 'in_progress')
  );

create policy "class_sessions_manage_teacher_admin"
  on public.class_sessions
  for all
  to authenticated
  using (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'teacher' and teacher_id = auth.uid())
  )
  with check (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'teacher' and teacher_id = auth.uid())
  );

-- ---------- bookings ----------
create policy "bookings_select_own_or_staff"
  on public.bookings
  for select
  to authenticated
  using (
    student_id = auth.uid()
    or public.current_user_role() in ('teacher', 'admin')
  );

create policy "bookings_manage_staff"
  on public.bookings
  for all
  to authenticated
  using (public.current_user_role() in ('teacher', 'admin'))
  with check (public.current_user_role() in ('teacher', 'admin'));

-- ---------- post_class_materials ----------
create policy "post_class_select_published_own_or_staff"
  on public.post_class_materials
  for select
  to authenticated
  using (
    (student_id = auth.uid() and status = 'published')
    or public.current_user_role() in ('teacher', 'admin')
  );

create policy "post_class_manage_staff"
  on public.post_class_materials
  for all
  to authenticated
  using (public.current_user_role() in ('teacher', 'admin'))
  with check (public.current_user_role() in ('teacher', 'admin'));

-- ---------- system_error_logs ----------
create policy "system_error_logs_admin_only"
  on public.system_error_logs
  for all
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ============================================================================
-- 6. STORAGE PRIVADO PARA ÁUDIOS DE TRIAGEM (5 MB, ACESSO VIA SIGNED URL)
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'screening-audios',
  'screening-audios',
  false,
  5242880,
  array['audio/webm', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/ogg']
)
on conflict (id) do nothing;

create policy "screening_audios_insert_own_folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'screening-audios'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "screening_audios_select_own_or_staff"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'screening-audios'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.current_user_role() in ('teacher', 'admin')
    )
  );

create policy "screening_audios_delete_admin"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'screening-audios'
    and public.current_user_role() = 'admin'
  );
