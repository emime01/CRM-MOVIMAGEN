-- v45 · Comentarios en las ventas
--
-- La pantalla de cada venta tiene un hilo de comentarios (vendedor, arte,
-- operaciones y administración hablan de ese trabajo), pero la tabla nunca
-- se creó: la v15 no se corrió en esta base y la sección daba error 500.
--
-- Mismo diseño que la v15, con dos correcciones:
--   · perfil_id admite null: era NOT NULL con ON DELETE SET NULL, y borrar un
--     perfil con comentarios habría fallado.
--   · sólo el servidor del CRM la lee y escribe (service_role), como el resto
--     de las tablas nuevas.
--
-- Idempotente.

create table if not exists comentarios_orden (
  id          uuid primary key default gen_random_uuid(),
  orden_id    uuid not null references ordenes_venta(id) on delete cascade,
  perfil_id   uuid references perfiles(id) on delete set null,
  mensaje     text not null,
  created_at  timestamptz default now()
);

alter table comentarios_orden alter column perfil_id drop not null;

create index if not exists idx_comentarios_orden_orden on comentarios_orden(orden_id, created_at desc);

alter table comentarios_orden enable row level security;
revoke all on comentarios_orden from anon, authenticated;
grant select, insert, update, delete on comentarios_orden to service_role;
