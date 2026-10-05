import type { SupabaseClient } from '@supabase/supabase-js'
import { ESTADOS_VENTA_VIVA, ESTADOS_BLOQUEO_VIVO, altaEfectiva, bajaEfectiva } from './asignar-buses'

/**
 * Detecta si una venta compromete más espacio del que hay.
 *
 * Se podía vender dos veces el mismo soporte en las mismas fechas sin que
 * saltara nada: ni al cotizar, ni al crear la orden, ni al aprobarla. Y en la
 * grilla de disponibilidad tampoco se notaba, porque el disponible se recortaba
 * en cero y un espacio vendido dos veces se veía igual que uno bien vendido.
 *
 * Esto no bloquea la venta —a veces se sobrevende a propósito y se resuelve
 * moviendo la instalación—, pero deja que quien aprueba lo sepa.
 */

export interface Sobreventa {
  soporte: string
  cap: number
  comprometido: number
  desde: string
  hasta: string
}

/** ¿Se pisan los dos períodos? Fechas sin hora, comparadas como texto. */
function seSolapan(a1: string | null, a2: string | null, b1: string | null, b2: string | null): boolean {
  if (!a1 || !a2 || !b1 || !b2) return false
  return a1 <= b2 && b1 <= a2
}

export async function detectarSobreventa(
  supabase: SupabaseClient,
  ordenId: string,
): Promise<Sobreventa[]> {
  const SELECT_ITEMS = `id, soporte_id, cantidad, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real,
      soportes(id, nombre, cap)`

  const { data: orden } = await supabase
    .from('ordenes_venta')
    .select(`id, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real, orden_items(${SELECT_ITEMS})`)
    .eq('id', ordenId)
    .maybeSingle()
  if (!orden?.orden_items?.length) return []

  // Todo lo demás que ocupa espacio: las otras ventas vivas y los bloqueos que
  // todavía retienen (los que ya son venta se excluyen por orden_id).
  const [{ data: otras }, { data: bloqueos }] = await Promise.all([
    supabase
      .from('ordenes_venta')
      .select(`id, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real, orden_items(${SELECT_ITEMS})`)
      .in('estado', ESTADOS_VENTA_VIVA as unknown as string[])
      .neq('id', ordenId),
    supabase
      .from('reservas')
      .select('fecha_desde, fecha_hasta, reserva_items(soporte_id, cantidad)')
      .in('estado', ESTADOS_BLOQUEO_VIVO as unknown as string[])
      .is('orden_id', null),
  ])

  const salida: Sobreventa[] = []

  for (const item of orden.orden_items as any[]) {
    const sop = Array.isArray(item.soportes) ? item.soportes[0] : item.soportes
    if (!sop) continue
    const cap = Number(sop.cap ?? 1)
    const desde = altaEfectiva(item, orden)
    const hasta = bajaEfectiva(item, orden)
    if (!desde || !hasta) continue

    let comprometido = Number(item.cantidad ?? 1)

    for (const o of (otras ?? []) as any[]) {
      for (const it of (o.orden_items ?? []) as any[]) {
        if (it.soporte_id !== item.soporte_id) continue
        if (seSolapan(desde, hasta, altaEfectiva(it, o), bajaEfectiva(it, o))) {
          comprometido += Number(it.cantidad ?? 1)
        }
      }
    }

    for (const b of (bloqueos ?? []) as any[]) {
      for (const it of (b.reserva_items ?? []) as any[]) {
        if (it.soporte_id !== item.soporte_id) continue
        if (seSolapan(desde, hasta, b.fecha_desde, b.fecha_hasta)) {
          comprometido += Number(it.cantidad ?? 1)
        }
      }
    }

    if (comprometido > cap) {
      salida.push({ soporte: sop.nombre ?? 'Soporte', cap, comprometido, desde, hasta })
    }
  }

  return salida
}

/** El aviso en texto, listo para mostrar a quien aprueba. */
export function textoSobreventa(s: Sobreventa): string {
  return `${s.soporte}: hay ${s.comprometido} compromisos sobre ${s.cap} lugar${s.cap === 1 ? '' : 'es'} entre el ${s.desde} y el ${s.hasta}.`
}
