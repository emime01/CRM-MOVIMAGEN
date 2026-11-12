import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { TIPO_TAREA_REGALO } from '@/lib/regalos/tarea'
import { atiendeTareasDe, es } from '@/lib/auth/roles'

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
  const { data: task } = await supabase.from('tasks').select('*').eq('id', params.id).maybeSingle()
  if (!task) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  // Las tareas de ventas son de su vendedor (y las ve y mueve el gerente comercial).
  const deVentas = task.asignado_a_rol === 'ventas'
  const allowed = deVentas
    ? task.asignado_a === session.user.id || es(session.user.rol, 'gerente_comercial')
    : es(session.user.rol, 'administracion') || atiendeTareasDe(session.user.rol, task.asignado_a_rol)
  if (!allowed) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const updates: Record<string, unknown> = { estado: body.estado }
  // En las de ventas "asignado_a" es el responsable: no se pisa al moverla.
  if (!deVentas) updates.asignado_a = session.user.id
  if (body.estado === 'completada') updates.completed_at = new Date().toISOString()
  else updates.completed_at = null

  const { error } = await supabase.from('tasks').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // La tarea de entregar un regalo, lista: el regalo queda entregado.
  if (body.estado === 'completada' && task.tipo === TIPO_TAREA_REGALO && task.regalo_id) {
    await supabase.from('regalos').update({ estado: 'entregado', updated_at: new Date().toISOString() })
      .eq('id', task.regalo_id).eq('estado', 'pendiente')
  }
  return NextResponse.json({ ok: true })
}
