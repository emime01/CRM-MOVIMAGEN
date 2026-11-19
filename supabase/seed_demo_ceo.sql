-- ════════════════════════════════════════════════════════════════════════════
-- SEED DE DEMO PARA GERENCIA / CEO  (datos de PRUEBA, noviembre 2026)
-- ════════════════════════════════════════════════════════════════════════════
--
-- NO es una migración: es un script de una sola vez para pegar en el SQL
-- Editor de Supabase. Carga datos ficticios para que los reportes del
-- gerente y del CEO (Resumen, Equipo, Comparativo, Cobranzas, Comisiones,
-- Disponibilidad) tengan algo que mostrar. "Hoy" del script es 2026-11-19.
--
-- QUÉ CREA
--   · 5 clientes "[PRUEBA] Demo <rubro>" (Bebidas, Telco → Natalia;
--     Banco → Federico; Retail → Fabián; Automotriz → Gonzalo) y la agencia
--     "[PRUEBA] Demo Agencia" (15 % de comisión sobre arrendamiento). Telco
--     y Retail cuelgan de la agencia.
--   · 22 ventas (ordenes_venta + orden_items):
--       - 16 en Q3-2026 (sep–nov 2026): 13 aprobadas, 2 pendientes de
--         aprobación y 1 rechazada; 4 de Natalia (+1 pendiente), 4 de
--         Federico, 3 de Fabián (+1 rechazada) y 2 de Gonzalo (+1 pendiente).
--         3 pasan por la agencia (comisión 15 %; en 2025 hay una más), 2 son en USD
--         (cotización 40,5). Formatos: LED y circuitos (Digital), Shopping,
--         medianeras (Exterior), ruteros (Ruta) y Bus, con los precios de
--         lista de cada soporte real (los elige por categoría y que tengan
--         lugar libre en las fechas de la venta).
--       - 6 en sep–nov 2025 (año anterior) para el comparativo interanual.
--     Montos calculados como la app (lib/ventas/montos-linea.ts): arrendamiento
--     (con IVA 22 % sólo si el soporte lo tiene), producción con IVA e
--     impuestos municipales / MTOP por semana.
--     Las ventas aprobadas quedan en estado 'aprobada': es el estado final
--     de la app (en_oic / facturada / cobrada ya no se setean; lo facturado y
--     lo cobrado se ve en las facturas).
--   · Facturas (cuotas) de cada venta, con el mismo plan que arma la app:
--     cobradas (con su pago y la comisión del vendedor, 6,75 % del
--     arrendamiento), emitidas ya vencidas (Deudores vencidos), emitidas
--     vigentes y previstas. Para las ventas con agencia, la comisión de
--     agencia (comisiones_agencia) de cada factura emitida; una factura
--     cobrada con la comisión "descontada" (la agencia pagó el neto:
--     total − comisión × 1,22). 3 gestiones de cobranza sobre facturas
--     vencidas.
--   · 25 leads de Q3-2026 de los 4 vendedores en todos los estados, varios
--     con la próxima gestión vencida, y 16 cotizaciones (COT-xxxx, números
--     de la secuencia propuestas_numero_seq): borrador, enviada (algunas con
--     más de 8 días sin movimiento), aceptada y rechazada; dos leads con dos
--     versiones. Las aceptadas quedan ligadas a su venta (propuesta_id) y a
--     su lead (que queda 'ganado').
--   · 2 bloqueos de soportes (reservas + reserva_items) en diciembre 2026.
--
-- CÓMO SE BORRA
--   supabase/borrar_todas_las_ventas.sql borra todo esto (y TAMBIÉN cualquier
--   venta, cotización o lead real que se haya cargado después: ese script
--   vacía las tablas enteras, no distingue datos de prueba).
--
-- SI ALGO FALLA
--   Corre dentro de una transacción: si hay un error no queda nada cargado.
--   Si ya se había cargado antes, aborta con un mensaje (hay que correr
--   borrar_todas_las_ventas.sql primero).
--
-- NECESITA que existan y estén activos en `perfiles` Natalia, Federico,
-- Fabián y Gonzalo, y soportes activos de las categorías Digital, Shopping,
-- Exterior, Ruta y Bus. Las migraciones hasta la v52 tienen que estar
-- aplicadas.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ─── 0. Precondición: no cargar dos veces ────────────────────────────────────
do $$
begin
  if exists (select 1 from clientes where nombre ilike '[PRUEBA] Demo %' or empresa ilike '[PRUEBA] Demo %')
     or exists (select 1 from agencias where nombre ilike '[PRUEBA] Demo %') then
    raise exception 'El seed de demo ya está cargado (hay clientes o agencias "[PRUEBA] Demo ..."). Corré primero supabase/borrar_todas_las_ventas.sql y después este script.';
  end if;
end $$;

-- ─── 1. Herramientas temporales (desaparecen al terminar) ────────────────────

-- Claves → ids de lo que se va creando (perfiles, clientes, leads, cotizaciones).
create temp table _d (clave text primary key, id uuid not null) on commit drop;
-- Ventas creadas: sus líneas y totales, para armar las cotizaciones iguales.
create temp table _ventas (
  clave text primary key, id uuid not null, lineas jsonb not null,
  arr numeric, prod numeric, neto numeric, total numeric, moneda text,
  alta date, baja date, cuotas int, cond int
) on commit drop;

-- La fecha de "hoy" del seed.
create function pg_temp.hoy() returns date language sql immutable as $$ select date '2026-11-19' $$;

create function pg_temp.k(p_clave text) returns uuid language plpgsql as $$
declare v uuid;
begin
  select id into v from _d where clave = p_clave;
  if v is null then raise exception 'Seed de demo: no existe la clave "%"', p_clave; end if;
  return v;
end $$;

-- Perfil por nombre (sin tildes ni mayúsculas, el nombre exacto gana).
create function pg_temp.perfil(p_nombre text, p_obligatorio boolean default true) returns uuid
language plpgsql as $$
declare v uuid;
begin
  select id into v from perfiles
   where activo and nombre not ilike '[PRUEBA]%'
     and translate(lower(nombre), 'áéíóúü', 'aeiouu') like translate(lower(p_nombre), 'áéíóúü', 'aeiouu') || '%'
   order by (translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower(p_nombre), 'áéíóúü', 'aeiouu')) desc, nombre
   limit 1;
  if v is null and p_obligatorio then
    raise exception 'Falta el perfil activo "%": el seed necesita a Natalia, Federico, Fabián y Gonzalo cargados en perfiles.', p_nombre;
  end if;
  return v;
end $$;

-- Reparte un importe en n partes de a centésimos; la última absorbe el redondeo
-- (igual que planDeCuotas de lib/ventas/facturas.ts).
create function pg_temp.repartir(p_total numeric, p_n int) returns numeric[] language plpgsql as $$
declare base numeric; partes numeric[] := '{}'; i int;
begin
  base := floor(round(p_total * 100) / p_n) / 100;
  for i in 1..p_n loop partes[i] := base; end loop;
  partes[p_n] := round((p_total - base * (p_n - 1)) * 100) / 100;
  return partes;
end $$;

