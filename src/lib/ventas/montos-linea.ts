/**
 * Montos de una línea de venta cargada a mano, con las mismas reglas que el
 * cotizador (lib/cotizador/calcular):
 *   · arrendamiento = precio semanal × cantidad × semanas, menos el descuento;
 *     lleva IVA sólo si el soporte está gravado (tiene_iva).
 *   · producción = costo de producción por unidad × cantidad; siempre con IVA.
 *   · impuestos municipales / MTOP = por semana × semanas × cantidad; sin IVA.
 *
 * Se usa en el formulario (para mostrar) y en el servidor (para guardar).
 */
export const IVA = 0.22

export interface LineaManual {
  precioUnitario: number
  cantidad: number
  semanas: number
  descuentoPct?: number
  /** Producción por unidad; si no viene, la del catálogo. */
  produccionUnitario?: number | null
}

export interface SoporteMontos {
  tiene_iva?: boolean | null
  costo_produccion?: number | null
  impuestos_municipales?: number | null
}

export interface MontosLinea {
  arr: number
  ivaArr: number
  prod: number
  ivaProd: number
  imp: number
  total: number
}

export function montosDeLinea(l: LineaManual, s: SoporteMontos | null | undefined): MontosLinea {
  const cant = Math.max(0, Number(l.cantidad) || 0)
  const sem = Math.max(0, Number(l.semanas) || 0)
  const arr = (Number(l.precioUnitario) || 0) * cant * sem * (1 - (Number(l.descuentoPct) || 0) / 100)
  const ivaArr = s?.tiene_iva ? arr * IVA : 0
  const prodUnit = l.produccionUnitario != null && Number.isFinite(Number(l.produccionUnitario))
    ? Math.max(0, Number(l.produccionUnitario))
    : Number(s?.costo_produccion ?? 0)
  const prod = prodUnit * cant
  const ivaProd = prod * IVA
  const imp = Number(s?.impuestos_municipales ?? 0) * sem * cant
  return { arr, ivaArr, prod, ivaProd, imp, total: arr + ivaArr + prod + ivaProd + imp }
}

export function sumarMontos(lineas: MontosLinea[]): MontosLinea {
  return lineas.reduce((a, m) => ({
    arr: a.arr + m.arr, ivaArr: a.ivaArr + m.ivaArr, prod: a.prod + m.prod,
    ivaProd: a.ivaProd + m.ivaProd, imp: a.imp + m.imp, total: a.total + m.total,
  }), { arr: 0, ivaArr: 0, prod: 0, ivaProd: 0, imp: 0, total: 0 })
}

export const redondear = (n: number) => Math.round(n * 100) / 100
