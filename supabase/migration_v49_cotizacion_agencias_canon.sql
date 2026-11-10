-- v49 · Cotización en dólares, comisión de agencia al facturar y cuotas del canon
--
-- 1. facturas.cotizacion: lo facturado en dólares se pasa a pesos con la
--    cotización que se elige al marcarla facturada (el CRM sugiere la del BCU).
--
-- 2. comisiones_agencia: la comisión de la agencia queda registrada cuando la
--    cuota se factura (antes se calculaba recién al cobrar), con su estado:
--      pendiente  → hay que pagársela a la agencia
--      pagada     → ya se le pagó
--      descontada → la agencia se la descontó del pago (pagó el neto), así
--                   que no se le debe nada y la factura no queda con saldo.
--
-- 3. canon_planes: en cuántas cuotas se le paga al shopping el canon de una
--    venta y desde qué mes (si no hay plan, cada cuota de la venta paga en su
--    mes, como hasta ahora).
--
-- Idempotente.

alter table facturas add column if not exists cotizacion numeric(12,4);
comment on column facturas.cotizacion is
  'Pesos por dólar al facturar (sólo facturas en USD). Lo usa el canon, que se liquida siempre en pesos.';

create table if not exists comisiones_agencia (
  id            uuid primary key default gen_random_uuid(),
  factura_id    uuid not null unique references facturas(id) on delete cascade,
  orden_id      uuid not null references ordenes_venta(id) on delete cascade,
  agencia_id    uuid references agencias(id) on delete set null,
  base_arr      numeric(14,2) not null default 0,
  base_prod     numeric(14,2) not null default 0,
  pct_arr       numeric(6,2)  not null default 0,
  pct_prod      numeric(6,2)  not null default 0,
  monto         numeric(14,2) not null default 0,
  moneda        text not null default 'UYU',
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'pagada', 'descontada')),
  fecha_pago    date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_comisiones_agencia_agencia on comisiones_agencia (agencia_id, estado);

create table if not exists canon_planes (
  orden_id    uuid primary key references ordenes_venta(id) on delete cascade,
  cuotas      integer not null check (cuotas between 1 and 36),
  primer_mes  date not null,
  updated_at  timestamptz not null default now()
);

alter table comisiones_agencia enable row level security;
alter table canon_planes enable row level security;
revoke all on comisiones_agencia, canon_planes from anon, authenticated;
grant select, insert, update, delete on comisiones_agencia, canon_planes to service_role;