-- Elige un soporte activo de la categoría (y tipo, si se pide) con lugar libre
-- en las fechas: cuenta ventas vivas y bloqueos sin venta, con la misma regla
-- de espacios que la disponibilidad (circuito y LED por salidas, el resto por
-- cantidad). `p_n` rota la elección para que las ventas no caigan todas en el
-- mismo soporte. Devuelve el soporte y cuánto le queda libre en esas fechas
-- (en espacios). Si ninguno tiene lugar, usa el más libre y avisa.
create function pg_temp.elegir_soporte(
  p_cat text, p_tipo text, p_n int, p_desde date, p_hasta date,
  p_cant int, p_sal int, p_sem int, p_chequear boolean
) returns table (soporte_id uuid, libre numeric) language plpgsql as $$
declare v_id uuid; v_libre numeric; v_necesita numeric; v_total int; v_tipo text := p_tipo;
begin
  select count(*) into v_total from soportes s
   where s.activo and s.categoria = p_cat and (v_tipo is null or s.tipo_cotizador = v_tipo)
     and coalesce(s.precio_semanal, 0) > 0 and s.precio_semanal_alta is null
     and coalesce(s.semanas_minimas, 1) <= p_sem;
  -- Sin soportes de ese tipo, cualquiera de la categoría.
  if v_total = 0 and v_tipo is not null then
    raise notice 'Seed demo: no hay soportes activos de tipo % en %: se usa otro de la categoría', v_tipo, p_cat;
    v_tipo := null;
    select count(*) into v_total from soportes s
     where s.activo and s.categoria = p_cat
       and coalesce(s.precio_semanal, 0) > 0 and s.precio_semanal_alta is null
       and coalesce(s.semanas_minimas, 1) <= p_sem;
  end if;
  if v_total = 0 then
    raise exception 'El seed necesita un soporte activo de categoría "%" con precio semanal y mínimo de semanas <= % (no hay ninguno).',
      p_cat, p_sem;
  end if;

  select c.id, c.cap - c.ocupado, c.necesita into v_id, v_libre, v_necesita
  from (
    select s.id, coalesce(s.cap, 1)::numeric as cap,
      row_number() over (order by s.nombre, coalesce(s.ubicacion, ''), s.id) - 1 as idx,
      case s.tipo_cotizador
        when 'circuito' then greatest(1, round(coalesce(p_sal, 10) / 10.0))
        when 'led'      then greatest(1, round(coalesce(p_sal, 30) / 30.0))
        else coalesce(p_cant, s.cantidad_default, 1) end::numeric as necesita,
      coalesce((
        select sum(case s.tipo_cotizador
                     when 'circuito' then greatest(1, round(coalesce(oi.salidas, 10) / 10.0))
                     when 'led'      then greatest(1, round(coalesce(oi.salidas, 30) / 30.0))
                     else coalesce(oi.cantidad, 1) end)
          from orden_items oi join ordenes_venta o on o.id = oi.orden_id
         where oi.soporte_id = s.id and o.estado in ('aprobada', 'en_oic', 'facturada', 'cobrada')
           and coalesce(oi.fecha_alta_real, oi.fecha_alta_prevista, o.fecha_alta_real, o.fecha_alta_prevista) <= p_hasta
           and coalesce(oi.fecha_baja_real, oi.fecha_baja_prevista, o.fecha_baja_real, o.fecha_baja_prevista) >= p_desde
      ), 0) + coalesce((
        select sum(case s.tipo_cotizador
                     when 'circuito' then 1 when 'led' then 1 else coalesce(ri.cantidad, 1) end)
          from reserva_items ri join reservas r on r.id = ri.reserva_id
         where ri.soporte_id = s.id and r.orden_id is null and r.estado in ('pendiente', 'aprobada', 'activa')
           and coalesce(ri.fecha_alta_real, r.fecha_desde) <= p_hasta
           and coalesce(ri.fecha_baja_real, r.fecha_hasta) >= p_desde
      ), 0) as ocupado
    from soportes s
    where s.activo and s.categoria = p_cat and (v_tipo is null or s.tipo_cotizador = v_tipo)
      and coalesce(s.precio_semanal, 0) > 0 and s.precio_semanal_alta is null
      and coalesce(s.semanas_minimas, 1) <= p_sem
  ) c
  order by case when p_chequear then (c.cap - c.ocupado >= c.necesita) else true end desc,
           case when p_chequear then (c.cap - c.ocupado >= 1) else true end desc,
           (((c.idx - p_n) % v_total) + v_total) % v_total,
           c.cap - c.ocupado desc
  limit 1;

  if p_chequear and v_libre < 1 then
    raise notice 'Seed demo: no había lugar libre en % % (% a %): se usa el más libre', p_cat, coalesce(v_tipo, ''), p_desde, p_hasta;
  end if;
  return query select v_id, v_libre;
end $$;

-- Líneas de una venta o cotización a partir de la lista de ítems pedidos.
-- Calcula cada línea como montosDeLinea (montos-linea.ts) / calcularItem:
--   arrendamiento = precio semanal × cantidad × semanas × (1 − descuento)
--   IVA del arrendamiento sólo si el soporte tiene_iva
--   producción = costo del catálogo × cantidad (más IVA)
--   impuestos municipales / MTOP = por semana × semanas × cantidad (sin IVA)
-- En USD, precio, producción e impuestos del catálogo (pesos) se pasan a
-- dólares a 40,5.
create function pg_temp.armar_items(p_items jsonb, p_alta date, p_moneda text, p_chequear boolean)
returns jsonb language plpgsql as $$
declare
  it jsonb; s soportes; r jsonb := '[]'::jsonb;
  v_div numeric := case when p_moneda = 'USD' then 40.5 else 1 end;
  v_id uuid; v_sem int; v_cant int; v_sal int; v_base int; v_mul numeric; v_pu numeric; v_desc numeric;
  v_arr numeric; v_iva numeric; v_prod numeric; v_ivap numeric; v_imp numeric; v_impactos bigint;
  v_baja date; v_pun numeric; v_libre numeric;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    v_sem  := (it->>'sem')::int;
    v_baja := p_alta + v_sem * 7 - 1;
    select e.soporte_id, e.libre into v_id, v_libre
      from pg_temp.elegir_soporte(it->>'cat', it->>'tipo', coalesce((it->>'n')::int, 0), p_alta, v_baja,
                                  (it->>'cant')::int, (it->>'sal')::int, v_sem, p_chequear) e;
    select * into s from soportes where id = v_id;
    v_cant := coalesce((it->>'cant')::int, s.cantidad_default, 1);
    -- En los soportes físicos la cantidad no puede pasar de lo que queda libre
    -- (sólo en ventas que ocupan lugar; las cotizaciones piden lo que quieran).
    if p_chequear and s.tipo_cotizador not in ('led', 'circuito') then
      v_cant := least(v_cant, greatest(floor(v_libre)::int, 1));
    end if;
    v_base := case s.tipo_cotizador when 'led' then 30 when 'circuito' then 10 else null end;
    v_sal  := case when v_base is null then null else coalesce((it->>'sal')::int, v_base) end;
    v_mul  := case when v_base is null then 1 else v_sal::numeric / v_base end;
    v_desc := coalesce((it->>'desc')::numeric, 0);
    v_pu   := round(s.precio_semanal * v_mul / v_div, 2);
    v_arr  := v_pu * v_cant * v_sem * (1 - v_desc / 100);
    v_iva  := case when s.tiene_iva then v_arr * 0.22 else 0 end;
    v_pun  := round(coalesce(s.costo_produccion, 0) / v_div, 2);
    v_prod := v_pun * v_cant;
    v_ivap := v_prod * 0.22;
    v_imp  := round(coalesce(s.impuestos_municipales, 0) / v_div, 2) * v_sem * v_cant;
    v_impactos := case when s.impactos_mensuales is not null
                       then round(s.impactos_mensuales * v_sem / 4.33 * v_cant * v_mul) else 0 end;
    r := r || jsonb_build_object(
      'soporte_id', s.id, 'nombre', s.nombre, 'ubicacion', s.ubicacion, 'categoria', s.categoria,
      'tipo', s.tipo_cotizador, 'cantidad', v_cant, 'semanas', v_sem, 'salidas', v_sal,
      'precio_unitario', v_pu, 'descuento_pct', v_desc, 'nota', it->>'nota',
      'arr', round(v_arr, 2), 'iva_arr', round(v_iva, 2), 'prod', round(v_prod, 2), 'iva_prod', round(v_ivap, 2),
      'imp', round(v_imp, 2), 'total', round(v_arr + v_iva + v_prod + v_ivap + v_imp, 2),
      'impactos', v_impactos, 'alta', p_alta, 'baja', v_baja);
  end loop;
  return r;
end $$;

-- Plan de facturas de una venta (como armarPlanDeFacturas) y, según la
-- política, emite y cobra cuotas:
--   prevista : todas previstas (ventas por aprobar)
--   al_dia   : emite cada cuota el 5 de su mes (o 5 días después de cargada la
--              venta) y la cobra poco antes de vencer, si esa fecha ya pasó
--   nada     : emite pero no cobra ninguna (las vencidas son deuda)
-- Al emitir, la comisión de la agencia; al cobrar, el pago y la comisión del
-- vendedor (6,75 % del arrendamiento sin IVA).
create function pg_temp.armar_facturas(p_orden uuid, p_cuotas int, p_politica text, p_descuenta_primera boolean)
returns void language plpgsql as $$
declare
  o ordenes_venta; v_n int := greatest(1, p_cuotas); i int;
  v_tot numeric[]; v_arr numeric[]; v_prod numeric[];
  v_mes date; v_emi date; v_venc date; v_cobro date; v_estado text; v_creada date;
  v_fid uuid; v_pid uuid; v_com numeric; v_neto numeric; v_desc_hecho boolean := false;
  v_admin uuid := pg_temp.perfil('Magaly', false);
  v_metodos text[] := array['Transferencia', 'Cheque', 'Depósito'];
  v_base numeric; v_mcom numeric; v_pct_arr numeric; v_pct_prod numeric; v_ag_estado text; v_ag_fecha date;
  v_mesliq date; v_liq boolean;
