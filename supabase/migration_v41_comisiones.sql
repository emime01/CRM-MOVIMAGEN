-- v41 · Liquidación de comisiones
--
-- Etapa 4 del plan de Administración. Requiere la v39 (facturas).
--
-- Lo que confirmó Administración:
--   · 6,75% para todos los vendedores, sobre el arrendamiento sin IVA.
--   · La comisión va en el mes en que se COBRA la factura.
--   · Una venta compartida se reparte mitad y mitad.
--   · Además, cada vendedor puede tener un bono si llega a su objetivo de
--     ventas del cuatrimestre. Es opcional: se carga sólo a quien lo tenga.
--
-- Esta migración:
--   1. Agrega a la venta el segundo vendedor de una venta compartida.
--   2. Le da a cada comisión su mes de liquidación, su moneda y su tipo
--      (venta o bono), y el estado intermedio "liquidada": pendiente → se
--      liquida con el mes → se paga.
--   3. Permite dos comisiones por factura (una por vendedor) en vez de una.
--   4. Crea los bonos por objetivo, por vendedor y cuatrimestre.
--
-- Idempotente.

-- ── 1. Venta compartida ─────────────────────────────────────────────────────
alter table ordenes_venta
  add column if not exists vendedor_compartido_id uuid references perfiles(id) on delete set null;

comment on column ordenes_venta.vendedor_compartido_id is
  'Segundo vendedor de una venta compartida. La comisión se reparte mitad y mitad.';

-- ── 2. Comisión: mes, moneda, tipo y estados ────────────────────────────────
-- Un bono no sale de una venta.
alter table comisiones alter column orden_id drop not null;

alter table comisiones add column if not exists tipo text not null default 'venta';
alter table comisiones add column if not exists moneda text not null default 'UYU';
-- El mes de la planilla en que se liquida: el del cobro (primer día del mes).
alter table comisiones add column if not exists mes_liquidacion date;
-- Para los bonos: de qué cuatrimestre ("Q2-2026").
alter table comisiones add column if not exists cuatrimestre text;
-- Si es la mitad de una venta compartida, con quién se compartió.
alter table comisiones add column if not exists compartida_con uuid references perfiles(id) on delete set null;
alter table comisiones add column if not exists liquidada_at timestamptz;
alter table comisiones add column if not exists pagada_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comisiones_tipo_check') then
    alter table comisiones add constraint comisiones_tipo_check check (tipo in ('venta', 'bono'));
  end if;
end $$;

-- El CHECK de estado de la v18 no tiene "liquidada". Se suelta, se llame
-- como se llame, y se vuelve a poner.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.comisiones'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%estado%'
  loop
    execute format('alter table comisiones drop constraint %I', c.conname);
  end loop;
end $$;
alter table comisiones add constraint comisiones_estado_check
  check (estado in ('pendiente', 'liquidada', 'pagada', 'cancelada'));

-- Lo que ya había: mes del cobro de su factura, o del pago, o de cuando se
-- generó; moneda de la factura o de la venta.
update comisiones c
   set mes_liquidacion = date_trunc('month', coalesce(
         (select f.fecha_cobro from facturas f where f.id = c.factura_id),
         (select p.fecha_pago from pagos p where p.id = c.pago_id),
         c.created_at::date))::date
 where c.mes_liquidacion is null;

update comisiones c
   set moneda = coalesce(
         (select f.moneda from facturas f where f.id = c.factura_id),
         (select o.moneda from ordenes_venta o where o.id = c.orden_id),
         'UYU')
 where c.tipo = 'venta';

create index if not exists idx_comisiones_mes on comisiones (mes_liquidacion, vendedor_id);

-- ── 3. Una comisión por factura y por vendedor ──────────────────────────────
drop index if exists uq_comisiones_factura;
create unique index if not exists uq_comisiones_factura_vendedor
  on comisiones (factura_id, vendedor_id) where factura_id is not null;

-- Un solo bono vigente por vendedor y cuatrimestre (uno cancelado no cuenta,
-- para poder volver a liquidarlo corregido).
create unique index if not exists uq_comisiones_bono
  on comisiones (vendedor_id, cuatrimestre) where tipo = 'bono' and estado <> 'cancelada';

-- ── 4. Bonos por objetivo ───────────────────────────────────────────────────
-- Aparte de `objetivos` a propósito: esa tabla la reescribe el recálculo de
-- la planilla y se llevaría el bono puesto.
create table if not exists bonos_objetivo (
  id            uuid primary key default gen_random_uuid(),
  vendedor_id   uuid not null references perfiles(id) on delete cascade,
  cuatrimestre  text not null,
  monto         numeric(12,2) not null check (monto > 0),
  moneda        text not null default 'UYU',
  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (vendedor_id, cuatrimestre)
);

comment on table bonos_objetivo is
  'Bono opcional que cobra el vendedor si llega a su objetivo del cuatrimestre.';

-- Acceso sólo por la API (service role).
alter table bonos_objetivo enable row level security;
