import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Marca una cotización como aceptada por el cliente y bloquea los soportes
 * creando una Reserva pendiente con sus items. Compartida entre la web
 * (POST /api/propuestas/[id]/aprobar) y el MCP (marcar_cotizacion_aceptada).
 */
export async function aceptarCotizacion(supabase: SupabaseClient, propuestaId: string): Promise<{
  ok: boolean
  error?: string
  numero?: string | null
  reservaId?: string | null
  itemsReservados?: number
}> {
  const { data: propuesta } = await supabase
    .from('propuestas')
    .select('*, propuesta_items(soporte_id, cantidad_soportes, cantidad)')
    .eq('id', propuestaId)
    .single()

  if (!propuesta) return { ok: false, error: 'Cotización no encontrada' }
  if (propuesta.estado === 'aceptada') return { ok: false, error: 'Ya estaba aceptada' }
  if (!propuesta.fecha_inicio || !propuesta.fecha_fin) {
    return { ok: false, error: 'La cotización necesita fecha de inicio y fin para reservar los soportes' }
  }

  await supabase
    .from('propuestas')
    .update({ estado: 'aceptada', updated_at: new Date().toISOString() })
    .eq('id', propuestaId)

  const itemsConSoporte = (propuesta.propuesta_items ?? []).filter((it: any) => it.soporte_id)
  let reservaId: string | null = null

  if (itemsConSoporte.length > 0) {
    const { data: reserva } = await supabase
      .from('reservas')
      .insert({
        cliente_id:  propuesta.cliente_id,
        vendedor_id: propuesta.vendedor_id,
        lead_id:     propuesta.lead_id,
        fecha_desde: propuesta.fecha_inicio,
        fecha_hasta: propuesta.fecha_fin,
        estado:      'pendiente',
        notas:       `Auto-creada desde cotización ${propuesta.numero ?? ''}`.trim(),
      })
      .select('id')
      .single()

    reservaId = reserva?.id ?? null

    if (reservaId) {
      await supabase.from('reserva_items').insert(
        itemsConSoporte.map((it: any) => ({
          reserva_id: reservaId,
          soporte_id: it.soporte_id,
          cantidad:   it.cantidad_soportes ?? it.cantidad ?? 1,
        })),
      )
    }
  }

  return { ok: true, numero: propuesta.numero ?? null, reservaId, itemsReservados: itemsConSoporte.length }
}