begin
  select * into o from ordenes_venta where id = p_orden;
  v_tot := pg_temp.repartir(coalesce(o.monto_total, 0), v_n);
  v_arr := pg_temp.repartir(coalesce(o.monto_arrendamiento, 0), v_n);
  v_prod := pg_temp.repartir(coalesce(o.monto_produccion, 0), v_n);
  v_creada := (o.created_at at time zone 'America/Montevideo')::date;

  for i in 1..v_n loop
    v_mes := (date_trunc('month', coalesce(o.fecha_alta_real, o.fecha_alta_prevista, v_creada)) + (i - 1) * interval '1 month')::date;
    v_emi := greatest(v_mes + 4, v_creada + 5);
    v_estado := 'prevista'; v_venc := null; v_cobro := null;
    if p_politica <> 'prevista' and v_emi <= pg_temp.hoy() then
      v_estado := 'emitida';
      v_venc := v_emi + o.condicion_pago_dias;
      -- Paga entre 2 y 10 días antes de vencer (varía por venta y cuota).
      if p_politica = 'al_dia' and v_venc - (2 + ((o.numero * 3 + i * 5) % 9)) <= pg_temp.hoy() then
        v_estado := 'cobrada';
        v_cobro := v_venc - (2 + ((o.numero * 3 + i * 5) % 9));
      end if;
    end if;

    insert into facturas (orden_id, cuota, cuotas_total, mes_pauta, tipo, estado, numero, fecha_emision,
                          importe_arrendamiento, importe_produccion, importe_total, moneda,
                          fecha_vencimiento, fecha_cobro, metodo_cobro, cotizacion, emitida_por, cobrada_por,
                          created_at, updated_at)
    values (p_orden, i, v_n, v_mes, 'factura', v_estado,
            case when v_estado <> 'prevista' then 'TMP-' || gen_random_uuid() end,
            case when v_estado <> 'prevista' then v_emi end,
            v_arr[i], v_prod[i], v_tot[i], o.moneda,
            v_venc, v_cobro,
            case when v_estado = 'cobrada' then v_metodos[1 + (o.numero + i) % 3] end,
            case when v_estado <> 'prevista' and o.moneda = 'USD' then 40.5 end,
            case when v_estado <> 'prevista' then v_admin end,
            case when v_estado = 'cobrada' then v_admin end,
            o.created_at, o.created_at)
    returning id into v_fid;

    -- Comisión de la agencia: se registra al emitir la factura.
    v_com := 0;
    if v_estado <> 'prevista' and o.agencia_id is not null then
      v_pct_arr := coalesce(o.comision_agencia_pct, 0);
      v_pct_prod := coalesce(o.comision_agencia_prod_pct, 0);
      v_com := round(v_arr[i] * v_pct_arr + v_prod[i] * v_pct_prod) / 100;
      if v_com > 0 then
        v_ag_estado := 'pendiente'; v_ag_fecha := null;
        if v_estado = 'cobrada' then
          if p_descuenta_primera and not v_desc_hecho then
            v_ag_estado := 'descontada'; v_ag_fecha := v_cobro;
          elsif v_cobro + 7 <= pg_temp.hoy() then
            v_ag_estado := 'pagada'; v_ag_fecha := v_cobro + 7;
          end if;
        end if;
        insert into comisiones_agencia (factura_id, orden_id, agencia_id, base_arr, base_prod, pct_arr, pct_prod,
                                        monto, moneda, estado, fecha_pago, created_at, updated_at)
        values (v_fid, p_orden, o.agencia_id, v_arr[i], v_prod[i], v_pct_arr, v_pct_prod,
                v_com, o.moneda, v_ag_estado, v_ag_fecha, v_emi::timestamptz, v_emi::timestamptz);
      end if;
    end if;

    -- Cobro: el pago y la comisión del vendedor.
    if v_estado = 'cobrada' then
      v_neto := v_tot[i];
      if p_descuenta_primera and not v_desc_hecho and v_com > 0 then
        -- La agencia pagó el neto: se descontó su comisión más el IVA de la comisión.
        v_neto := round((v_tot[i] - (round(v_com, 2) + round(round(v_com, 2) * 0.22, 2))) * 100) / 100;
        v_desc_hecho := true;
      end if;
      insert into pagos (orden_id, monto, fecha_pago, metodo, numero_factura, notas, created_at)
      values (p_orden, v_neto, v_cobro, v_metodos[1 + (o.numero + i) % 3],
              (select numero from facturas where id = v_fid),
              case when v_neto <> v_tot[i] then 'La agencia se descontó su comisión + IVA' end,
              v_cobro::timestamptz)
      returning id into v_pid;

      if v_arr[i] > 0 then
        v_mesliq := date_trunc('month', v_cobro)::date;
        v_liq := v_mesliq < date '2026-11-01';   -- lo de meses anteriores ya se liquidó y pagó
        insert into comisiones (pago_id, vendedor_id, orden_id, factura_id, tipo, monto_base, porcentaje,
                                monto_comision, moneda, mes_liquidacion, estado, liquidada,
                                liquidada_at, pagada_at, created_at)
        values (v_pid, o.vendedor_id, p_orden, v_fid, 'venta', v_arr[i], 6.75,
                round(v_arr[i] * 6.75) / 100, o.moneda, v_mesliq,
                case when v_liq then 'pagada' else 'pendiente' end, v_liq,
                case when v_liq then (v_mesliq + interval '1 month' + interval '4 days')::timestamptz end,
                case when v_liq then (v_mesliq + interval '1 month' + interval '7 days')::timestamptz end,
                v_cobro::timestamptz);
      end if;
    end if;
  end loop;
end $$;

-- Una venta completa: cabecera, líneas, historial y plan de facturas.
--   p: clave, vend, cli, agencia (bool), pct_arr, pct_prod, moneda, estado,
--      creada (AAAA-MM-DD), alta, cuotas, cond, marca, campana, politica,
--      desc_primera, rechazo, items [{cat, tipo, n, cant, sem, sal, desc}]
create function pg_temp.crear_venta(p jsonb) returns uuid language plpgsql as $$
declare
  v_moneda text := coalesce(p->>'moneda', 'UYU');
  v_estado text := coalesce(p->>'estado', 'aprobada');
  v_alta date := (p->>'alta')::date;
  v_creada timestamptz := ((p->>'creada') || ' 10:00:00-03')::timestamptz;
  v_lineas jsonb; l jsonb; v_id uuid; v_gerente uuid := pg_temp.perfil('Gonzalo');
  v_vend uuid := pg_temp.k('p:' || (p->>'vend'));
  v_arr numeric := 0; v_prod numeric := 0; v_imp numeric := 0; v_total numeric := 0;
  v_baja date; v_aprob timestamptz; v_ag uuid;
  v_digital boolean := false; v_impreso boolean := false; v_inicio boolean; v_fin boolean;
  v_cuotas int := coalesce((p->>'cuotas')::int, 1); v_cond int := coalesce((p->>'cond')::int, 60);
  v_alta_real date; v_baja_real date;
begin
  -- Las ventas que ocupan lugar se chequean contra la capacidad; las que no
  -- (pendientes y rechazadas) usan los mismos soportes sin chequear.
  v_lineas := pg_temp.armar_items(p->'items', v_alta, v_moneda, v_estado = 'aprobada');
  for l in select * from jsonb_array_elements(v_lineas) loop
    v_arr := v_arr + (l->>'arr')::numeric; v_prod := v_prod + (l->>'prod')::numeric;
    v_imp := v_imp + (l->>'imp')::numeric; v_total := v_total + (l->>'total')::numeric;
    v_digital := v_digital or (l->>'tipo') in ('led', 'circuito');
    v_baja := greatest(coalesce(v_baja, (l->>'baja')::date), (l->>'baja')::date);
  end loop;

  v_aprob := v_creada + interval '1 day 3 hours';
  v_ag := case when coalesce((p->>'agencia')::boolean, false) then pg_temp.k('a:demo') end;
  v_alta_real := case when v_estado = 'aprobada' and v_alta <= pg_temp.hoy() then v_alta end;
  v_baja_real := case when v_estado = 'aprobada' and v_baja < pg_temp.hoy() then v_baja end;

  insert into ordenes_venta (
    cliente_id, agencia_id, vendedor_id, facturar_a, estado, tiene_produccion, tiene_digital,
    es_canje, incluir_reportes, es_mensualizada, monto_total, monto_neto, monto_arrendamiento, monto_produccion,
    moneda, forma_pago_arrend, condicion_pago_dias, comision_agencia_pct, comision_agencia_prod_pct,
    fecha_alta_prevista, fecha_baja_prevista, fecha_alta_real, fecha_baja_real,
    marca, campana, motivo_rechazo, aprobado_por, aprobado_at, created_at, updated_at)
  values (
    pg_temp.k('c:' || (p->>'cli')), v_ag, v_vend,
    case when v_ag is not null then 'agencia' else 'cliente_final' end, v_estado,
    v_prod > 0, v_digital,
    false, true, false, round(v_total, 2), round(v_arr + v_prod + v_imp, 2), round(v_arr, 2), round(v_prod, 2),
    v_moneda, 'Crédito ' || v_cond || ' días', v_cond,
    case when v_ag is not null then coalesce((p->>'pct_arr')::numeric, 15) end,
    case when v_ag is not null then coalesce((p->>'pct_prod')::numeric, 0) end,
    v_alta, v_baja, v_alta_real, v_baja_real,
    p->>'marca', p->>'campana', p->>'rechazo',
    case when v_estado in ('aprobada', 'rechazada') then v_gerente end,
    case when v_estado in ('aprobada', 'rechazada') then v_aprob end,
    v_creada, case when v_estado in ('aprobada', 'rechazada') then v_aprob else v_creada end)
  returning id into v_id;

  -- Líneas, con fechas por ítem y el estado operativo según la fecha.
  for l in select * from jsonb_array_elements(v_lineas) loop
    v_inicio := v_estado = 'aprobada' and (l->>'alta')::date <= pg_temp.hoy();
    v_fin := v_estado = 'aprobada' and (l->>'baja')::date < pg_temp.hoy();
    insert into orden_items (
      orden_id, soporte_id, cantidad, semanas, salidas, precio_unitario, descuento_pct, nota,
      requiere_grabado, requiere_produccion, estado_grabado, estado_produccion,
      fecha_alta_prevista, fecha_baja_prevista, fecha_alta_real, fecha_baja_real, created_at)
    values (
      v_id, (l->>'soporte_id')::uuid, (l->>'cantidad')::int, (l->>'semanas')::int, (l->>'salidas')::int,
      (l->>'precio_unitario')::numeric, (l->>'descuento_pct')::numeric, l->>'nota',
      (l->>'tipo') in ('led', 'circuito'),
      (l->>'tipo') in ('estatico_bus', 'estatico_shopping', 'medianera', 'rutero', 'banner_shopping') and (l->>'prod')::numeric > 0,
      case when (l->>'tipo') in ('led', 'circuito') and v_inicio then 'grabado' else 'pendiente' end,
      case when (l->>'tipo') in ('estatico_bus', 'estatico_shopping', 'medianera', 'rutero', 'banner_shopping')
                and (l->>'prod')::numeric > 0 and v_inicio then 'instalado' else 'pendiente' end,
      (l->>'alta')::date, (l->>'baja')::date,
      case when v_inicio then (l->>'alta')::date end, case when v_fin then (l->>'baja')::date end,
      v_creada);
  end loop;

  insert into orden_historial (orden_id, perfil_id, estado_nuevo, comentario, created_at)
  values (v_id, v_vend, 'pendiente_aprobacion', 'Venta de demostración (seed)', v_creada);
  if v_estado = 'aprobada' then
    insert into orden_historial (orden_id, perfil_id, estado_anterior, estado_nuevo, comentario, created_at)
    values (v_id, v_gerente, 'pendiente_aprobacion', 'aprobada', 'Aprobada', v_aprob);
  elsif v_estado = 'rechazada' then
    insert into orden_historial (orden_id, perfil_id, estado_anterior, estado_nuevo, comentario, created_at)
    values (v_id, v_gerente, 'pendiente_aprobacion', 'rechazada', p->>'rechazo', v_aprob);
  end if;

  insert into _ventas values (p->>'clave', v_id, v_lineas, v_arr, v_prod, v_arr + v_prod + v_imp, v_total,
                              v_moneda, v_alta, v_baja, v_cuotas, v_cond);

  -- El plan de facturas: las rechazadas no facturan.
  if v_estado = 'aprobada' then
    perform pg_temp.armar_facturas(v_id, v_cuotas, coalesce(p->>'politica', 'al_dia'),
                                   coalesce((p->>'desc_primera')::boolean, false));
  elsif v_estado = 'pendiente_aprobacion' then
    perform pg_temp.armar_facturas(v_id, v_cuotas, 'prevista', false);
  end if;
  return v_id;
