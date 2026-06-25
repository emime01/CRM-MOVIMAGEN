-- Migration V17: secuencia para numeración de OIC
--
-- Antes: `crear-orden` calculaba siguienteNumero = max(numero) + 1, lo que
-- causa race condition (dos creaciones simultáneas → mismo número).
-- Ahora: usar una secuencia Postgres como ya hace propuestas.

DO $$
DECLARE
  current_max BIGINT;
BEGIN
  -- Solo si la tabla existe (defensivo)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ordenes_venta') THEN
    -- Crear la secuencia si no existe
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ordenes_venta_numero_seq' AND relkind = 'S') THEN
      EXECUTE 'CREATE SEQUENCE ordenes_venta_numero_seq';
    END IF;

    -- Sembrarla con max(numero)+1 para no duplicar con valores ya emitidos
    SELECT COALESCE(MAX(numero), 0) + 1 INTO current_max FROM ordenes_venta;
    EXECUTE format('SELECT setval(''ordenes_venta_numero_seq'', %s, false)', current_max);
  END IF;
END $$;

GRANT USAGE, SELECT ON SEQUENCE ordenes_venta_numero_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE ordenes_venta_numero_seq TO authenticated;
