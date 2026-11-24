-- v53 · Ventas históricas (2024 y 2025, antes del CRM)
--
-- Las ventas de 2024 y 2025 vienen de la planilla "Comparativo ventas 24-25":
-- una fila por venta con el cliente (texto libre), el monto sin IVA en pesos,
-- el vendedor y el trimestre (antes se medía por trimestres; desde 2026, por
-- cuatrimestres). No tienen soportes ni fechas exactas, así que no son
-- órdenes de venta: viven en esta tabla aparte, de sólo consulta, y las usan
-- los reportes comparativos y el historial de cada cuenta.
--
-- vendedor_id y cliente_id se completan al importar cuando el nombre coincide
-- con un perfil o un cliente del CRM; si no, queda el texto (p. ej. vendedores
-- que ya no están). Se importa desde la API /api/admin/ventas-historicas.
--
-- Idempotente.

create table if not exists ventas_historicas (
  id               uuid primary key default gen_random_uuid(),
  anio             int not null check (anio between 2000 and 2100),
  trimestre        int not null check (trimestre between 1 and 4),
  vendedor_nombre  text not null,
  vendedor_id      uuid references perfiles(id) on delete set null,
  cliente_texto    text not null,
  cliente_id       uuid references clientes(id) on delete set null,
  monto            numeric(14, 2) not null,
  moneda           text not null default 'UYU' check (moneda in ('UYU', 'USD')),
  fuente           text not null,
  created_at       timestamptz not null default now()
);

create index if not exists idx_ventas_historicas_anio on ventas_historicas (anio, trimestre);
create index if not exists idx_ventas_historicas_cliente on ventas_historicas (cliente_id) where cliente_id is not null;
create index if not exists idx_ventas_historicas_vendedor on ventas_historicas (vendedor_id) where vendedor_id is not null;

-- Igual que el resto de las tablas: se lee y escribe desde el servidor.
alter table ventas_historicas enable row level security;
