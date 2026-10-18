-- v43 · Rol de asistente administrativa
--
-- Belén es asistente administrativa. Con el rol `administracion` veía todo lo
-- del área y más: la configuración del sistema (usuarios, mails, roles,
-- objetivos de cada vendedor), el desempeño del equipo comercial, el catálogo
-- de soportes con sus precios, y podía marcar pagadas las comisiones y el
-- canon.
--
-- `asistente_administracion` hace el trabajo diario —factura, cobra, gestiona
-- deudores, arma la liquidación de comisiones y de canon, lleva los gastos de
-- tarjeta, anula facturas y carga notas de crédito— y ve Cuentas y Ventas.
-- Los pagos de comisiones y canon los registra Administración (Romina,
-- Mauricio), que conserva el rol `administracion`.
--
-- Idempotente.

alter table perfiles drop constraint if exists perfiles_rol_check;
alter table perfiles add constraint perfiles_rol_check check (rol = any (array[
  'vendedor','asistente_ventas','gerente_comercial','operaciones','arte',
  'administracion','asistente_ventas_ops','admin_sistema','asistente_administracion'
]));

-- El mail no está en `perfiles` sino en `auth.users`, ligado por user_id.
update perfiles
   set rol        = 'asistente_administracion',
       updated_at = now()
 where user_id in (
   select id from auth.users where lower(email) = 'belen@movimagen.com.uy'
 );

-- Control: tiene que devolver una fila, con rol asistente_administracion.
-- select p.nombre, p.rol, u.email
--   from perfiles p join auth.users u on u.id = p.user_id
--  where lower(u.email) = 'belen@movimagen.com.uy';
