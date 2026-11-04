-- Corregir la OIC #8 (Abitab): producción guardada con IVA
--
-- NO es una migración: es un script de una sola vez.
--
-- Hasta el arreglo del 4/11 el cotizador guardaba la producción CON su IVA en
-- monto_produccion y en monto_neto. La OIC #8 (y su cotización COT-7177) se
-- hizo antes del arreglo:
--   · producción guardada  $ 454.942  → correcta  $ 372.903 (sin IVA)
--   · neto de la venta     $ 1.110.292 → correcto $ 1.028.253
--   · cada una de las 12 cuotas: producción $ 37.912 → $ 31.075
-- El TOTAL de la venta y de cada cuota ($ 1.110.292 / $ 92.524) está bien y
-- no cambia; tampoco la comisión del vendedor (sale del arrendamiento) ni el
-- canon. La venta no tiene agencia, así que no hay comisión de agencia que
-- recalcular.
--
-- Se puede correr más de una vez: sólo corrige si sigue con el error (neto
-- igual al total).

begin;

do $$
declare
  v_orden uuid;
  v_prop  uuid;
  v_prod  numeric;
  v_nueva numeric;
begin
  select id, propuesta_id, monto_produccion into v_orden, v_prop, v_prod
    from ordenes_venta
   where numero = 8 and monto_neto >= monto_total - 1;   -- todavía con el error

  if v_orden is null then
    raise notice 'La OIC #8 ya estaba corregida: no se cambia nada.';
    return;
  end if;

  v_nueva := round(v_prod / 1.22, 2);

  update ordenes_venta
     set monto_produccion = v_nueva,
         monto_neto       = monto_neto - (v_prod - v_nueva)
   where id = v_orden;

  update propuestas
     set monto_produccion = v_nueva,
         monto_neto       = monto_neto - (v_prod - v_nueva)
   where id = v_prop and monto_neto >= monto_total - 1;

  -- Cuotas todavía sin facturar: la producción de cada una, sin IVA.
  update facturas
     set importe_produccion = round(importe_produccion / 1.22, 2)
   where orden_id = v_orden and tipo = 'factura' and estado = 'prevista';

  raise notice 'OIC #8 corregida: producción % → %', v_prod, v_nueva;
end $$;

commit;

-- ─── CONTROL ─────────────────────────────────────────────────────────────────
-- select numero, monto_total, monto_neto, monto_arrendamiento, monto_produccion from ordenes_venta where numero = 8;
-- select cuota, estado, importe_arrendamiento, importe_produccion, importe_total from facturas
--  where orden_id = (select id from ordenes_venta where numero = 8) order by cuota;
