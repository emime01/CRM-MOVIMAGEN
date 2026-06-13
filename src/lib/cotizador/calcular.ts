/**
 * Motor de cálculo del planificador 2026 — versión server-side.
 * Réplica exacta de calcItem() en CotizadorClient.tsx: si cambia una fórmula
 * hay que actualizar ambos lados (la web calcula client-side para el preview
 * interactivo; el MCP y cualquier API usan esta).
 */

export const IVA_RATE = 0.22
export const HORAS_MES = 4.33 // semanas por mes para prorratear impactos

export interface SoportePrecio {
  id: string
  nombre: string
  ubicacion: string | null
  categoria: string | null
  tipo_cotizador: string | null
  precio_semanal: number | null
  tiene_iva: boolean
  costo_produccion: number | null
  impuestos_municipales: number | null
  impactos_mensuales: number | null
  semanas_minimas: number | null
}

export interface ItemPlan {
  soporte: SoportePrecio
  semanas: number
  cantidad: number
  salidas: number | null
}

export interface CalcResultado {
  arr: number      // arrendamiento
  ivaArr: number   // IVA sobre arrendamiento (si gravado)
  prod: number     // producción
  ivaProd: number  // IVA sobre producción (siempre)
  mun: number      // impuestos municipales
  imp: number      // impactos totales
  tot: number      // total con impuestos
  mul: number      // multiplicador por salidas
  cpm: number      // costo por mil impactos
  sem: number      // semanas efectivas (clampeadas a semanas_minimas)
}

export const esLed      = (s: SoportePrecio) => s.tipo_cotizador === 'led'
export const esCircuito = (s: SoportePrecio) => s.tipo_cotizador === 'circuito'

export function salidasDefault(s: SoportePrecio): number | null {
  if (esLed(s)) return 30
  if (esCircuito(s)) return 10
  return null
}

export function calcularItem(item: ItemPlan): CalcResultado {
  const s = item.soporte
  const sem = Math.max(item.semanas, s.semanas_minimas || 1)
  const sal = item.salidas
  const cant = item.cantidad
  let mul = 1
  if (esCircuito(s) && sal) mul = sal / 10
  if (esLed(s) && sal) mul = sal / 30
  const arr     = (s.precio_semanal ?? 0) * sem * mul * cant
  const ivaArr  = s.tiene_iva ? arr * IVA_RATE : 0
  const prod    = (s.costo_produccion ?? 0) * cant
  const ivaProd = prod * IVA_RATE
  const mun     = (s.impuestos_municipales ?? 0) * sem * cant
  const imp     = s.impactos_mensuales
    ? Math.round(s.impactos_mensuales * sem / HORAS_MES * cant * mul)
    : 0
  const tot = arr + ivaArr + prod + ivaProd + mun
  const cpm = imp > 0 ? (tot / imp) * 1000 : 0
  return { arr, ivaArr, prod, ivaProd, mun, imp, tot, mul, cpm, sem }
}

export function totales(calcs: CalcResultado[]) {
  return calcs.reduce(
    (acc, c) => ({
      arr: acc.arr + c.arr,
      prod: acc.prod + c.prod,
      mun: acc.mun + c.mun,
      imp: acc.imp + c.imp,
      tot: acc.tot + c.tot,
    }),
    { arr: 0, prod: 0, mun: 0, imp: 0, tot: 0 },
  )
}
