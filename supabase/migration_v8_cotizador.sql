-- Migration V8: Cotizador (planificador) integration
-- Source: github.com/emime01/planificador (supabase_completo.sql)
-- Schema enrichment + 64 soportes seed with full pricing logic
-- Note: soportes.categoria CHECK already allows ('Shopping','Digital','Exterior','Bus','Otro')
--       so planificador's 4 values fit cleanly. We use a separate `tipo_cotizador` column
--       (instead of mutating `tipo`) to avoid conflicts with any existing tipo CHECK.

-- ============================================================
-- 1. ENRICH SOPORTES (planificador columns)
-- ============================================================
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS cotizador_id          INTEGER UNIQUE;
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS tipo_cotizador        TEXT;  -- led | circuito | estatico_bus | banner_shopping | estatico_shopping | medianera
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS salidas_por_hora      INTEGER;
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS horas_encendido       INTEGER;
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS impactos_mensuales    INTEGER;
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS costo_produccion      NUMERIC(12,2);
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS impuestos_municipales NUMERIC(12,2);
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS cantidad_default      INTEGER DEFAULT 1;
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS semanas_minimas       INTEGER DEFAULT 1;
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS temporada_alta        BOOLEAN DEFAULT FALSE;
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS temporada_baja        BOOLEAN DEFAULT FALSE;
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS comentario            TEXT;
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS url_imagen            TEXT;

-- Legacy columns from previous v8 attempt — kept for backwards compat, no longer used
-- (produccion / imp_municipal / impactos still exist but the cotizador now reads
--  costo_produccion / impuestos_municipales / impactos_mensuales)

-- ============================================================
-- 2. ENRICH PROPUESTAS
-- ============================================================
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS cliente_id     UUID REFERENCES clientes(id);
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS numero         TEXT;
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS nombre         TEXT;
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS marca          TEXT;
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS observaciones  TEXT;
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS fecha_inicio   DATE;
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS fecha_fin      DATE;
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS monto_neto     NUMERIC(14,2);
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS monto_total    NUMERIC(14,2);
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS monto_impactos BIGINT;
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS moneda         TEXT DEFAULT 'UYU';

-- ============================================================
-- 3. ENRICH PROPUESTA_ITEMS
-- ============================================================
ALTER TABLE propuesta_items ADD COLUMN IF NOT EXISTS salidas_elegidas  INTEGER;
ALTER TABLE propuesta_items ADD COLUMN IF NOT EXISTS cantidad_soportes INTEGER DEFAULT 1;
ALTER TABLE propuesta_items ADD COLUMN IF NOT EXISTS subtotal          NUMERIC(14,2);
ALTER TABLE propuesta_items ADD COLUMN IF NOT EXISTS impactos_calc     BIGINT;
-- Snapshot fields (so pricing stays stable if catalog changes)
ALTER TABLE propuesta_items ADD COLUMN IF NOT EXISTS nombre_soporte    TEXT;
ALTER TABLE propuesta_items ADD COLUMN IF NOT EXISTS ubicacion         TEXT;
ALTER TABLE propuesta_items ADD COLUMN IF NOT EXISTS categoria_soporte TEXT;
ALTER TABLE propuesta_items ADD COLUMN IF NOT EXISTS tipo_cotizador    TEXT;

-- ============================================================
-- 4. SEQUENCE for propuesta numero (COT-XXXX)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS propuestas_numero_seq START 1;

-- ============================================================
-- 5. SEED 64 soportes (planificador — Movimagen 2026)
-- ============================================================
INSERT INTO soportes (cotizador_id, nombre, seccion, categoria, tipo_cotizador, ubicacion, precio_semanal, tiene_iva,
  salidas_por_hora, horas_encendido, impactos_mensuales, costo_produccion, impuestos_municipales,
  cantidad_default, semanas_minimas, temporada_alta, temporada_baja, comentario, activo)
