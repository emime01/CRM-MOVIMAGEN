-- v36 · Un rol de administrador del sistema
--
-- Los roles del CRM reparten el proceso entre personas distintas a propósito:
-- el vendedor cotiza, el gerente aprueba, operaciones produce y administración
-- factura. Está bien para el día a día, pero deja sin salida a quien administra
-- el sistema: no puede recorrer una venta de punta a punta para probarla, ni
-- destrabar algo cuando falta alguien.
--
-- Hoy Emiliano es `asistente_ventas`, y con ese rol ni siquiera puede crear un
-- lead —sólo vendedor y gerente pueden—, así que no llega ni al primer paso.
--
-- `admin_sistema` ejerce todos los roles a la vez. No es un rol del negocio:
-- nadie en Movimagen vende, aprueba, produce y factura. Es el de quien
-- administra el CRM. Dárselo a alguien más saltea todas las separaciones de
-- responsabilidad, incluida la de aprobar su propia venta.
--
-- Ojo que es distinto de `administracion`, que es el área (Belén): esa factura
-- y cobra, pero no aprueba ventas ni trabaja las tareas de arte.
--
-- Idempotente.

alter table perfiles drop constraint if exists perfiles_rol_check;
alter table perfiles add constraint perfiles_rol_check check (rol = any (array[
  'vendedor','asistente_ventas','gerente_comercial','operaciones','arte',
  'administracion','asistente_ventas_ops','admin_sistema'
]));

update perfiles
   set rol        = 'admin_sistema',
       updated_at = now()
 where email = 'emiliano@movimagen.com.uy';
