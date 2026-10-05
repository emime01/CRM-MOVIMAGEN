import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const rol = session.user.rol
  const isAsistente = puede(rol, ['asistente_ventas', 'gerente_comercial', 'administracion'])

  let query = supabase
    .from('reservas')
    .select(`
      id, lead_id, fecha_desde, fecha_hasta, estado, notas, created_at,
      vence_el, motivo, orden_id,
      clientes(nombre, empresa),
      vendedor:perfiles!reservas_vendedor_id_fkey(nombre),
      leads(descripcion),
      reserva_items(id, cantidad, soportes(id, nombre, tipo, seccion))
    `)
    .order('created_at', { ascending: false })

  if (!isAsistente) {
    query = query.eq('vendedor_id', session.user.id)
  } else {
    // Asistente sees pending reservations first
    const { searchParams } = new URL(req.url)
    if (searchParams.get('pendientes') === 'true') {
      query = query.eq('estado', 'pendiente')
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reservas: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: {
    soporteIds: string[]
    clienteId: string
    leadId?: string
    fechaDesde: string
    fechaHasta: string
    notas?: string
    /** Hasta cuándo se retiene el espacio. Lo decide quien pide el bloqueo. */
    venceEl: string
    /** Por qué se bloquea (ej.: esperando la orden de compra). */
    motivo?: string
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (!body.soporteIds?.length || !body.clienteId || !body.fechaDesde || !body.fechaHasta) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }
  // Un bloqueo sin vencimiento retiene el espacio para siempre y nadie se
  // entera: la fecha la decide quien lo pide, pero tiene que estar.
  if (!body.venceEl) {
    return NextResponse.json({ error: 'Indicá hasta cuándo se bloquea el espacio' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Create the reserva (soporte_id null for multi-soporte)
  const { data: reserva, error: reservaError } = await supabase
    .from('reservas')
    .insert({
      soporte_id: body.soporteIds.length === 1 ? body.soporteIds[0] : null,
      cliente_id: body.clienteId,
      vendedor_id: session.user.id,
      lead_id: body.leadId || null,
      fecha_desde: body.fechaDesde,
      fecha_hasta: body.fechaHasta,
      notas: body.notas || null,
      vence_el: body.venceEl,
      motivo: body.motivo || null,
      estado: 'pendiente',
    })
    .select('id')
    .single()

  if (reservaError) return NextResponse.json({ error: reservaError.message }, { status: 500 })

  // Create items for each soporte
  if (body.soporteIds.length > 0) {
    const items = body.soporteIds.map(soporteId => ({
      reserva_id: reserva.id,
      soporte_id: soporteId,
      cantidad: 1,
    }))
    const { error: itemsError } = await supabase.from('reserva_items').insert(items)
    if (itemsError) {
      await supabase.from('reservas').delete().eq('id', reserva.id)
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ id: reserva.id }, { status: 201 })
}
