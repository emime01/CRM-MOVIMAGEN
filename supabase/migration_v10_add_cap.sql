-- Migration V10: Add capacity field to soportes
-- cap = total units available in this soporte/circuit
-- Defaults to 1 (binary: either taken or not).
-- Admins can set higher values for circuits that allow multiple simultaneous bookings.

ALTER TABLE soportes ADD COLUMN IF NOT EXISTS cap INTEGER NOT NULL DEFAULT 1;
