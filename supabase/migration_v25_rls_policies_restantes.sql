-- ============================================================
-- Migration v25 — Blindar policies "siempre verdadero" restantes
-- ============================================================
--
-- Varias tablas quedaron con policies USING(true) (algunas para el rol
-- público/anon) que no entraron en el blindaje de la v16. Eso deja esas
-- tablas accesibles con la anon key. La app NO lee estas tablas con la anon
-- key (sólo usa storage del lado del cliente; las tablas se leen server-side
-- con service_role), así que reemplazar las policies por una que exige un
-- usuario CRM válido (current_rol() not null) cierra la exposición a anon sin
-- afectar el funcionamiento. service_role bypassa RLS igual.
--
-- Idempotente.
-- ============================================================

DO $$
DECLARE
  t   text;
  pol text;
  tablas text[] := ARRAY[
    'buses', 'canon_config', 'canon_soportes', 'config', 'contactos',
    'cotizacion_items', 'cotizaciones', 'potenciales_cliente',
    'registros', 'reuniones', 'tipos_cliente'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    -- Sólo si la tabla existe
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      -- Borrar cualquier policy permisiva existente sobre la tabla
      FOR pol IN
        SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
      END LOOP;

      -- Policy única: sólo usuarios CRM autenticados (anon queda fuera).
      -- service_role bypassa RLS, así que la app server-side no se ve afectada.
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.current_rol() IS NOT NULL) WITH CHECK (public.current_rol() IS NOT NULL)',
        t || '_crm_rw', t
      );
    END IF;
  END LOOP;
END $$;
