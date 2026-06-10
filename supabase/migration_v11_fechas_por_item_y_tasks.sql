-- Migration V11: Pipeline rediseñado — fechas por ítem + tabla de tasks
-- Soporta:
--   - Fechas de campaña a nivel orden_items (cada soporte puede tener fechas distintas)
--   - Tareas automáticas de arte y operaciones generadas al aprobar la OIC
--   - Las lecturas usan COALESCE(item.fecha, orden.fecha) para no romper datos viejos

-- ============================================================
-- 0. Vincular OIC a cotización origen
-- ============================================================
ALTER TABLE ordenes_venta ADD COLUMN IF NOT EXISTS propuesta_id UUID REFERENCES propuestas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ordenes_venta_propuesta ON ordenes_venta(propuesta_id) WHERE propuesta_id IS NOT NULL;

-- ============================================================
-- 1. Fechas por ítem en orden_items
-- ============================================================
ALTER TABLE orden_items ADD COLUMN IF NOT EXISTS fecha_alta_prevista DATE;
ALTER TABLE orden_items ADD COLUMN IF NOT EXISTS fecha_alta_real     DATE;
ALTER TABLE orden_items ADD COLUMN IF NOT EXISTS fecha_baja_prevista DATE;
ALTER TABLE orden_items ADD COLUMN IF NOT EXISTS fecha_baja_real     DATE;

-- Backfill: copiar las fechas actuales del cabezal de orden a cada ítem
UPDATE orden_items oi
SET
  fecha_alta_prevista = COALESCE(oi.fecha_alta_prevista, ov.fecha_alta_prevista),
  fecha_alta_real     = COALESCE(oi.fecha_alta_real,     ov.fecha_alta_real),
  fecha_baja_prevista = COALESCE(oi.fecha_baja_prevista, ov.fecha_baja_prevista),
  fecha_baja_real     = COALESCE(oi.fecha_baja_real,     ov.fecha_baja_real)
FROM ordenes_venta ov
WHERE oi.orden_id = ov.id;

CREATE INDEX IF NOT EXISTS idx_orden_items_alta ON orden_items(fecha_alta_prevista, fecha_alta_real);
CREATE INDEX IF NOT EXISTS idx_orden_items_baja ON orden_items(fecha_baja_prevista, fecha_baja_real);

-- ============================================================
-- 2. Tabla de tareas (arte / operaciones)
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          TEXT NOT NULL CHECK (tipo IN (
                  'arte_muestra_color',
                  'arte_chequear_material_digital',
                  'ops_asignar_buses',
                  'ops_producir_impresos',
                  'ops_crear_comprobante'
                )),
  asignado_a_rol TEXT NOT NULL CHECK (asignado_a_rol IN ('arte', 'operaciones')),
  asignado_a    UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  orden_id      UUID NOT NULL REFERENCES ordenes_venta(id) ON DELETE CASCADE,
  orden_item_id UUID REFERENCES orden_items(id) ON DELETE CASCADE,
  soporte_id    UUID REFERENCES soportes(id) ON DELETE SET NULL,
  estado        TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'en_progreso', 'completada')),
  descripcion   TEXT,
  fecha_limite  DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_rol_estado  ON tasks(asignado_a_rol, estado);
CREATE INDEX IF NOT EXISTS idx_tasks_orden       ON tasks(orden_id);
CREATE INDEX IF NOT EXISTS idx_tasks_asignado_a  ON tasks(asignado_a) WHERE asignado_a IS NOT NULL;

-- ============================================================
-- 3. RLS habilitada (service_role bypassea; el resto se enfuerza vía API)
-- ============================================================
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Future-proof: grants explícitos para cuando Supabase enforce esto en Octubre 2026
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO service_role;
GRANT SELECT, INSERT, UPDATE          ON tasks TO authenticated;
