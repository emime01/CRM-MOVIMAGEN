import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { TIPOS_GESTION } from '@/lib/ventas/cobranza'

export const dynamic = 'force-dynamic'

const COBRANZA_ROLES = ['administracion', 'gerente_comercial']

/**
 * GET /api/cobranza?factura_id= | ?orden_id=
 *
 * Gestiones de una factura (o de toda la venta), la más reciente primero.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puede(session.user.rol, COBRANZA_ROLES)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const facturaId = searchParams.get('factura_id')
  const ordenId = searchParams.get('orden_id')
  if (!facturaId && !ordenId) return NextResponse.json({ error: 'Falta factura_id u orden_id' }, { status: 400 })

  const supabase = createServerClient()
  let q = supabase
    .from('gestiones_cobranza')
    .select('id, tipo, nota, proxima_accion, created_at, factura_id, perfiles:perfiles!gestiones_cobranza_registrado_por_fkey(nombre)')
    .order('created_at', { ascending: false })
  q = facturaId ? q.eq('factura_id', facturaId) : q.eq('orden_id', ordenId!)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ gestiones: data ?? [] })
}

/**
 * POST /api/cobranza — registra una gestión de cobranza.
 *
 * Con `factura_id` la gestión queda en esa factura, que es como la lleva la
 * planilla; la venta se toma de la factura.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puede(session.user.rol, COBRANZA_ROLES)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: { orden_id?: string; factura_id?: string; tipo?: string; nota?: string; proxima_accion?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (!body.tipo || !(TIPOS_GESTION as readonly string[]).includes(body.tipo)) {
    return NextResponse.json({ error: 'Tipo de gestión inválido' }, { status: 400 })
  }

  const supabase = createServerClient()

  let ordenId = body.orden_id ?? null
  if (body.factura_id) {
    const { data: f } = await supabase.from('facturas').select('orden_id').eq('id', body.factura_id).maybeSingle()
    if (!f) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    ordenId = f.orden_id
  }
  if (!ordenId) return NextResponse.json({ error: 'Falta factura_id u orden_id' }, { status: 400 })

  const { data, error } = await supabase
    .from('gestiones_cobranza')
    .insert({
      orden_id: ordenId,
      factura_id: body.factura_id ?? null,
      tipo: body.tipo,
      nota: body.nota?.trim() || null,
      proxima_accion: body.proxima_accion || null,
      registrado_por: session.user.id,
    })
    .select('id, tipo, nota, proxima_accion, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
