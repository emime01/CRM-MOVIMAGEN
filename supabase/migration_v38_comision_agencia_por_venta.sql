-- v38 · La comisión de agencia se define en cada venta
--
-- Hasta ahora el porcentaje de agencia vivía sólo en `agencias`, como un dato
-- fijo de la agencia. Pero se negocia venta por venta: la agencia tiene un
-- porcentaje habitual, y en cada orden puede quedar otro. Y a veces la agencia
-- también comisiona sobre la producción, no sólo sobre el arrendamiento.
--
-- Queda así:
--
--   agencias.porcentaje_comision              lo recomendado sobre arrendamiento
--   agencias.porcentaje_comision_produccion   lo recomendado sobre producción
--      → sólo sugieren: precargan el campo de la venta.
--
--   propuestas / ordenes_venta
--     .comision_agencia_pct                   lo pactado sobre arrendamiento
--     .comision_agencia_prod_pct              lo pactado sobre producción
--      → lo que vale. Lo carga el vendedor y es obligatorio cuando la venta
--        tiene agencia (0 es un valor válido: "esta vez no comisiona").
--
-- El canon usa el de la venta: `arrendamiento × (1 − comision_agencia_pct)`.
--
-- Idempotente.

-- ── Lo recomendado, en la agencia ───────────────────────────────────────────
alter table agencias add column if not exists porcentaje_comision_produccion numeric(5,2) not null default 0;

comment on column agencias.porcentaje_comision is
  'Comisión recomendada sobre arrendamiento. Precarga la venta; lo que vale es ordenes_venta.comision_agencia_pct.';
comment on column agencias.porcentaje_comision_produccion is
  'Comisión recomendada sobre producción. Precarga la venta; lo que vale es ordenes_venta.comision_agencia_prod_pct.';

-- ── Lo pactado, en la cotización y en la venta ──────────────────────────────
alter table propuestas    add column if not exists comision_agencia_pct      numeric(5,2);
alter table propuestas    add column if not exists comision_agencia_prod_pct numeric(5,2);
alter table ordenes_venta add column if not exists comision_agencia_pct      numeric(5,2);
alter table ordenes_venta add column if not exists comision_agencia_prod_pct numeric(5,2);

comment on column ordenes_venta.comision_agencia_pct is
  'Comisión de la agencia sobre arrendamiento, pactada en esta venta. Obligatoria si hay agencia.';
comment on column ordenes_venta.comision_agencia_prod_pct is
  'Comisión de la agencia sobre producción, pactada en esta venta. Obligatoria si hay agencia.';

-- Entre 0 y 100.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ordenes_venta_comision_agencia_rango') then
    alter table ordenes_venta add constraint ordenes_venta_comision_agencia_rango check (
      (comision_agencia_pct      is null or comision_agencia_pct      between 0 and 100) and
      (comision_agencia_prod_pct is null or comision_agencia_prod_pct between 0 and 100)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'propuestas_comision_agencia_rango') then
    alter table propuestas add constraint propuestas_comision_agencia_rango check (
      (comision_agencia_pct      is null or comision_agencia_pct      between 0 and 100) and
      (comision_agencia_prod_pct is null or comision_agencia_prod_pct between 0 and 100)
    );
  end if;
end $$;

-- ── Ventas que ya existen ───────────────────────────────────────────────────
-- Se completan con lo recomendado de su agencia (hoy todas en 0), para que
-- la regla de abajo se pueda aplicar. Revisarlas a mano si alguna se pactó
-- distinto.
update ordenes_venta o
   set comision_agencia_pct      = coalesce(o.comision_agencia_pct,      a.porcentaje_comision, 0),
       comision_agencia_prod_pct = coalesce(o.comision_agencia_prod_pct, a.porcentaje_comision_produccion, 0)
  from agencias a
 where a.id = o.agencia_id
   and (o.comision_agencia_pct is null or o.comision_agencia_prod_pct is null);

-- ── Obligatorio cuando hay agencia ──────────────────────────────────────────
-- En la base, además del formulario: una venta con agencia no puede quedar
-- sin el porcentaje pactado, venga de donde venga.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ordenes_venta_comision_agencia_obligatoria') then
    alter table ordenes_venta add constraint ordenes_venta_comision_agencia_obligatoria check (
      agencia_id is null
      or (comision_agencia_pct is not null and comision_agencia_prod_pct is not null)
    );
  end if;
end $$;