end $$;

-- Un lead.
--   p: clave, vend, cli, agencia (bool), desc, monto, estado, creada, upd,
--      prox, nota, motivo, campana
create function pg_temp.crear_lead(p jsonb) returns uuid language plpgsql as $$
declare
  v_creada date := (p->>'creada')::date; v_id uuid; v_upd date := coalesce((p->>'upd')::date, (p->>'creada')::date);
begin
  insert into leads (vendedor_id, cliente_id, agencia_id, descripcion, monto_potencial, cuatrimestre, estado,
                     motivo_perdida, notas, campana, proxima_gestion, nota_gestion, created_at, updated_at)
  values (pg_temp.k('p:' || (p->>'vend')), pg_temp.k('c:' || (p->>'cli')),
          case when coalesce((p->>'agencia')::boolean, false) then pg_temp.k('a:demo') end,
          p->>'desc', (p->>'monto')::numeric,
          'Q' || case when extract(month from v_creada) <= 4 then 1 when extract(month from v_creada) <= 8 then 2 else 3 end
              || '-' || extract(year from v_creada)::int,
          p->>'estado', p->>'motivo', p->>'nota', p->>'campana',
          (p->>'prox')::date, p->>'nota',
          (p->>'creada' || ' 09:30:00-03')::timestamptz, (v_upd::text || ' 16:00:00-03')::timestamptz)
  returning id into v_id;
  insert into _d values ('l:' || (p->>'clave'), v_id);
  return v_id;
end $$;

-- Una cotización de un lead: de una venta ya creada (mismas líneas y montos) o
-- de una lista de ítems. Si queda aceptada, el lead queda ganado y apunta a
-- la cotización, y la venta apunta a cotización y lead (como al aceptar en la app).
--   p: clave, lead, estado, creada, upd, nombre, marca, alta, venta | items, cuotas, cond
create function pg_temp.crear_propuesta(p jsonb) returns uuid language plpgsql as $$
declare
  v_lead uuid := pg_temp.k('l:' || (p->>'lead')); ld leads; v_id uuid; l jsonb; i int := 0;
  v_creada timestamptz := ((p->>'creada') || ' 11:00:00-03')::timestamptz;
  v_upd timestamptz := ((coalesce(p->>'upd', p->>'creada')) || ' 11:00:00-03')::timestamptz;
  v_lineas jsonb; v_moneda text := 'UYU'; v_arr numeric := 0; v_prod numeric := 0; v_imp numeric := 0; v_total numeric := 0;
  v_impactos bigint := 0; v_alta date; v_baja date; v_cuotas int := coalesce((p->>'cuotas')::int, 1);
  v_cond int := coalesce((p->>'cond')::int, 60); v_venta _ventas;
begin
  select * into ld from leads where id = v_lead;
  if p ? 'venta' then
    select * into v_venta from _ventas where clave = p->>'venta';
    v_lineas := v_venta.lineas; v_moneda := v_venta.moneda; v_alta := v_venta.alta; v_baja := v_venta.baja;
    v_cuotas := v_venta.cuotas; v_cond := v_venta.cond;
  else
    v_alta := (p->>'alta')::date;
    v_lineas := pg_temp.armar_items(p->'items', v_alta, v_moneda, false);
  end if;
  for l in select * from jsonb_array_elements(v_lineas) loop
    v_arr := v_arr + (l->>'arr')::numeric; v_prod := v_prod + (l->>'prod')::numeric;
    v_imp := v_imp + (l->>'imp')::numeric; v_total := v_total + (l->>'total')::numeric;
    v_impactos := v_impactos + (l->>'impactos')::bigint;
    v_baja := greatest(coalesce(v_baja, (l->>'baja')::date), (l->>'baja')::date);
  end loop;

  insert into propuestas (lead_id, cliente_id, agencia_id, campana, vendedor_id, numero, nombre, marca, estado,
                          fecha_inicio, fecha_fin, moneda, monto_neto, monto_arrendamiento, monto_produccion,
                          monto_total, monto_impactos, cuotas, condicion_pago_dias,
                          comision_agencia_pct, comision_agencia_prod_pct, created_at, updated_at)
  values (v_lead, ld.cliente_id, ld.agencia_id, ld.campana, ld.vendedor_id,
          'COT-' || lpad(nextval('propuestas_numero_seq')::text, 4, '0'),
          p->>'nombre', p->>'marca', p->>'estado', v_alta, v_baja, v_moneda,
          round(v_arr + v_prod + v_imp, 2), round(v_arr, 2), round(v_prod, 2), round(v_total, 2), v_impactos,
          v_cuotas, v_cond,
          case when ld.agencia_id is not null then 15 end, case when ld.agencia_id is not null then 0 end,
          v_creada, v_upd)
  returning id into v_id;

  -- El id lleva la posición en los primeros 8 dígitos hex: así los ítems salen en orden.
  for l in select * from jsonb_array_elements(v_lineas) loop
    i := i + 1;
    insert into propuesta_items (id, propuesta_id, soporte_id, nombre_soporte, ubicacion, categoria_soporte,
                                 tipo_cotizador, cantidad, cantidad_soportes, salidas_elegidas, semanas,
                                 precio_unitario, descuento_pct, subtotal, impactos_calc)
    values ((lpad(to_hex(i - 1), 8, '0') || substr(gen_random_uuid()::text, 9))::uuid, v_id,
            (l->>'soporte_id')::uuid, l->>'nombre', l->>'ubicacion', l->>'categoria', l->>'tipo',
            (l->>'cantidad')::int, (l->>'cantidad')::int, (l->>'salidas')::int, (l->>'semanas')::int,
            (l->>'precio_unitario')::numeric, (l->>'descuento_pct')::numeric,
            (l->>'total')::numeric, (l->>'impactos')::bigint);
  end loop;

  insert into _d values ('q:' || (p->>'clave'), v_id);
  if p->>'estado' = 'aceptada' then
    update leads set estado = 'ganado', propuesta_ganadora_id = v_id, updated_at = v_upd where id = v_lead;
    if p ? 'venta' then
      update ordenes_venta set propuesta_id = v_id, lead_id = v_lead where id = v_venta.id;
    end if;
  end if;
  return v_id;
end $$;

-- ─── 2. Perfiles, agencia y clientes ─────────────────────────────────────────
do $$
declare
  v_ag uuid; v_id uuid; c record;
