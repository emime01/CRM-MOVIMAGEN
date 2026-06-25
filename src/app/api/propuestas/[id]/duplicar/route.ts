import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

/**
 * POST /api/propuestas/[id]/duplicar
 *
 * Clona una cotización con todos sus items. La nueva nace en estado
 * 'borrador' con número COT-XXXX nuevo, sin lead asignado (para que el
 * vendedor decida si es alternativa del mismo lead o uno nuevo) y con
 * vendedor_id del usuario que duplica.
 *
 * Útil para: armar opciones A/B del mismo cliente, renovar campañas
 * viejas con leves ajustes, ofrecer la misma propuesta a otro cliente.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['vendedor', 'asistente_ventas', 'gerente_comercial'].includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const supabase = createServerClient()

  const { data: src } = await supabase
    .from('propuestas')
    .select('*, propuesta_items(*)')
    .eq('id', params.id)
    .maybeSingle()
  if (!src) return NextResponse.json({ error: 'Cotización origen no encontrada' }, { status: 404 })

  // Vendedor solo puede duplicar sus propias cotizaciones
  if (session.user.rol === 'vendedor' && src.vendedor_id !== session.user.id) {
    return NextResponse.json({ error: 'Sin permisos sobre esa cotización' }, { status: 403 })
  }

  const { data: seqRow } = await supabase.rpc('nextval', { seq: 'propuestas_numero_seq' }).single()
  const numero = `COT-${String((seqRow as any) ?? Math.floor(Math.random() * 9000) + 1000).padStart(4, '0')}`

  const { data: nueva, error } = await supabase
    .from('propuestas')
    .insert({
      lead_id:        null,
      cliente_id:     src.cliente_id,
      vendedor_id:    session.user.id,
      numero,
      nombre:         src.nombre ? `${src.nombre} (copia)` : null,
      marca:          src.marca,
      observaciones:  src.observaciones,
      estado:         'borrador',
      notas:          src.notas,
      fecha_inicio:   src.fecha_inicio,
      fecha_fin:      src.fecha_fin,
      moneda:         src.moneda,
      monto_neto:     src.monto_neto,
      monto_total:    src.monto_total,
      monto_impactos: src.monto_impactos,
    })
    .select('id, numero')
    .single()
  if (error || !nueva) return NextResponse.json({ error: error?.message ?? 'No se pudo duplicar' }, { status: 500 })

  const items = (src.propuesta_items ?? []) as any[]
  if (items.length > 0) {
    const rows = items.map(it => ({
      propuesta_id:      nueva.id,
      soporte_id:        it.soporte_id,
      nombre_soporte:    it.nombre_soporte,
      ubicacion:         it.ubicacion,
      categoria_soporte: it.categoria_soporte,
      tipo_cotizador:    it.tipo_cotizador,
      cantidad:          it.cantidad,
      cantidad_soportes: it.cantidad_soportes,
      salidas_elegidas:  it.salidas_elegidas,
      semanas:           it.semanas,
      precio_unitario:   it.precio_unitario,
      subtotal:          it.subtotal,
      impactos_calc:     it.impactos_calc,
    }))
    await supabase.from('propuesta_items').insert(rows)
  }

  return NextResponse.json({ ok: true, id: nueva.id, numero: nueva.numero })
}
