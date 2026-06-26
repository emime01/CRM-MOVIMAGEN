-- ============================================================
-- Migration v21 — Índices para listados frecuentes
-- ============================================================
--
-- Los dashboards filtran constantemente por (vendedor_id, estado) en leads,
-- ordenes_venta y propuestas. Sin índice compuesto, Postgres hace seq scan
-- a medida que crecen las tablas. Idempotente.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_leads_vendedor_estado
  ON leads(vendedor_id, estado);

CREATE INDEX IF NOT EXISTS idx_ordenes_venta_vendedor_estado
  ON ordenes_venta(vendedor_id, estado);

CREATE INDEX IF NOT EXISTS idx_propuestas_vendedor_estado
  ON propuestas(vendedor_id, estado);

-- Filtros por cliente (historial de cuenta, disponibilidad)
CREATE INDEX IF NOT EXISTS idx_leads_cliente        ON leads(cliente_id);
CREATE INDEX IF NOT EXISTS idx_propuestas_cliente    ON propuestas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_venta_cliente ON ordenes_venta(cliente_id);
