-- Migration V3: Bus fleet management linked to soportes and reservations
-- Run this in Supabase SQL editor

-- 1. Add categoria to buses (lateral_full = cartel de costado, full_bus = forra completo, urbano = bus pequeño)
ALTER TABLE buses ADD COLUMN IF NOT EXISTS categoria TEXT CHECK (categoria IN ('lateral_full', 'full_bus', 'urbano'));

-- 2. Link soportes to a physical bus (bus_id) and record which position on the bus (lado_bus)
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS bus_id UUID REFERENCES buses(id);
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS lado_bus TEXT CHECK (lado_bus IN ('lateral_izquierdo', 'lateral_derecho', 'trasero', 'interior'));

-- 3. Record which bus was assigned when operaciones confirms a reservation item
ALTER TABLE reserva_items ADD COLUMN IF NOT EXISTS bus_id UUID REFERENCES buses(id);

-- 4. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_soportes_bus_id ON soportes(bus_id) WHERE bus_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reserva_items_bus_id ON reserva_items(bus_id) WHERE bus_id IS NOT NULL;

-- 5. RLS: existing authenticated policies on soportes and reserva_items already cover new columns
-- No additional policies needed