begin
  insert into _d values
    ('p:Natalia',  pg_temp.perfil('Natalia')),
    ('p:Federico', pg_temp.perfil('Federico')),
    ('p:Fabián',   pg_temp.perfil('Fabián')),
    ('p:Gonzalo',  pg_temp.perfil('Gonzalo'));

  insert into agencias (nombre, email, telefono, rut, ejecutivo_cuenta, porcentaje_comision,
                        porcentaje_comision_produccion, incluye_produccion, condicion_pago_dias, notas, activo)
  values ('[PRUEBA] Demo Agencia', 'demo.agencia@prueba.invalid', '2900 0000', '999000000001', 'Ejecutiva Demo',
          15, 0, false, 60, 'Agencia ficticia del seed de demo (supabase/seed_demo_ceo.sql).', true)
  returning id into v_ag;
  insert into _d values ('a:demo', v_ag);

  -- (clave, rubro, vendedor, tipo, cuelga de la agencia)
  for c in select * from (values
    ('Bebidas',    'Natalia',  'A', false),
    ('Telco',      'Natalia',  'A', true),
    ('Banco',      'Federico', 'A', false),
    ('Retail',     'Fabián',   'B', true),
    ('Automotriz', 'Gonzalo',  'B', false)
  ) as t(rubro, vendedor, tipo, con_agencia)
  loop
    insert into clientes (nombre, empresa, email, telefono, rut, notas, activo, tipo_cliente, vendedor_id, agencia_id)
    values ('[PRUEBA] Demo ' || c.rubro, '[PRUEBA] Demo ' || c.rubro,
            'demo.' || lower(c.rubro) || '@prueba.invalid', '2900 00' || length(c.rubro),
            '9990000001' || length(c.rubro),
            'Cliente ficticio del seed de demo (supabase/seed_demo_ceo.sql).', true, c.tipo,
            pg_temp.k('p:' || c.vendedor), case when c.con_agencia then v_ag end)
    returning id into v_id;
    insert into _d values ('c:' || c.rubro, v_id);
  end loop;
end $$;

-- ─── 3. Ventas del año anterior (sep–nov 2025), todas cobradas ───────────────
-- En orden cronológico: la numeración de las OIC sigue la fecha de carga.
do $$
begin
  perform pg_temp.crear_venta('{"clave":"P1","vend":"Natalia","cli":"Bebidas","creada":"2025-09-09","alta":"2025-09-22","cuotas":2,"cond":60,"marca":"Demo Cola","campana":"Primavera 2025",
    "items":[{"cat":"Digital","tipo":"led","n":0,"sem":6},{"cat":"Shopping","tipo":"banner_shopping","n":0,"cant":2,"sem":4}]}');
  perform pg_temp.crear_venta('{"clave":"P4","vend":"Fabián","cli":"Retail","creada":"2025-09-16","alta":"2025-09-29","cuotas":2,"cond":30,"marca":"Demo Market","campana":"Primavera 2025",
    "items":[{"cat":"Ruta","tipo":"rutero","n":0,"cant":2,"sem":8},{"cat":"Digital","tipo":"led","n":1,"sem":4}]}');
  perform pg_temp.crear_venta('{"clave":"P2","vend":"Natalia","cli":"Telco","agencia":true,"creada":"2025-10-07","alta":"2025-10-20","cuotas":2,"cond":60,"marca":"Demo Móvil","campana":"Black Friday 2025",
    "items":[{"cat":"Digital","tipo":"circuito","n":0,"sem":8},{"cat":"Bus","tipo":"estatico_bus","n":0,"cant":4,"sem":4}]}');
  perform pg_temp.crear_venta('{"clave":"P3","vend":"Federico","cli":"Banco","creada":"2025-10-14","alta":"2025-10-27","cuotas":2,"cond":60,"marca":"Demo Banco","campana":"Ahorro 2025",
    "items":[{"cat":"Exterior","tipo":"medianera","n":0,"cant":1,"sem":8},{"cat":"Shopping","tipo":"estatico_shopping","n":0,"cant":2,"sem":8}]}');
  perform pg_temp.crear_venta('{"clave":"P5","vend":"Fabián","cli":"Retail","creada":"2025-11-06","alta":"2025-11-17","cuotas":1,"cond":60,"marca":"Demo Market","campana":"Black Friday 2025",
    "items":[{"cat":"Bus","tipo":"estatico_bus","n":1,"cant":5,"sem":4},{"cat":"Shopping","tipo":"banner_shopping","n":2,"cant":1,"sem":6}]}');
  perform pg_temp.crear_venta('{"clave":"P6","vend":"Gonzalo","cli":"Automotriz","creada":"2025-11-11","alta":"2025-11-24","cuotas":2,"cond":60,"marca":"Demo Motors","campana":"Verano 2026",
    "items":[{"cat":"Digital","tipo":"led","n":2,"sem":4},{"cat":"Ruta","tipo":"rutero","n":1,"cant":2,"sem":6}]}');
end $$;

