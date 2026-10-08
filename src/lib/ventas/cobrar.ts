import type { SupabaseClient } from '@supabase/supabase-js'
import { cerrarSeguimiento } from './cobranza'

/**
 * Lo que se le liquida al vendedor sobre el arrendamiento sin IVA. Es el
 * porcentaje de la planilla de comisiones de Administración, y es el mismo
 * para todos los vendedores.
 */
export const PORCENTAJE_COMISION_VENDEDOR = 6.75

/**
 * Registro del cobro de UNA factura: la marca cobrada, crea el pago y genera
 * la comisión del vendedor sobre el arrendamiento de esa factura.
 *
 * Antes el cobro era de la venta entera. Con cuotas, cada factura se cobra por
 * su lado y cada cobro genera su comisión: es lo que hace la planilla, que
 * liquida comisión por número de factura.
 *
 * El cobro es administrativo y corre en paralelo a la producción: no cambia
 * en qué anda la campaña. Las fechas de cobro de la venta las actualiza un
 * trigger de la base a partir de sus facturas.
 *
 * Idempotente: la comisión es una por factura (índice único en la base), y si
 * ya existe no se vuelve a generar.
 */
export async function registrarCobroDeFactura(
  supabase: SupabaseClient,
  facturaId: string,
  opts: { fecha?: string; metodo?: string; userId: string },
): Promise<{ ok: boolean; error?: string; comisionGenerada: boolean }> {
  const hoy = new Date().toISOString().slice(0, 10)
  const fechaCobro = opts.fecha || hoy

  const { data: factura, error: fErr } = await supabase
    .from('facturas')
    .select('id, orden_id, tipo, estado, numero, importe_total, importe_arrendamiento, moneda')
    .eq('id', facturaId)
    .maybeSingle()
  if (fErr) return { ok: false, error: fErr.message, comisionGenerada: false }
  if (!factura) return { ok: false, error: 'Factura no encontrada', comisionGenerada: false }
  if (factura.estado !== 'emitida') {
    return { ok: false, error: 'Sólo se puede cobrar una factura emitida y todavía no cobrada', comisionGenerada: false }
  }

  const { data: cobradas, error: updErr } = await supabase
    .from('facturas')
    .update({
      estado: 'cobrada',
      fecha_cobro: fechaCobro,
      metodo_cobro: opts.metodo ?? null,
      cobrada_por: opts.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', facturaId)
    .eq('estado', 'emitida') // CAS: un doble clic no cobra dos veces
    .select('id')
  if (updErr) return { ok: false, error: updErr.message, comisionGenerada: false }
  // Si otro pedido la cobró entre la lectura y acá, no se duplica el pago.
  if (!cobradas?.length) return { ok: false, error: 'La factura ya se había cobrado', comisionGenerada: false }

  // Si había una promesa de pago, su tarea de seguimiento ya no hace falta.
  await cerrarSeguimiento(supabase, facturaId)

  const { data: pago } = await supabase
    .from('pagos')
    .insert({
      orden_id: factura.orden_id,
      monto: Number(factura.importe_total),
      fecha_pago: fechaCobro,
      numero_factura: factura.numero ?? null,
      metodo: opts.metodo ?? null,
    })
    .select('id')
    .single()

  // Las notas de crédito no generan comisión por sí solas.
  if (factura.tipo !== 'factura') return { ok: true, comisionGenerada: false }

  const generada = await generarComisionDeFactura(supabase, {
    facturaId,
    ordenId: factura.orden_id,
    arrendamiento: Number(factura.importe_arrendamiento ?? 0),
    moneda: factura.moneda ?? 'UYU',
    fechaCobro,
    pagoId: pago?.id ?? null,
  })
  return { ok: true, comisionGenerada: generada }
}

/** Primer día del mes de una fecha "AAAA-MM-DD": el mes de liquidación. */
export function mesDeLiquidacion(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`
}

/**
 * Reparto de la comisión de una factura entre los vendedores de la venta.
 * Una venta compartida va mitad y mitad; los centavos que sobran del redondeo
 * van al vendedor titular, así las dos mitades suman exacto.
 */
export function repartirComision(
  base: number,
  vendedorId: string,
  compartidoId: string | null,
  pct: number = PORCENTAJE_COMISION_VENDEDOR,
): { vendedor_id: string; monto_base: number; monto_comision: number; compartida_con: string | null }[] {
  const total = Math.round(base * pct) / 100
  if (!compartidoId || compartidoId === vendedorId) {
    return [{ vendedor_id: vendedorId, monto_base: base, monto_comision: total, compartida_con: null }]
  }
  const mitadBase = Math.round(base * 50) / 100
  const mitad = Math.floor(total * 50) / 100
  return [
    { vendedor_id: vendedorId,   monto_base: Math.round((base - mitadBase) * 100) / 100, monto_comision: Math.round((total - mitad) * 100) / 100, compartida_con: compartidoId },
    { vendedor_id: compartidoId, monto_base: mitadBase,                                  monto_comision: mitad,                                  compartida_con: vendedorId },
  ]
}

/**
 * Genera la comisión del cobro de una factura: 6,75% del arrendamiento sin
 * IVA, en el mes del cobro y en la moneda de la factura. Idempotente: si la
 * factura ya tiene comisión, no hace nada.
 */
async function generarComisionDeFactura(
  supabase: SupabaseClient,
  f: { facturaId: string; ordenId: string; arrendamiento: number; moneda: string; fechaCobro: string; pagoId: string | null },
): Promise<boolean> {
  // Con `maybeSingle()` dos filas devuelven error y `data` en null, así que
  // un chequeo anti-duplicados así se rompe justo cuando ya hay duplicado.
  const { data: ya } = await supabase.from('comisiones').select('id').eq('factura_id', f.facturaId).limit(1)
  if (ya?.length) return false

  const { data: orden } = await supabase
    .from('ordenes_venta')
    .select('vendedor_id, vendedor_compartido_id')
    .eq('id', f.ordenId)
    .maybeSingle()
  if (!orden?.vendedor_id) return false

  // Base de la comisión: el arrendamiento sin IVA de esta factura. La
  // producción no comisiona —en la planilla, una venta que es toda producción
  // tiene la comisión en blanco— y el IVA tampoco.
  if (f.arrendamiento <= 0) return false

  // Es la misma tasa para todos: no se lee el porcentaje del perfil, que
  // sólo serviría para que alguien quede liquidado distinto sin saberlo.
  const filas = repartirComision(f.arrendamiento, orden.vendedor_id, orden.vendedor_compartido_id ?? null)
  const { error } = await supabase.from('comisiones').insert(filas.map(r => ({
    ...r,
    tipo:            'venta',
    pago_id:         f.pagoId,
    orden_id:        f.ordenId,
    factura_id:      f.facturaId,
    porcentaje:      PORCENTAJE_COMISION_VENDEDOR,
    moneda:          f.moneda,
    mes_liquidacion: mesDeLiquidacion(f.fechaCobro),
    estado:          'pendiente',
  })))
  return !error
}
