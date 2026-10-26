-- Borrar los datos de la prueba punta a punta (octubre 2026)
--
-- NO es una migración: es un script de una sola vez.
--
-- Borra las 4 ventas de prueba (OIC de Coca Cola / Fabián, Frig Doña Coca /
-- [PRUEBA] vendedor, ABASUR / Natalia y ABASUR / Federico), sus cuotas,
-- cobros, comisiones, tareas, gestiones, notificaciones y reservas; las 3
-- cotizaciones y los 2 leads de prueba; y la liquidación de canon de
-- noviembre que se cerró y reabrió en la prueba.
--
-- NO toca clientes, agencias, soportes ni usuarios.

-- ─── VERIFICACIÓN (no borra nada) ────────────────────────────────────────────
-- select 'ventas' t, count(*) from ordenes_venta where id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb')
-- union all select 'cotizaciones', count(*) from propuestas where id in ('c0a1fd18-6358-4982-b2f9-afb621162434', '70244c15-858a-4310-965a-5137ba2b8039', '17aba587-2cc4-4294-a8a5-317a46ba8c08')
-- union all select 'leads', count(*) from leads where id in ('9e0c12af-cd02-4725-a8fa-027f1f2535ac', '5749fa56-2513-4301-970b-7adf9243a60e')
-- union all select 'facturas', count(*) from facturas where orden_id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb')
-- union all select 'comisiones', count(*) from comisiones where orden_id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb');

begin;

delete from comisiones           where orden_id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb');
delete from pagos                where orden_id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb');
delete from tasks                where orden_id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb');
delete from gestiones_cobranza   where orden_id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb');
delete from facturas             where orden_id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb');
delete from registros            where orden_id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb');
delete from comprobantes         where orden_id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb');
delete from materiales_digitales where orden_id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb');
delete from muestras_impresion   where orden_id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb');
delete from orden_historial      where orden_id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb');
delete from orden_documentos     where orden_id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb');
-- notificaciones puede no existir en esta base (la v7 no se corrió).
do $$ begin
  if to_regclass('public.notificaciones') is not null then
    execute $q$ delete from notificaciones where entity_id::text in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb') $q$;
  end if;
end $$;

-- Reservas de las cotizaciones de prueba (y lo que haya quedado ligado a las ventas).
delete from reserva_items where reserva_id in (
  select id from reservas where orden_id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb') or propuesta_id in ('c0a1fd18-6358-4982-b2f9-afb621162434', '70244c15-858a-4310-965a-5137ba2b8039', '17aba587-2cc4-4294-a8a5-317a46ba8c08') or lead_id in ('9e0c12af-cd02-4725-a8fa-027f1f2535ac', '5749fa56-2513-4301-970b-7adf9243a60e'));
delete from reservas where orden_id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb') or propuesta_id in ('c0a1fd18-6358-4982-b2f9-afb621162434', '70244c15-858a-4310-965a-5137ba2b8039', '17aba587-2cc4-4294-a8a5-317a46ba8c08') or lead_id in ('9e0c12af-cd02-4725-a8fa-027f1f2535ac', '5749fa56-2513-4301-970b-7adf9243a60e');

delete from orden_items          where orden_id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb');
delete from ordenes_venta        where id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb');

update leads set propuesta_ganadora_id = null where id in ('9e0c12af-cd02-4725-a8fa-027f1f2535ac', '5749fa56-2513-4301-970b-7adf9243a60e');
delete from propuesta_items      where propuesta_id in ('c0a1fd18-6358-4982-b2f9-afb621162434', '70244c15-858a-4310-965a-5137ba2b8039', '17aba587-2cc4-4294-a8a5-317a46ba8c08');
delete from propuestas           where id in ('c0a1fd18-6358-4982-b2f9-afb621162434', '70244c15-858a-4310-965a-5137ba2b8039', '17aba587-2cc4-4294-a8a5-317a46ba8c08');
delete from leads                where id in ('9e0c12af-cd02-4725-a8fa-027f1f2535ac', '5749fa56-2513-4301-970b-7adf9243a60e');

-- La liquidación de canon de noviembre de Paysandú se creó al cerrar y
-- reabrir en la prueba (quedó abierta). Sólo se borra si sigue abierta.
delete from canon_mensual
 where shopping_id = '1168d38a-593d-45f1-a6bf-c21988b49975' and mes = '2026-11-01' and estado = 'abierto';

commit;

-- ─── CONTROL ─────────────────────────────────────────────────────────────────
-- Tiene que dar 0:
-- select count(*) from ordenes_venta where id in ('898a00e5-ed62-4490-8d7d-b0563c8c70f5', '1f949a59-0eb4-49ea-8099-986857ef91eb', '7c65f65b-ea67-4224-a196-d6407f9f536b', '238a9dbc-667a-48ee-bb68-3e1e6b5471fb');
