-- Borrar la prueba de facturación y cobranza con Belén (noviembre 2026)
--
-- NO es una migración: es un script de una sola vez. Correrlo cuando termine
-- la prueba.
--
-- Borra las 13 ventas de prueba (campaña "[PRUEBA] Caso N · ..."), con todo
-- lo que se haya hecho sobre ellas en la prueba: facturas, cobros, notas de
-- crédito, comisiones, gestiones de cobranza, tareas, registros, comprobantes,
-- comentarios, notificaciones. También los 4 clientes [PRUEBA] y la agencia
-- "[PRUEBA] Agencia Demo".
--
-- Si después de la prueba no queda ninguna venta real, la numeración vuelve a
-- empezar en la OIC #1. Si ya hay ventas reales, sigue después de la última.
--
-- Corré primero la VERIFICACIÓN para ver qué se va a borrar.

-- ─── VERIFICACIÓN (no borra nada) ────────────────────────────────────────────
-- select numero, campana, estado, monto_total from ordenes_venta
--  where campana like '[PRUEBA] Caso %' order by numero;

begin;

create temporary table _ventas_prueba on commit drop as
  select id from ordenes_venta where campana like '[PRUEBA] Caso %';

create or replace function pg_temp.borrar_de(tabla text, columna text) returns void language plpgsql as $$
begin
  if to_regclass('public.' || tabla) is not null then
    execute format('delete from public.%I where %I in (select id from _ventas_prueba)', tabla, columna);
  end if;
end $$;

-- Notificaciones de esas ventas (avisos de aprobación, tareas, cobranza…)
do $$ begin
  if to_regclass('public.notificaciones') is not null then
    delete from notificaciones where entity_id::text in (select id::text from _ventas_prueba)
       or entity_id::text in (select id::text from facturas where orden_id in (select id from _ventas_prueba));
  end if;
end $$;

select pg_temp.borrar_de('comisiones', 'orden_id');
select pg_temp.borrar_de('pagos', 'orden_id');
do $$ begin
  -- tareas de la venta y de sus facturas (promesas de pago)
  delete from tasks where orden_id in (select id from _ventas_prueba)
     or factura_id in (select id from facturas where orden_id in (select id from _ventas_prueba));
end $$;
select pg_temp.borrar_de('gestiones_cobranza', 'orden_id');
select pg_temp.borrar_de('facturas', 'orden_id');
select pg_temp.borrar_de('registros', 'orden_id');
select pg_temp.borrar_de('comprobantes', 'orden_id');
select pg_temp.borrar_de('materiales_digitales', 'orden_id');
select pg_temp.borrar_de('orden_historial', 'orden_id');
select pg_temp.borrar_de('orden_documentos', 'orden_id');
select pg_temp.borrar_de('comentarios_orden', 'orden_id');
do $$ begin
  if to_regclass('public.gastos_tarjeta') is not null then
    delete from gastos_tarjeta where orden_id in (select id from _ventas_prueba);
  end if;
  if to_regclass('public.orden_item_buses') is not null then
    delete from orden_item_buses where orden_item_id in (select id from orden_items where orden_id in (select id from _ventas_prueba));
  end if;
  update reservas set orden_id = null where orden_id in (select id from _ventas_prueba);
end $$;
select pg_temp.borrar_de('orden_items', 'orden_id');
delete from ordenes_venta where id in (select id from _ventas_prueba);

-- Canon mensual: se recalcula con las ventas que quedan.
do $$ begin
  if to_regclass('public.canon_mensual') is not null
     and not exists (select 1 from ordenes_venta) then
    delete from canon_mensual;
  end if;
end $$;

-- Clientes y agencia de prueba
do $$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids from clientes
   where nombre in ('[PRUEBA] Directo SA', '[PRUEBA] Marca con Agencia SA', '[PRUEBA] Exportadora USD SA', '[PRUEBA] Canje Medios SA');
  if v_ids is not null then
    delete from leads where cliente_id = any(v_ids);
    delete from contactos where cuenta_id = any(v_ids);
    if to_regclass('public.cliente_objetivos') is not null then
      delete from cliente_objetivos where cliente_id = any(v_ids);
    end if;
    delete from clientes where id = any(v_ids);
  end if;
  delete from contactos where cuenta_id in (select id from agencias where nombre = '[PRUEBA] Agencia Demo');
  delete from agencias where nombre = '[PRUEBA] Agencia Demo';
end $$;

-- Numeración: después de la última venta que quede (o desde la #1).
do $$
declare mx bigint;
begin
  if exists (select 1 from pg_class where relname = 'ordenes_venta_numero_seq' and relkind = 'S') then
    select coalesce(max(numero), 0) into mx from ordenes_venta;
    perform setval('ordenes_venta_numero_seq', greatest(mx, 1), mx > 0);
  end if;
end $$;

commit;
