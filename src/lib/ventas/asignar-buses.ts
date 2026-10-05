import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Asignación de buses sobre la orden de venta.
 *
 * Antes esto colgaba de la reserva, porque la reserva se creaba con cada venta
 * y hacía de contenedor operativo. Pero la reserva es en realidad un bloqueo
 * opcional y anterior a la venta: el vendedor retiene un espacio mientras
 * espera la orden de compra del cliente. El bus se asigna a lo que se vendió,
 * así que vive en la venta.
 */

/**
 * Estados de una venta que ocupan el espacio de verdad.
 *
 * Hoy la única que ocupa es `aprobada`: la máquina de estados termina ahí
 * (ver lib/ventas/estados.ts). Los otros tres son filas viejas, de cuando
 * pasar a producción, facturar y cobrar eran estados; se siguen contando para
 * no perder historia.
 */
export const ESTADOS_VENTA_VIVA = ['aprobada', 'en_oic', 'facturada', 'cobrada'] as const

/** Estados de un bloqueo que todavía retiene el espacio. */
export const ESTADOS_BLOQUEO_VIVO = ['pendiente', 'aprobada', 'activa'] as const

/**
 * Fecha efectiva de alta: manda la real (si ya se instaló), después la prevista
 * del ítem, y por último la de la orden. Las campañas se atrasan, así que la
 * fecha real es la que vale en toda la planilla.
 */
export function altaEfectiva(item: any, orden: any): string | null {
  return item?.fecha_alta_real ?? item?.fecha_alta_prevista ?? orden?.fecha_alta_real ?? orden?.fecha_alta_prevista ?? null
}

export function bajaEfectiva(item: any, orden: any): string | null {
  return item?.fecha_baja_real ?? item?.fecha_baja_prevista ?? orden?.fecha_baja_real ?? orden?.fecha_baja_prevista ?? null
}

/** ¿Se pisan dos rangos de fechas? */
function seCruzan(desdeA: string | null, hastaA: string | null, desdeB: string | null, hastaB: string | null): boolean {
  if (!desdeA || !hastaA || !desdeB || !hastaB) return false
  return desdeA <= hastaB && hastaA >= desdeB
}

export type ConflictoBus = { itemId: string; busNumero: string; motivo: string }

export type ResultadoAsignacion = {
  asignados: number
  conflictos: ConflictoBus[]
  warnings: string[]
}

/**
 * Asigna el bus de cada línea de la venta y avisa de los cruces de fechas.
 *
 * Un conflicto no bloquea: se reporta para que operaciones lo resuelva a mano,
 * que es como se venía trabajando.
 */
export async function asignarBusesDeOrden(
  supabase: SupabaseClient,
  ordenId: string,
  busOverrides: { itemId: string; busId: string }[] = [],
): Promise<ResultadoAsignacion> {
  const override = new Map(busOverrides.map(o => [o.itemId, o.busId]))

  const { data: orden } = await supabase
    .from('ordenes_venta')
    .select(`
      id, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real,
      orden_items(id, soporte_id, bus_id, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real,
        soportes(bus_id, lado_bus))
    `)
    .eq('id', ordenId)
    .maybeSingle()

  if (!orden?.orden_items?.length) return { asignados: 0, conflictos: [], warnings: [] }

  const items = orden.orden_items as unknown as Array<{
    id: string
    soporte_id: string | null
    bus_id: string | null
    fecha_alta_prevista: string | null
    fecha_alta_real: string | null
    fecha_baja_prevista: string | null
    fecha_baja_real: string | null
    soportes: { bus_id: string | null; lado_bus: string | null } | null
  }>

  const conflictos: ConflictoBus[] = []
  let asignados = 0

  for (const item of items) {
    const busDestino = override.get(item.id) ?? item.soportes?.bus_id ?? null
    if (!busDestino || !item.soporte_id) continue

    const desde = altaEfectiva(item, orden)
    const hasta = bajaEfectiva(item, orden)

    // ¿Otra venta viva usa el mismo soporte en fechas que se pisan?
    const { data: otras } = await supabase
      .from('orden_items')
      .select(`
        id, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real,
        ordenes_venta!inner(id, estado, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real)
      `)
      .eq('soporte_id', item.soporte_id)
      .neq('orden_id', ordenId)
      .in('ordenes_venta.estado', ESTADOS_VENTA_VIVA as unknown as string[])

    const choque = (otras ?? []).find((o: any) => {
      const ord = Array.isArray(o.ordenes_venta) ? o.ordenes_venta[0] : o.ordenes_venta
      return seCruzan(desde, hasta, altaEfectiva(o, ord), bajaEfectiva(o, ord))
    })

    if (choque) {
      const { data: bus } = await supabase.from('buses').select('numero').eq('id', busDestino).maybeSingle()
      conflictos.push({ itemId: item.id, busNumero: bus?.numero ?? busDestino, motivo: 'ya vendido en esas fechas' })
      continue
    }

    await supabase.from('orden_items').update({ bus_id: busDestino }).eq('id', item.id)
    asignados++
  }

  return {
    asignados,
    conflictos,
    warnings: conflictos.map(c => `Bus #${c.busNumero}: ${c.motivo} — asignar manualmente`),
  }
}
