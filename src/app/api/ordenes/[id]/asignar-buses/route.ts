import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { asignarBusesDeOrden } from '@/lib/ventas/asignar-buses'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ordenes/[id]/asignar-buses
 *
 * Asigna qué bus lleva cada línea de la venta. Reemplaza al viejo
 * PATCH /api/reservas/[id] con estado 'confirmada': el bus pertenece a lo que
 * se vendió, no al bloqueo previo, que es opcional y puede no existir.
 */
const ROLES = ['operaciones', 'administracion', 'gerente_comercial']

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puede(session.user.rol, ROLES)) {
    return NextResponse.json({ error: 'Sin permisos para asignar buses' }, { status: 403 })
  }

  let body: { busOverrides?: { itemId: string; busId: string }[] }
  try { body = await req.json() } catch { body = {} }

  const supabase = createServerClient()
  const { data: orden } = await supabase.from('ordenes_venta').select('id').eq('id', params.id).maybeSingle()
  if (!orden) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

  const r = await asignarBusesDeOrden(supabase, params.id, body.busOverrides ?? [])

  return NextResponse.json({
    ok: true,
    asignados: r.asignados,
    conflicts: r.conflictos,
    warnings: r.warnings.length > 0 ? r.warnings : undefined,
  })
}
