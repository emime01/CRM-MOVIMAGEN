-- Migration V9: Limpieza de datos de prueba para arranque productivo
-- Borra todos los datos transaccionales (ventas, leads, reservas, comprobantes, etc.)
-- y también clientes y agencias para arrancar de cero.
-- PRESERVA: catálogo de soportes, tipos_cliente, buses, canon, perfiles reales, config.

-- ============================================================
-- PASO 1: Truncar TODAS las tablas públicas que referencian
--         perfiles (detectadas automáticamente via FK) + CASCADE
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Truncate every table in public schema that has a FK pointing to perfiles
  FOR r IN
    SELECT DISTINCT tc.table_name
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc
      ON tc.constraint_name = rc.constraint_name
      AND tc.table_schema = 'public'
    JOIN information_schema.table_constraints pc
      ON pc.constraint_name = rc.unique_constraint_name
      AND pc.table_name = 'perfiles'
      AND pc.table_schema = 'public'
  LOOP
    EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', r.table_name);
    RAISE NOTICE 'Truncated (perfiles ref): %', r.table_name;
  END LOOP;
END $$;

-- ============================================================
-- PASO 2: Truncar el resto de tablas transaccionales conocidas
--         (que no referencian perfiles pero sí a otras tablas)
-- ============================================================
DO $$
DECLARE
  tablas TEXT[] := ARRAY[
    'notificaciones',
    'comisiones',
    'comisiones_agencia',
    'pagos',
    'gastos_tarjeta',
    'evidencias',
    'comprobantes',
    'registros',
    'reserva_items',
    'reservas',
    'orden_items',
    'orden_historial',
    'ordenes_venta',
    'propuesta_items',
    'propuestas',
    'reuniones',
    'canon_liquidaciones',
    'potenciales_cliente',
    'leads',
    'agencias',
    'clientes',
    'objetivos',
    'regalos'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
      RAISE NOTICE 'Truncated: %', t;
    ELSE
      RAISE NOTICE 'Skipped (does not exist): %', t;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- PASO 3: Ahora sí borrar perfiles de test (@test.com)
-- ============================================================
DELETE FROM perfiles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@test.com'
);

-- ============================================================
-- PASO 4: Resetear secuencia de numeración de cotizaciones
-- ============================================================
ALTER SEQUENCE IF EXISTS propuestas_numero_seq RESTART WITH 1;

-- ============================================================
-- PASO 5: Verificar
-- ============================================================
SELECT 'perfiles'            AS tabla, COUNT(*) AS filas FROM perfiles
UNION ALL
SELECT 'soportes (catálogo)', COUNT(*) FROM soportes;
