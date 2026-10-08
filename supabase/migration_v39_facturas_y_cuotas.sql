-- v39 · Una venta, varias facturas
--
-- Etapa 2 del plan de Administración, y la base de las que siguen.
--
-- Hasta ahora la venta tenía UNA fecha de factura, UN número y UNA fecha de
-- cobro. La planilla de deudores de Belén muestra otra cosa: ventas en cuotas
-- ("1 DE 2", "5 DE 12", "33 DE 36"), cada una con su número de factura, su
-- vencimiento y su pago, y notas de crédito en negativo. Y el vencimiento —la
-- columna "FECHA VTO", desde donde se cuentan los días de atraso— no existía
-- en ningún lado.
--
-- Esta migración:
--   1. Crea `facturas`: una fila por cuota o nota de crédito.
--   2. Agrega la condición de pago (días) a la venta, a la cotización y, como
--      recomendada, a la agencia. El vencimiento sale de ahí.
--   3. Agrega a la cotización la cantidad de cuotas que pacta el vendedor.
--   4. Liga cada comisión a la factura que se cobró, en vez de a la venta: con
--      cuotas, cada cobro genera su comisión.
--   5. Mantiene solas las fechas de factura y cobro de la venta a partir de sus
--      facturas, para que Facturación, Deudores y Reportes sigan andando
--      mientras se pasan a leer facturas.
--   6. Crea una factura por cada venta aprobada que ya existe, con sus datos.
--
-- Idempotente.

