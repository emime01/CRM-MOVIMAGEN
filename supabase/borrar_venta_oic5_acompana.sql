-- Borrar la venta OIC #5 (Acompaña · Alva · Fabián · $5.200) de prueba
--
-- NO es una migración: es un script de una sola vez. No lo guardes en el
-- historial de migraciones.
--
-- Se cargó a mano (no viene de un lead ni de una cotización). Borra la venta y
-- todo lo que cuelga de ella: las 12 cuotas, el cobro de la cuota 1 y su
-- comisión, la tarea y las gestiones de cobranza, ítems, historial,
-- comentarios, documentos y lo de arte (muestras y materiales). Los bloqueos que apunten a la venta se liberan.
--
-- NO toca el cliente Acompaña, la agencia Alva ni nada de otras ventas.
--
-- Corré primero el bloque de VERIFICACIÓN para ver qué se va a borrar.

-- ─── VERIFICACIÓN (no borra nada) ────────────────────────────────────────────
-- select 'venta' t, count(*) from ordenes_venta    where id       = 'df9ded77-957d-4929-898d-f1e89732d411'
-- union all select 'facturas',   count(*) from facturas           where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411'
-- union all select 'comisiones', count(*) from comisiones         where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411'
-- union all select 'pagos',      count(*) from pagos              where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411'
-- union all select 'tareas',     count(*) from tasks              where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411'
-- union all select 'gestiones',  count(*) from gestiones_cobranza where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411';

begin;

-- Primero lo que tiene FK hacia la venta sin borrado en cascada.
delete from comisiones         where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411';
delete from pagos              where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411';
delete from tasks              where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411';
delete from gestiones_cobranza where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411';
delete from facturas           where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411';
delete from registros          where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411';
delete from comprobantes       where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411';
delete from materiales_digitales where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411';
delete from muestras_impresion   where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411';
-- comentarios_orden puede no existir en esta base (la v15 no se corrió).
do $$ begin
  if to_regclass('public.comentarios_orden') is not null then
    delete from comentarios_orden where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411';
  end if;
end $$;
delete from orden_historial    where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411';
delete from orden_documentos   where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411';
delete from orden_items        where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411';

-- Si algún bloqueo quedó ligado a esta venta, se suelta (no se borra).
update reservas set orden_id = null where orden_id = 'df9ded77-957d-4929-898d-f1e89732d411';

delete from ordenes_venta where id = 'df9ded77-957d-4929-898d-f1e89732d411';

commit;

-- ─── CONTROL ─────────────────────────────────────────────────────────────────
-- Tiene que dar 0.
-- select count(*) from ordenes_venta where id = 'df9ded77-957d-4929-898d-f1e89732d411';
