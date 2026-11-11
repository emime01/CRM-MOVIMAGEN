-- v51 · Canon diferido por línea
--
-- Antes se pasaba al mes siguiente un monto arbitrario por shopping, y la
-- factura seguía apareciendo en el informe del mes original. Ahora se difiere
-- una línea (factura × shopping): sale del informe de su mes y aparece, como
-- línea normal, en el del mes en que se paga.
--
--   linea_id    uuid de la factura, o 'plan-<orden_id>' si la venta se paga en
--               cuotas de canon (canon_planes)
--   mes_pauta   mes donde la línea se calcula originalmente (día 1)
--   mes_destino mes donde se paga (día 1, posterior a mes_pauta)
--
-- Una fila por línea diferida: volver a diferirla sólo mueve mes_destino;
-- "devolver" borra la fila.
--
-- Idempotente.

create table if not exists canon_diferidos (
  shopping_id  uuid not null references canon_shoppings(id) on delete cascade,
  linea_id     text not null,
  mes_pauta    date not null,
  mes_destino  date not null,
  creado_por   uuid,
  created_at   timestamptz not null default now(),
  primary key (shopping_id, linea_id, mes_pauta),
  constraint canon_diferidos_destino_posterior check (mes_destino > mes_pauta)
);
create index if not exists idx_canon_diferidos_destino on canon_diferidos (mes_destino);

alter table canon_diferidos enable row level security;
revoke all on canon_diferidos from anon, authenticated;
grant select, insert, update, delete on canon_diferidos to service_role;
