import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'
import { armarRenovacion } from '@/lib/ventas/renovaciones'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ordenes/[id]/renovar
 *
 * Arma la cotización de renovación de la venta (borrador, mismo cliente,
 * agencia y soportes, desde el día siguiente al fin de la campaña) y cierra
 * la tarea "Ofrecer renovación". Devuelve el id de la cotización nueva.
 *
 * Pueden: el vendedor de la venta (o con quien la comparte), la asistente de
 * ventas y el gerente comercial.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const { data: orden } = await supabase
    .from('ordenes_venta')
    .select('id, estado, vendedor_id, vendedor_compartido_id')
    .eq('id', params.id)
    .maybeSingle()
  if (!orden) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })

  const esDueno = orden.vendedor_id === session.user.id || orden.vendedor_compartido_id === session.user.id
  if (!esDueno && !puede(session.user.rol, ['asistente_ventas', 'gerente_comercial'])) {
    return NextResponse.json({ error: 'Sin permisos sobre esta venta' }, { status: 403 })
  }
  if (!(ESTADOS_VENTA_VIVA as readonly string[]).includes(orden.estado)) {
    return NextResponse.json({ error: 'Sólo se renuevan ventas aprobadas' }, { status: 400 })
  }

  const r = await armarRenovacion(supabase, params.id, session.user.id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 500 })
  return NextResponse.json({ ok: true, id: r.propuestaId, numero: r.numero, aviso: r.aviso }, { status: 201 })
}
