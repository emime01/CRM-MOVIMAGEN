-- ============================================================
-- Migration v20 — Datos de la empresa (emisor de facturas)
-- ============================================================
--
-- Tabla de configuración de una sola fila con los datos del emisor que
-- aparecen en el membrete de la factura interna. Editable desde
-- /dashboard/config (solo administracion).
--
-- Se fuerza fila única con un id fijo + CHECK. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS config_empresa (
  id            INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nombre        TEXT NOT NULL DEFAULT 'Movimagen',
  razon_social  TEXT,
  rut           TEXT,
  direccion     TEXT,
  telefono      TEXT,
  email         TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed con los datos públicos conocidos (RUT vacío hasta completar).
INSERT INTO config_empresa (id, nombre, razon_social, rut, direccion, telefono, email)
VALUES (1, 'Movimagen', 'Giralor S.A.', NULL,
        'Av. Almirante Harwood 6411, Montevideo',
        '(+598) 2600 18 81', 'info@movimagen.com')
ON CONFLICT (id) DO NOTHING;

-- RLS — la app usa service_role (la bypassa). Dejamos lectura a authenticated
-- por consistencia; la escritura se controla en el endpoint (solo administracion).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='config_empresa'
  ) THEN
    ALTER TABLE config_empresa ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='config_empresa' AND policyname='config_empresa_select'
    ) THEN
      CREATE POLICY config_empresa_select ON config_empresa FOR SELECT TO authenticated USING (true);
    END IF;
  END IF;
END $$;
