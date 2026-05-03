import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

// GET /api/propuestas/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()

  const { data: propuesta, error } = await supabase
    .from('propuestas')
    .select(`
      id, numero, nombre, estado, moneda, monto_neto, monto_total,
      fecha_inicio, fecha_fin, notas, iva_pct, imp_municipal_pct,
      lead_id, cliente_id, vendedor_id, created_at, updated_at,
      clientes(id, nombre, empresa),
      leads(id, descripcion),
      perfiles(id, nombre)
    `)
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  const isOwner = propuesta.vendedor_id === session.user.id
  const canSeeAll = ['gerente_comercial', 'administracion', 'asistente_ventas'].includes(session.user.rol)
  if (!isOwner && !canSeeAll) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { data: items } = await supabase
    .from('propuesta_items')
    .select('*')
    .eq('propuesta_id', params.id)
    .order('id')

  return NextResponse.json({ propuesta, items: items ?? [] })
}

// PATCH /api/propuestas/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const body = await req.json()

  // Check ownership
  const { data: existing } = await supabase
    .from('propuestas')
    .select('vendedor_id, estado')
    .eq('id', params.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const canEdit = existing.vendedor_id === session.user.id ||
    ['gerente_comercial', 'administracion', 'asistente_ventas'].includes(session.user.rol)
  if (!canEdit) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  // Update propuesta header
  const { error: updateErr } = await supabase
    .from('propuestas')
    .update({
      nombre:             body.nombre,
      cliente_id:         body.cliente_id ?? null,
      lead_id:            body.lead_id ?? null,
      fecha_inicio:       body.fecha_inicio ?? null,
      fecha_fin:          body.fecha_fin ?? null,
      estado:             body.estado ?? existing.estado,
      notas:              body.notas ?? null,
      moneda:             body.moneda ?? 'UYU',
      iva_pct:            body.iva_pct ?? 22,
      imp_municipal_pct:  body.imp_municipal_pct ?? 8,
      monto_neto:         body.monto_neto ?? null,
      monto_total:        body.monto_total ?? null,
      updated_at:         new Date().toISOString(),
    })
    .eq('id', params.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Replace items if provided
  if (Array.isArray(body.items)) {
    await supabase.from('propuesta_items').delete().eq('propuesta_id', params.id)
    if (body.items.length > 0) {
      const rows = body.items.map((it: any) => ({
        propuesta_id:   params.id,
        soporte_id:     it.soporte_id ?? null,
        nombre_soporte: it.nombre_soporte,
        ubicacion:      it.ubicacion ?? null,
        cantidad:       it.cantidad ?? 1,
        semanas:        it.semanas ?? 1,
        precio_unitario: it.precio_unitario,
        produccion:     it.produccion ?? 0,
        tiene_iva:      it.tiene_iva ?? false,
        tiene_imp_mun:  it.tiene_imp_mun ?? false,
        impactos:       it.impactos ?? 0,
        es_digital:     it.es_digital ?? false,
        subtotal:       it.subtotal ?? null,
      }))
      await supabase.from('propuesta_items').insert(rows)
    }
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/propuestas/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const { data: existing } = await supabase
    .from('propuestas')
    .select('vendedor_id')
    .eq('id', params.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const canDelete = existing.vendedor_id === session.user.id ||
    ['gerente_comercial', 'administracion'].includes(session.user.rol)
  if (!canDelete) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  await supabase.from('propuesta_items').delete().eq('propuesta_id', params.id)
  await supabase.from('propuestas').delete().eq('id', params.id)

  return NextResponse.json({ ok: true })
}
