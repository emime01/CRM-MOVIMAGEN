-- v40 · Cobranzas por factura
--
-- Etapa 3 del plan de Administración. Requiere la v39 (tabla `facturas`).
--
-- La planilla de deudores es por FACTURA: cada fila es una cuota emitida con
-- su vencimiento, sus días de atraso y el último comentario ("Envié mail
-- 28/9", "Mandé wpp"). Y cuando la agencia dice qué día paga, Belén lo anota
-- y vuelve a mirar ese día.
--
-- Esta migración:
--   1. Liga cada gestión de cobranza a la factura que se está gestionando.
--   2. Suma el área Administración a las tareas, con un tipo nuevo:
--      verificar el pago que la agencia prometió para tal día.
--   3. Liga la tarea a su factura, para cerrarla sola cuando entra el cobro.
--
-- Idempotente.

-- ── 1. Gestiones por factura ────────────────────────────────────────────────
alter table gestiones_cobranza
  add column if not exists factura_id uuid references facturas(id) on delete set null;

create index if not exists idx_gestiones_cobranza_factura
  on gestiones_cobranza (factura_id, created_at desc);

-- Las gestiones que ya había eran de la venta entera. Si la venta tiene una
-- sola factura abierta, son de esa.
update gestiones_cobranza g
   set factura_id = f.id
  from facturas f
 where g.factura_id is null
   and f.orden_id = g.orden_id
   and f.tipo = 'factura'
   and (select count(*) from facturas f2
         where f2.orden_id = g.orden_id and f2.tipo = 'factura' and f2.estado <> 'anulada') = 1;

-- ── 2. Tareas de Administración ─────────────────────────────────────────────
-- Se sueltan los CHECK de tipo y de área que haya, se llamen como se llamen,
-- y se vuelven a poner con los valores nuevos.
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
  'admin_verificar_pago'
));

alter table tasks drop constraint if exists tasks_asignado_a_rol_check;
alter table tasks add constraint tasks_asignado_a_rol_check
  check (asignado_a_rol in ('arte', 'operaciones', 'administracion'));

-- ── 3. La tarea sabe de qué factura es ──────────────────────────────────────
alter table tasks add column if not exists factura_id uuid references facturas(id) on delete cascade;

create index if not exists idx_tasks_factura on tasks (factura_id) where factura_id is not null;

-- Una sola tarea abierta de seguimiento por factura: si la agencia cambia la
-- fecha, se mueve la tarea, no se apila otra.
create unique index if not exists uq_tasks_pago_abierto
  on tasks (factura_id)
  where tipo = 'admin_verificar_pago' and estado <> 'completada';
