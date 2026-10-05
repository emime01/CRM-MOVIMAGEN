-- ═══════════════════════════════════════════════════════════════════════════
-- v28 · Rol mixto: asistente de ventas y operaciones
-- ═══════════════════════════════════════════════════════════════════════════
--
-- En la práctica una misma persona reserva los espacios (tarea de ventas) y
-- después asigna los buses, graba y arma los registros (tareas de operaciones).
-- Con los roles que había no podía completar su trabajo: el rol que aprueba la
-- reserva no es el que la confirma.
--
-- Idempotente. Ya aplicada en la base del proyecto.

ALTER TABLE perfiles DROP CONSTRAINT IF EXISTS perfiles_rol_check;
ALTER TABLE perfiles ADD CONSTRAINT perfiles_rol_check CHECK (rol = ANY (ARRAY[
  'vendedor','asistente_ventas','gerente_comercial','operaciones','arte',
  'administracion','asistente_ventas_ops'
]));
