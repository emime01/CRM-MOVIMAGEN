-- v42 · Canon de shoppings por mes
--
-- Etapa 5 del plan de Administración. Requiere la v39 (facturas).
--
-- El "Informe mensual de canon" de Administración liquida cada shopping por
-- mes, en el mes en que sale la pauta: arrendamiento sin IVA, neto de la
-- comisión de la agencia, por el % de canon del shopping. Se compara con el
-- canon mínimo y se paga el mayor; a veces se paga una parte y el resto se
-- pasa al mes siguiente. Un circuito reparte su canon entre los shoppings que
-- lo forman (Conaprole: 106.667 en seis partes de 17.778).
--
-- Esta migración:
--   1. Agrega el canon mínimo mensual a cada shopping.
--   2. Permite que un soporte pertenezca a varios shoppings (los circuitos),
--      con un peso para repartir; por defecto, partes iguales.
--   3. Crea la liquidación mensual por shopping: lo calculado, el mínimo, lo
--      que viene del mes anterior, lo que se pasa al siguiente, lo que se
--      paga y su estado.
--
-- Idempotente.

-- ── 1. Canon mínimo ─────────────────────────────────────────────────────────
alter table canon_shoppings add column if not exists canon_minimo numeric(12,2) not null default 0
  check (canon_minimo >= 0);

comment on column canon_shoppings.canon_minimo is
  'Canon mínimo mensual, sin IVA. Se paga el mayor entre esto y el canon variable.';

-- ── 2. Soportes en uno o varios shoppings ───────────────────────────────────
create table if not exists canon_soporte_shoppings (
  soporte_id   uuid not null references soportes(id) on delete cascade,
  shopping_id  uuid not null references canon_shoppings(id) on delete cascade,
  -- Peso en el reparto del canon de un circuito. Iguales = partes iguales.
  peso         numeric(8,3) not null default 1 check (peso > 0),
  created_at   timestamptz not null default now(),
  primary key (soporte_id, shopping_id)
);

create index if not exists idx_canon_soporte_shoppings_shopping on canon_soporte_shoppings (shopping_id);

comment on table canon_soporte_shoppings is
  'En qué shopping está cada soporte. Un circuito está en varios y su canon se reparte según el peso.';

-- Lo que ya estaba asignado (un soporte, un shopping) pasa a la tabla nueva.
insert into canon_soporte_shoppings (soporte_id, shopping_id)
select s.id, s.canon_shopping_id
  from soportes s
 where s.canon_shopping_id is not null
on conflict do nothing;

alter table canon_soporte_shoppings enable row level security;

-- ── 3. Liquidación mensual ──────────────────────────────────────────────────
create table if not exists canon_mensual (
  id               uuid primary key default gen_random_uuid(),
  shopping_id      uuid not null references canon_shoppings(id) on delete cascade,
  mes              date not null,                  -- primer día del mes
  -- Foto al cerrar el mes, en pesos y sin IVA.
  canon_variable   numeric(12,2) not null default 0,
  canon_minimo     numeric(12,2) not null default 0,
  -- Lo que se pasó del mes anterior y lo que se pasa al siguiente.
  arrastre         numeric(12,2) not null default 0,
  diferido         numeric(12,2) not null default 0 check (diferido >= 0),
  a_pagar          numeric(12,2) not null default 0,
  -- Lo vendido en dólares no se convierte: su canon va aparte.
  canon_variable_usd numeric(12,2) not null default 0,
  estado           text not null default 'abierto' check (estado in ('abierto', 'cerrado', 'pagado')),
  fecha_pago       date,
  notas            text,
  cerrado_por      uuid references perfiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (shopping_id, mes),
  constraint canon_mensual_mes_primer_dia check (extract(day from mes) = 1),
  constraint canon_mensual_pagado_con_fecha check (estado <> 'pagado' or fecha_pago is not null)
);

create index if not exists idx_canon_mensual_mes on canon_mensual (mes);

comment on table canon_mensual is
  'Liquidación de canon de cada shopping por mes. Abierto se recalcula; cerrado y pagado quedan fijos.';

alter table canon_mensual enable row level security;
