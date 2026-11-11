-- v50 · Renovaciones y seguimiento de propuestas (tareas del vendedor)
--
-- Las tareas hasta ahora eran de arte, operaciones y administración. Esto suma
-- el área "ventas" para dos avisos automáticos del cron diario:
--   · vendedor_renovacion: ofrecer la renovación de una campaña que termina.
--   · vendedor_seguimiento_propuesta: una cotización enviada sin respuesta.
--
-- Cambios sobre `tasks`:
--   1. orden_id deja de ser obligatorio (el seguimiento cuelga de la cotización).
--   2. propuesta_id: la cotización de la tarea (se borra con ella).
--   3. Tipos nuevos y área 'ventas' en los CHECK (se incluye también
--      admin_seguimiento_cobranza, que el código ya usaba).
--   4. Índices únicos para que el cron nunca duplique:
--      una renovación por venta, un seguimiento abierto por cotización.
--
-- Idempotente.

-- 1. La tarea puede no tener orden.
alter table tasks alter column orden_id drop not null;

-- 2. La cotización de la tarea.
alter table tasks add column if not exists propuesta_id uuid references propuestas(id) on delete cascade;
create index if not exists idx_tasks_propuesta on tasks (propuesta_id) where propuesta_id is not null;

-- 3. CHECK de tipo y de área, sin importar cómo se llamen hoy.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.tasks'::regclass and contype = 'c'
       and (pg_get_constraintdef(oid) ilike '%tipo%' or pg_get_constraintdef(oid) ilike '%asignado_a_rol%')
  loop
    execute format('alter table tasks drop constraint %I', c.conname);
  end loop;
end $$;

alter table tasks drop constraint if exists tasks_tipo_check;
alter table tasks add constraint tasks_tipo_check check (tipo in (
  'arte_muestra_color',
  'arte_chequear_material_digital',
  'ops_asignar_buses',
  'ops_producir_impresos',
  'ops_crear_comprobante',
  'admin_verificar_pago',
  'admin_seguimiento_cobranza',
  'vendedor_renovacion',
  'vendedor_seguimiento_propuesta'
));

alter table tasks drop constraint if exists tasks_asignado_a_rol_check;
alter table tasks add constraint tasks_asignado_a_rol_check
  check (asignado_a_rol in ('arte', 'operaciones', 'administracion', 'ventas'));

-- 4. Sin duplicados.
create unique index if not exists uq_tasks_renovacion_por_venta
  on tasks (orden_id)
  where tipo = 'vendedor_renovacion';

create unique index if not exists uq_tasks_seguimiento_propuesta_abierto
  on tasks (propuesta_id)
  where tipo = 'vendedor_seguimiento_propuesta' and estado <> 'completada';
