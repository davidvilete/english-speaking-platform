-- ============================================================================
-- Sprint 2 — Agenda do Professor, Pareamento 1v2 Atômico e Check-in (10 min)
-- Referência: .ai/PROJECT_DNA.md (Seções 4, 9 e 10) e .ai/AI_EXECUTION_GUIDE.md
-- Regras invioláveis:
--   1. Reserva e cancelamento 100% atômicos com SELECT ... FOR UPDATE.
--   2. Plano (trial/basic_1x/intermediate_2x) != Nível de fala (proficiency_level).
--   3. Semana operacional canônica: America/Sao_Paulo (Seg 00:00 a Dom 23:59).
--   4. Cancelamento pelo aluno exige >= 12h de antecedência; reseta locked_level se esvaziar.
--   5. Check-in validado estritamente pelo relógio UTC do banco [-10min, +10min].
-- ============================================================================

-- ============================================================================
-- 1. ANTI-SOBREPOSIÇÃO DE HORÁRIOS POR PROFESSOR
-- ============================================================================

create or replace function public.prevent_overlapping_teacher_sessions()
returns trigger
language plpgsql
as $$
declare
  v_new_end timestamptz;
  v_conflict_exists boolean;
begin
  if new.status = 'canceled' then
    return new;
  end if;

  v_new_end := new.starts_at_utc + make_interval(mins => new.duration_minutes);

  select exists (
    select 1
    from public.class_sessions cs
    where cs.teacher_id = new.teacher_id
      and cs.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and cs.status <> 'canceled'
      and cs.starts_at_utc < v_new_end
      and (cs.starts_at_utc + make_interval(mins => cs.duration_minutes)) > new.starts_at_utc
  )
  into v_conflict_exists;

  if v_conflict_exists then
    raise exception 'TEACHER_SESSION_OVERLAP: Já existe outro horário ativo para este professor neste intervalo.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_overlapping_teacher_sessions on public.class_sessions;
create trigger trg_prevent_overlapping_teacher_sessions
  before insert or update of starts_at_utc, duration_minutes, status, teacher_id
  on public.class_sessions
  for each row
  execute function public.prevent_overlapping_teacher_sessions();

-- ============================================================================
-- 2. RPC ATÔMICA: RESERVA 1v2 (book_session_atomic)
-- ============================================================================