VALUES
  (1,  'PANTALLA GIGANTE CURVA',          'PANTALLAS GIGANTES',                    'Digital',  'led',                'Rivera y L.A.Herrera',                                                23000.0, FALSE, 30, 16, 3154539, NULL,    2200.0, 1,  1,  FALSE, FALSE, '', TRUE),
  (2,  'PANTALLA GIGANTE',                'PANTALLAS GIGANTES',                    'Digital',  'led',                'Av Italia y Ricaldoni',                                               23000.0, FALSE, 30, 16, 4586760, NULL,    2200.0, 1,  1,  FALSE, FALSE, '', TRUE),
  (3,  'PANTALLA GIGANTE',                'PANTALLAS GIGANTES',                    'Digital',  'led',                'Rivera y Bvar Batlle y Ordoñez',                                      23000.0, FALSE, 30, 16, 2117435, NULL,    2200.0, 1,  1,  FALSE, FALSE, '', TRUE),
  (4,  'PANTALLA GIGANTE 360',            'PANTALLAS GIGANTES',                    'Digital',  'led',                'Atlántico Shopping Punta del Este',                                   32000.0, FALSE, 30, 16, 5236278, NULL,    NULL,   1,  13, TRUE,  FALSE, 'Temporada alta Punta del Este (dic-feb). Mínimo 13 semanas, solo reservas.', TRUE),
  (5,  'PANTALLA GIGANTE 360',            'PANTALLAS GIGANTES',                    'Digital',  'led',                'Atlántico Shopping Punta del Este',                                   21000.0, FALSE, 30, 16, 201397,  NULL,    NULL,   1,  1,  FALSE, TRUE,  'Temporada baja Punta del Este (mar-nov).', TRUE),
  (6,  'CIRCUITO SHOPPING',               'CIRCUITOS DE PANTALLAS SHOPPINGS',      'Digital',  'circuito',           'Atlántico Shopping Punta del Este',                                   2100.0,  FALSE, 10, 16, 7854416, NULL,    NULL,   12, 13, TRUE,  FALSE, 'Temporada alta Punta del Este (dic-feb). Mínimo 13 semanas, solo reservas.', TRUE),
  (7,  'CIRCUITO SHOPPING',               'CIRCUITOS DE PANTALLAS SHOPPINGS',      'Digital',  'circuito',           'Atlántico Shopping Punta del Este',                                   1300.0,  FALSE, 10, 16, 251746,  NULL,    NULL,   12, 1,  FALSE, TRUE,  'Temporada baja Punta del Este (mar-nov).', TRUE),
  (8,  'CIRCUITO SHOPPING',               'CIRCUITOS DE PANTALLAS SHOPPINGS',      'Digital',  'circuito',           'Minas (2 gigantes en circuito)',                                      5900.0,  FALSE, 10, 16, 185034,  NULL,    NULL,   2,  1,  FALSE, FALSE, '', TRUE),
  (9,  'CIRCUITO SHOPPING',               'CIRCUITOS DE PANTALLAS SHOPPINGS',      'Digital',  'circuito',           'Salto',                                                               1300.0,  FALSE, 10, 16, 308387,  NULL,    NULL,   8,  1,  FALSE, FALSE, '', TRUE),
  (10, 'CIRCUITO SHOPPING',               'CIRCUITOS DE PANTALLAS SHOPPINGS',      'Digital',  'circuito',           'Paysandú',                                                            1300.0,  FALSE, 10, 16, 307127,  NULL,    NULL,   9,  1,  FALSE, FALSE, '', TRUE),
  (11, 'CIRCUITO SHOPPING',               'CIRCUITOS DE PANTALLAS SHOPPINGS',      'Digital',  'circuito',           'Mercedes',                                                            1300.0,  FALSE, 10, 16, 205593,  NULL,    NULL,   5,  1,  FALSE, FALSE, '', TRUE),
  (12, 'CIRCUITO SHOPPING',               'CIRCUITOS DE PANTALLAS SHOPPINGS',      'Digital',  'circuito',           'Colonia',                                                             1300.0,  FALSE, 10, 16, 138772,  NULL,    NULL,   5,  1,  FALSE, FALSE, '', TRUE),
  (13, 'PUERTA ENTRADA SHOPPING',         'PLOTEO PUERTAS',                        'Shopping', 'estatico_shopping',  'Atlántico Shopping Punta del Este',                                   19700.0, FALSE, NULL, NULL, NULL, 44625.0, NULL, 1,  13, TRUE,  FALSE, 'Temporada alta Punta del Este (dic-feb). Mínimo 13 semanas, solo reservas.', TRUE),
  (14, 'PUERTA ENTRADA SHOPPING',         'PLOTEO PUERTAS',                        'Shopping', 'estatico_shopping',  'Atlántico Shopping Punta del Este',                                   11800.0, FALSE, NULL, NULL, NULL, 44625.0, NULL, 1,  1,  FALSE, TRUE,  'Temporada baja Punta del Este (mar-nov).', TRUE),
  (15, 'PUERTA ENTRADA SHOPPING',         'PLOTEO PUERTAS',                        'Shopping', 'estatico_shopping',  'Salto',                                                               11800.0, FALSE, NULL, NULL, NULL, 44625.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (16, 'PUERTA ENTRADA SHOPPING',         'PLOTEO PUERTAS',                        'Shopping', 'estatico_shopping',  'Paysandú',                                                            11800.0, FALSE, NULL, NULL, NULL, 44625.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (17, 'PUERTA ENTRADA SHOPPING',         'PLOTEO PUERTAS',                        'Shopping', 'estatico_shopping',  'Mercedes',                                                            11800.0, FALSE, NULL, NULL, NULL, 44625.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (18, 'PUERTA ENTRADA SHOPPING',         'PLOTEO PUERTAS',                        'Shopping', 'estatico_shopping',  'Colonia',                                                             11800.0, FALSE, NULL, NULL, NULL, 44625.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (19, 'PUERTA ENTRADA SHOPPING',         'PLOTEO PUERTAS',                        'Shopping', 'estatico_shopping',  'Minas',                                                               11800.0, FALSE, NULL, NULL, NULL, 44625.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (20, 'BANNER EXTRA GIGANTE',            'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Atlántico Shopping Punta del Este',                                   19700.0, FALSE, NULL, NULL, NULL, 101050.0, NULL, 1,  13, TRUE,  FALSE, 'Temporada alta Punta del Este (dic-feb). Mínimo 13 semanas, solo reservas.', TRUE),
  (21, 'BANNER EXTRA GIGANTE',            'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Atlántico Shopping Punta del Este',                                   11800.0, FALSE, NULL, NULL, NULL, 101050.0, NULL, 1,  1,  FALSE, TRUE,  'Temporada baja Punta del Este (mar-nov).', TRUE),
  (22, 'BANNER GIGANTE SHOPPING',         'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Salto',                                                               5800.0,  FALSE, NULL, NULL, NULL, 34150.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (23, 'BANNER GIGANTE SHOPPING',         'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Paysandú',                                                            5800.0,  FALSE, NULL, NULL, NULL, 34150.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (24, 'BANNER GIGANTE SHOPPING',         'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Mercedes',                                                            5800.0,  FALSE, NULL, NULL, NULL, 34150.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (25, 'BANNER GIGANTE SHOPPING',         'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Colonia',                                                             5800.0,  FALSE, NULL, NULL, NULL, 28900.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (26, 'BANNER GIGANTE SHOPPING',         'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Minas',                                                               5800.0,  FALSE, NULL, NULL, NULL, 26250.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (27, 'BANNER STANDARD SHOPPING',        'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Salto',                                                               2900.0,  FALSE, NULL, NULL, NULL, 5250.0,  NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (28, 'BANNER STANDARD SHOPPING',        'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Paysandú',                                                            2900.0,  FALSE, NULL, NULL, NULL, 5250.0,  NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (29, 'BANNER STANDARD SHOPPING',        'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Mercedes',                                                            2900.0,  FALSE, NULL, NULL, NULL, 5250.0,  NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (30, 'BANNER PARKING SHOPPING',         'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Atlántico Shopping Punta del Este',                                   4350.0,  FALSE, NULL, NULL, NULL, 8150.0,  NULL, 1,  13, TRUE,  FALSE, 'Temporada alta Punta del Este (dic-feb). Mínimo 13 semanas, solo reservas.', TRUE),
  (31, 'BANNER PARKING SHOPPING',         'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Atlántico Shopping Punta del Este',                                   2900.0,  FALSE, NULL, NULL, NULL, 8150.0,  NULL, 1,  1,  FALSE, TRUE,  'Temporada baja Punta del Este (mar-nov).', TRUE),
  (32, 'BANNER PARKING SHOPPING',         'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Salto',                                                               2900.0,  FALSE, NULL, NULL, NULL, 8150.0,  NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (33, 'BANNER PARKING SHOPPING',         'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Paysandú',                                                            2900.0,  FALSE, NULL, NULL, NULL, 8150.0,  NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (34, 'BANNER PARKING SHOPPING',         'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Minas',                                                               2900.0,  FALSE, NULL, NULL, NULL, 8150.0,  NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (35, 'BANNER PARKING SHOPPING',         'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Colonia',                                                             2900.0,  FALSE, NULL, NULL, NULL, 8150.0,  NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (36, 'LONA PARKING SHOPPING',           'BANNERS EN SHOPPINGS',                  'Shopping', 'banner_shopping',    'Mercedes',                                                            5800.0,  FALSE, NULL, NULL, NULL, 28875.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (37, 'ESCALERA SHOPPING',               'PLOTEO ESCALERAS Y ASCENSORES',         'Shopping', 'estatico_shopping',  'Atlántico Shopping Punta del Este',                                   19700.0, FALSE, NULL, NULL, NULL, 42250.0, NULL, 1,  13, TRUE,  FALSE, 'Temporada alta Punta del Este (dic-feb). Mínimo 13 semanas, solo reservas.', TRUE),
  (38, 'ESCALERA SHOPPING',               'PLOTEO ESCALERAS Y ASCENSORES',         'Shopping', 'estatico_shopping',  'Atlántico Shopping Punta del Este',                                   11800.0, FALSE, NULL, NULL, NULL, 42250.0, NULL, 1,  1,  FALSE, TRUE,  'Temporada baja Punta del Este (mar-nov).', TRUE),
  (39, 'ESCALERA SHOPPING',               'PLOTEO ESCALERAS Y ASCENSORES',         'Shopping', 'estatico_shopping',  'Salto',                                                               11800.0, FALSE, NULL, NULL, NULL, 42250.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (40, 'ASCENSOR SHOPPING',               'PLOTEO ESCALERAS Y ASCENSORES',         'Shopping', 'estatico_shopping',  'Atlántico Shopping Punta del Este',                                   11800.0, FALSE, NULL, NULL, NULL, 34650.0, NULL, 1,  13, TRUE,  FALSE, 'Temporada alta Punta del Este (dic-feb). Mínimo 13 semanas, solo reservas.', TRUE),
  (41, 'ASCENSOR SHOPPING',               'PLOTEO ESCALERAS Y ASCENSORES',         'Shopping', 'estatico_shopping',  'Atlántico Shopping Punta del Este',                                   7900.0,  FALSE, NULL, NULL, NULL, 34650.0, NULL, 1,  1,  FALSE, TRUE,  'Temporada baja Punta del Este (mar-nov).', TRUE),
  (42, 'ASCENSOR SHOPPING',               'PLOTEO ESCALERAS Y ASCENSORES',         'Shopping', 'estatico_shopping',  'Salto',                                                               7900.0,  FALSE, NULL, NULL, NULL, 34650.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (43, 'CARA PALETAS BACKLIGHT SHOPPING', 'CARA PALETAS BACKLIGHT Y PLOTEO PISOS', 'Shopping', 'estatico_shopping',  'Salto',                                                               2900.0,  FALSE, NULL, NULL, NULL, 8150.0,  NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (44, 'CARA PALETAS BACKLIGHT SHOPPING', 'CARA PALETAS BACKLIGHT Y PLOTEO PISOS', 'Shopping', 'estatico_shopping',  'Mercedes',                                                            2900.0,  FALSE, NULL, NULL, NULL, 8150.0,  NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (45, 'CARA PALETAS BACKLIGHT SHOPPING', 'CARA PALETAS BACKLIGHT Y PLOTEO PISOS', 'Shopping', 'estatico_shopping',  'Colonia',                                                             2900.0,  FALSE, NULL, NULL, NULL, 8150.0,  NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (46, 'PISOS PASILLO SHOPPING',          'CARA PALETAS BACKLIGHT Y PLOTEO PISOS', 'Shopping', 'estatico_shopping',  'Atlántico Shopping Punta del Este',                                   4350.0,  FALSE, NULL, NULL, NULL, 13650.0, NULL, 1,  13, TRUE,  FALSE, 'Temporada alta Punta del Este (dic-feb). Mínimo 13 semanas, solo reservas.', TRUE),
  (47, 'PISOS PASILLO SHOPPING',          'CARA PALETAS BACKLIGHT Y PLOTEO PISOS', 'Shopping', 'estatico_shopping',  'Atlántico Shopping Punta del Este',                                   2900.0,  FALSE, NULL, NULL, NULL, 13650.0, NULL, 1,  1,  FALSE, TRUE,  'Temporada baja Punta del Este (mar-nov).', TRUE),
  (48, 'PISOS PASILLO SHOPPING',          'CARA PALETAS BACKLIGHT Y PLOTEO PISOS', 'Shopping', 'estatico_shopping',  'Salto',                                                               2900.0,  FALSE, NULL, NULL, NULL, 13650.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (49, 'PISOS PASILLO SHOPPING',          'CARA PALETAS BACKLIGHT Y PLOTEO PISOS', 'Shopping', 'estatico_shopping',  'Paysandú',                                                            2900.0,  FALSE, NULL, NULL, NULL, 13650.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (50, 'PISOS PASILLO SHOPPING',          'CARA PALETAS BACKLIGHT Y PLOTEO PISOS', 'Shopping', 'estatico_shopping',  'Mercedes',                                                            2900.0,  FALSE, NULL, NULL, NULL, 13650.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (51, 'PISOS PASILLO SHOPPING',          'CARA PALETAS BACKLIGHT Y PLOTEO PISOS', 'Shopping', 'estatico_shopping',  'Colonia',                                                             2900.0,  FALSE, NULL, NULL, NULL, 13650.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (52, 'PISOS PASILLO SHOPPING',          'CARA PALETAS BACKLIGHT Y PLOTEO PISOS', 'Shopping', 'estatico_shopping',  'Minas',                                                               2900.0,  FALSE, NULL, NULL, NULL, 13650.0, NULL, 1,  1,  FALSE, FALSE, '', TRUE),
  (53, 'MEDIANERA EDIFICIO',              'MEDIANERAS EN EDIFICIOS',               'Exterior', 'medianera',          'Av 18 de Julio y Roxlo - visual  publico al Este',                    21650.0, FALSE, NULL, NULL, NULL, 111550.0, 3812.5, 1, 1, FALSE, FALSE, '', TRUE),
  (54, 'MEDIANERA EDIFICIO',              'MEDIANERAS EN EDIFICIOS',               'Exterior', 'medianera',          'Bvar. Batlle y Ordoñez y Av. Rivera - visual hacia N y E',            21650.0, FALSE, NULL, NULL, NULL, 133875.0, 4600.0, 1, 1, FALSE, FALSE, '', TRUE),
  (55, 'MEDIANERA EDIFICIO',              'MEDIANERAS EN EDIFICIOS',               'Exterior', 'medianera',          'Av Italia y Caldas - visual publico hacia el Este',                   21650.0, FALSE, NULL, NULL, NULL, 127300.0, 4262.5, 1, 1, FALSE, FALSE, '', TRUE),
  (56, 'MegaBus Exclusivo',               'CARTELES EN BUSES',                     'Bus',      'estatico_bus',       'Coetc - Línea D9 y DM1 (Montevideo)',                                 27550.0, FALSE, NULL, NULL, NULL, 107800.0, NULL, 1, 1, FALSE, FALSE, '', TRUE),
  (57, 'FullBus Exclusivo',               'CARTELES EN BUSES',                     'Bus',      'estatico_bus',       'Coetc - Líneas Suburbanas (Mvd y Canelones)',                         17050.0, FALSE, NULL, NULL, NULL, 63525.0,  NULL, 1, 1, FALSE, FALSE, '', TRUE),
  (58, 'InteriorBus Exclusivo',           'CARTELES EN BUSES',                     'Bus',      'estatico_bus',       'Coetc - Líneas Urbanas (Montevideo)',                                 5650.0,  FALSE, NULL, NULL, NULL, 20450.0,  NULL, 1, 1, FALSE, FALSE, '', TRUE),
  (59, 'TraseroFull',                     'CARTELES EN BUSES',                     'Bus',      'estatico_bus',       'Coetc - Líneas Suburbanas (Mvd y Canelones)',                         2100.0,  FALSE, NULL, NULL, NULL, 7600.0,   NULL, 1, 1, FALSE, FALSE, '', TRUE),
  (60, 'LateralFull',                     'CARTELES EN BUSES',                     'Bus',      'estatico_bus',       'Coetc - Líneas Suburbanas (Mvd y Canelones)',                         6550.0,  FALSE, NULL, NULL, NULL, 36500.0,  NULL, 4, 1, FALSE, FALSE, '', TRUE),
  (61, 'Lateral Extra o 2 Paños',         'CARTELES EN BUSES',                     'Bus',      'estatico_bus',       'Coetc - Líneas Urbanas (Montevideo)',                                 1050.0,  FALSE, NULL, NULL, NULL, 2900.0,   NULL, 1, 1, FALSE, FALSE, '', TRUE),
  (62, 'Lateral 1 Paño',                  'CARTELES EN BUSES',                     'Bus',      'estatico_bus',       'Coetc - Líneas Urbanas (Montevideo)',                                 900.0,   FALSE, NULL, NULL, NULL, 2350.0,   NULL, 1, 1, FALSE, FALSE, '', TRUE),
  (63, 'Trasero Premium',                 'CARTELES EN BUSES',                     'Bus',      'estatico_bus',       'Coetc - Líneas Urbanas (Montevideo)',                                 850.0,   FALSE, NULL, NULL, NULL, 1575.0,   NULL, 1, 1, FALSE, FALSE, '', TRUE),
  (64, 'Luneta Premium',                  'CARTELES EN BUSES',                     'Bus',      'estatico_bus',       'Coetc - Líneas Urbanas (Montevideo)',                                 850.0,   FALSE, NULL, NULL, NULL, 2625.0,   NULL, 1, 1, FALSE, FALSE, '', TRUE)
ON CONFLICT (cotizador_id) DO UPDATE SET
  nombre                = EXCLUDED.nombre,
  seccion               = EXCLUDED.seccion,
  categoria             = EXCLUDED.categoria,
  tipo_cotizador        = EXCLUDED.tipo_cotizador,
  ubicacion             = EXCLUDED.ubicacion,
  precio_semanal        = EXCLUDED.precio_semanal,
  tiene_iva             = EXCLUDED.tiene_iva,
  salidas_por_hora      = EXCLUDED.salidas_por_hora,
  horas_encendido       = EXCLUDED.horas_encendido,
  impactos_mensuales    = EXCLUDED.impactos_mensuales,
  costo_produccion      = EXCLUDED.costo_produccion,
  impuestos_municipales = EXCLUDED.impuestos_municipales,
  cantidad_default      = EXCLUDED.cantidad_default,
  semanas_minimas       = EXCLUDED.semanas_minimas,
  temporada_alta        = EXCLUDED.temporada_alta,
  temporada_baja        = EXCLUDED.temporada_baja,
  comentario            = EXCLUDED.comentario,
  activo                = EXCLUDED.activo;

-- ============================================================
-- 6. VERIFY
-- ============================================================
SELECT categoria, seccion, COUNT(*) AS cant
FROM soportes
WHERE cotizador_id IS NOT NULL
GROUP BY categoria, seccion
ORDER BY categoria, seccion;