-- ── 1. Facturas ─────────────────────────────────────────────────────────────
create table if not exists facturas (
  id                     uuid primary key default gen_random_uuid(),
  orden_id               uuid not null references ordenes_venta(id) on delete cascade,

  -- "1 DE 2": qué cuota es y de cuántas. Una nota de crédito lleva la cuota
  -- de la factura que corrige.
  cuota                  int  not null default 1 check (cuota >= 1),
  cuotas_total           int  not null default 1 check (cuotas_total >= 1),
  -- El mes en que sale la pauta de esta cuota (primer día del mes). Es la
  -- columna MES de la planilla, y el mes en que se liquida el canon.
  mes_pauta              date not null,

  tipo                   text not null default 'factura' check (tipo in ('factura', 'nota_credito')),
  -- prevista: planificada, todavía no emitida · emitida: se facturó, se debe
  -- cobrada: entró la plata · anulada: no va.
  estado                 text not null default 'prevista' check (estado in ('prevista', 'emitida', 'cobrada', 'anulada')),

  numero                 text,
  fecha_emision          date,

  -- Importes sin IVA por concepto, y el total facturado. La diferencia entre
  -- el total y arrendamiento + producción es IVA e impuestos.
  importe_arrendamiento  numeric(12,2) not null default 0,
  importe_produccion     numeric(12,2) not null default 0,
  importe_total          numeric(12,2) not null default 0,
  moneda                 text not null default 'UYU',

  fecha_vencimiento      date,
  -- La fecha que la agencia dice que va a pagar. Distinta del cobro real.
  fecha_pago_prometida   date,
  fecha_cobro            date,
  metodo_cobro           text,

  notas                  text,
  emitida_por            uuid references perfiles(id),
  cobrada_por            uuid references perfiles(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- Emitida o cobrada exige fecha de emisión; cobrada exige fecha de cobro.
  constraint facturas_emitida_con_fecha check (estado not in ('emitida', 'cobrada') or fecha_emision is not null),
  constraint facturas_cobrada_con_fecha check (estado <> 'cobrada' or fecha_cobro is not null)
);

create index if not exists idx_facturas_orden       on facturas (orden_id);
create index if not exists idx_facturas_estado_vto  on facturas (estado, fecha_vencimiento);
create index if not exists idx_facturas_mes_pauta   on facturas (mes_pauta);

comment on table facturas is
  'Cada cuota o nota de crédito de una venta. Cobranzas, comisiones y canon leen de acá.';

-- Todo el acceso pasa por la API, que corre con la service role. Sin
-- políticas, nadie lee ni escribe facturas directo con su sesión.
alter table facturas enable row level security;

-- ── 2. Condición de pago ────────────────────────────────────────────────────
-- En la planilla el vencimiento queda casi siempre a 60 días de la factura,
-- aunque hay casos a 30 y a 90. 60 es el valor por defecto; se cambia por
-- venta, y cada agencia puede tener el suyo recomendado.
alter table ordenes_venta add column if not exists condicion_pago_dias int not null default 60
  check (condicion_pago_dias between 0 and 365);
alter table propuestas    add column if not exists condicion_pago_dias int
  check (condicion_pago_dias is null or condicion_pago_dias between 0 and 365);
alter table agencias      add column if not exists condicion_pago_dias int
  check (condicion_pago_dias is null or condicion_pago_dias between 0 and 365);

comment on column ordenes_venta.condicion_pago_dias is
  'Días desde la factura hasta el vencimiento. Fija el vencimiento de cada factura al emitirla.';

-- ── 3. Cuotas pactadas en la cotización ─────────────────────────────────────
alter table propuestas add column if not exists cuotas int not null default 1
  check (cuotas between 1 and 60);

comment on column propuestas.cuotas is
  'En cuántas cuotas mensuales se factura la venta. Genera el plan de facturas al crear la OIC.';

-- ── 4. La comisión se liga a la factura ─────────────────────────────────────
alter table comisiones add column if not exists factura_id uuid references facturas(id) on delete set null;

-- ── 6. Facturas de las ventas que ya existen ────────────────────────────────
-- Una por venta, con lo que tenía: si estaba cobrada, cobrada; si estaba
-- facturada, emitida con su número y fecha; si no, prevista. También las que
-- esperan aprobación: si no, quedaban sin plan y había que rearmarlo a mano.
-- Una venta con cobro pero sin fecha de factura (anularon la factura con el
-- botón viejo) va como cobrada, con el cobro como fecha: como prevista, la
-- sincronización le borraba la fecha de cobro y su comisión podía repetirse.
insert into facturas (
  orden_id, cuota, cuotas_total, mes_pauta, tipo, estado, numero, fecha_emision,
  importe_arrendamiento, importe_produccion, importe_total, moneda,
  fecha_vencimiento, fecha_cobro
)
select
  o.id, 1, 1,
  date_trunc('month', coalesce(o.fecha_alta_real, o.fecha_alta_prevista, o.created_at::date))::date,
  'factura',
  case when o.fecha_cobro is not null then 'cobrada'
       when o.fecha_facturacion is not null then 'emitida'
       else 'prevista' end,
  o.factura_numero,
  coalesce(o.fecha_facturacion, o.fecha_cobro),
  coalesce(o.monto_arrendamiento, o.monto_neto, o.monto_total, 0),
  coalesce(o.monto_produccion, 0),
  coalesce(o.monto_total, 0),
  coalesce(o.moneda, 'UYU'),
  case when coalesce(o.fecha_facturacion, o.fecha_cobro) is not null
       then coalesce(o.fecha_facturacion, o.fecha_cobro) + o.condicion_pago_dias end,
  o.fecha_cobro
from ordenes_venta o
where o.estado in ('pendiente_aprobacion', 'aprobada', 'en_oic', 'facturada', 'cobrada')
  and not exists (select 1 from facturas f where f.orden_id = o.id);

-- Las comisiones que ya había, a la factura de su venta.
update comisiones c
   set factura_id = f.id
  from facturas f
 where f.orden_id = c.orden_id
   and f.cuota = 1
   and f.tipo = 'factura'
   and c.factura_id is null;

-- Una comisión por FACTURA, ya no por venta: con cuotas, cada cobro genera la
-- suya. El índice viejo (v33) impediría la comisión de la segunda cuota.
drop index if exists uq_comisiones_orden;
create unique index if not exists uq_comisiones_factura
  on comisiones (factura_id) where factura_id is not null;

-- ── 5. Las fechas de la venta se mantienen desde sus facturas ───────────────
-- fecha_facturacion  = la primera factura emitida
-- factura_numero     = los números emitidos, en orden de cuota
-- fecha_cobro        = el último cobro, sólo cuando ya no queda nada por cobrar
create or replace function sincronizar_orden_desde_facturas() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  -- En un DELETE no hay NEW; en un INSERT no hay OLD.
  v_orden uuid := case when tg_op = 'DELETE' then old.orden_id else new.orden_id end;
begin
  update ordenes_venta o
     set fecha_facturacion = s.primera_emision,
         factura_numero    = s.numeros,
         fecha_cobro       = case when s.facturas > 0 and s.abiertas = 0 then s.ultimo_cobro end,
         updated_at        = now()
    from (
      select
        min(fecha_emision) filter (where tipo = 'factura' and estado in ('emitida', 'cobrada'))   as primera_emision,
        string_agg(numero, ' · ' order by cuota)
          filter (where tipo = 'factura' and estado in ('emitida', 'cobrada') and numero is not null) as numeros,
        count(*) filter (where tipo = 'factura' and estado <> 'anulada')                           as facturas,
        count(*) filter (where tipo = 'factura' and estado in ('prevista', 'emitida'))             as abiertas,
        max(fecha_cobro) filter (where tipo = 'factura' and estado = 'cobrada')                     as ultimo_cobro
      from facturas
      where orden_id = v_orden
    ) s
   where o.id = v_orden;
  return null;
end $$;

drop trigger if exists trg_facturas_sincronizan_orden on facturas;
create trigger trg_facturas_sincronizan_orden
  after insert or update or delete on facturas
  for each row execute function sincronizar_orden_desde_facturas();

-- Correr la sincronización una vez sobre lo migrado.
update facturas set updated_at = updated_at where cuota = 1;