create or replace function public.book_session_atomic(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_now_utc timestamptz := timezone('utc', now());
  v_profile public.profiles%rowtype;
  v_session public.class_sessions%rowtype;
  v_sub public.subscriptions%rowtype;
  v_active_count integer;
  v_used_quota integer;
  v_week_start_utc timestamptz;
  v_week_end_utc timestamptz;
  v_booking_id uuid;
  v_next_status public.class_session_status;
  v_next_locked_level public.proficiency_level;
begin
  if v_student_id is null then
    raise exception 'UNAUTHENTICATED: Faça login para reservar uma aula.';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_student_id;

  if not found or v_profile.role <> 'student' then
    raise exception 'FORBIDDEN_ROLE: Apenas alunos podem reservar aulas.';
  end if;

  if v_profile.proficiency_level is null or v_profile.proficiency_level = 'REDIRECTED_EXTERNAL' then
    raise exception 'NOT_ELIGIBLE_LEVEL: Seu perfil ainda não está liberado para agendamento 1v2.';
  end if;

  -- Lock de linha na sessão para impedir overbooking e conflito de nível concorrente.
  select * into v_session
  from public.class_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND: Horário não encontrado.';
  end if;

  if v_session.status <> 'open' then
    raise exception 'SESSION_NOT_OPEN: Este horário não está mais disponível.';
  end if;

  if v_session.starts_at_utc <= v_now_utc then
    raise exception 'SESSION_IN_PAST: Não é possível reservar um horário que já começou.';
  end if;

  -- Verifica se o aluno já possui reserva ativa nesta sessão.
  if exists (
    select 1
    from public.bookings b
    where b.session_id = p_session_id
      and b.student_id = v_student_id
      and b.status <> 'canceled'
  ) then
    raise exception 'ALREADY_BOOKED: Você já está reservado neste horário.';
  end if;

  -- Valida compatibilidade estrita de nível de fala (nunca usar plan_code aqui).
  if v_session.locked_level is not null and v_session.locked_level <> v_profile.proficiency_level then
    raise exception 'LEVEL_MISMATCH: Este horário está travado para outro nível de fala.';
  end if;

  -- Valida capacidade atual.
  select count(*) into v_active_count
  from public.bookings b
  where b.session_id = p_session_id
    and b.status in ('confirmed', 'checked_in', 'attended');

  if v_active_count >= v_session.capacity then
    raise exception 'SESSION_FULL: Este horário já atingiu a capacidade máxima.';
  end if;

  -- Valida assinatura ativa e vigente.
  select * into v_sub
  from public.subscriptions s
  where s.student_id = v_student_id
    and s.status in ('active', 'cancel_at_period_end')
    and s.current_period_start <= v_now_utc
    and s.current_period_end > v_now_utc
  order by s.created_at desc
  limit 1;

  if not found then
    raise exception 'NO_ACTIVE_SUBSCRIPTION: Nenhuma assinatura ativa vigente encontrada.';
  end if;

  -- Contagem de franquia:
  --   trial -> 2 aulas totais no período
  --   basic_1x / intermediate_2x -> 1 ou 2 aulas na semana canônica (America/Sao_Paulo, Seg–Dom)
  if v_sub.plan_code = 'trial' then
    select count(*) into v_used_quota
    from public.bookings b
    where b.student_id = v_student_id
      and b.status in ('confirmed', 'checked_in', 'attended', 'no_show')
      and b.created_at >= v_sub.current_period_start;
  else
    -- date_trunc('week', timestamp) em PostgreSQL inicia na segunda-feira 00:00:00.
    v_week_start_utc := (
      date_trunc('week', v_session.starts_at_utc at time zone 'America/Sao_Paulo')
      at time zone 'America/Sao_Paulo'
    );
    v_week_end_utc := v_week_start_utc + interval '7 days';

    select count(*) into v_used_quota
    from public.bookings b
    join public.class_sessions cs on cs.id = b.session_id
    where b.student_id = v_student_id
      and b.status in ('confirmed', 'checked_in', 'attended', 'no_show')
      and cs.starts_at_utc >= v_week_start_utc
      and cs.starts_at_utc < v_week_end_utc;
  end if;

  if v_used_quota >= v_sub.weekly_limit then
    raise exception 'QUOTA_EXCEEDED: Você atingiu o limite de aulas do seu plano neste período.';
  end if;

  -- Reaproveita registro cancelado anterior (unique session_id, student_id) ou insere novo.
  insert into public.bookings (session_id, student_id, status, checked_in_at)
  values (p_session_id, v_student_id, 'confirmed', null)
  on conflict (session_id, student_id)
  do update set status = 'confirmed', checked_in_at = null, updated_at = v_now_utc
  returning id into v_booking_id;

  v_next_locked_level := coalesce(v_session.locked_level, v_profile.proficiency_level);
  v_next_status := case
    when (v_active_count + 1) >= v_session.capacity then 'full'::public.class_session_status
    else 'open'::public.class_session_status
  end;

  update public.class_sessions
  set locked_level = v_next_locked_level,
      status = v_next_status
  where id = p_session_id;

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'session_id', p_session_id,
    'locked_level', v_next_locked_level,
    'session_status', v_next_status
  );
end;
$$;

-- ============================================================================
-- 3. RPC ATÔMICA: CANCELAMENTO COM REGRA DE 12H (cancel_booking_atomic)
-- ============================================================================

