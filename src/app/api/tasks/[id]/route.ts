import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

/**
 * PATCH /api/tasks/[id]
 *
 * Actualiza el estado de una task (pendiente → en_progreso → completada).
 * Solo puede actualizarla:
 *   - quien tiene el rol asignado (arte para tasks de arte, operaciones para las suyas)
 *   - administracion
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: { estado?: 'pendiente' | 'en_progreso' | 'completada' }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  if (!body.estado || !['pendiente', 'en_progreso', 'completada'].includes(body.estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: task } = await supabase.from('tasks').select('asignado_a_rol').eq('id', params.id).maybeSingle()
  if (!task) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const allowed = session.user.rol === 'administracion' || session.user.rol === task.asignado_a_rol
  if (!allowed) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const updates: Record<string, unknown> = {
    estado: body.estado,
    asignado_a: session.user.id,
  }
  if (body.estado === 'completada') updates.completed_at = new Date().toISOString()
  else updates.completed_at = null

  const { error } = await supabase.from('tasks').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
