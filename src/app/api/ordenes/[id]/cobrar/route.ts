import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { registrarCobro } from '@/lib/ventas/cobrar'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ordenes/[id]/cobrar
 *
 * Registra el cobro sin tocar el estado de la venta, y genera el pago y la
 * comisión del vendedor. Igual que facturar, el cobro es un carril aparte: la
 * producción no se detiene ni cambia porque administración haya cobrado.
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
  const { data: orden } = await supabase
    .from('ordenes_venta')
    .select('id, estado, fecha_facturacion')
    .eq('id', params.id)
    .maybeSingle()
  if (!orden) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
  if (!orden.fecha_facturacion) {
    return NextResponse.json({ error: 'Primero hay que facturar la venta' }, { status: 400 })
  }

  const r = await registrarCobro(supabase, params.id, {
    fecha: body.fecha,
    metodo: body.metodo,
    userId: session.user.id,
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })

  // Facturar deja constancia en el historial y cobrar no dejaba ninguna, así
  // que la venta mostraba la factura pero no el cobro. Se anota con el estado
  // que la venta ya tenía: el cobro no la mueve de donde está.
  await supabase.from('orden_historial').insert({
    orden_id: params.id,
    perfil_id: session.user.id,
    estado_nuevo: orden.estado,
    comentario: `Cobrada${body.metodo ? ` · ${body.metodo}` : ''}`,
  })

  return NextResponse.json({ ok: true, comision_generada: r.comisionGenerada })
}
