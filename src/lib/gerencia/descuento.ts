import { nombreFormato } from './ocupacion'

/**
 * Precio real vs lista, por formato. Para cada item vendido:
 *   lista = soporte.precio_semanal × cantidad × semanas
 *   real  = precio_unitario × (1 − descuento_pct/100) × cantidad × semanas
 * El descuento promedio del formato es 1 − Σreal / Σlista (ponderado por
 * importe de lista). Items sin precio o sin precio de lista se ignoran.
 * Puede dar negativo si se vendió por encima de la lista.
 */

export interface ItemVendido {
  soporte_id: string
  cantidad?: unknown
  semanas?: unknown
  precio_unitario?: unknown
  descuento_pct?: unknown
}
export interface SoporteLista { id: string; categoria?: string | null; precio_semanal?: unknown }

export interface DescuentoFormato {
  formato: string
  items: number
  lista: number
  real: number
  /** % de descuento promedio sobre lista (redondeado a 1 decimal); null si no hay datos. */
  descuentoPct: number | null
}

export function descuentoPorFormato(items: readonly ItemVendido[], soportes: readonly SoporteLista[]): DescuentoFormato[] {
  const porId = new Map(soportes.map(s => [s.id, s]))
  const acc = new Map<string, DescuentoFormato>()
  for (const it of items) {
    const s = porId.get(it.soporte_id)
    if (!s) continue
    const precio = Number(it.precio_unitario)
    const lista = Number(s.precio_semanal)
    if (!(it.precio_unitario != null && it.precio_unitario !== '' && Number.isFinite(precio) && precio >= 0)) continue
    if (!(lista > 0)) continue
    const mult = (Number(it.cantidad ?? 1) || 1) * (Number(it.semanas ?? 1) || 1)
    const desc = Math.min(100, Math.max(0, Number(it.descuento_pct ?? 0) || 0))
    const formato = nombreFormato(s.categoria)
    const f = acc.get(formato) ?? { formato, items: 0, lista: 0, real: 0, descuentoPct: null }
    f.items++
    f.lista += lista * mult
    f.real += precio * (1 - desc / 100) * mult
    acc.set(formato, f)
  }
  return Array.from(acc.values())
    .map(f => ({ ...f, descuentoPct: f.lista > 0 ? Math.round((1 - f.real / f.lista) * 1000) / 10 : null }))
    .sort((a, b) => a.formato.localeCompare(b.formato))
}
