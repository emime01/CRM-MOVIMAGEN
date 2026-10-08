import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { registrarCobroDeFactura } from '@/lib/ventas/cobrar'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ordenes/[id]/cobrar
 *
 * Atajo de la venta: cobra su factura emitida. El cobro es por factura desde
 * que una venta puede ir en cuotas (PATCH /api/facturas/[id], accion
 * 'cobrar'); esto sólo resuelve el caso común de una sola factura pendiente.
 * Si hay varias, hay que elegir cuál.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puede(session.user.rol, ['administracion'])) {
    return NextResponse.json({ error: 'Sólo administración puede registrar el cobro' }, { status: 403 })
  }

  let body: { fecha?: string; metodo?: string }
  try { body = await req.json() } catch { body = {} }

  const supabase = createServerClient()
  const { data: pendientes, error } = await supabase
    .from('facturas')
    .select('id')
    .eq('orden_id', params.id)
    .eq('tipo', 'factura')
    .eq('estado', 'emitida')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!pendientes?.length) {
    return NextResponse.json({ error: 'No hay ninguna factura emitida pendiente de cobro' }, { status: 400 })
  }
  if (pendientes.length > 1) {
    return NextResponse.json({ error: 'La venta tiene varias facturas pendientes: registrá el cobro en cada cuota' }, { status: 409 })
  }

  const r = await registrarCobroDeFactura(supabase, pendientes[0].id, {
    fecha: body.fecha,
    metodo: body.metodo,
    userId: session.user.id,
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
  return NextResponse.json({ ok: true, comision_generada: r.comisionGenerada })
}
