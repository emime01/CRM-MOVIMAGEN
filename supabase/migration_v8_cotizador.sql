-- Migration V8: Cotizador integration
-- Adds pricing fields to soportes, enriches propuestas/propuesta_items, seeds 64 soportes

-- 0. Drop categoria check constraint so cotizador categories can be stored
ALTER TABLE soportes DROP CONSTRAINT IF EXISTS soportes_categoria_check;

-- 1. Enrich soportes
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS produccion        NUMERIC(12,2)  DEFAULT 0;
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS imp_municipal     BOOLEAN        DEFAULT FALSE;
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS impactos          INTEGER        DEFAULT 0;
ALTER TABLE soportes ADD COLUMN IF NOT EXISTS cotizador_id      INTEGER        UNIQUE;

-- 2. Enrich propuestas
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS cliente_id          UUID    REFERENCES clientes(id);
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS numero              TEXT;
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS nombre              TEXT;
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS fecha_inicio        DATE;
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS fecha_fin           DATE;
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS monto_neto          NUMERIC(14,2);
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS monto_total         NUMERIC(14,2);
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS moneda              TEXT DEFAULT 'UYU';
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS iva_pct             NUMERIC(5,2)  DEFAULT 22;
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS imp_municipal_pct   NUMERIC(5,2)  DEFAULT 8;

-- 3. Enrich propuesta_items (snapshot fields so pricing never changes retroactively)
ALTER TABLE propuesta_items ADD COLUMN IF NOT EXISTS nombre_soporte     TEXT;
ALTER TABLE propuesta_items ADD COLUMN IF NOT EXISTS ubicacion          TEXT;
ALTER TABLE propuesta_items ADD COLUMN IF NOT EXISTS produccion         NUMERIC(12,2)  DEFAULT 0;
ALTER TABLE propuesta_items ADD COLUMN IF NOT EXISTS tiene_iva          BOOLEAN        DEFAULT FALSE;
ALTER TABLE propuesta_items ADD COLUMN IF NOT EXISTS tiene_imp_mun      BOOLEAN        DEFAULT FALSE;
ALTER TABLE propuesta_items ADD COLUMN IF NOT EXISTS impactos           INTEGER        DEFAULT 0;
ALTER TABLE propuesta_items ADD COLUMN IF NOT EXISTS es_digital         BOOLEAN        DEFAULT FALSE;
ALTER TABLE propuesta_items ADD COLUMN IF NOT EXISTS subtotal           NUMERIC(14,2);

-- 4. Auto-number sequence for propuestas
CREATE SEQUENCE IF NOT EXISTS propuestas_numero_seq START 1;

