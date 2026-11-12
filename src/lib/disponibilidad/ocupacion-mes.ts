import type { SupabaseClient } from '@supabase/supabase-js'
import { ESTADOS_BLOQUEO_VIVO, ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'
import { espaciosQueOcupa } from '@/lib/disponibilidad/espacios'

/**
 * Ocupación de soportes sobre un rango de fechas, reutilizable fuera de la
 * pantalla de disponibilidad (por ejemplo, el resumen semanal por mail).
 *
 * Mismas reglas que /api/disponibilidad: ocupan las ventas vivas y los
 * bloqueos vivos sin venta; la fecha efectiva de un ítem es real → prevista
 * → la de la orden; y cuántos espacios ocupa cada ítem lo dice
 * `espaciosQueOcupa`.
 */

export interface SoporteBase { id: string; categoria: string | null; cap: number | null }
/** Una venta o bloqueo sobre un soporte, ya con fechas efectivas. */
export interface Ocupacion { soporte_id: string; espacios: number; alta: string; baja: string }
export interface OcupacionFormato { formato: string; soportes: number; pct: number }

export const SIN_FORMATO = 'Sin categoría'

const diaMs = 86400000
const ms = (f: string) => Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10))

/** Días (inclusive) que el intervalo [alta, baja] se pisa con [desde, hasta]. */
export function diasSolapados(alta: string, baja: string, desde: string, hasta: string): number {
  const ini = Math.max(ms(alta), ms(desde))
  const fin = Math.min(ms(baja), ms(hasta))
  return fin < ini ? 0 : Math.round((fin - ini) / diaMs) + 1
}

/** Cantidad de días del rango, inclusive. */
export function diasDelRango(desde: string, hasta: string): number {
  return Math.max(0, Math.round((ms(hasta) - ms(desde)) / diaMs) + 1)
}

function espacioDiasPorSoporte(ocupaciones: readonly Ocupacion[], desde: string, hasta: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const o of ocupaciones) {
    const d = diasSolapados(o.alta, o.baja, desde, hasta)
    if (d > 0) out.set(o.soporte_id, (out.get(o.soporte_id) ?? 0) + o.espacios * d)
  }
  return out
}

/**
 * % vendido por formato (soportes.categoria) en el rango: espacios-día
 * ocupados sobre espacios-día disponibles (capacidad × días). Un soporte
 * sobrevendido no cuenta por encima de su capacidad.
 */
export function ocupacionPorFormato(
  soportes: readonly SoporteBase[], ocupaciones: readonly Ocupacion[], desde: string, hasta: string,
): OcupacionFormato[] {
  const dias = diasDelRango(desde, hasta)
  const usado = espacioDiasPorSoporte(ocupaciones, desde, hasta)
  const acc = new Map<string, { cap: number; ocupado: number; soportes: number }>()
  for (const s of soportes) {
    const formato = s.categoria?.trim() || SIN_FORMATO
    const cap = Math.max(1, Number(s.cap ?? 1)) * dias
    const a = acc.get(formato) ?? { cap: 0, ocupado: 0, soportes: 0 }
    a.cap += cap
    a.ocupado += Math.min(cap, usado.get(s.id) ?? 0)
    a.soportes++
    acc.set(formato, a)
  }
  return Array.from(acc, ([formato, a]) => ({
    formato, soportes: a.soportes, pct: a.cap > 0 ? Math.round((a.ocupado / a.cap) * 100) : 0,
  })).sort((x, y) => x.formato.localeCompare(y.formato, 'es'))
}

/** Soportes sin ninguna venta ni bloqueo en el rango (el estado "libre" de la pantalla). */
export function soportesLibres(
  soportes: readonly SoporteBase[], ocupaciones: readonly Ocupacion[], desde: string, hasta: string,
): number {
  const usado = espacioDiasPorSoporte(ocupaciones, desde, hasta)
  return soportes.filter(s => (usado.get(s.id) ?? 0) === 0).length
}

const efAlta = (item: any, ord: any): string | null =>
  item.fecha_alta_real ?? item.fecha_alta_prevista ?? ord.fecha_alta_real ?? ord.fecha_alta_prevista ?? null
const efBaja = (item: any, ord: any): string | null =>
  item.fecha_baja_real ?? item.fecha_baja_prevista ?? ord.fecha_baja_real ?? ord.fecha_baja_prevista ?? null

/** Soportes activos y todas sus ocupaciones vivas (ventas y bloqueos). */
export async function cargarOcupaciones(
  supabase: SupabaseClient,
): Promise<{ soportes: SoporteBase[]; ocupaciones: Ocupacion[]; error?: string }> {
  const [sop, res, ord] = await Promise.all([
    supabase.from('soportes').select('id, categoria, cap, tipo_cotizador').eq('activo', true),
    supabase.from('reservas')
      .select('fecha_desde, fecha_hasta, reserva_items(soporte_id, cantidad, fecha_alta_real, fecha_baja_real)')
      .in('estado', ESTADOS_BLOQUEO_VIVO as unknown as string[]).is('orden_id', null),
    supabase.from('ordenes_venta')
      .select('fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real, orden_items(soporte_id, cantidad, salidas, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real)')
      .in('estado', ESTADOS_VENTA_VIVA as unknown as string[]),
  ])
  // Si falla una consulta no se devuelve nada: con el mapa vacío todo se vería libre.
  const err = sop.error ?? res.error ?? ord.error
  if (err) return { soportes: [], ocupaciones: [], error: err.message }

  const tipoDe = new Map<string, string | null>((sop.data ?? []).map((s: any) => [s.id, s.tipo_cotizador ?? null]))
  const ocupaciones: Ocupacion[] = []
  const agregar = (it: any, alta: string | null, baja: string | null) => {
    if (it.soporte_id && alta && baja) {
      ocupaciones.push({
        soporte_id: it.soporte_id, espacios: espaciosQueOcupa(tipoDe.get(it.soporte_id), it),
        alta: String(alta).slice(0, 10), baja: String(baja).slice(0, 10),
      })
    }
  }
  for (const r of (res.data ?? []) as any[]) {
    for (const it of r.reserva_items ?? []) agregar(it, it.fecha_alta_real ?? r.fecha_desde, it.fecha_baja_real ?? r.fecha_hasta)
  }
  for (const o of (ord.data ?? []) as any[]) {
    for (const it of o.orden_items ?? []) agregar(it, efAlta(it, o), efBaja(it, o))
  }
  const soportes = (sop.data ?? []).map((s: any) => ({ id: s.id, categoria: s.categoria ?? null, cap: s.cap ?? null }))
  return { soportes, ocupaciones }
}
