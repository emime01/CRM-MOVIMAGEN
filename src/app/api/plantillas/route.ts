import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const CREATE_ROLES = ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion']

// GET /api/plantillas — lista las plantillas propias + las globales
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  // Propias (vendedor_id = yo) o globales (vendedor_id null).
  // Los roles administrativos ven todas.
  let query = supabase
    .from('plantillas_cotizacion')
    .select('id, nombre, vendedor_id, items, created_at, perfiles:perfiles!plantillas_cotizacion_vendedor_id_fkey(nombre)')
    .order('created_at', { ascending: false })

  if (!['gerente_comercial', 'administracion'].includes(session.user.rol)) {
    query = query.or(`vendedor_id.eq.${session.user.id},vendedor_id.is.null`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plantillas: data ?? [] })
}

// POST /api/plantillas — crea una plantilla con { nombre, items, global? }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!CREATE_ROLES.includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: { nombre?: string; items?: unknown; global?: boolean }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const nombre = (body.nombre ?? '').trim()
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'La plantilla no tiene ítems' }, { status: 400 })
  }

  // Solo los roles administrativos pueden crear plantillas globales.
  const esGlobal = body.global === true && ['gerente_comercial', 'administracion'].includes(session.user.rol)

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('plantillas_cotizacion')
    .insert({
      nombre,
      vendedor_id: esGlobal ? null : session.user.id,
      items: body.items,
    })
    .select('id, nombre, vendedor_id, items, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
