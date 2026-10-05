-- ═══════════════════════════════════════════════════════════════════════════
-- v29 · La parte operativa cuelga de la venta; la reserva pasa a ser un hold
-- ═══════════════════════════════════════════════════════════════════════════
-- La reserva sostenía todo lo operativo (bus, registros, comprobantes) y se
-- creaba sola con cada venta. Pero en la práctica es un bloqueo OPCIONAL y
-- ANTERIOR: el vendedor retiene un espacio con riesgo de perderse mientras
-- espera la orden de compra del cliente. Lo operativo pertenece a la venta.
--
-- Idempotente. Ya aplicada en la base del proyecto.

ALTER TABLE orden_items  ADD COLUMN IF NOT EXISTS bus_id   UUID REFERENCES buses(id);
ALTER TABLE registros    ADD COLUMN IF NOT EXISTS orden_id UUID REFERENCES ordenes_venta(id) ON DELETE CASCADE;
ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS orden_id UUID REFERENCES ordenes_venta(id) ON DELETE CASCADE;
ALTER TABLE reservas     ADD COLUMN IF NOT EXISTS vence_el DATE;
ALTER TABLE reservas     ADD COLUMN IF NOT EXISTS motivo   TEXT;

CREATE INDEX IF NOT EXISTS idx_orden_items_bus     ON orden_items(bus_id);
CREATE INDEX IF NOT EXISTS idx_registros_orden     ON registros(orden_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_orden  ON comprobantes(orden_id);
CREATE INDEX IF NOT EXISTS idx_reservas_vence      ON reservas(vence_el);

COMMENT ON COLUMN orden_items.bus_id IS 'Bus asignado a esta línea de la venta.';
COMMENT ON COLUMN reservas.vence_el  IS 'Hasta cuándo retiene el espacio; al vencer se avisa al vendedor.';
COMMENT ON COLUMN reservas.motivo    IS 'Por qué se bloqueó (ej.: esperando la orden de compra).';
