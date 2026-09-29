-- ═══════════════════════════════════════════════════════════════════════════
-- v27 · La cotización hereda la agencia del lead
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Las cotizaciones ahora nacen siempre de un lead, así que traen su cliente y
-- su agencia. `leads` y `ordenes_venta` ya tenían agencia_id; faltaba el
-- eslabón del medio para que la agencia llegue hasta la OIC, que es donde se
-- liquidan sus comisiones (ver comisiones_agencia).
--
-- Idempotente. Ya aplicada en la base del proyecto.

ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS agencia_id UUID REFERENCES agencias(id);
CREATE INDEX IF NOT EXISTS idx_propuestas_agencia ON propuestas(agencia_id);
COMMENT ON COLUMN propuestas.agencia_id IS 'Agencia heredada del lead al crear la cotización.';
