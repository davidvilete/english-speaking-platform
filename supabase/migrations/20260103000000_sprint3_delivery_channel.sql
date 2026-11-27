-- ============================================================================
-- Sprint 3 — Preferência de Entrega Pós-Aula (Plataforma vs WhatsApp)
-- Referência: .ai/PROJECT_DNA.md (Seções 5 e 10)
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'post_class_delivery_channel'
  ) then
    create type public.post_class_delivery_channel as enum ('platform', 'whatsapp');
  end if;
end $$;

alter table public.profiles
  add column if not exists post_class_delivery_channel
  public.post_class_delivery_channel not null default 'platform';
