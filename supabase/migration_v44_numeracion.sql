-- v44 · Numeración de cotizaciones sin repetidos
--
-- El CRM pedía el próximo número de cotización a una función `nextval` que
-- nunca existió en la base. Al fallar, usaba un número AL AZAR de 4 cifras
-- (COT-7174), así que dos cotizaciones podían salir con el mismo número.
--
-- Crea la secuencia de cotizaciones (arrancando después del mayor número
-- usado) y una función que el CRM llama para pedir el siguiente.
--
-- Las ventas no necesitan nada: el número lo pone la base con su propio
-- contador, y el CRM ya no lo calcula aparte.
--
-- Idempotente.

do $$
declare mx bigint;
begin
  if not exists (select 1 from pg_class where relname = 'propuestas_numero_seq' and relkind = 'S') then
    create sequence propuestas_numero_seq;
  end if;
  select coalesce(max(nullif(regexp_replace(numero, '\D', '', 'g'), '')::bigint), 0)
    into mx from propuestas where numero like 'COT-%';
  -- Nunca para atrás: si ya se usó, sigue desde donde estaba.
  perform setval('propuestas_numero_seq', greatest(mx, (select last_value from propuestas_numero_seq)), true);
end $$;

create or replace function siguiente_numero_cotizacion() returns bigint
language sql security definer set search_path = public as $$
  select nextval('propuestas_numero_seq')
$$;

-- Supabase le da permiso a anon y authenticated por defecto: se le saca,
-- sólo el servidor del CRM pide números.
revoke all on function siguiente_numero_cotizacion() from public, anon, authenticated;
grant execute on function siguiente_numero_cotizacion() to service_role;
