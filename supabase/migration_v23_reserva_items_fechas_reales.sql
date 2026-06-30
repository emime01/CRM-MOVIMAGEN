-- ============================================================
-- Migration v23 — Fechas reales por soporte (reserva_items)
-- ============================================================
--
-- La fecha de la reserva (fecha_desde/hasta) es PROVISORIA. Cuando
-- operaciones instala el soporte en el bus, carga la fecha real acá.
-- A partir de ese momento, en todo el CRM se muestra la fecha real
-- (real ?? provisoria) — una sola fecha efectiva por soporte.
--
-- Idempotente.
-- ============================================================

ALTER TABLE reserva_items ADD COLUMN IF NOT EXISTS fecha_alta_real DATE;
ALTER TABLE reserva_items ADD COLUMN IF NOT EXISTS fecha_baja_real DATE;
