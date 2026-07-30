import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { aceptarCotizacion } from '@/lib/cotizaciones/aceptar'

/**
 * POST /api/propuestas/[id]/aprobar
 *
 * El cliente aceptó la propuesta: en un solo paso la marca aceptada, bloquea los
 * soportes con una Reserva y genera la OIC lista para que la apruebe el gerente.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const canMark = ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'].includes(session.user.rol)
  if (!canMark) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const supabase = createServerClient()
  const r = await aceptarCotizacion(supabase, params.id, session.user.id)
  if (!r.ok) {
    const status = r.error === 'Cotización no encontrada' ? 404 : 400
    return NextResponse.json({ error: r.error }, { status })
  }

  return NextResponse.json({
    ok: true,
    reserva_id: r.reservaId,
    items_reservados: r.itemsReservados,
    orden_id: r.ordenId,
    orden_numero: r.ordenNumero,
    orden_error: r.ordenError,
  })
}
