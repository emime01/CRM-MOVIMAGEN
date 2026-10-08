import type { SupabaseClient } from '@supabase/supabase-js'
import { puede, es } from '@/lib/auth/roles'

/**
 * Facturas de una venta.
 *
 * Una venta se factura en una o más cuotas mensuales —la planilla de
 * Administración las anota "1 DE 2", "5 DE 12"—, cada una con su número, su
 * vencimiento y su cobro. Las notas de crédito son facturas en negativo.
 *
 * Cobranzas, comisiones y canon leen de acá. Las fechas de factura y de cobro
 * de la venta las mantiene un trigger de la base (v39) a partir de estas filas.
 */

export type EstadoFactura = 'prevista' | 'emitida' | 'cobrada' | 'anulada'
export type TipoFactura = 'factura' | 'nota_credito'

export interface Factura {
  id: string
  orden_id: string
  cuota: number
  cuotas_total: number
  mes_pauta: string
  tipo: TipoFactura
  estado: EstadoFactura
  numero: string | null
  fecha_emision: string | null
  importe_arrendamiento: number
  importe_produccion: number
  importe_total: number
  moneda: string
  fecha_vencimiento: string | null
  fecha_pago_prometida: string | null
  fecha_cobro: string | null
  metodo_cobro: string | null
  notas: string | null
}

export const CONDICION_PAGO_POR_DEFECTO = 60

/** Primer día del mes de una fecha `YYYY-MM-DD`, corrido `meses` hacia adelante. */
export function primerDiaDelMes(fecha: string, meses = 0): string {
  const [y, m] = fecha.slice(0, 10).split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + meses, 1))
  return d.toISOString().slice(0, 10)
}

/** Vencimiento: la fecha de emisión más la condición de pago, en días. */
export function calcularVencimiento(fechaEmision: string, dias: number): string {
  const [y, m, d] = fechaEmision.slice(0, 10).split('-').map(Number)
  const v = new Date(Date.UTC(y, m - 1, d + dias))
  return v.toISOString().slice(0, 10)
}

/** Reparte un importe en `n` partes de a centésimos; la última absorbe el redondeo. */
function repartir(total: number, n: number): number[] {
  const base = Math.floor((total / n) * 100) / 100
  const partes = Array(n).fill(base) as number[]
  partes[n - 1] = Math.round((total - base * (n - 1)) * 100) / 100
  return partes
}

export interface CuotaPlaneada {
  cuota: number
  cuotas_total: number
  mes_pauta: string
  importe_arrendamiento: number
  importe_produccion: number
  importe_total: number
  moneda: string
}

/**
 * Plan de `cuotas` cuotas mensuales iguales, desde el mes de `desde`. Se
 * reparten por separado arrendamiento, producción y total, para que cada cuota
 * conserve la proporción: la comisión y el canon salen del arrendamiento de
 * cada cuota.
 */
export function planDeCuotas(opts: {
  cuotas: number
  desde: string
  total: number
  arrendamiento: number
  produccion: number
  moneda: string
}): CuotaPlaneada[] {
  const n = Math.max(1, Math.min(60, Math.floor(opts.cuotas || 1)))
  const tot = repartir(opts.total, n)
  const arr = repartir(opts.arrendamiento, n)
  const prod = repartir(opts.produccion, n)
  return Array.from({ length: n }, (_, i) => ({
    cuota: i + 1,
    cuotas_total: n,
    mes_pauta: primerDiaDelMes(opts.desde, i),
    importe_arrendamiento: arr[i],
    importe_produccion: prod[i],
    importe_total: tot[i],
    moneda: opts.moneda,
  }))
}

/**
 * (Re)arma el plan de facturas de una venta en `cuotas` cuotas.
 *
 * Sólo toca las facturas previstas: lo emitido ya es un documento y no se
 * reescribe. Si ya hay algo emitido, no se puede replanificar entero; se
 * edita cuota por cuota.
 */
export async function armarPlanDeFacturas(
  supabase: SupabaseClient,
  ordenId: string,
  cuotas: number,
): Promise<{ ok: true; creadas: number } | { ok: false; error: string }> {
  const { data: orden, error } = await supabase
    .from('ordenes_venta')
    .select('id, monto_total, monto_arrendamiento, monto_neto, monto_produccion, moneda, fecha_alta_prevista, fecha_alta_real, created_at')
    .eq('id', ordenId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!orden) return { ok: false, error: 'Orden no encontrada' }

  const { data: existentes } = await supabase
    .from('facturas')
    .select('id, estado')
    .eq('orden_id', ordenId)
  const yaEmitidas = (existentes ?? []).filter(f => f.estado === 'emitida' || f.estado === 'cobrada')
  if (yaEmitidas.length > 0) {
    return { ok: false, error: 'La venta ya tiene facturas emitidas: el plan se edita cuota por cuota.' }
  }

  const total = Number(orden.monto_total ?? 0)
  const arrendamiento = Number(orden.monto_arrendamiento ?? orden.monto_neto ?? orden.monto_total ?? 0)
  const produccion = Number(orden.monto_produccion ?? 0)
  const desde = orden.fecha_alta_real ?? orden.fecha_alta_prevista ?? String(orden.created_at).slice(0, 10)

  const plan = planDeCuotas({ cuotas, desde, total, arrendamiento, produccion, moneda: orden.moneda ?? 'UYU' })

  if ((existentes ?? []).length > 0) {
    const { error: delErr } = await supabase.from('facturas').delete().eq('orden_id', ordenId).eq('estado', 'prevista')
    if (delErr) return { ok: false, error: delErr.message }
  }

  const { error: insErr } = await supabase
    .from('facturas')
    .insert(plan.map(c => ({ ...c, orden_id: ordenId, tipo: 'factura', estado: 'prevista' })))
  if (insErr) return { ok: false, error: insErr.message }

  return { ok: true, creadas: plan.length }
}

// ── Quién puede qué ─────────────────────────────────────────────────────────


/** Ver las facturas: el vendedor de la venta, y los roles que ven todas. */
export function puedeVerFacturas(rol: string | null | undefined, userId: string, vendedorId: string | null): boolean {
  if (puede(rol, ['asistente_ventas', 'gerente_comercial', 'administracion'])) return true
  return rol === 'vendedor' && vendedorId === userId
}

/**
 * Armar el plan (cuántas cuotas, en qué meses, cuánto cada una) mientras no se
 * emitió: lo pacta el vendedor con el cliente, y lo puede ajustar quien lo
 * acompaña.
 */
export function puedePlanificar(rol: string | null | undefined, userId: string, vendedorId: string | null): boolean {
  return puedeVerFacturas(rol, userId, vendedorId)
}

/** Emitir, cobrar, anular, notas de crédito y promesas de pago: Administración. */
export function puedeAdministrarFacturas(rol: string | null | undefined): boolean {
  return es(rol, 'administracion')
}
