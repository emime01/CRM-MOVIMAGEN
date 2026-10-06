-- v35 · El megabus es una categoría de bus más
--
-- `buses.categoria` admite urbano, full_bus y lateral_full. El megabus no
-- estaba, y en la planilla de stock tiene su propia hoja: son 4 unidades que
-- van por la línea D9 y se venden como producto aparte.
--
-- Al cargar la flota de abril quedaron como `urbano` con "MEGABUS" escrito en
-- las notas, que sirve para no perderlos pero los mezcla con los 217 urbanos
-- comunes en cualquier filtro o conteo.
--
-- Esta migración agrega la categoría y reclasifica esos cuatro.
--
-- Idempotente.

alter table buses drop constraint if exists buses_categoria_check;

alter table buses add constraint buses_categoria_check
  check (categoria is null or categoria in ('urbano', 'full_bus', 'lateral_full', 'megabus'));

update buses
   set categoria  = 'megabus',
       notas      = nullif(btrim(replace(notas, 'MEGABUS', '')), ''),
       updated_at = now()
 where categoria = 'urbano'
   and notas like '%MEGABUS%';
