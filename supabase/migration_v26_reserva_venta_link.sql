-- ═══════════════════════════════════════════════════════════════════════════
-- v26 · Vincular la reserva con la cotización y la orden de venta
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problema: la reserva se creaba desde una cotización aceptada pero no guardaba
-- de dónde venía — sólo un texto en `notas` ("Auto-creada desde cotización
-- COT-1234"). Sin ese vínculo, reserva y OIC quedaban como dos objetos
-- paralelos que nadie podía relacionar, y por eso había que aprobar cada uno
-- por separado (dos botones en la bandeja del gerente para el mismo hecho).
--
-- Con estos vínculos la OIC puede arrastrar el estado de su reserva:
--   OIC aprobada  → reserva aprobada
--   OIC en_oic    → reserva confirmada
--
-- Idempotente: se puede correr más de una vez sin efecto.

-- Procedencia: de qué cotización salió la reserva.
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS propuesta_id UUID REFERENCES propuestas(id);

-- Vínculo operativo con la venta. Ya existía en el schema base, pero se declara
-- acá también por si alguna base quedó sin él.
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS orden_id UUID REFERENCES ordenes_venta(id);

CREATE INDEX IF NOT EXISTS idx_reservas_propuesta ON reservas(propuesta_id);
CREATE INDEX IF NOT EXISTS idx_reservas_orden     ON reservas(orden_id);

COMMENT ON COLUMN reservas.propuesta_id IS 'Cotización que originó la reserva (procedencia).';
COMMENT ON COLUMN reservas.orden_id     IS 'OIC asociada: su estado arrastra el de la reserva.';

-- ── Backfill de las reservas ya existentes ─────────────────────────────────
-- Se recupera la cotización desde el número que quedó escrito en `notas`.
UPDATE reservas r
SET    propuesta_id = p.id
FROM   propuestas p
WHERE  r.propuesta_id IS NULL
  AND  p.numero IS NOT NULL
  AND  r.notas LIKE '%' || p.numero || '%';

-- Y la OIC, que se puede deducir de esa misma cotización.
UPDATE reservas r
SET    orden_id = o.id
FROM   ordenes_venta o
WHERE  r.orden_id IS NULL
  AND  r.propuesta_id IS NOT NULL
  AND  o.propuesta_id = r.propuesta_id;
