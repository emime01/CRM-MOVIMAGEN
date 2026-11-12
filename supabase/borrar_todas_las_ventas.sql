-- Borrar TODAS las ventas, cotizaciones, leads y clientes de prueba
-- (arranque en limpio, noviembre 2026)
--
-- NO es una migración: es un script de una sola vez y NO SE PUEDE DESHACER.
--
-- Borra:
--   · Todas las ventas (OIC), incluida la #8 de Abitab, con todo lo que cuelga
--     de ellas: líneas, buses asignados, cuotas y facturas, notas de crédito,
--     cobros, comisiones, gestiones de cobranza, tareas, fotos de registros,
--     comprobantes, documentos, comentarios e historial.
--   · Las comisiones de agencia registradas al facturar.
--   · El canon: liquidaciones mensuales, planes de cuotas y líneas diferidas
--     (se recalcula con las ventas nuevas).
--   · Todos los bloqueos de soportes (reservas).
--   · Todas las cotizaciones y todos los leads.
--   · Los clientes y agencias [PRUEBA] con sus contactos y regalos.
--   · Todas las notificaciones (eran de esas ventas, leads y tareas).
--   · Reinicia la numeración: la próxima venta es la OIC #1 y la próxima
--     cotización la COT-0001.
--
-- NO toca: clientes, agencias y contactos reales, soportes, buses, shoppings
-- del canon, objetivos, bonos, usuarios ni configuración.
--
-- Los gastos de tarjeta que estaban asociados a una venta quedan, sin venta.
-- Los archivos de fotos y comprobantes quedan en Storage (no molestan; se
-- pueden borrar a mano desde Storage → registros / comprobantes).
--
-- Corré primero el bloque de VERIFICACIÓN para ver cuánto se va a borrar.

-- ─── VERIFICACIÓN (no borra nada) ────────────────────────────────────────────
-- select 'ventas' t, count(*) from ordenes_venta
-- union all select 'facturas',     count(*) from facturas
-- union all select 'comisiones',   count(*) from comisiones
-- union all select 'tareas',       count(*) from tasks
-- union all select 'registros',    count(*) from registros
-- union all select 'bloqueos',     count(*) from reservas
-- union all select 'cotizaciones', count(*) from propuestas
-- union all select 'leads',        count(*) from leads
-- union all select 'clientes [PRUEBA]', count(*) from clientes where nombre ilike '[PRUEBA]%' or empresa ilike '[PRUEBA]%'
-- union all select 'agencias [PRUEBA]', count(*) from agencias where nombre ilike '[PRUEBA]%';

begin;

-- Borra todo de una tabla, si la tabla existe en esta base.
create or replace function pg_temp.vaciar(tabla text) returns void language plpgsql as $$
begin
  if to_regclass('public.' || tabla) is not null then
    execute format('delete from public.%I', tabla);
  end if;
end $$;

-- Lo que cuelga de las ventas y las facturas.
select pg_temp.vaciar('notificaciones');
select pg_temp.vaciar('comisiones');
select pg_temp.vaciar('pagos');
select pg_temp.vaciar('tasks');
select pg_temp.vaciar('gestiones_cobranza');
select pg_temp.vaciar('comisiones_agencia');
select pg_temp.vaciar('facturas');
select pg_temp.vaciar('canon_mensual');
select pg_temp.vaciar('canon_diferidos');
select pg_temp.vaciar('canon_planes');
select pg_temp.vaciar('registros');
select pg_temp.vaciar('comprobantes');
select pg_temp.vaciar('materiales_digitales');
select pg_temp.vaciar('muestras_impresion');
select pg_temp.vaciar('orden_historial');
select pg_temp.vaciar('orden_documentos');
select pg_temp.vaciar('comentarios_orden');
select pg_temp.vaciar('orden_item_buses');

-- Gastos de tarjeta: quedan, sin la venta. Sugerencias de mail: sin lead ni venta.
do $$ begin
  if to_regclass('public.gastos_tarjeta') is not null then
    begin
      update gastos_tarjeta set orden_id = null where orden_id is not null;
    exception when not_null_violation then
      delete from gastos_tarjeta where orden_id is not null;
    end;
  end if;
  if to_regclass('public.email_suggestions') is not null then
    update email_suggestions set lead_id = null, orden_id = null where lead_id is not null or orden_id is not null;
  end if;
end $$;

-- Bloqueos de soportes.
select pg_temp.vaciar('reserva_items');
select pg_temp.vaciar('reservas');

-- Las ventas.
select pg_temp.vaciar('orden_items');
select pg_temp.vaciar('ordenes_venta');

-- Cotizaciones y leads.
select pg_temp.vaciar('propuesta_items');
select pg_temp.vaciar('propuestas');
select pg_temp.vaciar('leads');

-- Clientes [PRUEBA] con sus contactos (y los regalos de esos contactos).
do $$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids from clientes where nombre ilike '[PRUEBA]%' or empresa ilike '[PRUEBA]%';
  if v_ids is not null then
    if to_regclass('public.regalos') is not null then
      delete from regalos where contacto_id in (select id from contactos where cuenta_id = any(v_ids));
    end if;
    delete from contactos where cuenta_id = any(v_ids);
    if to_regclass('public.cliente_objetivos') is not null then
      delete from cliente_objetivos where cliente_id = any(v_ids);
    end if;
    delete from clientes where id = any(v_ids);
  end if;
end $$;

-- Agencias [PRUEBA] con sus contactos (y los regalos de esos contactos).
do $$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids from agencias where nombre ilike '[PRUEBA]%';
  if v_ids is not null then
    update clientes set agencia_id = null where agencia_id = any(v_ids);
    if to_regclass('public.regalos') is not null then
      delete from regalos where contacto_id in (select id from contactos where cuenta_id = any(v_ids));
    end if;
    delete from contactos where cuenta_id = any(v_ids);
    delete from agencias where id = any(v_ids);
  end if;
end $$;

-- Numeración desde cero: OIC #1 y COT-0001.
do $$ begin
  if exists (select 1 from pg_class where relname = 'ordenes_venta_numero_seq' and relkind = 'S') then
    alter sequence ordenes_venta_numero_seq restart with 1;
  end if;
  if exists (select 1 from pg_class where relname = 'propuestas_numero_seq' and relkind = 'S') then
    -- El CRM pide nextval: con is_called = false el próximo es el 1.
    perform setval('propuestas_numero_seq', 1, false);
  end if;
end $$;

commit;

-- ─── CONTROL (después de correrlo, todo en 0) ────────────────────────────────
-- select 'ventas' t, count(*) from ordenes_venta
-- union all select 'facturas', count(*) from facturas
-- union all select 'cotizaciones', count(*) from propuestas
-- union all select 'leads', count(*) from leads;
