import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { generarTasksDeOrden } from '@/lib/tasks/generar-desde-orden'

const ESTADOS_VALIDOS = ['aprobada', 'rechazada', 'en_oic', 'facturada', 'cobrada', 'borrador', 'pendiente_aprobacion']

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: { estado: string; comentario?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (!ESTADOS_VALIDOS.includes(body.estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { error } = await supabase
    .from('ordenes_venta')
    .update({ estado: body.estado })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log historial
  await supabase.from('orden_historial').insert({
    orden_id: params.id,
    perfil_id: session.user.id,
    estado_nuevo: body.estado,
    comentario: body.comentario || null,
  })

  // Al aprobar la OIC, generar tareas automáticas para arte / operaciones
  let tasksCreated = 0
  if (body.estado === 'aprobada') {
    const r = await generarTasksDeOrden(supabase, params.id)
    tasksCreated = r.created
  }

  return NextResponse.json({ ok: true, tasks_creadas: tasksCreated })
}
