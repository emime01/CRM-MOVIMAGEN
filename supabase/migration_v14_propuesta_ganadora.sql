-- Migration V14: cotización ganadora por lead
--
-- Un lead puede tener múltiples cotizaciones (varias opciones para el cliente).
-- Cuando el cliente confirma una, se marca como "ganadora" y el lead pasa
-- a estado ganado. Las otras cotizaciones del lead quedan guardadas en su
-- estado original (no se borran ni se marcan automáticamente perdidas) —
-- son info importante de qué alternativas se ofrecieron.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS propuesta_ganadora_id UUID
  REFERENCES propuestas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_propuesta_ganadora
  ON leads(propuesta_ganadora_id) WHERE propuesta_ganadora_id IS NOT NULL;
