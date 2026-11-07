-- Borrar los datos de la prueba con agentes (noviembre 2026)
--
-- NO es una migración: es un script de una sola vez.
--
-- Borra las ventas de prueba OIC #11 y OIC #13 ([PRUEBA] Cliente Agentes /
-- [PRUEBA] vendedor) con todo lo que cuelga de ellas: cuotas, las facturas
-- PRUEBA-0001 y PRUEBA-0002 (y el saldo del cobro parcial), la nota de crédito
-- PRUEBA-NC-0001, cobros, comisiones, gestiones de cobranza, tareas, fotos de
-- registros, comprobantes, documentos, comentarios, historial y
-- notificaciones. También la cotización COT-7179, el lead y el cliente.
-- La OIC #12 (duplicada) ya se borró desde la pantalla.
--
-- Además deja como estaba la tarea REAL de la OIC #8 (Abitab) que el agente de
-- operaciones movió por error: vuelve a pendiente y sin asignar.
--
-- NO toca la OIC #8 ni ningún otro dato real. Los archivos de prueba que
-- quedan en Storage (registros/, comprobantes/ y ordenes-docs/ con los ids de
-- abajo) se pueden borrar a mano desde Storage; no molestan.
--
-- Corré primero el bloque de VERIFICACIÓN para ver qué se va a borrar.

-- ─── VERIFICACIÓN (no borra nada) ────────────────────────────────────────────
-- select 'ventas' t, count(*) from ordenes_venta where id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc')
-- union all select 'facturas',   count(*) from facturas   where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc')
-- union all select 'comisiones', count(*) from comisiones where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc')
-- union all select 'tareas',     count(*) from tasks      where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc')
-- union all select 'registros',  count(*) from registros  where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc')
-- union all select 'cotizacion', count(*) from propuestas where id = '1ed8d006-21c2-4338-8bd0-2f4a92f36c54'
-- union all select 'lead',       count(*) from leads      where id = 'f1bf72a3-470a-4e43-8e9e-e9aab49a2efd'
-- union all select 'cliente',    count(*) from clientes   where id = 'd23bd159-7183-4617-bb01-8e7b1ed707fb';

begin;

delete from comisiones           where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc');
delete from pagos                where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc');
delete from tasks                where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc');
delete from gestiones_cobranza   where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc');
delete from facturas             where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc');
delete from registros            where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc');
delete from comprobantes         where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc');
delete from materiales_digitales where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc');
delete from orden_historial      where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc');
delete from orden_documentos     where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc');
delete from gastos_tarjeta       where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc');
do $$ begin
  if to_regclass('public.muestras_impresion') is not null then
    delete from muestras_impresion where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc');
  end if;
  if to_regclass('public.comentarios_orden') is not null then
    delete from comentarios_orden where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc');
  end if;
  if to_regclass('public.orden_item_buses') is not null then
    delete from orden_item_buses where orden_item_id in (select id from orden_items where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc'));
  end if;
  if to_regclass('public.notificaciones') is not null then
    execute $q$ delete from notificaciones where entity_id::text in (
      'de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc', 'da51bec9-4488-42cb-ab61-2e15a1c1020e',
      '1ed8d006-21c2-4338-8bd0-2f4a92f36c54', 'f1bf72a3-470a-4e43-8e9e-e9aab49a2efd') $q$;
  end if;
end $$;

-- Bloqueos ligados a las ventas, la cotización, el lead o el cliente de prueba.
do $$
declare v_ids uuid[];
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reservas' and column_name = 'cliente_id') then
    execute $q$ select array_agg(id) from reservas
      where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc')
         or propuesta_id = '1ed8d006-21c2-4338-8bd0-2f4a92f36c54'
         or lead_id = 'f1bf72a3-470a-4e43-8e9e-e9aab49a2efd'
         or cliente_id = 'd23bd159-7183-4617-bb01-8e7b1ed707fb' $q$ into v_ids;
  else
    select array_agg(id) into v_ids from reservas
      where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc')
         or propuesta_id = '1ed8d006-21c2-4338-8bd0-2f4a92f36c54'
         or lead_id = 'f1bf72a3-470a-4e43-8e9e-e9aab49a2efd';
  end if;
  if v_ids is not null then
    delete from reserva_items where reserva_id = any(v_ids);
    delete from reservas      where id = any(v_ids);
  end if;
end $$;

delete from orden_items   where orden_id in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc');
delete from ordenes_venta where id       in ('de197407-0aa6-4856-bd5e-977911a0e133', 'fe43c27c-5042-4b36-aeb9-9e1e02e2d2fc');

update leads set propuesta_ganadora_id = null where id = 'f1bf72a3-470a-4e43-8e9e-e9aab49a2efd';
delete from propuesta_items where propuesta_id = '1ed8d006-21c2-4338-8bd0-2f4a92f36c54';
delete from propuestas      where id = '1ed8d006-21c2-4338-8bd0-2f4a92f36c54';
delete from leads           where id = 'f1bf72a3-470a-4e43-8e9e-e9aab49a2efd';

delete from contactos where cuenta_id = 'd23bd159-7183-4617-bb01-8e7b1ed707fb';
do $$ begin
  if to_regclass('public.cliente_objetivos') is not null then
    delete from cliente_objetivos where cliente_id = 'd23bd159-7183-4617-bb01-8e7b1ed707fb';
  end if;
end $$;
delete from clientes where id = 'd23bd159-7183-4617-bb01-8e7b1ed707fb';

-- La tarea REAL de la OIC #8 que se movió por error: pendiente y sin asignar.
update tasks set estado = 'pendiente', completed_at = null, asignado_a = null
 where id = '4dcdcdf0-3cc2-4c71-b556-7b86745a29fe';

commit;
