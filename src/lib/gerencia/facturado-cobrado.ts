import { esMoneda, type Moneda } from '@/lib/money'

/**
 * Facturado vs cobrado de un mes, por moneda.
 * Facturado = facturas emitidas/cobradas del mes menos notas de crédito (con
 * IVA, tal cual el importe_total). Cobrado = pagos con fecha_pago del mes: el
 * monto real que entró (el descuento de la agencia ya lo reduce).
 */

export interface FacturaMes {
  tipo?: string | null
  estado?: string | null
  fecha_emision?: string | null
  importe_total?: unknown
  moneda?: unknown
  cotizacion?: unknown
}
export interface PagoMes {
  monto?: unknown
  fecha_pago?: string | null
  /** Moneda de la venta a la que pertenece el pago (pagos no tiene moneda). */
  moneda?: unknown
}

export interface FilaFacturadoCobrado {
  moneda: Moneda
  facturado: number
  cobrado: number
  diferencia: number
  /** cobrado ÷ facturado, en %. null si no se facturó nada. */
  pctCobrado: number | null
  /** Facturado de USD pasado a pesos con facturas.cotizacion (sólo USD). */
  facturadoEnPesos?: number
  /** Facturas USD del mes sin cotización cargada (no entran a facturadoEnPesos). */
  sinCotizacion?: number
}

export function facturadoVsCobrado(facturas: readonly FacturaMes[], pagos: readonly PagoMes[], mes: string): FilaFacturadoCobrado[] {
  const fact: Record<Moneda, number> = { UYU: 0, USD: 0 }
  const cob: Record<Moneda, number> = { UYU: 0, USD: 0 }
  let usdEnPesos = 0
  let usdSinCot = 0

  for (const f of facturas) {
    if (f.estado !== 'emitida' && f.estado !== 'cobrada') continue
    if (!f.fecha_emision || f.fecha_emision.slice(0, 7) !== mes) continue
    const m: Moneda = esMoneda(f.moneda) ? f.moneda : 'UYU'
    const imp = Number(f.importe_total ?? 0) || 0
    // La nota de crédito resta aunque venga cargada en positivo.
    const signed = f.tipo === 'nota_credito' ? -Math.abs(imp) : imp
    fact[m] += signed
    if (m === 'USD') {
      const c = Number(f.cotizacion ?? 0)
      if (c > 0) usdEnPesos += signed * c
      else usdSinCot++
    }
  }
  for (const p of pagos) {
    if (!p.fecha_pago || p.fecha_pago.slice(0, 7) !== mes) continue
    const m: Moneda = esMoneda(p.moneda) ? p.moneda : 'UYU'
    cob[m] += Number(p.monto ?? 0) || 0
  }

  const r2 = (n: number) => Math.round(n * 100) / 100
  return (['UYU', 'USD'] as const)
    .filter(m => fact[m] !== 0 || cob[m] !== 0)
    .map(m => ({
      moneda: m,
      facturado: r2(fact[m]),
      cobrado: r2(cob[m]),
      diferencia: r2(fact[m] - cob[m]),
      pctCobrado: fact[m] > 0 ? Math.round((cob[m] / fact[m]) * 100) : null,
      ...(m === 'USD' ? { facturadoEnPesos: r2(usdEnPesos), sinCotizacion: usdSinCot } : {}),
    }))
}
