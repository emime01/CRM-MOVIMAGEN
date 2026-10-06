-- v35 · Las categorías de bus son las de la flota, no las del soporte
--
-- `buses.categoria` admitía 'urbano', 'full_bus' y 'lateral_full'. Las dos
-- últimas están mal: un full bus y un lateral full no son tipos de bus, son
-- SOPORTES — lo que se vende sobre el bus. Mezclarlos con la categoría hacía
-- que la flota se clasificara por lo que se le vende encima en vez de por lo
-- que es.
--
-- Las categorías reales de la flota son tres: urbano, suburbano y diferencial.
--
-- El mapeo sale del propio catálogo de soportes, que agrupa por línea:
--
--   Líneas Urbanas (Montevideo)        Interior, Lateral 1 Paño, Lateral
--                                      Extra, Luneta, Trasero Premium
--   Líneas Suburbanas (Mvd y Canel.)   FullBus, LateralFull, TraseroFull
--   Línea D9 y DM1 (Montevideo)        MegaBus Exclusivo
--
-- y las hojas de la planilla de stock traen exactamente esas columnas en cada
-- bloque, sin un solo bus repetido entre hojas:
--
--   URBANOS  → urbano       (59 de los 276 quedan fuera de este grupo)
--   INTER    → suburbano    (55 unidades, numeradas 300-364)
--   MEGAS    → diferencial  (4 unidades, por D9 y DM1)
--
-- Idempotente.

alter table buses drop constraint if exists buses_categoria_check;

alter table buses add constraint buses_categoria_check
  check (categoria is null or categoria in ('urbano', 'suburbano', 'diferencial'));

-- Primero todo a urbano, después las excepciones. Así la migración no depende
-- de en qué categoría equivocada haya quedado cada fila.
update buses set categoria = 'urbano', updated_at = now()
 where categoria is distinct from 'urbano';

update buses set categoria = 'suburbano', updated_at = now()
 where numero in (
    '302', '303', '304', '305', '306', '307', '308', '309', '310', '311',
    '312', '313', '314', '315', '316', '317', '318', '319', '320', '321',
    '322', '323', '324', '325', '326', '327', '328', '329', '330', '331',
    '332', '333', '335', '336', '337', '338', '339', '340', '341', '342',
    '343', '344', '345', '346', '347', '348', '349', '350', '351', '352',
    '353', '354', '362', '363', '364'
 );

update buses set categoria = 'diferencial', updated_at = now()
 where numero in ('203', '205', '206', '301');

-- "MEGABUS" en las notas era el parche para no perder esos cuatro cuando la
-- categoría no existía. Ya no hace falta.
update buses
   set notas = nullif(btrim(replace(notas, 'MEGABUS', '')), ''),
       updated_at = now()
 where notas like '%MEGABUS%';
