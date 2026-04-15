import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

interface OrdenItem {
  soporteId: string
  cantidad: number
  semanas: number
  salidas?: number
  segundos?: number
  precioUnitario: number
  descuentoPct: number
  nota?: string
  requiereGrabado?: boolean
  requiereProduccion?: boolean
}

interface OrdenPayload {
  clienteId: string
  contacto?: string
  agenciaId?: string
  facturarA?: 'agencia' | 'cliente_final'
  marca?: string
  referencia?: string
  validez?: string
  fechaAltaPrevista?: string
  fechaBajaPrevista?: string
  moneda: 'USD' | 'UYU'
  esCanje?: boolean
  incluirReportes?: boolean
  esMensualizada?: boolean
  tieneProduccion?: boolean
  tieneDigital?: boolean
  formaPagoArrend?: string
  comentarioArrend?: string
  formaPagoProd?: string
  comentarioProd?: string
  asignadoAId?: string
  estado: 'borrador' | 'pendiente_aprobacion'
  items: OrdenItem[]
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  let body: OrdenPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (!body.clienteId || !body.moneda) {
    return NextResponse.json({ error: 'Faltan campos requeridos: clienteId, moneda' }, { status: 400 })
  }

  const supabase = createServerClient()
  const vendedorId = body.asignadoAId || session.user.id

  // Calculate total from items
  const montoTotal = (body.items ?? []).reduce((sum, item) => {
    const lineTotal = item.precioUnitario * item.cantidad * item.semanas * (1 - (item.descuentoPct ?? 0) / 100)
    return sum + lineTotal
  }, 0)

  // Insert order header
  const { data: orden, error: ordenError } = await supabase
    .from('ordenes_venta')
    .insert({
      cliente_id: body.clienteId,
      agencia_id: body.agenciaId || null,
      vendedor_id: vendedorId,
      contacto: body.contacto || null,
      facturar_a: body.facturarA || null,
      marca: body.marca || null,
      referencia: body.referencia || null,
      moneda: body.moneda,
      estado: body.estado,
      monto_total: montoTotal,
      fecha_alta_prevista: body.fechaAltaPrevista || null,
      fecha_baja_prevista: body.fechaBajaPrevista || null,
      validez: body.validez || null,
      es_canje: body.esCanje ?? false,
      incluir_reportes: body.incluirReportes ?? true,
      es_mensualizada: body.esMensualizada ?? false,
      tiene_produccion: body.tieneProduccion ?? false,
      tiene_digital: body.tieneDigital ?? false,
      forma_pago_arrend: body.formaPagoArrend || null,
      comentario_arrend: body.comentarioArrend || null,
      forma_pago_prod: body.formaPagoProd || null,
      comentario_prod: body.comentarioProd || null,
    })
    .select('id')
    .single()

  if (ordenError || !orden) {
    console.error('Error creando orden:', ordenError)
    return NextResponse.json({ error: ordenError?.message ?? 'Error al crear la orden' }, { status: 500 })
  }

  // Insert items
  if (body.items && body.items.length > 0) {
    const { error: itemsError } = await supabase
      .from('orden_items')
      .insert(
        body.items.map(item => ({
          orden_id: orden.id,
          soporte_id: item.soporteId,
          cantidad: item.cantidad,
          semanas: item.semanas,
          salidas: item.salidas || null,
          segundos: item.segundos || null,
          precio_unitario: item.precioUnitario,
          descuento_pct: item.descuentoPct ?? 0,
          nota: item.nota || null,
          requiere_grabado: item.requiereGrabado ?? false,
          requiere_produccion: item.requiereProduccion ?? false,
        }))
      )

    if (itemsError) {
      console.error('Error insertando items:', itemsError)
      // Rollback order if items failed
      await supabase.from('ordenes_venta').delete().eq('id', orden.id)
      return NextResponse.json({ error: 'Error al guardar los ítems de la orden' }, { status: 500 })
    }
  }

  // Insert historial entry
  await supabase.from('orden_historial').insert({
    orden_id: orden.id,
    perfil_id: session.user.id,
    estado_nuevo: body.estado,
    comentario: body.estado === 'borrador' ? 'Orden guardada como borrador' : 'Orden enviada para aprobación',
  })

  return NextResponse.json({ id: orden.id }, { status: 201 })
}
