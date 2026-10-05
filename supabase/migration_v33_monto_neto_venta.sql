-- v33 · La comisión se calcula siempre sobre la misma base
--
-- `ordenes_venta.monto_total` significaba dos cosas distintas según por dónde
-- entró la venta:
--
--   · nacida de una cotización → el total del cotizador, CON IVA
--   · cargada a mano en /ventas/nueva → la suma de las líneas, SIN IVA
--
-- Y la comisión del vendedor sale de ese número. Con 100.000 netos + 22.000 de
-- IVA, el mismo negocio liquidaba 7.320 por un camino y 6.000 por el otro:
-- 1.320 de diferencia según qué pantalla usó el vendedor.
--
-- Se agrega `monto_neto`, que es lo cobrado sin IVA, y la comisión pasa a
-- calcularse sobre eso en los dos caminos. `monto_total` queda como está —es
-- lo que se factura— para no mover lo que ya muestran las pantallas.
--
-- Para las ventas que ya existen se completa con `monto_total`: en las
-- cargadas a mano es exactamente el neto, y en las que vienen de cotización es
-- lo mejor que se puede reconstruir sin volver a calcular ítem por ítem (su
-- cotización sí guarda el neto, pero recién desde ahora lo guarda bien).
--
-- Idempotente.

alter table ordenes_venta add column if not exists monto_neto numeric(12,2);

comment on column ordenes_venta.monto_neto is
  'Lo cobrado sin IVA. Es la base de la comisión del vendedor; monto_total es lo que se factura.';

update ordenes_venta
   set monto_neto = monto_total
 where monto_neto is null
   and monto_total is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Una comisión por venta, garantizado por la base
--
-- El chequeo anti-duplicados vivía sólo en el código, y entre dos requests
-- simultáneos (un doble clic en "Cobrar") los dos pasaban el chequeo y los dos
-- insertaban. Peor: con dos filas, la consulta que usaba `maybeSingle()`
-- devolvía error y el código lo leía como "no hay comisión", así que cada
-- cobro posterior agregaba otra más. Eso ya se arregló en el código; esto lo
-- cierra también del lado de la base, que es donde no hay carreras.
--
-- Antes del índice se borran los duplicados que pudiera haber, dejando el más
-- viejo de cada venta.

delete from comisiones c
 where exists (
   select 1 from comisiones d
    where d.orden_id = c.orden_id
      and d.orden_id is not null
      and (d.created_at, d.id) < (c.created_at, c.id)
 );

create unique index if not exists uq_comisiones_orden
  on comisiones (orden_id) where orden_id is not null;
