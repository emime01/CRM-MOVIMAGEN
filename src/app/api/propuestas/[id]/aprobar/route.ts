import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

/**
 * POST /api/propuestas/[id]/aprobar
 *
 * El cliente aceptó la propuesta:
 *   - Marca propuesta.estado = 'aceptada'
 *   - Bloquea los soportes creando una Reserva pendiente con los items que tengan soporte_id
 *
 * La Orden de Venta se crea como paso separado vía POST /api/propuestas/[id]/crear-orden.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const canMark = ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'].includes(session.user.rol)
  if (!canMark) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const supabase = createServerClient()

  const { data: propuesta } = await supabase
    .from('propuestas')
    .select('*, propuesta_items(soporte_id, cantidad_soportes, cantidad)')
    .eq('id', params.id)
    .single()

  if (!propuesta) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (propuesta.estado === 'aceptada') return NextResponse.json({ error: 'Ya estaba aceptada' }, { status: 400 })
  if (!propuesta.fecha_inicio || !propuesta.fecha_fin) {
    return NextResponse.json({ error: 'La propuesta debe tener fecha inicio y fin para reservar' }, { status: 400 })
  }

  // 1. Mark as accepted by client
  await supabase
    .from('propuestas')
    .update({ estado: 'aceptada', updated_at: new Date().toISOString() })
    .eq('id', params.id)

  // 2. Block soportes with a Reserva (pendiente)
  const itemsConSoporte = (propuesta.propuesta_items ?? []).filter((it: any) => it.soporte_id)
  let reservaId: string | null = null

  if (itemsConSoporte.length > 0) {
    const { data: reserva } = await supabase
      .from('reservas')
      .insert({
        cliente_id:   propuesta.cliente_id,
        vendedor_id:  propuesta.vendedor_id,
        lead_id:      propuesta.lead_id,
        fecha_desde:  propuesta.fecha_inicio,
        fecha_hasta:  propuesta.fecha_fin,
        estado:       'pendiente',
        notas:        `Auto-creada desde cotización ${propuesta.numero ?? ''}`.trim(),
      })
      .select('id')
      .single()

    reservaId = reserva?.id ?? null

    if (reservaId) {
      const rows = itemsConSoporte.map((it: any) => ({
        reserva_id: reservaId,
        soporte_id: it.soporte_id,
        cantidad:   it.cantidad_soportes ?? it.cantidad ?? 1,
      }))
      await supabase.from('reserva_items').insert(rows)
    }
  }

  return NextResponse.json({
    ok: true,
    reserva_id: reservaId,
    items_reservados: itemsConSoporte.length,
  })
}
