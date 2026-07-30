import type { SupabaseClient } from '@supabase/supabase-js'
import { crearOrdenDesdePropuesta } from '@/lib/ventas/crear-orden'

/**
 * El cliente aceptó la cotización: cierra la venta en un solo paso.
 *
 * Antes esto sólo creaba la reserva y la OIC había que crearla aparte con otro
 * botón. Eran dos acciones para un mismo hecho, y si alguien olvidaba la
 * segunda la venta quedaba a medias: sin OIC, sin tareas y con el lead sin
 * marcar como ganado. Ahora los tres pasos (aceptar, reservar, generar la OIC)
 * salen juntos.
 *
 * Compartida entre la web (POST /api/propuestas/[id]/aprobar) y el MCP
 * (marcar_cotizacion_aceptada).
 */
export async function aceptarCotizacion(
  supabase: SupabaseClient,
  propuestaId: string,
  userId?: string,
): Promise<{
  ok: boolean
  error?: string
  numero?: string | null
  reservaId?: string | null
  itemsReservados?: number
  ordenId?: string | null
  ordenNumero?: number | null
  /** Si la reserva se creó pero la OIC no, para avisar sin romper el flujo. */
  ordenError?: string
}> {
  const { data: propuesta } = await supabase
    .from('propuestas')
    .select('*, propuesta_items(soporte_id, cantidad_soportes, cantidad)')
    .eq('id', propuestaId)
    .single()

  if (!propuesta) return { ok: false, error: 'Cotización no encontrada' }
  if (propuesta.estado === 'aceptada') return { ok: false, error: 'Ya estaba aceptada' }
  if (!['borrador', 'enviada'].includes(propuesta.estado)) {
    return { ok: false, error: `La cotización está en estado "${propuesta.estado}", no puede pasar a aceptada` }
  }
  if (!propuesta.fecha_inicio || !propuesta.fecha_fin) {
    return { ok: false, error: 'La cotización necesita fecha de inicio y fin para reservar los soportes' }
  }

  // CAS: el WHERE estado != 'aceptada' nos protege de race conditions.
  // Si dos requests entran en paralelo, solo uno aplica el update (rowCount=1);
  // el segundo recibe rowCount=0 y abortamos sin crear reservas duplicadas.
  const { data: actualizadas, error: updErr } = await supabase
    .from('propuestas')
    .update({ estado: 'aceptada', updated_at: new Date().toISOString() })
    .eq('id', propuestaId)
    .neq('estado', 'aceptada')
    .select('id')
  if (updErr) return { ok: false, error: updErr.message }
  if (!actualizadas || actualizadas.length === 0) {
    return { ok: false, error: 'Otra sesión ya marcó esta cotización como aceptada' }
  }

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

      // Procedencia de la reserva. Best-effort: si la migración v26 todavía no
      // corrió, la columna no existe y la venta no debe romperse por esto.
      await supabase.from('reservas').update({ propuesta_id: propuestaId }).eq('id', reservaId)
    }
  }

  // La OIC sale en el mismo movimiento y queda esperando al gerente.
  const orden = await crearOrdenDesdePropuesta(supabase, propuestaId, userId ?? propuesta.vendedor_id)

  return {
    ok: true,
    numero: propuesta.numero ?? null,
    reservaId,
    itemsReservados: itemsConSoporte.length,
    ordenId: orden.ordenId ?? null,
    ordenNumero: orden.numero ?? null,
    // La cotización ya quedó aceptada y los soportes reservados; si la OIC falló
    // se informa para que se pueda reintentar con el botón de respaldo.
    ordenError: orden.ok ? undefined : orden.error,
  }
}