-- ─── 4. Ventas de Q3-2026 (sep–nov), en orden cronológico ────────────────────
do $$
begin
  -- S1 Natalia · Bebidas · nace de una cotización aceptada
  perform pg_temp.crear_venta('{"clave":"S1","vend":"Natalia","cli":"Bebidas","creada":"2026-09-04","alta":"2026-09-14","cuotas":2,"cond":60,"marca":"Demo Cola","campana":"Primavera 2026","politica":"al_dia",
    "items":[{"cat":"Digital","tipo":"led","n":0,"sem":8},{"cat":"Shopping","tipo":"banner_shopping","n":0,"cant":2,"sem":6,"desc":5}]}');
  -- S6 Federico · Banco · cotización aceptada; sus cuotas vencidas quedan como deuda
  perform pg_temp.crear_venta('{"clave":"S6","vend":"Federico","cli":"Banco","creada":"2026-09-08","alta":"2026-09-14","cuotas":3,"cond":60,"marca":"Demo Banco","campana":"Ahorro 2026","politica":"nada",
    "items":[{"cat":"Ruta","tipo":"rutero","n":1,"cant":3,"sem":12},{"cat":"Digital","tipo":"circuito","n":1,"sem":8}]}');
  -- S2 Natalia · Telco · por la agencia; la primera cuota la pagó la agencia descontándose la comisión
  perform pg_temp.crear_venta('{"clave":"S2","vend":"Natalia","cli":"Telco","agencia":true,"creada":"2026-09-10","alta":"2026-09-21","cuotas":3,"cond":60,"marca":"Demo Móvil","campana":"Primavera 2026","politica":"al_dia","desc_primera":true,
    "items":[{"cat":"Bus","tipo":"estatico_bus","n":1,"cant":5,"sem":4},{"cat":"Digital","tipo":"circuito","n":2,"sem":6}]}');
  -- S10 Fabián · Retail · cotización aceptada
  perform pg_temp.crear_venta('{"clave":"S10","vend":"Fabián","cli":"Retail","creada":"2026-09-10","alta":"2026-09-21","cuotas":2,"cond":60,"marca":"Demo Market","campana":"Primavera 2026","politica":"al_dia",
    "items":[{"cat":"Digital","tipo":"led","n":1,"sem":6},{"cat":"Shopping","tipo":"estatico_shopping","n":1,"cant":3,"sem":6,"desc":10}]}');
  -- S14 Gonzalo · Automotriz · en dólares, cotización aceptada (2ª versión)
  perform pg_temp.crear_venta('{"clave":"S14","vend":"Gonzalo","cli":"Automotriz","moneda":"USD","creada":"2026-09-16","alta":"2026-09-28","cuotas":4,"cond":60,"marca":"Demo Motors","campana":"Lanzamiento 2026","politica":"al_dia",
    "items":[{"cat":"Exterior","tipo":"medianera","n":1,"cant":1,"sem":12}]}');
  -- S7 Federico · Banco · vencida sin cobrar
  perform pg_temp.crear_venta('{"clave":"S7","vend":"Federico","cli":"Banco","creada":"2026-09-24","alta":"2026-10-05","cuotas":2,"cond":30,"marca":"Demo Banco","campana":"Ahorro 2026","politica":"nada",
    "items":[{"cat":"Bus","tipo":"estatico_bus","n":2,"cant":6,"sem":8,"desc":8},{"cat":"Shopping","tipo":"estatico_shopping","n":2,"cant":2,"sem":8}]}');
  -- S11 Fabián · Retail · vencida sin cobrar
  perform pg_temp.crear_venta('{"clave":"S11","vend":"Fabián","cli":"Retail","creada":"2026-10-01","alta":"2026-10-12","cuotas":3,"cond":30,"marca":"Demo Market","campana":"Primavera 2026","politica":"nada",
    "items":[{"cat":"Ruta","tipo":"rutero","n":2,"cant":2,"sem":10,"desc":10},{"cat":"Digital","tipo":"led","n":2,"sem":6}]}');
  -- S3 Natalia · Bebidas · cotización aceptada (2ª versión)
  perform pg_temp.crear_venta('{"clave":"S3","vend":"Natalia","cli":"Bebidas","creada":"2026-10-05","alta":"2026-10-12","cuotas":4,"cond":30,"marca":"Demo Cola","campana":"Verano 2027","politica":"al_dia",
    "items":[{"cat":"Exterior","tipo":"medianera","n":0,"cant":1,"sem":8},{"cat":"Shopping","tipo":"estatico_shopping","n":3,"cant":2,"sem":8}]}');
  -- S8 Federico · Banco · en dólares, vencida sin cobrar
  perform pg_temp.crear_venta('{"clave":"S8","vend":"Federico","cli":"Banco","moneda":"USD","creada":"2026-10-14","alta":"2026-10-26","cuotas":3,"cond":30,"marca":"Demo Banco","campana":"Ahorro 2026","politica":"nada",
    "items":[{"cat":"Exterior","tipo":"medianera","n":2,"cant":1,"sem":10}]}');
  -- S12 Fabián · Retail · por la agencia (comisión también sobre producción)
  perform pg_temp.crear_venta('{"clave":"S12","vend":"Fabián","cli":"Retail","agencia":true,"pct_prod":15,"creada":"2026-10-20","alta":"2026-11-02","cuotas":2,"cond":60,"marca":"Demo Market","campana":"Black Friday 2026","politica":"al_dia",
    "items":[{"cat":"Digital","tipo":"circuito","n":3,"sem":8},{"cat":"Bus","tipo":"estatico_bus","n":3,"cant":5,"sem":8}]}');
  -- S15 Gonzalo · Automotriz
  perform pg_temp.crear_venta('{"clave":"S15","vend":"Gonzalo","cli":"Automotriz","creada":"2026-10-27","alta":"2026-11-09","cuotas":2,"cond":60,"marca":"Demo Motors","campana":"Black Friday 2026","politica":"al_dia",
    "items":[{"cat":"Digital","tipo":"led","n":0,"sem":6},{"cat":"Ruta","tipo":"rutero","n":3,"cant":2,"sem":6,"desc":8}]}');
  -- S4 Natalia · Telco · por la agencia
  perform pg_temp.crear_venta('{"clave":"S4","vend":"Natalia","cli":"Telco","agencia":true,"creada":"2026-11-03","alta":"2026-11-16","cuotas":2,"cond":60,"marca":"Demo Móvil","campana":"Black Friday 2026","politica":"al_dia",
    "items":[{"cat":"Digital","tipo":"led","n":1,"sem":4},{"cat":"Ruta","tipo":"rutero","n":0,"cant":2,"sem":8}]}');
  -- S13 Fabián · Retail · rechazada
  perform pg_temp.crear_venta('{"clave":"S13","vend":"Fabián","cli":"Retail","estado":"rechazada","creada":"2026-11-06","alta":"2026-11-30","cuotas":1,"cond":60,"marca":"Demo Market","campana":"Verano 2027",
    "rechazo":"Descuento fuera de política: pedía 35 % sobre lista.",
    "items":[{"cat":"Digital","tipo":"led","n":0,"sem":4,"desc":35},{"cat":"Shopping","tipo":"banner_shopping","n":6,"cant":1,"sem":4,"desc":35}]}');
  -- S9 Federico · Banco
  perform pg_temp.crear_venta('{"clave":"S9","vend":"Federico","cli":"Banco","creada":"2026-11-09","alta":"2026-11-23","cuotas":2,"cond":60,"marca":"Demo Banco","campana":"Ahorro 2026","politica":"al_dia",
    "items":[{"cat":"Bus","tipo":"estatico_bus","n":0,"cant":4,"sem":6},{"cat":"Shopping","tipo":"estatico_shopping","n":4,"cant":2,"sem":6}]}');
  -- S5 Natalia · Bebidas · pendiente de aprobación
  perform pg_temp.crear_venta('{"clave":"S5","vend":"Natalia","cli":"Bebidas","estado":"pendiente_aprobacion","creada":"2026-11-17","alta":"2026-12-01","cuotas":2,"cond":60,"marca":"Demo Cola","campana":"Verano 2027",
    "items":[{"cat":"Bus","tipo":"estatico_bus","n":4,"cant":6,"sem":4},{"cat":"Shopping","tipo":"banner_shopping","n":3,"cant":1,"sem":4}]}');
  -- S16 Gonzalo · Automotriz · pendiente de aprobación
  perform pg_temp.crear_venta('{"clave":"S16","vend":"Gonzalo","cli":"Automotriz","estado":"pendiente_aprobacion","creada":"2026-11-18","alta":"2026-12-07","cuotas":2,"cond":60,"marca":"Demo Motors","campana":"Verano 2027",
    "items":[{"cat":"Shopping","tipo":"banner_shopping","n":4,"cant":2,"sem":4},{"cat":"Bus","tipo":"estatico_bus","n":5,"cant":4,"sem":4}]}');
end $$;

-- ─── 5. Leads de Q3-2026 ─────────────────────────────────────────────────────
-- 25 leads: ganado 5, perdido 4, propuesta_enviada 4, negociacion 3,
-- en_conversacion 5, nuevo 4. Los abiertos con `prox` anterior al 19/11 tienen
-- la gestión vencida.
do $$
begin
  -- Natalia
  perform pg_temp.crear_lead('{"clave":"L01","vend":"Natalia","cli":"Bebidas","desc":"Campaña de primavera: pantalla gigante y banners en shoppings","monto":600000,"estado":"ganado","creada":"2026-09-01","campana":"Primavera 2026"}');
  perform pg_temp.crear_lead('{"clave":"L02","vend":"Natalia","cli":"Bebidas","desc":"Campaña de verano 2027: medianera y shoppings","monto":700000,"estado":"ganado","creada":"2026-09-15","campana":"Verano 2027"}');
  perform pg_temp.crear_lead('{"clave":"L03","vend":"Natalia","cli":"Telco","agencia":true,"desc":"Lanzamiento de planes: circuito de shoppings","monto":450000,"estado":"en_conversacion","creada":"2026-09-18","upd":"2026-11-03","prox":"2026-11-10","nota":"Pidió ver disponibilidad en diciembre.","campana":"Verano 2027"}');
  perform pg_temp.crear_lead('{"clave":"L04","vend":"Natalia","cli":"Telco","agencia":true,"desc":"Campaña de fibra: ruteros y pantalla","monto":800000,"estado":"propuesta_enviada","creada":"2026-10-08","upd":"2026-11-16","prox":"2026-11-24","nota":"Cotización enviada a la agencia.","campana":"Fibra 2026"}');
  perform pg_temp.crear_lead('{"clave":"L05","vend":"Natalia","cli":"Bebidas","desc":"Temporada de verano: pantallas en Punta del Este y ruteros","monto":1100000,"estado":"negociacion","creada":"2026-10-12","upd":"2026-11-04","prox":"2026-11-12","nota":"Negocia descuento por volumen.","campana":"Verano 2027"}');
  perform pg_temp.crear_lead('{"clave":"L06","vend":"Natalia","cli":"Bebidas","desc":"Acción de fin de año en shoppings","monto":250000,"estado":"nuevo","creada":"2026-11-12","prox":"2026-11-27"}');
  perform pg_temp.crear_lead('{"clave":"L07","vend":"Natalia","cli":"Telco","agencia":true,"desc":"Campaña institucional en buses","monto":380000,"estado":"perdido","creada":"2026-09-22","upd":"2026-10-20","motivo":"Presupuesto recortado: pasan la campaña al año próximo."}');
  -- Federico
  perform pg_temp.crear_lead('{"clave":"L08","vend":"Federico","cli":"Banco","desc":"Campaña de ahorro: ruteros y circuito de shoppings","monto":900000,"estado":"ganado","creada":"2026-09-01","campana":"Ahorro 2026"}');
  perform pg_temp.crear_lead('{"clave":"L09","vend":"Federico","cli":"Banco","desc":"Tarjetas: buses y shoppings","monto":520000,"estado":"propuesta_enviada","creada":"2026-10-05","upd":"2026-11-02","prox":"2026-11-05","nota":"Esperando respuesta de marketing del banco."}');
  perform pg_temp.crear_lead('{"clave":"L10","vend":"Federico","cli":"Banco","desc":"Créditos de verano: medianera y pantalla","monto":1300000,"estado":"negociacion","creada":"2026-10-15","upd":"2026-11-15","prox":"2026-11-20","nota":"Cierra la semana próxima si le sostenemos el espacio."}');
  perform pg_temp.crear_lead('{"clave":"L11","vend":"Federico","cli":"Banco","desc":"Cajeros y sucursales del interior: ruteros","monto":300000,"estado":"en_conversacion","creada":"2026-10-22","upd":"2026-10-30","prox":"2026-11-02","nota":"Quedamos en mandar propuesta."}');
  perform pg_temp.crear_lead('{"clave":"L12","vend":"Federico","cli":"Banco","desc":"Patrocinio de evento: pantallas","monto":200000,"estado":"nuevo","creada":"2026-11-10","prox":"2026-11-16"}');
  perform pg_temp.crear_lead('{"clave":"L13","vend":"Federico","cli":"Banco","desc":"Campaña de seguros","monto":280000,"estado":"perdido","creada":"2026-09-12","upd":"2026-10-14","motivo":"Eligió otro medio (radio)."}');
  -- Fabián
  perform pg_temp.crear_lead('{"clave":"L14","vend":"Fabián","cli":"Retail","desc":"Primavera: pantalla y shoppings","monto":650000,"estado":"ganado","creada":"2026-09-01","campana":"Primavera 2026"}');
  perform pg_temp.crear_lead('{"clave":"L15","vend":"Fabián","cli":"Retail","desc":"Black Friday: circuito y buses (dos opciones)","monto":850000,"estado":"propuesta_enviada","creada":"2026-10-14","upd":"2026-11-06","prox":"2026-11-14","nota":"Comparan la opción A y la B.","campana":"Black Friday 2026"}');
  perform pg_temp.crear_lead('{"clave":"L16","vend":"Fabián","cli":"Retail","desc":"Navidad: ruteros y banners","monto":720000,"estado":"negociacion","creada":"2026-10-28","upd":"2026-11-14","prox":"2026-11-19","nota":"Pide más semanas sin costo."}');
  perform pg_temp.crear_lead('{"clave":"L17","vend":"Fabián","cli":"Retail","agencia":true,"desc":"Vuelta a clases: shoppings del interior","monto":330000,"estado":"en_conversacion","creada":"2026-11-02","upd":"2026-11-09","prox":"2026-11-17"}');
  perform pg_temp.crear_lead('{"clave":"L18","vend":"Fabián","cli":"Retail","desc":"Apertura de sucursal: medianera","monto":260000,"estado":"nuevo","creada":"2026-11-13","prox":"2026-12-01"}');
  perform pg_temp.crear_lead('{"clave":"L19","vend":"Fabián","cli":"Retail","desc":"Campaña de electro","monto":310000,"estado":"perdido","creada":"2026-09-19","upd":"2026-10-25","motivo":"No había disponibilidad en las fechas que pedía."}');
  -- Gonzalo
  perform pg_temp.crear_lead('{"clave":"L20","vend":"Gonzalo","cli":"Automotriz","desc":"Lanzamiento de modelo 2027: medianera","monto":780000,"estado":"ganado","creada":"2026-09-02","campana":"Lanzamiento 2026"}');
  perform pg_temp.crear_lead('{"clave":"L21","vend":"Gonzalo","cli":"Automotriz","desc":"Cuatro por cuatro: ruteros y pantallas","monto":960000,"estado":"propuesta_enviada","creada":"2026-10-20","upd":"2026-11-10","prox":"2026-11-11","nota":"La gerencia del cliente la está revisando."}');
  perform pg_temp.crear_lead('{"clave":"L22","vend":"Gonzalo","cli":"Automotriz","desc":"Postventa y service: buses","monto":340000,"estado":"en_conversacion","creada":"2026-11-04","upd":"2026-11-12","prox":"2026-11-23"}');
  perform pg_temp.crear_lead('{"clave":"L23","vend":"Gonzalo","cli":"Automotriz","desc":"Test drive en shoppings","monto":210000,"estado":"nuevo","creada":"2026-11-14","prox":"2026-11-25"}');
  perform pg_temp.crear_lead('{"clave":"L24","vend":"Gonzalo","cli":"Automotriz","desc":"Flota corporativa: circuito digital","monto":400000,"estado":"en_conversacion","creada":"2026-10-02","upd":"2026-10-28","prox":"2026-11-09","nota":"Espera presupuesto del año próximo."}');
  perform pg_temp.crear_lead('{"clave":"L25","vend":"Gonzalo","cli":"Automotriz","desc":"Concesionario del interior: ruteros","monto":290000,"estado":"perdido","creada":"2026-09-25","upd":"2026-11-02","motivo":"Contrató un cartel propio."}');
