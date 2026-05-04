-- Migration V9: Limpieza de datos de prueba para arranque productivo
-- Borra todos los datos transaccionales (ventas, leads, reservas, comprobantes, etc.)
-- y también clientes y agencias para arrancar de cero.
-- PRESERVA: catálogo de soportes, tipos_cliente, buses, canon, perfiles reales, config.

-- ============================================================
-- Truncar tablas transaccionales si existen (con CASCADE)
-- Orden: primero hijos, después padres. Perfiles se borra al final.
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
    'objetivos'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', t);
      RAISE NOTICE 'Truncated: %', t;
    ELSE
      RAISE NOTICE 'Skipped (does not exist): %', t;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- Limpiar perfiles de usuarios de prueba (@test.com)
-- Ya no quedan FK que los referencien.
-- ============================================================
DELETE FROM perfiles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@test.com'
);

-- ============================================================
-- Resetear secuencia de numeración de cotizaciones (COT-0001)
-- ============================================================
ALTER SEQUENCE IF EXISTS propuestas_numero_seq RESTART WITH 1;

-- ============================================================
-- Verificar
-- ============================================================
SELECT tabla, filas FROM (
  SELECT 'perfiles'           AS tabla, COUNT(*) AS filas FROM perfiles
  UNION ALL SELECT 'clientes',           COUNT(*) FROM clientes            WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clientes')
  UNION ALL SELECT 'agencias',           COUNT(*) FROM agencias            WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='agencias')
  UNION ALL SELECT 'leads',              COUNT(*) FROM leads               WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leads')
  UNION ALL SELECT 'propuestas',         COUNT(*) FROM propuestas          WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='propuestas')
  UNION ALL SELECT 'ordenes_venta',      COUNT(*) FROM ordenes_venta       WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ordenes_venta')
  UNION ALL SELECT 'reservas',           COUNT(*) FROM reservas            WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='reservas')
  UNION ALL SELECT 'comprobantes',       COUNT(*) FROM comprobantes        WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='comprobantes')
  UNION ALL SELECT 'soportes (catálogo)',COUNT(*) FROM soportes
) q;
