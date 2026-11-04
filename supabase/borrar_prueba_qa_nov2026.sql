-- Borrar los datos de la prueba general (noviembre 2026)
--
-- NO es una migración: es un script de una sola vez.
--
-- Borra las ventas de prueba OIC #9 y OIC #10 ([PRUEBA] Cliente QA SA /
-- [PRUEBA] vendedor) con todo lo que cuelga de ellas (cuotas, la factura QA-0001 y su cobro, la
-- nota de crédito NC-QA-1, la comisión, las tareas, el historial y las
-- notificaciones), la cotización COT-7178, el lead y el cliente de prueba.
--
-- También el bloqueo de prueba (Lateral 1 Paño, rechazado) del cliente QA.
--
-- NO toca la OIC #8 (Abitab) ni ningún otro dato real. La numeración sigue:
-- la próxima venta va a ser la #11.
--
-- Corré primero el bloque de VERIFICACIÓN para ver qué se va a borrar.

-- ─── VERIFICACIÓN (no borra nada) ────────────────────────────────────────────
-- select 'venta' t, count(*) from ordenes_venta where id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999')
-- union all select 'facturas',   count(*) from facturas   where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999')
-- union all select 'comisiones', count(*) from comisiones where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999')
-- union all select 'tareas',     count(*) from tasks      where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999')
-- union all select 'cotizacion', count(*) from propuestas where id = 'd2787274-2aeb-431c-94ac-4b7e0ddf0ccb'
-- union all select 'lead',       count(*) from leads      where id = 'bb1569ee-5887-404a-b977-3e38361f30b5'
-- union all select 'cliente',    count(*) from clientes   where id = '6ec0bf23-bf1d-4600-a9b2-d5feead454b6';

begin;

delete from comisiones           where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999');
delete from pagos                where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999');
delete from tasks                where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999');
delete from gestiones_cobranza   where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999');
delete from facturas             where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999');
delete from registros            where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999');
delete from comprobantes         where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999');
delete from materiales_digitales where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999');
delete from muestras_impresion   where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999');
delete from orden_historial      where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999');
delete from orden_documentos     where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999');
delete from gastos_tarjeta       where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999');
do $$ begin
  if to_regclass('public.comentarios_orden') is not null then
    delete from comentarios_orden where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999');
  end if;
  if to_regclass('public.notificaciones') is not null then
    execute $q$ delete from notificaciones where entity_id::text in (
      'c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999', 'd2787274-2aeb-431c-94ac-4b7e0ddf0ccb', 'bb1569ee-5887-404a-b977-3e38361f30b5') $q$;
  end if;
end $$;

-- Bloqueos que hayan quedado ligados a la venta, la cotización o el lead.
delete from reserva_items where reserva_id in (
  select id from reservas
   where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999')
      or cliente_id = '6ec0bf23-bf1d-4600-a9b2-d5feead454b6'
      or propuesta_id = 'd2787274-2aeb-431c-94ac-4b7e0ddf0ccb'
      or lead_id = 'bb1569ee-5887-404a-b977-3e38361f30b5');
delete from reservas
 where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999')
    or cliente_id = '6ec0bf23-bf1d-4600-a9b2-d5feead454b6'
    or propuesta_id = 'd2787274-2aeb-431c-94ac-4b7e0ddf0ccb'
    or lead_id = 'bb1569ee-5887-404a-b977-3e38361f30b5';

delete from orden_items   where orden_id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999');
delete from ordenes_venta where id       in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999');

update leads set propuesta_ganadora_id = null where id = 'bb1569ee-5887-404a-b977-3e38361f30b5';
delete from propuesta_items where propuesta_id = 'd2787274-2aeb-431c-94ac-4b7e0ddf0ccb';
delete from propuestas      where id = 'd2787274-2aeb-431c-94ac-4b7e0ddf0ccb';
delete from leads           where id = 'bb1569ee-5887-404a-b977-3e38361f30b5';

delete from contactos         where cliente_id = '6ec0bf23-bf1d-4600-a9b2-d5feead454b6';
delete from cliente_objetivos where cliente_id = '6ec0bf23-bf1d-4600-a9b2-d5feead454b6';
delete from clientes          where id = '6ec0bf23-bf1d-4600-a9b2-d5feead454b6';

commit;

-- ─── CONTROL ─────────────────────────────────────────────────────────────────
-- Tiene que dar 0 en las tres.
-- select (select count(*) from ordenes_venta where id in ('c7133bd0-629a-4207-9c86-252b76ed26e8', 'a8fd5286-e710-49ea-a209-7904cd1fd999')),
--        (select count(*) from propuestas    where id = 'd2787274-2aeb-431c-94ac-4b7e0ddf0ccb'),
--        (select count(*) from clientes      where id = '6ec0bf23-bf1d-4600-a9b2-d5feead454b6');
