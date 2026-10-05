import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { pickAllowed } from '@/lib/api/safe-patch'
import { estaCerrada } from '@/lib/ventas/estados'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('ordenes_venta')
    .select(`
      id, numero, estado, moneda, monto_total, created_at, updated_at,
      contacto, facturar_a, marca, campana, referencia, validez,
      fecha_alta_prevista, fecha_baja_prevista,
      es_canje, incluir_reportes, es_mensualizada,
      tiene_produccion, tiene_digital,
      forma_pago_arrend, comentario_arrend,
      forma_pago_prod, comentario_prod,
      detalles_texto, adjunto_url,
      motivo_rechazo, aprobado_at,
      lead_id,
      clientes(id, nombre, empresa),
      agencias(id, nombre),
      perfiles!vendedor_id(id, nombre),
      perfiles!aprobado_por(id, nombre),
      orden_items(
        id, cantidad, semanas, salidas, segundos,
        precio_unitario, descuento_pct, nota,
        requiere_grabado, requiere_produccion,
        soportes(id, nombre, tipo, categoria, ubicacion)
      ),
      orden_historial(
        id, estado_nuevo, comentario, created_at,
        perfiles(nombre)
      ),
      orden_documentos(id, nombre, url, tipo, created_at)
    `)
    .eq('id', params.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

  return NextResponse.json(data)
}

/**
 * Campos editables vía PATCH directo (mass-assignment seguro). Para cambiar
 * estado existe /api/ordenes/[id]/estado; para fechas reales por ítem,
 * /api/orden-items/[id]; para vendedor / monto / aprobación no hay endpoint
 * (se gestiona desde el flujo de cotización → crear-orden y el de aprobar).
 */
const ALLOWED_FIELDS = [
  'contacto', 'facturar_a', 'marca', 'campana', 'referencia', 'validez',
  'fecha_alta_prevista', 'fecha_baja_prevista',
  'es_canje', 'incluir_reportes', 'es_mensualizada',
  'tiene_produccion', 'tiene_digital',
  'forma_pago_arrend', 'comentario_arrend',
  'forma_pago_prod', 'comentario_prod',
  'detalles_texto', 'adjunto_url',
  'notas',
] as const

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: orden } = await supabase
    .from('ordenes_venta')
    .select('estado, vendedor_id')
    .eq('id', params.id)
    .maybeSingle()
  if (!orden) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

  // Una venta aprobada es un compromiso cerrado con el cliente: lo que se
  // vendió no se toca más. Lo operativo sigue abierto por sus propios
  // endpoints —fechas reales e instalación en /api/orden-items/[id], buses en
  // /asignar-buses, y factura y cobro en los suyos—, porque las campañas se
  // atrasan en la instalación y eso no cambia lo vendido.
  if (estaCerrada(orden.estado)) {
    return NextResponse.json(
      { error: 'La venta está aprobada y no se edita. Las fechas reales y la instalación se cargan desde Disponibilidad; si cambió lo vendido, hay que hacer una venta nueva.' },
      { status: 409 },
    )
  }

  // Ownership: vendedor solo edita las suyas; resto puede tocar cualquiera.
  if (session.user.rol === 'vendedor' && orden.vendedor_id !== session.user.id) {
    return NextResponse.json({ error: 'Sin permisos sobre esta orden' }, { status: 403 })
  }

  const updates = pickAllowed(body, ALLOWED_FIELDS)
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Sin campos editables en el payload' }, { status: 400 })
  }

  const { error } = await supabase
    .from('ordenes_venta')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
