import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/ordenes/[id]/compartida  { vendedor_compartido_id: uuid | null }
 *
 * Marca la venta como compartida con otro vendedor: la comisión de cada
 * factura cobrada se reparte mitad y mitad.
 *
 * Va aparte del PATCH de la venta porque una venta aprobada ya no se edita,
 * y esto no cambia lo vendido sino a quién se le liquida. Se puede cambiar
 * hasta que se genera la primera comisión; después, lo ya liquidado quedaría
 * repartido distinto que lo que falta.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: { vendedor_compartido_id?: string | null }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  const compartidoId = body.vendedor_compartido_id || null

  const supabase = createServerClient()
  const { data: orden } = await supabase
    .from('ordenes_venta')
    .select('id, estado, vendedor_id, vendedor_compartido_id')
    .eq('id', params.id)
    .maybeSingle()
  if (!orden) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })

  const esDueno = orden.vendedor_id === session.user.id
  if (!esDueno && !puede(session.user.rol, ['asistente_ventas', 'gerente_comercial', 'administracion'])) {
    return NextResponse.json({ error: 'Sin permisos sobre esta venta' }, { status: 403 })
  }

  if (compartidoId) {
    if (compartidoId === orden.vendedor_id) {
      return NextResponse.json({ error: 'Elegí a otro vendedor: ése ya es el titular' }, { status: 400 })
    }
    const { data: otro } = await supabase.from('perfiles').select('id, nombre, rol').eq('id', compartidoId).maybeSingle()
    if (!otro || !['vendedor', 'asistente_ventas', 'gerente_comercial'].includes(otro.rol)) {
      return NextResponse.json({ error: 'Ese vendedor no existe' }, { status: 400 })
    }
  }

  const { data: ya } = await supabase
    .from('comisiones').select('id').eq('orden_id', params.id).eq('tipo', 'venta').limit(1)
  if (ya?.length && compartidoId !== (orden.vendedor_compartido_id ?? null)) {
    return NextResponse.json(
      { error: 'Esta venta ya tiene comisiones generadas: el reparto no se cambia a mitad de camino. Pedile a Administración que lo ajuste a mano.' },
      { status: 409 },
    )
  }

  const { error } = await supabase
    .from('ordenes_venta')
    .update({ vendedor_compartido_id: compartidoId, updated_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let nombre: string | null = null
  if (compartidoId) {
    const { data: p } = await supabase.from('perfiles').select('nombre').eq('id', compartidoId).maybeSingle()
    nombre = p?.nombre ?? null
  }
  await supabase.from('orden_historial').insert({
    orden_id: params.id,
    perfil_id: session.user.id,
    estado_nuevo: orden.estado,
    comentario: compartidoId ? `Venta compartida con ${nombre ?? 'otro vendedor'} (mitad y mitad)` : 'Ya no es venta compartida',
  })

  return NextResponse.json({ ok: true })
}
