-- v46 · Varios buses por línea de venta
--
-- El catálogo vende productos genéricos de bus ("FullBus Exclusivo",
-- "Lateral 1 Paño"...) por cantidad: "FullBus × 3" son tres buses. La línea
-- de la venta guardaba un solo bus (orden_items.bus_id), así que operaciones
-- no podía asignar los otros dos y el comprobante no los listaba.
--
-- Esta tabla guarda todos los buses de cada línea. orden_items.bus_id queda
-- con el primero, por compatibilidad.
--
-- Idempotente.

create table if not exists orden_item_buses (
  orden_item_id uuid not null references orden_items(id) on delete cascade,
  bus_id        uuid not null references buses(id) on delete restrict,
  created_at    timestamptz not null default now(),
  primary key (orden_item_id, bus_id)
);

create index if not exists idx_orden_item_buses_bus on orden_item_buses (bus_id);

-- Lo que ya estaba asignado (un bus por línea) pasa a la tabla nueva.
insert into orden_item_buses (orden_item_id, bus_id)
select id, bus_id from orden_items where bus_id is not null
on conflict do nothing;

alter table orden_item_buses enable row level security;
revoke all on orden_item_buses from anon, authenticated;
grant select, insert, update, delete on orden_item_buses to service_role;
