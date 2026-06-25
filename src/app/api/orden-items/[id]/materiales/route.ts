import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { registrarCambioDigital } from '@/lib/cambios-material/lib'

/**
 * GET /api/orden-items/[id]/materiales — historial de cambios de material
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const { data } = await supabase
    .from('cambios_material')
    .select('id, fecha_desde, url_material, nombre_archivo, descripcion, created_at, perfiles:created_by(nombre)')
    .eq('orden_item_id', params.id)
    .order('fecha_desde', { ascending: false })

  return NextResponse.json({ cambios: data ?? [] })
}

/**
 * POST /api/orden-items/[id]/materiales — registra cambio de material digital
 *   body: { fecha_desde, url_material?, nombre_archivo?, descripcion? }
 * Solo operaciones, administracion y asistente_ventas.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['operaciones', 'administracion', 'asistente_ventas'].includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: { fecha_desde?: string; url_material?: string; nombre_archivo?: string; descripcion?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  if (!body.fecha_desde || !/^\d{4}-\d{2}-\d{2}$/.test(body.fecha_desde)) {
    return NextResponse.json({ error: 'fecha_desde requerida (YYYY-MM-DD)' }, { status: 400 })
  }

  const supabase = createServerClient()
  const r = await registrarCambioDigital(supabase, {
    ordenItemId:    params.id,
    fechaDesde:     body.fecha_desde,
    urlMaterial:    body.url_material,
    nombreArchivo:  body.nombre_archivo,
    descripcion:    body.descripcion,
    perfilId:       session.user.id,
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error?.includes('no es digital') ? 400 : 500 })
  return NextResponse.json({ ok: true, cambio_id: r.cambioId, tasks_creadas: r.tasksCreadas })
}
