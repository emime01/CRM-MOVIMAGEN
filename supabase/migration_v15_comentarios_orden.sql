-- Migration V15: comentarios en órdenes de venta
--
-- Hilo de discusión por OIC donde vendedor, arte, operaciones y admin
-- pueden hablar sobre ese trabajo específico. Reemplaza el "te paso por
-- WhatsApp" que se pierde y no queda asociado a la venta.

CREATE TABLE IF NOT EXISTS comentarios_orden (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id    UUID NOT NULL REFERENCES ordenes_venta(id) ON DELETE CASCADE,
  perfil_id   UUID NOT NULL REFERENCES perfiles(id) ON DELETE SET NULL,
  mensaje     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comentarios_orden_orden ON comentarios_orden(orden_id, created_at DESC);

ALTER TABLE comentarios_orden ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON comentarios_orden TO service_role;
GRANT SELECT, INSERT, UPDATE          ON comentarios_orden TO authenticated;
