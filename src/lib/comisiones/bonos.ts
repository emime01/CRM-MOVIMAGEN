import type { SupabaseClient } from '@supabase/supabase-js'
import { ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'

/**
 * Bono por objetivo.
 *
 * Cada vendedor puede tener, si se le asigna, un bono que cobra al llegar a
 * su objetivo de ventas del cuatrimestre. El avance se mide igual que en el
 * Dashboard —ventas aprobadas creadas en el cuatrimestre, en pesos— con una
 * diferencia: una venta compartida suma la mitad para cada uno, igual que su
 * comisión.
 */

/** Cuatrimestre "Q2-2026" → sus fechas. Q1 ene–abr, Q2 may–ago, Q3 sep–dic. */
export function rangoCuatrimestre(label: string): { start: string; end: string } | null {
  const m = /^Q([123])-(\d{4})$/.exec(label)
  if (!m) return null
  const y = m[2]
  if (m[1] === '1') return { start: `${y}-01-01`, end: `${y}-04-30` }
  if (m[1] === '2') return { start: `${y}-05-01`, end: `${y}-08-31` }
  return { start: `${y}-09-01`, end: `${y}-12-31` }
}

export function cuatrimestreDe(fecha: Date = new Date()): string {
  const mes = fecha.getMonth() + 1
  return `Q${mes <= 4 ? 1 : mes <= 8 ? 2 : 3}-${fecha.getFullYear()}`
}

/** Los cuatrimestres para elegir: el año pasado, este y el que viene. */
export function cuatrimestresCercanos(hoy: Date = new Date()): string[] {
  const y = hoy.getFullYear()
  return [y - 1, y, y + 1].flatMap(a => [`Q1-${a}`, `Q2-${a}`, `Q3-${a}`])
}

/** Lo vendido en pesos por vendedor en el cuatrimestre. */
export async function vendidoEnCuatrimestre(
  supabase: SupabaseClient,
  label: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const r = rangoCuatrimestre(label)
  if (!r) return out
  const { data } = await supabase
    .from('ordenes_venta')
    .select('vendedor_id, vendedor_compartido_id, monto_total, moneda')
    .in('estado', ESTADOS_VENTA_VIVA as unknown as string[])
    .gte('created_at', r.start)
    .lte('created_at', `${r.end}T23:59:59`)
  for (const o of data ?? []) {
    // Los objetivos están en pesos; lo vendido en dólares no se convierte
    // porque no hay tipo de cambio en el sistema.
    if ((o.moneda ?? 'UYU') !== 'UYU' || !o.vendedor_id) continue
    const monto = Number(o.monto_total ?? 0)
    if (o.vendedor_compartido_id && o.vendedor_compartido_id !== o.vendedor_id) {
      out.set(o.vendedor_id, (out.get(o.vendedor_id) ?? 0) + monto / 2)
      out.set(o.vendedor_compartido_id, (out.get(o.vendedor_compartido_id) ?? 0) + monto / 2)
    } else {
      out.set(o.vendedor_id, (out.get(o.vendedor_id) ?? 0) + monto)
    }
  }
  return out
}
