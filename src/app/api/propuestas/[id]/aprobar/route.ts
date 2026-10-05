import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { aceptarCotizacion } from '@/lib/cotizaciones/aceptar'
import { puede } from '@/lib/auth/roles'

/**
 * POST /api/propuestas/[id]/aprobar
 *
 * El cliente aceptó la propuesta: la marca aceptada y genera la OIC lista para
 * que la apruebe el gerente. No crea ninguna reserva: el bloqueo es un hold
 * opcional y anterior a la venta.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const canMark = puede(session.user.rol, ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'])
  if (!canMark) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const supabase = createServerClient()

  // Ownership: un vendedor solo acepta sus propias cotizaciones. Era el único
  // endpoint del grupo que no lo chequeaba (duplicar, crear-orden, lead y
  // marcar-ganadora sí), y aceptar es irreversible: marca la cotización como
  // aceptada con un CAS que no se puede deshacer y genera la OIC.
  if (session.user.rol === 'vendedor') {
    const { data: propia } = await supabase
      .from('propuestas')
      .select('vendedor_id')
      .eq('id', params.id)
      .maybeSingle()
    if (!propia) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    if (propia.vendedor_id !== session.user.id) {
      return NextResponse.json({ error: 'Sin permisos sobre esta cotización' }, { status: 403 })
    }
  }

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
