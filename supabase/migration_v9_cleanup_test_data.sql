-- Migration V9: Limpieza de datos de prueba para arranque productivo
-- Borra todos los datos transaccionales (ventas, leads, reservas, comprobantes, etc.)
-- y también clientes y agencias para arrancar de cero.
-- PRESERVA: catálogo de soportes, tipos_cliente, buses, canon, perfiles reales, config.

-- ============================================================
-- 1. Borrar registros (tabla puede no existir en algunas instancias)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='registros') THEN
    EXECUTE 'TRUNCATE TABLE registros CASCADE';
  END IF;
END $$;

-- ============================================================
-- 2. Truncar todas las tablas transaccionales + clientes y agencias
--    Hacemos esto ANTES de tocar perfiles para liberar las FK
--    (ordenes_venta.vendedor_id → perfiles.id, etc.)
-- ============================================================
TRUNCATE TABLE
  notificaciones,
  comisiones,
  comisiones_agencia,
  pagos,
  gastos_tarjeta,
  evidencias,
  comprobantes,
  reserva_items,
  reservas,
  orden_items,
  orden_historial,
  ordenes_venta,
  propuesta_items,
  propuestas,
  reuniones,
  canon_liquidaciones,
  potenciales_cliente,
  leads,
  agencias,
  clientes
RESTART IDENTITY CASCADE;

-- ============================================================
-- 3. Ahora sí, limpiar perfiles de usuarios de prueba (@test.com)
--    Ya no quedan FK que los referencien.
-- ============================================================
DELETE FROM perfiles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%@test.com'
);

-- ============================================================
-- 4. Resetear secuencia de numeración de cotizaciones (COT-0001)
-- ============================================================
ALTER SEQUENCE IF EXISTS propuestas_numero_seq RESTART WITH 1;

-- ============================================================
-- 5. Verificar
-- ============================================================
SELECT 'perfiles' AS tabla, COUNT(*) AS filas FROM perfiles
UNION ALL SELECT 'clientes', COUNT(*) FROM clientes
UNION ALL SELECT 'agencias', COUNT(*) FROM agencias
UNION ALL SELECT 'leads', COUNT(*) FROM leads
UNION ALL SELECT 'propuestas', COUNT(*) FROM propuestas
UNION ALL SELECT 'ordenes_venta', COUNT(*) FROM ordenes_venta
UNION ALL SELECT 'reservas', COUNT(*) FROM reservas
UNION ALL SELECT 'comprobantes', COUNT(*) FROM comprobantes
UNION ALL SELECT 'soportes (catálogo)', COUNT(*) FROM soportes;
