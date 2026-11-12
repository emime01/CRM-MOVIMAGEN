-- v52 · El regalo de cumpleaños le llega a Magaly como tarea
--
-- Cuando un vendedor toca "Enviar regalo" en Próximos cumpleaños, además del
-- registro en `regalos` se crea una tarea "Entregar regalo" para la asistente
-- (rol mixto ventas + operaciones). Marcar la tarea lista deja el regalo
-- "entregado", y al revés.
--
-- Cambios sobre `tasks`:
--   1. Tipo nuevo 'ops_entregar_regalo' en el CHECK.
--   2. regalo_id: el regalo de la tarea (se borra con él).
--   3. Una sola tarea abierta por regalo.
--
-- Requiere la v50 (tasks.orden_id opcional). Idempotente.

alter table tasks add column if not exists regalo_id uuid references regalos(id) on delete cascade;
create index if not exists idx_tasks_regalo on tasks (regalo_id) where regalo_id is not null;

alter table tasks drop constraint if exists tasks_tipo_check;
alter table tasks add constraint tasks_tipo_check check (tipo in (
  'arte_muestra_color',
  'arte_chequear_material_digital',
  'ops_asignar_buses',
  'ops_producir_impresos',
  'ops_crear_comprobante',
  'ops_entregar_regalo',
  'admin_verificar_pago',
  'admin_seguimiento_cobranza',
  'vendedor_renovacion',
  'vendedor_seguimiento_propuesta'
));

create unique index if not exists uq_tasks_regalo_abierto
  on tasks (regalo_id)
  where tipo = 'ops_entregar_regalo' and estado <> 'completada';
