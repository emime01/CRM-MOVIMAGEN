-- Limpieza de los datos de prueba de la simulación del proceso de venta
--
-- NO es una migración: es un script de una sola vez. No lo guardes en el
-- historial de migraciones.
--
-- Borra los leads de prueba y todo lo que cuelga de ellos. Buena parte ya se
-- borró desde la app (ítems, historial, bloqueos, registros, comprobantes);
-- lo que queda son las tablas que RLS no deja tocar desde una sesión de
-- usuario, que es justamente como tiene que ser: comisiones y pagos sólo se
-- escriben desde el servidor.
--
-- NO toca: buses (276, la flota real de la planilla de abril), clientes,
-- agencias, soportes, objetivos, cliente_objetivos ni perfiles.
--
-- Corré primero el bloque de VERIFICACIÓN para ver qué se va a borrar.

-- ─── VERIFICACIÓN (no borra nada) ────────────────────────────────────────────
-- select 'leads'        t, count(*) from leads
-- union all select 'ventas',      count(*) from ordenes_venta
-- union all select 'tareas',      count(*) from tasks
-- union all select 'comisiones',  count(*) from comisiones
-- union all select 'pagos',       count(*) from pagos
-- union all select 'BUSES (no se tocan)', count(*) from buses;

begin;

-- Lo que cuelga de la venta. El orden importa: pagos y comisiones tienen FK
-- hacia ordenes_venta y la bloquean.
delete from comisiones;
delete from pagos;
delete from tasks;
delete from registros;
delete from comprobantes;
delete from orden_historial;
delete from orden_documentos;
delete from orden_items;
delete from gestiones_cobranza;

-- Los bloqueos apuntan a la venta y al lead.
delete from reserva_items;
delete from reservas;

delete from ordenes_venta;

-- Las cotizaciones ya no están, pero el lead puede conservar el puntero.
update leads set propuesta_ganadora_id = null;
delete from propuesta_items;
delete from propuestas;

delete from leads;

commit;

-- ─── CONTROL ─────────────────────────────────────────────────────────────────
-- Tiene que dar 0 en todo menos en buses, que sigue en 276.
--
-- select 'leads' t, count(*) from leads
-- union all select 'ventas',     count(*) from ordenes_venta
-- union all select 'comisiones', count(*) from comisiones
-- union all select 'pagos',      count(*) from pagos
-- union all select 'tareas',     count(*) from tasks
-- union all select 'buses',      count(*) from buses;
