-- v32 · Que nadie se pueda cambiar el rol a sí mismo
--
-- URGENTE. Verificado contra producción el 2026-10-05: un usuario con rol
-- `arte` se autenticó contra Supabase con su propio usuario y contraseña, y
-- actualizó su fila de `perfiles` incluyendo la columna `rol`. El PATCH
-- devolvió 200 y la fila modificada.
--
-- Es decir: cualquier empleado con login podía ponerse `rol = 'administracion'`
-- y, en su siguiente sesión, entrar como administración a todo el CRM
-- —facturar, cobrar, ver comisiones, editar la empresa—. También podía subirse
-- su `porcentaje_comision`, que es el número con el que se le liquida
-- (src/lib/ventas/cobrar.ts lo lee tal cual).
--
-- Nada de esto pasaba por las API routes, así que ningún chequeo de rol del
-- código lo veía, y no dejaba rastro en el historial de la aplicación.
--
-- La causa: la policy `perfiles_update_self` de la v16 limita QUÉ FILA se puede
-- tocar (la propia), pero no QUÉ COLUMNAS, y el GRANT de la v16 dio UPDATE
-- sobre la tabla entera al rol `authenticated`.
--
-- La solución es sacarle el UPDATE sobre `perfiles` a `authenticated`. No
-- rompe nada: ningún componente de cliente escribe en `perfiles`. Lo único que
-- se actualiza ahí es `mcp_token_hash`, desde /api/perfil/mcp-token, que corre
-- en el servidor con la service role key y por lo tanto no pasa por RLS ni por
-- estos grants.
--
-- Si más adelante se quiere que la gente edite su propio perfil desde el
-- navegador, hay que devolver el permiso COLUMNA POR COLUMNA, nunca entero:
--   grant update (nombre, telefono) on perfiles to authenticated;
-- dejando `rol`, `porcentaje_comision`, `activo`, `user_id` y `mcp_token_hash`
-- siempre afuera.
--
-- Idempotente: se puede correr más de una vez.

revoke update on perfiles from authenticated;
revoke update on perfiles from anon;

-- La policy se puede dejar como está: sin el GRANT no habilita nada. Se la
-- reemplaza igual por una que nombre el motivo, para que el próximo que la lea
-- no vuelva a conceder el UPDATE entero creyendo que la policy alcanza.
drop policy if exists perfiles_update_self on perfiles;

create policy perfiles_update_self on perfiles for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    -- Defensa en profundidad: aunque alguien devuelva el GRANT de UPDATE,
    -- el rol y la comisión tienen que quedar como están.
    and rol = (select p.rol from perfiles p where p.user_id = auth.uid())
    and porcentaje_comision is not distinct from
        (select p.porcentaje_comision from perfiles p where p.user_id = auth.uid())
  );

comment on policy perfiles_update_self on perfiles is
  'Sin GRANT de UPDATE no habilita nada. El WITH CHECK impide cambiarse el rol o la comisión si alguien reconcede el permiso.';
