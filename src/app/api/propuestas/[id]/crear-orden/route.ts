import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

/**
 * POST /api/propuestas/[id]/crear-orden
 *
 * A partir de una cotización ya aceptada por el cliente, crea la Orden de Venta
 * con todos los datos pre-cargados (lead, cliente, items, fechas, precios) en
 * estado 'borrador'. El vendedor luego la manda a aprobar.
 *
 * Marca el lead asociado como 'ganado' (la venta es real ahora).
 *
 * Cada orden_item arranca con las fechas previstas iguales a las de la cotización;
 * vendedor/operaciones pueden ajustarlas por ítem después.
 */

// Mapeo de tipo_cotizador → flags requiere_grabado / requiere_produccion
function flagsPorTipo(tipo: string | null): { requiere_grabado: boolean; requiere_produccion: boolean } {
  if (!tipo) return { requiere_grabado: false, requiere_produccion: false }
  const digital = ['led', 'banner_shopping', 'circuito'].includes(tipo)
  const impreso = ['estatico_bus', 'estatico_shopping', 'medianera'].includes(tipo)
  return { requiere_grabado: digital, requiere_produccion: impreso }
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const canCreate = ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'].includes(session.user.rol)
  if (!canCreate) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const supabase = createServerClient()

  const { data: propuesta } = await supabase
    .from('propuestas')
    .select('*, propuesta_items(*)')
    .eq('id', params.id)
    .single()

  if (!propuesta) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
  if (propuesta.estado !== 'aceptada') {
    return NextResponse.json({ error: 'La cotización debe estar aceptada por el cliente primero' }, { status: 400 })
  }

  // Evitar duplicar OIC si ya existe una desde esta cotización
  const { data: existing } = await supabase
    .from('ordenes_venta')
    .select('id')
    .eq('propuesta_id', params.id)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'Ya hay una orden creada desde esta cotización', orden_id: existing.id }, { status: 409 })
  }

  // Siguiente número de orden
  const { data: ordenSeq } = await supabase
    .from('ordenes_venta')
    .select('numero')
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle()
  const siguienteNumero = ((ordenSeq?.numero ?? 0) as number) + 1

  const { data: orden, error: ordenErr } = await supabase
    .from('ordenes_venta')
    .insert({
      propuesta_id:         propuesta.id,
      lead_id:              propuesta.lead_id ?? null,
      cliente_id:           propuesta.cliente_id,
      vendedor_id:          session.user.id,
      numero:               siguienteNumero,
      estado:               'borrador',
      moneda:               propuesta.moneda ?? 'UYU',
      monto_total:          propuesta.monto_total ?? null,
      fecha_alta_prevista:  propuesta.fecha_inicio ?? null,
      fecha_baja_prevista:  propuesta.fecha_fin ?? null,
      notas:                `Generada desde cotización ${propuesta.numero ?? ''}`.trim(),
    })
    .select('id, numero')
    .single()

  if (ordenErr || !orden) {
    return NextResponse.json({ error: ordenErr?.message ?? 'No se pudo crear la orden' }, { status: 500 })
  }

  // Items: copiar de propuesta_items → orden_items con fechas por ítem
  const items = (propuesta.propuesta_items ?? []) as any[]
  if (items.length > 0) {
    const itemRows = items.map((it: any) => {
      const flags = flagsPorTipo(it.tipo_cotizador)
      return {
        orden_id:             orden.id,
        soporte_id:           it.soporte_id ?? null,
        cantidad:             it.cantidad_soportes ?? it.cantidad ?? 1,
        semanas:              it.semanas ?? 1,
        salidas:              it.salidas_elegidas ?? null,
        precio_unitario:      it.precio_unitario ?? 0,
        descuento_pct:        0,
        nota:                 null,
        fecha_alta_prevista:  propuesta.fecha_inicio ?? null,
        fecha_baja_prevista:  propuesta.fecha_fin ?? null,
        ...flags,
      }
    })
    const { error: itemsErr } = await supabase.from('orden_items').insert(itemRows)
    if (itemsErr) {
      await supabase.from('ordenes_venta').delete().eq('id', orden.id)
      return NextResponse.json({ error: 'Error al copiar items: ' + itemsErr.message }, { status: 500 })
    }
  }

  // Lead ganado (la venta se concreta acá, no en la aprobación de la cotización)
  if (propuesta.lead_id) {
    await supabase
      .from('leads')
      .update({ estado: 'ganado', updated_at: new Date().toISOString() })
      .eq('id', propuesta.lead_id)
  }

  await supabase.from('orden_historial').insert({
    orden_id:    orden.id,
    perfil_id:   session.user.id,
    estado_nuevo: 'borrador',
    comentario:  `Creada desde cotización ${propuesta.numero ?? ''}`.trim(),
  })

  return NextResponse.json({ ok: true, orden_id: orden.id, orden_numero: orden.numero })
}
