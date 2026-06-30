-- ============================================================
-- Migration v24 — RLS en tablas de arte (materiales_digitales, muestras_impresion)
-- ============================================================
--
-- Estas dos tablas quedaron sin RLS (creadas a mano, fuera de las migraciones)
-- y por lo tanto expuestas a las keys anon/authenticated. La app sólo las toca
-- server-side con service_role (rutas /api/arte/*), que bypassa RLS, así que
-- activar RLS NO afecta el funcionamiento y cierra la exposición.
--
-- Policy: lectura/escritura para usuarios autenticados de los roles que
-- realmente trabajan con arte. anon queda sin acceso. Idempotente.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='materiales_digitales') THEN
    ALTER TABLE public.materiales_digitales ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='materiales_digitales' AND policyname='materiales_digitales_rw') THEN
      CREATE POLICY materiales_digitales_rw ON public.materiales_digitales
        FOR ALL TO authenticated
        USING (public.current_rol() IN ('arte','operaciones','administracion','gerente_comercial'))
        WITH CHECK (public.current_rol() IN ('arte','operaciones','administracion','gerente_comercial'));
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='muestras_impresion') THEN
    ALTER TABLE public.muestras_impresion ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='muestras_impresion' AND policyname='muestras_impresion_rw') THEN
      CREATE POLICY muestras_impresion_rw ON public.muestras_impresion
        FOR ALL TO authenticated
        USING (public.current_rol() IN ('arte','operaciones','administracion','gerente_comercial'))
        WITH CHECK (public.current_rol() IN ('arte','operaciones','administracion','gerente_comercial'));
    END IF;
  END IF;
END $$;