end $$;

-- ─── 6. Cotizaciones (COT-xxxx), en orden cronológico ────────────────────────
-- Las aceptadas copian las líneas de su venta y dejan el lead 'ganado'.
-- Las enviadas con `upd` de hace más de 8 días son las que piden seguimiento.
do $$
begin
  perform pg_temp.crear_propuesta('{"clave":"Q01","lead":"L01","estado":"aceptada","creada":"2026-09-02","upd":"2026-09-04","nombre":"Primavera 2026","marca":"Demo Cola","venta":"S1"}');
  perform pg_temp.crear_propuesta('{"clave":"Q02","lead":"L08","estado":"aceptada","creada":"2026-09-03","upd":"2026-09-08","nombre":"Ahorro 2026","marca":"Demo Banco","venta":"S6"}');
  perform pg_temp.crear_propuesta('{"clave":"Q03","lead":"L14","estado":"aceptada","creada":"2026-09-04","upd":"2026-09-10","nombre":"Primavera 2026","marca":"Demo Market","venta":"S10"}');
  perform pg_temp.crear_propuesta('{"clave":"Q04","lead":"L20","estado":"rechazada","creada":"2026-09-05","upd":"2026-09-12","nombre":"Opción A (2 medianeras)","marca":"Demo Motors","alta":"2026-09-28",
    "items":[{"cat":"Exterior","tipo":"medianera","n":0,"cant":2,"sem":12}]}');
  perform pg_temp.crear_propuesta('{"clave":"Q05","lead":"L20","estado":"aceptada","creada":"2026-09-13","upd":"2026-09-16","nombre":"Opción B (1 medianera)","marca":"Demo Motors","venta":"S14"}');
  perform pg_temp.crear_propuesta('{"clave":"Q06","lead":"L02","estado":"rechazada","creada":"2026-09-17","upd":"2026-09-26","nombre":"Opción A","marca":"Demo Cola","alta":"2026-10-12",
    "items":[{"cat":"Exterior","tipo":"medianera","n":0,"cant":1,"sem":12},{"cat":"Shopping","tipo":"estatico_shopping","n":3,"cant":4,"sem":12}]}');
  perform pg_temp.crear_propuesta('{"clave":"Q07","lead":"L02","estado":"aceptada","creada":"2026-09-28","upd":"2026-10-05","nombre":"Opción B","marca":"Demo Cola","venta":"S3"}');
  perform pg_temp.crear_propuesta('{"clave":"Q08","lead":"L09","estado":"enviada","creada":"2026-10-06","upd":"2026-11-02","nombre":"Tarjetas","marca":"Demo Banco","alta":"2026-12-01","cuotas":2,
    "items":[{"cat":"Bus","tipo":"estatico_bus","n":1,"cant":5,"sem":8},{"cat":"Shopping","tipo":"estatico_shopping","n":5,"cant":2,"sem":8}]}');
  perform pg_temp.crear_propuesta('{"clave":"Q09","lead":"L04","estado":"enviada","creada":"2026-10-09","upd":"2026-11-16","nombre":"Fibra 2026","marca":"Demo Móvil","alta":"2026-12-07","cuotas":2,
    "items":[{"cat":"Ruta","tipo":"rutero","n":4,"cant":2,"sem":8},{"cat":"Digital","tipo":"led","n":2,"sem":6}]}');
  perform pg_temp.crear_propuesta('{"clave":"Q10","lead":"L05","estado":"enviada","creada":"2026-10-14","upd":"2026-11-04","nombre":"Verano 2027","marca":"Demo Cola","alta":"2026-12-14","cuotas":3,
    "items":[{"cat":"Digital","tipo":"led","n":1,"sem":10},{"cat":"Ruta","tipo":"rutero","n":5,"cant":3,"sem":10,"desc":5}]}');
  perform pg_temp.crear_propuesta('{"clave":"Q11","lead":"L10","estado":"enviada","creada":"2026-10-17","upd":"2026-11-15","nombre":"Créditos de verano","marca":"Demo Banco","alta":"2026-12-14","cuotas":3,
    "items":[{"cat":"Exterior","tipo":"medianera","n":1,"cant":1,"sem":10},{"cat":"Digital","tipo":"led","n":0,"sem":8,"desc":10}]}');
  perform pg_temp.crear_propuesta('{"clave":"Q12","lead":"L15","estado":"enviada","creada":"2026-10-16","upd":"2026-10-30","nombre":"Opción A (circuito)","marca":"Demo Market","alta":"2026-11-30","cuotas":2,
    "items":[{"cat":"Digital","tipo":"circuito","n":4,"sem":6},{"cat":"Bus","tipo":"estatico_bus","n":2,"cant":4,"sem":6}]}');
  perform pg_temp.crear_propuesta('{"clave":"Q13","lead":"L15","estado":"enviada","creada":"2026-10-30","upd":"2026-11-06","nombre":"Opción B (circuito + shoppings)","marca":"Demo Market","alta":"2026-11-30","cuotas":2,
    "items":[{"cat":"Digital","tipo":"circuito","n":4,"sem":6,"desc":5},{"cat":"Shopping","tipo":"estatico_shopping","n":6,"cant":3,"sem":6}]}');
  perform pg_temp.crear_propuesta('{"clave":"Q14","lead":"L21","estado":"enviada","creada":"2026-10-22","upd":"2026-11-10","nombre":"Cuatro por cuatro","marca":"Demo Motors","alta":"2026-12-07","cuotas":2,
    "items":[{"cat":"Ruta","tipo":"rutero","n":6,"cant":3,"sem":8},{"cat":"Digital","tipo":"led","n":2,"sem":8}]}');
  perform pg_temp.crear_propuesta('{"clave":"Q15","lead":"L16","estado":"enviada","creada":"2026-10-30","upd":"2026-11-14","nombre":"Navidad","marca":"Demo Market","alta":"2026-12-07","cuotas":2,
    "items":[{"cat":"Ruta","tipo":"rutero","n":7,"cant":2,"sem":6},{"cat":"Shopping","tipo":"banner_shopping","n":5,"cant":2,"sem":6}]}');
  perform pg_temp.crear_propuesta('{"clave":"Q16","lead":"L11","estado":"borrador","creada":"2026-11-12","nombre":"Sucursales del interior","marca":"Demo Banco","alta":"2026-12-14","cuotas":1,
    "items":[{"cat":"Ruta","tipo":"rutero","n":3,"cant":2,"sem":6}]}');