create or replace function public.cancel_booking_atomic(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_now_utc timestamptz := timezone('utc', now());
  v_booking public.bookings%rowtype;
  v_session public.class_sessions%rowtype;
  v_remaining_count integer;
  v_reset_level boolean := false;
begin
  if v_student_id is null then
    raise exception 'UNAUTHENTICATED: Faça login para cancelar uma reserva.';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
    and student_id = v_student_id
  for update;

  if not found then
    raise exception 'BOOKING_NOT_FOUND: Reserva não encontrada.';
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'BOOKING_NOT_CANCELABLE: Apenas reservas confirmadas antes do check-in podem ser canceladas.';
  end if;

  select * into v_session
  from public.class_sessions
  where id = v_booking.session_id
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND: Sessão associada não encontrada.';
  end if;

  -- Regra inviolável: mínimo de 12 horas de antecedência para liberar vaga e devolver saldo.
  if (v_session.starts_at_utc - v_now_utc) < interval '12 hours' then
    raise exception 'LATE_CANCELLATION_NOT_ALLOWED: Cancelamentos só são permitidos com no mínimo 12 horas de antecedência.';
  end if;

  update public.bookings
  set status = 'canceled'
  where id = p_booking_id;

  select count(*) into v_remaining_count
  from public.bookings b
  where b.session_id = v_session.id
    and b.status in ('confirmed', 'checked_in', 'attended');

  if v_remaining_count = 0 then
    v_reset_level := true;
    update public.class_sessions
    set locked_level = null,
        status = case when status = 'canceled' then 'canceled' else 'open' end
    where id = v_session.id;
  elsif v_remaining_count < v_session.capacity and v_session.status = 'full' then
    update public.class_sessions
    set status = 'open'
    where id = v_session.id;
  end if;

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'refunded_quota', true,
    'locked_level_reset', v_reset_level
  );
end;
$$;

-- ============================================================================
-- 4. RPC ATÔMICA: CHECK-IN (10 MIN ANTES) + LIBERAÇÃO PROTEGIDA DO MEET
-- ============================================================================

create or replace function public.checkin_booking_atomic(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_now_utc timestamptz := timezone('utc', now());
  v_booking public.bookings%rowtype;
  v_session public.class_sessions%rowtype;
  v_checked_in_at timestamptz;
begin
  if v_student_id is null then
    raise exception 'UNAUTHENTICATED: Faça login para fazer check-in.';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
    and student_id = v_student_id
  for update;

  if not found then
    raise exception 'BOOKING_NOT_FOUND: Reserva não encontrada.';
  end if;

  if v_booking.status not in ('confirmed', 'checked_in') then
    raise exception 'BOOKING_NOT_ELIGIBLE: Esta reserva não está elegível para check-in.';
  end if;

  select * into v_session
  from public.class_sessions
  where id = v_booking.session_id
  for update;

  if not found or v_session.status = 'canceled' then
    raise exception 'SESSION_CANCELED: Esta sessão foi cancelada.';
  end if;

  -- Janela estrita pelo relógio UTC do servidor: [starts_at - 10min, starts_at + 10min]
  if v_now_utc < (v_session.starts_at_utc - interval '10 minutes') then
    raise exception 'CHECKIN_TOO_EARLY: O check-in abre exatamente 10 minutos antes da aula.';
  end if;

  if v_now_utc > (v_session.starts_at_utc + interval '10 minutes') then
    raise exception 'CHECKIN_CLOSED: A janela de check-in (até 10 minutos após o início) foi encerrada.';
  end if;

  v_checked_in_at := coalesce(v_booking.checked_in_at, v_now_utc);

  update public.bookings
  set status = 'checked_in',
      checked_in_at = v_checked_in_at
  where id = p_booking_id;

  if v_session.status in ('open', 'full') then
    update public.class_sessions
    set status = 'in_progress'
    where id = v_session.id;
  end if;

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'checked_in_at', v_checked_in_at,
    'meet_url', v_session.meet_url
  );
end;
$$;

grant execute on function public.book_session_atomic(uuid) to authenticated;
grant execute on function public.cancel_booking_atomic(uuid) to authenticated;
grant execute on function public.checkin_booking_atomic(uuid) to authenticated;
