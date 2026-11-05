/**
 * Plata, en un solo lugar.
 *
 * Antes cada pantalla formateaba por su cuenta y todas terminaban diciendo
 * dólares: el helper del dashboard tenía `currency = 'USD'` por defecto y
 * ningún llamador pasaba la moneda, y Reportes directamente escribía "USD"
 * abajo del número. Como todo lo que hay cargado está en pesos, el cartel
 * estaba mal el 100% de las veces.
 *
 * El otro problema es sumar. Las ventas pueden ser en UYU o en USD y no hay
 * tipo de cambio en ningún lado del sistema, así que una suma de las dos no
 * significa nada. En vez de inventar una cotización, los totales se llevan
 * separados por moneda y se muestran los dos.
 */

export type Moneda = 'UYU' | 'USD'

export const MONEDA_POR_DEFECTO: Moneda = 'UYU'

export function esMoneda(v: unknown): v is Moneda {
  return v === 'UYU' || v === 'USD'
}

/** Un importe con su moneda. Nunca adivina: si no viene, asume pesos. */
export function formatMoney(amount: number, moneda: string | null | undefined = MONEDA_POR_DEFECTO) {
  const cur = esMoneda(moneda) ? moneda : MONEDA_POR_DEFECTO
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export type TotalPorMoneda = Partial<Record<Moneda, number>>

/** Suma separando por moneda, que es la única suma que significa algo. */
export function sumarPorMoneda(
  items: ReadonlyArray<{ monto_total?: unknown; moneda?: unknown }>,
): TotalPorMoneda {
  const out: TotalPorMoneda = {}
  for (const it of items) {
    const cur = esMoneda(it.moneda) ? it.moneda : MONEDA_POR_DEFECTO
    out[cur] = (out[cur] ?? 0) + Number(it.monto_total ?? 0)
  }
  return out
}

/**
 * Los totales listos para mostrar. Con una sola moneda se ve igual que antes;
 * con dos se ven las dos, separadas por "+", en vez de un número inventado.
 */
export function formatTotales(totales: TotalPorMoneda): string {
  const partes = (['UYU', 'USD'] as const)
    .filter(m => (totales[m] ?? 0) !== 0)
    .map(m => formatMoney(totales[m]!, m))
  return partes.length ? partes.join('  +  ') : formatMoney(0)
}

/**
 * Lo facturado en pesos. Los objetivos se cargan de la planilla en pesos, así
 * que el avance se mide contra esto; lo vendido en dólares se informa aparte
 * en vez de convertirse a una cotización que el sistema no tiene.
 */
export function montoEnPesos(totales: TotalPorMoneda): number {
  return totales.UYU ?? 0
}

/** Si hay ventas en otra moneda que el avance no puede contar. */
export function hayOtraMoneda(totales: TotalPorMoneda): boolean {
  return (totales.USD ?? 0) !== 0
}

/**
 * Lo vendido sin IVA: es contra lo que se miden los objetivos y los bonos
 * (que no contemplan IVA). Neto = arrendamiento + producción + impuestos.
 * Las ventas viejas sin monto_neto se aproximan sacándole el 22% al total.
 */
export function netoSinIva(o: { monto_neto?: unknown; monto_total?: unknown }): number {
  if (o.monto_neto != null && o.monto_neto !== '') return Number(o.monto_neto) || 0
  return (Number(o.monto_total) || 0) / 1.22
}

/** Las mismas filas, con monto_total = neto sin IVA (para sumarPorMoneda). */
export function comoNeto<T extends { monto_neto?: unknown; monto_total?: unknown }>(rows: readonly T[]): (T & { monto_total: number })[] {
  return rows.map(r => ({ ...r, monto_total: netoSinIva(r) }))
}
