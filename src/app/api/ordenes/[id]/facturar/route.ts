import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ordenes/[id]/facturar
 *
 * Registra la factura sin tocar el estado de la venta.
 *
 * Antes facturar era un estado más de la orden, así que marcarla facturada la
 * sacaba de producción: los dos carriles se pisaban y el último que actuaba
 * borraba lo del otro. En la práctica administración factura cuando puede
 * —apenas se aprueba o bastante después— y eso no tiene por qué frenar ni
 * alterar la producción, que sigue su curso en paralelo.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puede(session.user.rol, ['administracion'])) {
    return NextResponse.json({ error: 'Sólo administración puede facturar' }, { status: 403 })
  }

  let body: { fecha?: string; numero?: string; anular?: boolean }
  try { body = await req.json() } catch { body = {} }

  const supabase = createServerClient()
  const { data: orden } = await supabase
    .from('ordenes_venta')
    .select('id, estado')
    .eq('id', params.id)
    .maybeSingle()
  if (!orden) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

  // Se factura una venta aprobada. Antes de la aprobación del gerente no hay
  // nada que facturar.
  const APROBADAS = ESTADOS_VENTA_VIVA as unknown as string[]
  if (!body.anular && !APROBADAS.includes(orden.estado)) {
    return NextResponse.json({ error: 'La venta tiene que estar aprobada para facturarla' }, { status: 400 })
  }

  const updates = body.anular
    ? { fecha_facturacion: null, factura_numero: null }
    : {
        fecha_facturacion: body.fecha || new Date().toISOString().slice(0, 10),
        factura_numero: body.numero || null,
      }

  const { error } = await supabase
    .from('ordenes_venta')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('orden_historial').insert({
    orden_id: params.id,
    perfil_id: session.user.id,
    estado_nuevo: orden.estado,
    comentario: body.anular ? 'Factura anulada' : `Facturada${body.numero ? ` · ${body.numero}` : ''}`,
  })

  return NextResponse.json({ ok: true, ...updates })
}
