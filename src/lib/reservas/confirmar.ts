import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Confirmación de una reserva: asigna el bus de cada ítem y detecta
 * solapamientos de fechas con otras reservas del mismo soporte.
 *
 * Vive acá porque se dispara desde dos lados: la pantalla de reservas y el paso
 * de la OIC a producción (que confirma la reserva en el mismo movimiento). Si
 * estuviera duplicado, uno de los dos caminos podría quedar sin la validación
 * de solapamientos.
 */

export type ConflictoBus = { itemId: string; busNumero: string }

export type ResultadoConfirmar = {
  /** Mensajes para mostrar al usuario; no bloquean la confirmación. */
  warnings: string[]
  conflictos: ConflictoBus[]
}

/**
 * Asigna buses y devuelve los conflictos encontrados.
 *
 * No cambia `estado`: eso lo hace quien la llama, porque el paso de estado tiene
 * reglas de permisos distintas en cada camino.
 *
 * Un conflicto no impide confirmar — se reporta para que operaciones asigne el
 * bus a mano, que es como se venía trabajando.
 */
export async function asignarBusesYDetectarConflictos(
  supabase: SupabaseClient,
  reservaId: string,
  busOverrides: { itemId: string; busId: string }[] = [],
): Promise<ResultadoConfirmar> {
  const overrideMap = new Map(busOverrides.map(o => [o.itemId, o.busId]))

  const { data: reserva } = await supabase
    .from('reservas')
    .select('fecha_desde, fecha_hasta, reserva_items(id, soporte_id, soportes(bus_id, lado_bus))')
    .eq('id', reservaId)
    .single()

  if (!reserva?.reserva_items?.length) return { warnings: [], conflictos: [] }

  const conflictos: ConflictoBus[] = []

  for (const item of reserva.reserva_items as unknown as Array<{
    id: string
    soporte_id: string
    soportes: { bus_id: string | null; lado_bus: string | null } | null
  }>) {
    const targetBusId = overrideMap.get(item.id) ?? item.soportes?.bus_id ?? null
    if (!targetBusId) continue

    // ¿El soporte ya está tomado por otra reserva viva en fechas que se cruzan?
    const { data: conflictItems } = await supabase
      .from('reserva_items')
      .select('id, reservas!inner(id, fecha_desde, fecha_hasta, estado)')
      .eq('soporte_id', item.soporte_id)
      .neq('reservas.id', reservaId)
      .in('reservas.estado', ['confirmada', 'aprobada'])
      .lte('reservas.fecha_desde', reserva.fecha_hasta)
      .gte('reservas.fecha_hasta', reserva.fecha_desde)

    if (conflictItems && conflictItems.length > 0) {
      const { data: bus } = await supabase.from('buses').select('numero').eq('id', targetBusId).single()
      conflictos.push({ itemId: item.id, busNumero: bus?.numero ?? targetBusId })
      continue
    }

    await supabase.from('reserva_items').update({ bus_id: targetBusId }).eq('id', item.id)
  }

  return {
    conflictos,
    warnings: conflictos.map(c => `Bus #${c.busNumero} tiene conflicto de fechas — asignar manualmente`),
  }
}

/**
 * Arrastra el estado de la reserva asociada a una OIC.
 *
 * Aprobar la venta y ponerla en producción son hechos únicos: no tiene sentido
 * que además haya que aprobar y confirmar la reserva a mano en otra pantalla.
 * Sólo avanza (pendiente → aprobada → confirmada); nunca retrocede ni toca
 * reservas rechazadas o vencidas.
 */
export async function cerrarBloqueoDeVenta(
  supabase: SupabaseClient,
  ordenId: string,
  userId: string,
): Promise<{ reservaId: string | null; estado: string | null }> {
  const vacio = { reservaId: null, estado: null }

  // El bloqueo es opcional: la mayoría de las ventas no tienen uno. Tampoco
  // debe romper la aprobación si la columna orden_id no existe (v26 sin correr).
  const { data: reserva, error } = await supabase
    .from('reservas')
    .select('id, estado')
    .eq('orden_id', ordenId)
    .maybeSingle()
  if (error || !reserva) return vacio

  // Aprobada la venta, el bloqueo cumplió: el espacio ya está vendido y pasa a
  // ocuparlo la venta. Antes esto iba en dos pasos —aprobar lo dejaba
  // "aprobado" y recién pasarlo a producción lo confirmaba—, y si el segundo
  // paso no se daba el espacio quedaba contado dos veces.
  //
  // 'rechazada' y 'vencida' se dejan como están: son decisiones explícitas que
  // la venta no debería pisar.
  if (!['pendiente', 'aprobada'].includes(reserva.estado)) {
    return { reservaId: reserva.id, estado: reserva.estado }
  }

  const { error: updErr } = await supabase
    .from('reservas')
    .update({ estado: 'confirmada', aprobada_por: userId, updated_at: new Date().toISOString() })
    .eq('id', reserva.id)
  if (updErr) return { reservaId: reserva.id, estado: reserva.estado }

  return { reservaId: reserva.id, estado: 'confirmada' }
}
