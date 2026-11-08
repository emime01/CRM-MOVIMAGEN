-- v48 · Notificaciones push en el celular
--
-- Cada celular (o navegador) donde alguien activó las notificaciones del CRM
-- deja acá su suscripción. Cuando el CRM crea una notificación para esa
-- persona, además de la campanita le llega un aviso al celular.
--
-- Idempotente.

create table if not exists push_suscripciones (
  id          uuid primary key default gen_random_uuid(),
  perfil_id   uuid not null references perfiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_push_suscripciones_perfil on push_suscripciones (perfil_id);

alter table push_suscripciones enable row level security;
revoke all on push_suscripciones from anon, authenticated;
grant select, insert, update, delete on push_suscripciones to service_role;
