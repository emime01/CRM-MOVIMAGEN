-- v30 · La campaña deja de esconderse adentro de "Marca"
--
-- Hasta ahora el formulario de venta tenía un solo campo "Marca" con el
-- placeholder "Marca o campaña": en una venta de Coca Cola para la campaña
-- Verano había que elegir cuál de las dos cosas escribir. Por eso el video
-- comprobante tenía el renglón de la campaña siempre vacío —la plantilla lo
-- dibuja, pero nadie tenía dónde cargarlo— y no se podía mirar un cliente y
-- ver sus campañas.
--
-- La campaña se declara una vez en el lead y viaja sola: cotización → venta →
-- comprobante.
--
-- Idempotente: se puede correr más de una vez sin romper nada.

alter table leads            add column if not exists campana text;
alter table propuestas       add column if not exists campana text;
alter table ordenes_venta    add column if not exists campana text;

comment on column leads.campana         is 'Campaña del cliente (ej.: Verano). Se hereda a la cotización y a la venta.';
comment on column propuestas.campana    is 'Campaña heredada del lead.';
comment on column ordenes_venta.campana is 'Campaña heredada de la cotización. Sale en el video comprobante.';

-- Buscar "las ventas de la campaña Verano" sin escanear la tabla entera.
create index if not exists idx_ordenes_venta_campana on ordenes_venta (campana) where campana is not null;
create index if not exists idx_leads_campana         on leads (campana)         where campana is not null;
