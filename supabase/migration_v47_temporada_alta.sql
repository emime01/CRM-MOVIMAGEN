-- v47 · Un soporte por espacio, con precio de temporada alta
--
-- En Punta del Este cada espacio estaba cargado dos veces: una con el precio
-- de temporada alta (dic-feb, mínimo 13 semanas) y otra con el de baja.
-- Eran dos soportes para el mismo lugar: la disponibilidad los contaba por
-- separado (se podía vender el mismo espacio dos veces en diciembre) y en el
-- cotizador no se distinguían.
--
-- Ahora queda uno solo (el de temporada baja) con dos columnas más:
--   precio_semanal_alta   precio por semana de dic, ene y feb
--   semanas_minimas_alta  mínimo de semanas si la campaña arranca en alta
-- El de temporada alta se desactiva. El cotizador cobra cada semana al
-- precio de su temporada.
--
-- Idempotente.

alter table soportes add column if not exists precio_semanal_alta  numeric(12,2);
alter table soportes add column if not exists semanas_minimas_alta integer;

comment on column soportes.precio_semanal_alta is
  'Precio semanal en temporada alta (diciembre, enero y febrero). Null = mismo precio todo el año.';
comment on column soportes.semanas_minimas_alta is
  'Mínimo de semanas si la campaña arranca en temporada alta.';

-- Cada par (mismo nombre y ubicación, uno marcado alta y otro baja): el de
-- baja toma el precio y el mínimo del de alta, y el de alta se desactiva.
with pares as (
  select b.id as baja_id, a.id as alta_id, a.precio_semanal as precio_alta, a.semanas_minimas as min_alta
    from soportes b
    join soportes a on a.nombre = b.nombre and coalesce(a.ubicacion, '') = coalesce(b.ubicacion, '')
   where b.activo and a.activo and b.temporada_baja and a.temporada_alta and a.id <> b.id
)
update soportes s
   set precio_semanal_alta  = p.precio_alta,
       semanas_minimas_alta = coalesce(p.min_alta, 13),
       temporada_baja       = false,
       comentario           = 'Punta del Este: temporada alta (dic-feb) a otro precio y con mínimo de semanas; el resto del año, precio de temporada baja.'
  from pares p
 where s.id = p.baja_id;

update soportes a
   set activo = false
 where a.activo and a.temporada_alta
   and exists (select 1 from soportes b
                where b.nombre = a.nombre and coalesce(b.ubicacion, '') = coalesce(a.ubicacion, '')
                  and b.precio_semanal_alta is not null and b.activo and b.id <> a.id);

-- ─── CONTROL ─────────────────────────────────────────────────────────────────
-- select nombre, ubicacion, precio_semanal, precio_semanal_alta, semanas_minimas_alta, activo
--   from soportes where ubicacion ilike '%punta del este%' order by nombre, activo desc;
