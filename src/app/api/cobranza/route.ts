import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const TIPOS = ['llamada', 'email', 'whatsapp', 'visita', 'promesa_pago', 'otro']
const COBRANZA_ROLES = ['administracion', 'gerente_comercial']

// GET /api/cobranza?orden_id= — gestiones de una orden (más reciente primero)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!COBRANZA_ROLES.includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const ordenId = new URL(req.url).searchParams.get('orden_id')
  if (!ordenId) return NextResponse.json({ error: 'Falta orden_id' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('gestiones_cobranza')
    .select('id, tipo, nota, proxima_accion, created_at, perfiles:perfiles!gestiones_cobranza_registrado_por_fkey(nombre)')
    .eq('orden_id', ordenId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ gestiones: data ?? [] })
}

// POST /api/cobranza — registra una gestión de cobranza
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!COBRANZA_ROLES.includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: { orden_id?: string; tipo?: string; nota?: string; proxima_accion?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (!body.orden_id) return NextResponse.json({ error: 'Falta orden_id' }, { status: 400 })
  if (!body.tipo || !TIPOS.includes(body.tipo)) {
    return NextResponse.json({ error: 'Tipo de gestión inválido' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('gestiones_cobranza')
    .insert({
      orden_id: body.orden_id,
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
