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

  // Aprobar / rechazar una OIC es decisión exclusiva del gerente comercial
  if (['aprobada', 'rechazada'].includes(body.estado) && session.user.rol !== 'gerente_comercial') {
    return NextResponse.json({ error: 'Solo el gerente comercial puede aprobar o rechazar órdenes' }, { status: 403 })
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

  // Aviso inmediato al gerente cuando una OIC queda esperando su aprobación
  if (body.estado === 'pendiente_aprobacion') {
    const [{ data: orden }, { data: gerentes }] = await Promise.all([
      supabase.from('ordenes_venta').select('numero, clientes(nombre, empresa)').eq('id', params.id).maybeSingle(),
      supabase.from('perfiles').select('id').eq('rol', 'gerente_comercial'),
    ])
    if (orden && gerentes?.length) {
      const cli: any = Array.isArray(orden.clientes) ? orden.clientes[0] : orden.clientes
      const clienteNombre = cli?.empresa ?? cli?.nombre ?? 'cliente'
      await supabase.from('notificaciones').insert(
        gerentes.map((g: { id: string }) => ({
          user_id:   g.id,
          tipo:      'orden_pendiente',
          titulo:    'OIC esperando tu aprobación',
          mensaje:   `OIC #${orden.numero} · ${clienteNombre}`,
          link:      `/dashboard/ventas/${params.id}`,
          entity_id: params.id,
        }))
      )
    }
  }

  return NextResponse.json({ ok: true, tasks_creadas: tasksCreated })
}
