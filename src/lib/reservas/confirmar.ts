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
export async function sincronizarReservaConOrden(
  supabase: SupabaseClient,
  ordenId: string,
  estadoOrden: 'aprobada' | 'en_oic',
  userId: string,
): Promise<{ reservaId: string | null; estado: string | null; warnings: string[] }> {
  const vacio = { reservaId: null, estado: null, warnings: [] as string[] }

  // La columna orden_id puede no existir si v26 no corrió: no debe romper el
  // cambio de estado de la OIC.
  const { data: reserva, error } = await supabase
    .from('reservas')
    .select('id, estado')
    .eq('orden_id', ordenId)
    .maybeSingle()
  if (error || !reserva) return vacio

  const destino = estadoOrden === 'aprobada' ? 'aprobada' : 'confirmada'

  // Sólo avanzar. 'rechazada'/'vencida' se dejan como están: son decisiones
  // explícitas que la venta no debería pisar.
  const avance: Record<string, string[]> = {
    aprobada:   ['pendiente'],
    confirmada: ['pendiente', 'aprobada'],
  }
  if (!avance[destino].includes(reserva.estado)) {
    return { reservaId: reserva.id, estado: reserva.estado, warnings: [] }
  }

  const updates: Record<string, unknown> = { estado: destino, updated_at: new Date().toISOString() }
  if (destino === 'aprobada') updates.aprobada_por = userId

  const { error: updErr } = await supabase.from('reservas').update(updates).eq('id', reserva.id)
  if (updErr) return { reservaId: reserva.id, estado: reserva.estado, warnings: [] }

  // Al confirmar hay que asignar buses, igual que desde la pantalla de reservas.
  const warnings = destino === 'confirmada'
    ? (await asignarBusesYDetectarConflictos(supabase, reserva.id)).warnings
    : []

  return { reservaId: reserva.id, estado: destino, warnings }
}
