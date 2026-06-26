-- ============================================================
-- Migration v19 — Plantillas de cotización
-- ============================================================
--
-- Permite a los vendedores guardar el plan de soportes de una cotización
-- como plantilla reutilizable. items es un JSONB con el array de líneas:
--   [{ soporte_id, cantidad_soportes, semanas, salidas_elegidas }, ...]
--
-- vendedor_id = dueño de la plantilla. NULL = plantilla global (visible
-- para todos). Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS plantillas_cotizacion (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       TEXT NOT NULL,
  vendedor_id  UUID REFERENCES perfiles(id) ON DELETE CASCADE,
  items        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plantillas_cotizacion_vendedor
  ON plantillas_cotizacion(vendedor_id);

-- RLS — la app usa service_role (la bypassa), pero dejamos la policy por
-- consistencia con el resto del esquema y por si se usa anon en el futuro.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='plantillas_cotizacion'
  ) THEN
    ALTER TABLE plantillas_cotizacion ENABLE ROW LEVEL SECURITY;

    -- Cada quien ve sus plantillas + las globales (vendedor_id NULL).
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='plantillas_cotizacion' AND policyname='plantillas_select'
    ) THEN
      CREATE POLICY plantillas_select ON plantillas_cotizacion FOR SELECT TO authenticated
        USING (
          vendedor_id IS NULL
          OR vendedor_id = public.current_perfil_id()
          OR public.current_rol() IN ('gerente_comercial','administracion')
        );
    END IF;
  END IF;
END $$;
