-- ============================================================
-- Migration v18 — Facturación, cobro y comisiones automáticas
-- ============================================================
--
-- Idempotente. Asume que existen las tablas ordenes_venta, comisiones y pagos
-- (creadas en supabase_crm.sql).  Si tu instancia es defensiva como en v16,
-- las cláusulas IF NOT EXISTS / DO ... END se encargan de saltear lo aplicable.
--
-- Cambios:
--   1. ordenes_venta: agrega fecha_facturacion, fecha_cobro, factura_numero
--   2. comisiones: estado TEXT (sustituye al BOOLEAN liquidada que estaba
--      definido en el schema inicial — la UI ya usa "estado")
--   3. comisiones: pago_id pasa a NULLABLE (permite generar la comisión al
--      marcar la OIC como cobrada incluso si no hay registro en pagos)
--   4. Backfill: si quedó algún row con liquidada=true, marcarlo pagada
-- ============================================================

-- 1. Columnas de facturación/cobro en ordenes_venta
ALTER TABLE ordenes_venta ADD COLUMN IF NOT EXISTS fecha_facturacion DATE;
ALTER TABLE ordenes_venta ADD COLUMN IF NOT EXISTS fecha_cobro       DATE;
ALTER TABLE ordenes_venta ADD COLUMN IF NOT EXISTS factura_numero    TEXT;

-- 2-3. Ajustes en comisiones
DO $$
BEGIN
  -- Solo si la tabla existe
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='comisiones'
  ) THEN
    -- pago_id nullable (idempotente)
    BEGIN
      ALTER TABLE comisiones ALTER COLUMN pago_id DROP NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      -- columna ya nullable, o nombre distinto — seguir
      NULL;
    END;

    -- agregar columna estado si no existe
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='comisiones' AND column_name='estado'
    ) THEN
      ALTER TABLE comisiones ADD COLUMN estado TEXT NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente','pagada','cancelada'));
    END IF;

    -- backfill desde liquidada si existe esa columna
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='comisiones' AND column_name='liquidada'
    ) THEN
      UPDATE comisiones SET estado='pagada' WHERE liquidada IS TRUE AND estado='pendiente';
    END IF;
  END IF;
END $$;

-- 4. Índices para queries del dashboard de admin
CREATE INDEX IF NOT EXISTS idx_ordenes_venta_fecha_facturacion ON ordenes_venta(fecha_facturacion);
CREATE INDEX IF NOT EXISTS idx_ordenes_venta_fecha_cobro       ON ordenes_venta(fecha_cobro);
CREATE INDEX IF NOT EXISTS idx_comisiones_vendedor_estado      ON comisiones(vendedor_id, estado);
