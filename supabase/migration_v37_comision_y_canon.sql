-- v37 · Comisión al 6,75% sobre el arrendamiento, y la base para el canon
--
-- Etapa 1 del plan de Administración. Corrige dos de los tres cálculos que
-- daban distinto que la planilla de Belén (el tercero, el canon neto de
-- agencia, es sólo código y no necesita migración).
--
-- 1. El porcentaje. Los perfiles tenían 6% y la planilla liquida al 6,75%:
--    Conaprole, 232.000 × 6,75% = 15.660, que es lo que figura.
--
-- 2. La base. La comisión salía de `monto_neto`, que incluye producción. En la
--    planilla una venta que es toda producción tiene la comisión en blanco: se
--    comisiona sólo el arrendamiento sin IVA. Para eso la venta (y la
--    cotización de donde sale) guarda arrendamiento y producción por separado.
--
-- Idempotente.

-- ── Arrendamiento y producción por separado ─────────────────────────────────
alter table propuestas    add column if not exists monto_arrendamiento numeric(12,2);
alter table propuestas    add column if not exists monto_produccion    numeric(12,2);
alter table ordenes_venta add column if not exists monto_arrendamiento numeric(12,2);
alter table ordenes_venta add column if not exists monto_produccion    numeric(12,2);

comment on column ordenes_venta.monto_arrendamiento is
  'Arrendamiento sin IVA. Base de la comisión del vendedor y del canon.';
comment on column ordenes_venta.monto_produccion is
  'Producción sin IVA. No comisiona ni paga canon.';

-- Ventas que ya existen: sin el desglose guardado, lo mejor que se puede
-- reconstruir es el neto. Las cargadas a mano no tienen producción con
-- precio, así que ahí coincide exacto.
update ordenes_venta
   set monto_arrendamiento = coalesce(monto_neto, monto_total),
       monto_produccion    = coalesce(monto_produccion, 0)
 where monto_arrendamiento is null;

-- ── 6,75% ───────────────────────────────────────────────────────────────────
alter table perfiles alter column porcentaje_comision set default 6.75;

-- Sólo los que estaban en el 6% de fábrica; si alguien tiene un porcentaje
-- propio distinto, se respeta.
update perfiles
   set porcentaje_comision = 6.75,
       updated_at          = now()
 where porcentaje_comision = 6.00;

-- ── Comisiones todavía no liquidadas ────────────────────────────────────────
-- Se recalculan con la base y el porcentaje nuevos. Las ya pagadas no se tocan.
update comisiones c
   set monto_base     = o.monto_arrendamiento,
       porcentaje     = coalesce(p.porcentaje_comision, 6.75),
       monto_comision = round(o.monto_arrendamiento * coalesce(p.porcentaje_comision, 6.75)) / 100
  from ordenes_venta o
  left join perfiles p on p.id = o.vendedor_id
 where c.orden_id = o.id
   and c.estado   = 'pendiente'
   and o.monto_arrendamiento is not null;
