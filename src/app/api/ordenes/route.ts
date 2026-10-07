import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'

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
  comisionAgenciaPct?: number
  comisionAgenciaProdPct?: number
  facturarA?: 'agencia' | 'cliente_final'
  marca?: string
  campana?: string
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
  leadId?: string
  detallesTexto?: string
  adjuntoUrl?: string
  estado: 'borrador' | 'pendiente_aprobacion'
  items: OrdenItem[]
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  // Antes sólo pedía sesión: arte u operaciones podían crear ventas.
  if (!puede(session.user.rol, ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'])) {
    return NextResponse.json({ error: 'Tu rol no puede crear ventas' }, { status: 403 })
  }

  let body: OrdenPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  // Con agencia, la comisión pactada es obligatoria (0 vale: "no comisiona").
  if (body.agenciaId) {
    const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100
    if (!ok(body.comisionAgenciaPct) || !ok(body.comisionAgenciaProdPct)) {
      return NextResponse.json(
        { error: 'Falta la comisión de la agencia, sobre arrendamiento y sobre producción, entre 0 y 100.' },
        { status: 400 },
      )
    }
  }

  if (!body.clienteId || !body.moneda) {
    return NextResponse.json({ error: 'Faltan campos requeridos: clienteId, moneda' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Un vendedor sólo crea ventas a su nombre. `asignadoAId` venía sin validar,
  // así que cualquiera podía cargar una venta a nombre de otro vendedor y
  // ensuciarle los números y la comisión.
  const puedeAsignar = puede(session.user.rol, ['asistente_ventas', 'gerente_comercial', 'administracion'])
  const vendedorId = puedeAsignar ? (body.asignadoAId || session.user.id) : session.user.id

  const montoTotal = (body.items ?? []).reduce((sum, item) => {
    const lineTotal = item.precioUnitario * item.cantidad * item.semanas * (1 - (item.descuentoPct ?? 0) / 100)
    return sum + lineTotal
  }, 0)

  const { data: orden, error: ordenError } = await supabase
    .from('ordenes_venta')
    .insert({
      cliente_id: body.clienteId,
      agencia_id: body.agenciaId || null,
      comision_agencia_pct:      body.agenciaId ? body.comisionAgenciaPct : null,
      comision_agencia_prod_pct: body.agenciaId ? body.comisionAgenciaProdPct : null,
      vendedor_id: vendedorId,
      contacto: body.contacto || null,
      facturar_a: body.facturarA || 'cliente_final',
      marca: body.marca || null,
      campana: body.campana || null,
      referencia: body.referencia || null,
      moneda: body.moneda,
      estado: body.estado,
      monto_total: montoTotal,
      // Acá las líneas ya vienen sin IVA, así que el total es el neto.
      monto_neto: montoTotal,
      // La carga manual no tiene producción con precio: las líneas son todo
      // arrendamiento sin IVA.
      monto_arrendamiento: montoTotal,
      monto_produccion: 0,
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
      lead_id: body.leadId || null,
      detalles_texto: body.detallesTexto || null,
      adjunto_url: body.adjuntoUrl || null,
    })
    .select('id')
    .single()

  if (ordenError || !orden) {
    console.error('Error creando orden:', ordenError)
    return NextResponse.json({ error: ordenError?.message ?? 'Error al crear la orden' }, { status: 500 })
  }

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
      await supabase.from('ordenes_venta').delete().eq('id', orden.id)
      return NextResponse.json({ error: 'Error al guardar los ítems de la orden' }, { status: 500 })
    }
  }

  await supabase.from('orden_historial').insert({
    orden_id: orden.id,
    perfil_id: session.user.id,
    estado_nuevo: body.estado,
    comentario: body.estado === 'borrador' ? 'Orden guardada como borrador' : 'Orden enviada para aprobación',
  })

  return NextResponse.json({ id: orden.id }, { status: 201 })
}