-- 5. Seed / upsert 64 soportes from cotizador
INSERT INTO soportes (cotizador_id, nombre, categoria, ubicacion, precio_semanal, produccion, tiene_iva, imp_municipal, impactos, activo)
VALUES
  (1,  'PANTALLA GIGANTE CURVA',                'PANTALLAS GIGANTES',                       'Rivera y L.A.Herrera',                                              23000,  0,      false, true,  728530,  true),
  (2,  'PANTALLA GIGANTE',                      'PANTALLAS GIGANTES',                       'Av Italia y Ricaldoni',                                             23000,  0,      false, true,  1059298, true),
  (3,  'PANTALLA GIGANTE',                      'PANTALLAS GIGANTES',                       'Rivera y Bvar Batlle y Ordoñez',                                    23000,  0,      false, true,  489014,  true),
  (4,  'PANTALLA GIGANTE 360',                  'PANTALLAS GIGANTES',                       'Atlántico Shopping Punta del Este (Temp Alta)',                      32000,  0,      true,  false, 1209302, true),
  (5,  'PANTALLA GIGANTE 360',                  'PANTALLAS GIGANTES',                       'Atlántico Shopping Punta del Este (Temp Baja)',                      21000,  0,      true,  false, 46511,   true),
  (6,  'CIRCUITO SHOPPING',                     'CIRCUITOS DE PANTALLAS SHOPPINGS',         'Atlántico Shopping Punta del Este (Temp Alta)',                      25200,  0,      true,  false, 1813953, true),
  (7,  'CIRCUITO SHOPPING',                     'CIRCUITOS DE PANTALLAS SHOPPINGS',         'Atlántico Shopping Punta del Este (Temp Baja)',                      15600,  0,      true,  false, 58139,   true),
  (8,  'CIRCUITO SHOPPING',                     'CIRCUITOS DE PANTALLAS SHOPPINGS',         'Minas (2 gigantes en circuito)',                                     11800,  0,      true,  false, 42732,   true),
  (9,  'CIRCUITO SHOPPING',                     'CIRCUITOS DE PANTALLAS SHOPPINGS',         'Salto',                                                             10400,  0,      true,  false, 71220,   true),
  (10, 'CIRCUITO SHOPPING',                     'CIRCUITOS DE PANTALLAS SHOPPINGS',         'Paysandú',                                                          11700,  0,      true,  false, 70930,   true),
  (11, 'CIRCUITO SHOPPING',                     'CIRCUITOS DE PANTALLAS SHOPPINGS',         'Mercedes',                                                          6500,   0,      true,  false, 47480,   true),
  (12, 'CIRCUITO SHOPPING',                     'CIRCUITOS DE PANTALLAS SHOPPINGS',         'Colonia',                                                           6500,   0,      true,  false, 32049,   true),
  (13, 'PUERTA ENTRADA SHOPPING',               'PLOTEO PUERTAS',                           'Atlántico Shopping Punta del Este (Temp Alta)',                      19700,  44625,  true,  false, 0,       true),
  (14, 'PUERTA ENTRADA SHOPPING',               'PLOTEO PUERTAS',                           'Atlántico Shopping Punta del Este (Temp Baja)',                      11800,  44625,  true,  false, 0,       true),
  (15, 'PUERTA ENTRADA SHOPPING',               'PLOTEO PUERTAS',                           'Salto',                                                             11800,  44625,  true,  false, 0,       true),
  (16, 'PUERTA ENTRADA SHOPPING',               'PLOTEO PUERTAS',                           'Paysandú',                                                          11800,  44625,  true,  false, 0,       true),
  (17, 'PUERTA ENTRADA SHOPPING',               'PLOTEO PUERTAS',                           'Mercedes',                                                          11800,  44625,  true,  false, 0,       true),
  (18, 'PUERTA ENTRADA SHOPPING',               'PLOTEO PUERTAS',                           'Colonia',                                                           11800,  44625,  true,  false, 0,       true),
  (19, 'PUERTA ENTRADA SHOPPING',               'PLOTEO PUERTAS',                           'Minas',                                                             11800,  44625,  true,  false, 0,       true),
  (20, 'BANNER EXTRA GIGANTE',                  'BANNERS EN SHOPPINGS',                     'Atlántico Shopping Punta del Este (Temp Alta)',                      19700,  101050, true,  false, 0,       true),
  (21, 'BANNER EXTRA GIGANTE',                  'BANNERS EN SHOPPINGS',                     'Atlántico Shopping Punta del Este (Temp Baja)',                      11800,  101050, true,  false, 0,       true),
  (22, 'BANNER GIGANTE SHOPPING',               'BANNERS EN SHOPPINGS',                     'Salto',                                                             5800,   34150,  true,  false, 0,       true),
  (23, 'BANNER GIGANTE SHOPPING',               'BANNERS EN SHOPPINGS',                     'Paysandú',                                                          5800,   34150,  true,  false, 0,       true),
  (24, 'BANNER GIGANTE SHOPPING',               'BANNERS EN SHOPPINGS',                     'Mercedes',                                                          5800,   34150,  true,  false, 0,       true),
  (25, 'BANNER GIGANTE SHOPPING',               'BANNERS EN SHOPPINGS',                     'Colonia',                                                           5800,   28900,  true,  false, 0,       true),
  (26, 'BANNER GIGANTE SHOPPING',               'BANNERS EN SHOPPINGS',                     'Minas',                                                             5800,   26250,  true,  false, 0,       true),
  (27, 'BANNER STANDARD SHOPPING',              'BANNERS EN SHOPPINGS',                     'Salto',                                                             2900,   5250,   true,  false, 0,       true),
  (28, 'BANNER STANDARD SHOPPING',              'BANNERS EN SHOPPINGS',                     'Paysandú',                                                          2900,   5250,   true,  false, 0,       true),
  (29, 'BANNER STANDARD SHOPPING',              'BANNERS EN SHOPPINGS',                     'Mercedes',                                                          2900,   5250,   true,  false, 0,       true),
  (30, 'BANNER PARKING SHOPPING',               'BANNERS EN SHOPPINGS',                     'Atlántico Shopping Punta del Este (Temp Alta)',                      4350,   8150,   true,  false, 0,       true),
  (31, 'BANNER PARKING SHOPPING',               'BANNERS EN SHOPPINGS',                     'Atlántico Shopping Punta del Este (Temp Baja)',                      2900,   8150,   true,  false, 0,       true),
  (32, 'BANNER PARKING SHOPPING',               'BANNERS EN SHOPPINGS',                     'Salto',                                                             2900,   8150,   true,  false, 0,       true),
  (33, 'BANNER PARKING SHOPPING',               'BANNERS EN SHOPPINGS',                     'Paysandú',                                                          2900,   8150,   true,  false, 0,       true),
  (34, 'BANNER PARKING SHOPPING',               'BANNERS EN SHOPPINGS',                     'Minas',                                                             2900,   8150,   true,  false, 0,       true),
  (35, 'BANNER PARKING SHOPPING',               'BANNERS EN SHOPPINGS',                     'Colonia',                                                           2900,   8150,   true,  false, 0,       true),
  (36, 'LONA PARKING SHOPPING',                 'BANNERS EN SHOPPINGS',                     'Mercedes',                                                          5800,   28875,  true,  false, 0,       true),
  (37, 'ESCALERA SHOPPING',                     'PLOTEO ESCALERAS Y ASCENSORES',            'Atlántico Shopping Punta del Este (Temp Alta)',                      19700,  42250,  true,  false, 0,       true),
  (38, 'ESCALERA SHOPPING',                     'PLOTEO ESCALERAS Y ASCENSORES',            'Atlántico Shopping Punta del Este (Temp Baja)',                      11800,  42250,  true,  false, 0,       true),
  (39, 'ESCALERA SHOPPING',                     'PLOTEO ESCALERAS Y ASCENSORES',            'Salto',                                                             11800,  42250,  true,  false, 0,       true),
  (40, 'ASCENSOR SHOPPING',                     'PLOTEO ESCALERAS Y ASCENSORES',            'Atlántico Shopping Punta del Este (Temp Alta)',                      11800,  34650,  true,  false, 0,       true),
  (41, 'ASCENSOR SHOPPING',                     'PLOTEO ESCALERAS Y ASCENSORES',            'Atlántico Shopping Punta del Este (Temp Baja)',                      7900,   34650,  true,  false, 0,       true),
  (42, 'ASCENSOR SHOPPING',                     'PLOTEO ESCALERAS Y ASCENSORES',            'Salto',                                                             7900,   34650,  true,  false, 0,       true),
  (43, 'CARA PALETAS BACKLIGHT SHOPPING',       'CARA PALETAS BACKLIGHT Y PLOTEO PISOS',    'Salto',                                                             2900,   8150,   true,  false, 0,       true),
  (44, 'CARA PALETAS BACKLIGHT SHOPPING',       'CARA PALETAS BACKLIGHT Y PLOTEO PISOS',    'Mercedes',                                                          2900,   8150,   true,  false, 0,       true),
  (45, 'CARA PALETAS BACKLIGHT SHOPPING',       'CARA PALETAS BACKLIGHT Y PLOTEO PISOS',    'Colonia',                                                           2900,   8150,   true,  false, 0,       true),
  (46, 'PISOS PASILLO SHOPPING',                'CARA PALETAS BACKLIGHT Y PLOTEO PISOS',    'Atlántico Shopping Punta del Este (Temp Alta)',                      4350,   13650,  true,  false, 0,       true),
  (47, 'PISOS PASILLO SHOPPING',                'CARA PALETAS BACKLIGHT Y PLOTEO PISOS',    'Atlántico Shopping Punta del Este (Temp Baja)',                      2900,   13650,  true,  false, 0,       true),
  (48, 'PISOS PASILLO SHOPPING',                'CARA PALETAS BACKLIGHT Y PLOTEO PISOS',    'Salto',                                                             2900,   13650,  true,  false, 0,       true),
  (49, 'PISOS PASILLO SHOPPING',                'CARA PALETAS BACKLIGHT Y PLOTEO PISOS',    'Paysandú',                                                          2900,   13650,  true,  false, 0,       true),
  (50, 'PISOS PASILLO SHOPPING',                'CARA PALETAS BACKLIGHT Y PLOTEO PISOS',    'Mercedes',                                                          2900,   13650,  true,  false, 0,       true),
  (51, 'PISOS PASILLO SHOPPING',                'CARA PALETAS BACKLIGHT Y PLOTEO PISOS',    'Colonia',                                                           2900,   13650,  true,  false, 0,       true),
  (52, 'PISOS PASILLO SHOPPING',                'CARA PALETAS BACKLIGHT Y PLOTEO PISOS',    'Minas',                                                             2900,   13650,  true,  false, 0,       true),
  (53, 'MEDIANERA EDIFICIO',                    'MEDIANERAS EN EDIFICIOS',                  'Av 18 de Julio y Roxlo - visual publico al Este',                    21650,  111550, false, true,  0,       true),
  (54, 'MEDIANERA EDIFICIO',                    'MEDIANERAS EN EDIFICIOS',                  'Bvar. Batlle y Ordoñez y Av. Rivera - visual hacia N y E',           21650,  133875, false, true,  0,       true),
  (55, 'MEDIANERA EDIFICIO',                    'MEDIANERAS EN EDIFICIOS',                  'Av Italia y Caldas - visual publico hacia el Este',                  21650,  127300, false, true,  0,       true),
  (56, 'MegaBus Exclusivo',                     'CARTELES EN BUSES',                        'Coetc - Línea D9 y DM1 (Montevideo)',                               27550,  107800, false, false, 0,       true),
  (57, 'FullBus Exclusivo',                     'CARTELES EN BUSES',                        'Coetc - Líneas Suburbanas (Mvd y Canelones)',                        17050,  63525,  false, false, 0,       true),
  (58, 'InteriorBus Exclusivo',                 'CARTELES EN BUSES',                        'Coetc - Líneas Urbanas (Montevideo)',                                5650,   20450,  false, false, 0,       true),
  (59, 'TraseroFull',                           'CARTELES EN BUSES',                        'Coetc - Líneas Suburbanas (Mvd y Canelones)',                        2100,   7600,   false, false, 0,       true),
  (60, 'LateralFull',                           'CARTELES EN BUSES',                        'Coetc - Líneas Suburbanas (Mvd y Canelones)',                        26200,  36500,  false, false, 0,       true),
  (61, 'Lateral Extra o 2 Paños',               'CARTELES EN BUSES',                        'Coetc - Líneas Urbanas (Montevideo)',                                1050,   2900,   false, false, 0,       true),
  (62, 'Lateral 1 Paño',                        'CARTELES EN BUSES',                        'Coetc - Líneas Urbanas (Montevideo)',                                900,    2350,   false, false, 0,       true),
  (63, 'Trasero Premium',                       'CARTELES EN BUSES',                        'Coetc - Líneas Urbanas (Montevideo)',                                850,    1575,   false, false, 0,       true),
  (64, 'Luneta Premium',                        'CARTELES EN BUSES',                        'Coetc - Líneas Urbanas (Montevideo)',                                850,    2625,   false, false, 0,       true)
ON CONFLICT (cotizador_id) DO UPDATE SET
  nombre          = EXCLUDED.nombre,
  categoria       = EXCLUDED.categoria,
  ubicacion       = EXCLUDED.ubicacion,
  precio_semanal  = EXCLUDED.precio_semanal,
  produccion      = EXCLUDED.produccion,
  tiene_iva       = EXCLUDED.tiene_iva,
  imp_municipal   = EXCLUDED.imp_municipal,
  impactos        = EXCLUDED.impactos;
