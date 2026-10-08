import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { estaCerrada } from '@/lib/ventas/estados'
import { calcularVencimiento, CONDICION_PAGO_POR_DEFECTO } from '@/lib/ventas/facturas'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ordenes/[id]/facturar
 *
 * Atajo de la venta: emite la próxima cuota prevista. La facturación es por
 * cuota (PATCH /api/facturas/[id], accion 'emitir'); esto resuelve el caso
 * común de facturar la que sigue. Facturar no cambia el estado de la venta: la
 * producción sigue su curso.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puede(session.user.rol, ['administracion'])) {
    return NextResponse.json({ error: 'Sólo administración puede facturar' }, { status: 403 })
  }

  let body: { fecha?: string; numero?: string; anular?: boolean }
  try { body = await req.json() } catch { body = {} }

  if (body.anular) {
    return NextResponse.json({ error: 'Las facturas se anulan cuota por cuota, desde la venta' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: orden } = await supabase
    .from('ordenes_venta')
    .select('id, estado, condicion_pago_dias')
    .eq('id', params.id)
    .maybeSingle()
  if (!orden) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
  if (!estaCerrada(orden.estado)) {
    return NextResponse.json({ error: 'La venta tiene que estar aprobada para facturarla' }, { status: 400 })
  }

  const numero = body.numero?.trim()
  if (!numero) return NextResponse.json({ error: 'Indicá el número de factura' }, { status: 400 })

  const { data: proxima } = await supabase
    .from('facturas')
    .select('id')
    .eq('orden_id', params.id)
    .eq('tipo', 'factura')
    .eq('estado', 'prevista')
    .order('cuota')
    .limit(1)
  if (!proxima?.length) return NextResponse.json({ error: 'No quedan cuotas por facturar' }, { status: 400 })

  const fecha = body.fecha || new Date().toISOString().slice(0, 10)
  const vto = calcularVencimiento(fecha, orden.condicion_pago_dias ?? CONDICION_PAGO_POR_DEFECTO)
  const { error } = await supabase
    .from('facturas')
    .update({
      estado: 'emitida', numero, fecha_emision: fecha, fecha_vencimiento: vto,
      emitida_por: session.user.id, updated_at: new Date().toISOString(),
    })
    .eq('id', proxima[0].id)
    .eq('estado', 'prevista')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('orden_historial').insert({
    orden_id: params.id,
    perfil_id: session.user.id,
    estado_nuevo: orden.estado,
    comentario: `Facturada · ${numero}`,
  })

  return NextResponse.json({ ok: true, fecha_facturacion: fecha, factura_numero: numero, fecha_vencimiento: vto })
}