end $$;

-- ─── 7. Bloqueos de soportes en diciembre (aparecen como "reservado") ────────
do $$
declare
  v_r uuid; v_s record; v_vend uuid;
begin
  -- Natalia retiene espacio para su lead de verano (esperando la orden de compra).
  v_vend := pg_temp.k('p:Natalia');
  insert into reservas (cliente_id, vendedor_id, lead_id, propuesta_id, fecha_desde, fecha_hasta, estado, vence_el, motivo, notas)
  values (pg_temp.k('c:Bebidas'), v_vend, pg_temp.k('l:L05'), pg_temp.k('q:Q10'), date '2026-12-14', date '2026-12-31',
          'pendiente', date '2026-11-30', 'Esperando la orden de compra', 'Bloqueo de demo (seed).')
  returning id into v_r;
  select * into v_s from pg_temp.elegir_soporte('Digital', 'led', 1, date '2026-12-14', date '2026-12-31', 1, 30, 1, true);
  insert into reserva_items (reserva_id, soporte_id, cantidad) values (v_r, v_s.soporte_id, 1);
  select * into v_s from pg_temp.elegir_soporte('Ruta', 'rutero', 5, date '2026-12-14', date '2026-12-31', 1, null, 1, true);
  insert into reserva_items (reserva_id, soporte_id, cantidad) values (v_r, v_s.soporte_id, 1);

  -- Federico, bloqueo ya aprobado por el gerente.
  v_vend := pg_temp.k('p:Federico');
  insert into reservas (cliente_id, vendedor_id, lead_id, propuesta_id, fecha_desde, fecha_hasta, estado, aprobada_por,
                        vence_el, motivo, notas)
  values (pg_temp.k('c:Banco'), v_vend, pg_temp.k('l:L10'), pg_temp.k('q:Q11'), date '2026-12-07', date '2026-12-27',
          'aprobada', pg_temp.perfil('Gonzalo'), date '2026-12-01', 'Esperando la firma del contrato', 'Bloqueo de demo (seed).')
  returning id into v_r;
  select * into v_s from pg_temp.elegir_soporte('Shopping', 'estatico_shopping', 7, date '2026-12-07', date '2026-12-27', 2, null, 1, true);
  insert into reserva_items (reserva_id, soporte_id, cantidad) values (v_r, v_s.soporte_id, least(2, greatest(floor(v_s.libre)::int, 1)));
  select * into v_s from pg_temp.elegir_soporte('Bus', 'estatico_bus', 6, date '2026-12-07', date '2026-12-27', 5, null, 1, true);
  insert into reserva_items (reserva_id, soporte_id, cantidad) values (v_r, v_s.soporte_id, least(5, greatest(floor(v_s.libre)::int, 1)));
end $$;

-- ─── 8. Cobranza: gestiones sobre facturas vencidas ──────────────────────────
do $$
declare
  v_admin uuid := pg_temp.perfil('Magaly', false); v_f uuid; v_o uuid;
begin
  select f.id, f.orden_id into v_f, v_o from facturas f join _ventas v on v.id = f.orden_id
   where v.clave = 'S6' and f.cuota = 1;
  insert into gestiones_cobranza (orden_id, factura_id, tipo, nota, proxima_accion, registrado_por, created_at)
  values (v_o, v_f, 'llamada', 'Llamé a administración del banco: dicen que la pagan esta semana.', date '2026-11-24', v_admin, timestamptz '2026-11-17 10:30:00-03');

  select f.id, f.orden_id into v_f, v_o from facturas f join _ventas v on v.id = f.orden_id
   where v.clave = 'S7' and f.cuota = 1;
  update facturas set fecha_pago_prometida = date '2026-11-27' where id = v_f;
  insert into gestiones_cobranza (orden_id, factura_id, tipo, nota, proxima_accion, registrado_por, created_at)
  values (v_o, v_f, 'promesa_pago', 'Prometen el pago para el 27/11.', date '2026-11-27', v_admin, timestamptz '2026-11-12 15:00:00-03');

  select f.id, f.orden_id into v_f, v_o from facturas f join _ventas v on v.id = f.orden_id
   where v.clave = 'S11' and f.cuota = 1;
  insert into gestiones_cobranza (orden_id, factura_id, tipo, nota, proxima_accion, registrado_por, created_at)
  values (v_o, v_f, 'email', 'Reenviada la factura con el recordatorio de vencimiento.', date '2026-11-21', v_admin, timestamptz '2026-11-16 09:15:00-03');
end $$;

-- ─── 9. Números de factura en orden cronológico ──────────────────────────────
-- Las facturas se crearon venta por venta; se renumeran A 4501, A 4502... por
-- fecha de emisión, y los pagos copian el número de su factura.
with orden as (
  select id, numero as viejo, 'A ' || (4500 + row_number() over (order by fecha_emision, orden_id, cuota)) as nuevo
    from facturas where numero is not null
), renumeradas as (
  update facturas f set numero = o.nuevo from orden o where f.id = o.id returning o.viejo, o.nuevo
)
update pagos p set numero_factura = r.nuevo from renumeradas r where p.numero_factura = r.viejo;

-- ─── 10. Controles internos: si algo no cuadra, aborta y no carga nada ───────
do $$
declare v_mal int; v_n int;
begin
  -- Cada venta aprobada o pendiente: las cuotas suman el total de la venta.
  select count(*) into v_mal from ordenes_venta o
   where o.estado in ('aprobada', 'pendiente_aprobacion')
     and abs(coalesce((select sum(importe_total) from facturas f where f.orden_id = o.id), 0) - o.monto_total) > 0.02;
  if v_mal > 0 then raise exception 'Seed demo: % venta(s) con cuotas que no suman su total', v_mal; end if;

  -- Total con impuestos siempre mayor al neto; neto = arrendamiento + producción o más.
  select count(*) into v_mal from ordenes_venta o
   where o.monto_total <= o.monto_neto or o.monto_neto < o.monto_arrendamiento + o.monto_produccion - 0.01;
  if v_mal > 0 then raise exception 'Seed demo: % venta(s) con montos incoherentes', v_mal; end if;

  -- Cada factura cobrada tiene su pago.
  select count(*) into v_mal from facturas f
   where f.estado = 'cobrada'
     and not exists (select 1 from pagos p where p.orden_id = f.orden_id and p.numero_factura = f.numero);
  if v_mal > 0 then raise exception 'Seed demo: % factura(s) cobrada(s) sin pago', v_mal; end if;

  select count(*) into v_n from ordenes_venta o join clientes c on c.id = o.cliente_id where c.nombre ilike '[PRUEBA] Demo %';
  if v_n <> 22 then raise exception 'Seed demo: se esperaban 22 ventas y hay %', v_n; end if;
end $$;

commit;

-- Limpia las funciones temporales de esta sesión.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f from pg_proc p where p.pronamespace = pg_my_temp_schema() loop
    execute 'drop function ' || r.f;
  end loop;
end $$;

-- ─── RESUMEN (lo que quedó cargado) ──────────────────────────────────────────
select 'clientes [PRUEBA] Demo' as tabla, count(*) as filas from clientes where nombre ilike '[PRUEBA] Demo %'
union all select 'agencias [PRUEBA] Demo',  count(*) from agencias where nombre ilike '[PRUEBA] Demo %'
union all select 'ordenes_venta',           count(*) from ordenes_venta
union all select 'orden_items',             count(*) from orden_items
union all select 'facturas',                count(*) from facturas
union all select 'pagos',                   count(*) from pagos
union all select 'comisiones',              count(*) from comisiones
union all select 'comisiones_agencia',      count(*) from comisiones_agencia
union all select 'gestiones_cobranza',      count(*) from gestiones_cobranza
union all select 'leads',                   count(*) from leads
union all select 'propuestas',              count(*) from propuestas
union all select 'propuesta_items',         count(*) from propuesta_items
union all select 'reservas',                count(*) from reservas
union all select 'reserva_items',           count(*) from reserva_items;

-- Ventas por vendedor y por mes de carga (descomentar para ver):
-- select p.nombre as vendedor, to_char(o.created_at, 'YYYY-MM') as mes, o.estado, o.moneda,
--        count(*) as ventas, round(sum(o.monto_neto)) as neto, round(sum(o.monto_total)) as total
--   from ordenes_venta o join perfiles p on p.id = o.vendedor_id
--  group by 1, 2, 3, 4 order by 2, 1, 3;
