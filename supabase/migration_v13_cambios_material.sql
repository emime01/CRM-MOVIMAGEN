-- Migration V13: cambios de material durante la campaña
--
--   Digital (LED, banner_shopping, circuito): el cliente manda material nuevo
--   y se reemplaza in-place. No genera OIC nueva. Se versiona por orden_item.
--
--   Impreso (estatico_bus, estatico_shopping, medianera): cambiar implica
--   reimprimir e instalar → se crea una OIC HIJA solo de producción
--   (arrendamiento en 0, mismo costo de producción). La OIC madre sigue
--   corriendo. Se vinculan vía oic_origen_id + tipo='cambio_material'.

-- ============================================================
-- 1. Vincular OIC hija de cambio con la madre
-- ============================================================
ALTER TABLE ordenes_venta ADD COLUMN IF NOT EXISTS oic_origen_id UUID REFERENCES ordenes_venta(id) ON DELETE SET NULL;
ALTER TABLE ordenes_venta ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'venta'
  CHECK (tipo IN ('venta', 'cambio_material'));

CREATE INDEX IF NOT EXISTS idx_ordenes_venta_oic_origen ON ordenes_venta(oic_origen_id) WHERE oic_origen_id IS NOT NULL;

-- ============================================================
-- 2. Cambios de material para soportes DIGITALES
-- ============================================================
CREATE TABLE IF NOT EXISTS cambios_material (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_item_id   UUID NOT NULL REFERENCES orden_items(id) ON DELETE CASCADE,
  fecha_desde     DATE NOT NULL,
  url_material    TEXT,
  nombre_archivo  TEXT,
  descripcion     TEXT,
  created_by      UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cambios_material_orden_item ON cambios_material(orden_item_id);
CREATE INDEX IF NOT EXISTS idx_cambios_material_fecha     ON cambios_material(fecha_desde DESC);

ALTER TABLE cambios_material ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON cambios_material TO service_role;
GRANT SELECT, INSERT, UPDATE          ON cambios_material TO authenticated;
