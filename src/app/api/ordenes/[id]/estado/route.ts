import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { generarTasksDeOrden } from '@/lib/tasks/generar-desde-orden'

const ESTADOS_VALIDOS = ['aprobada', 'rechazada', 'en_oic', 'facturada', 'cobrada', 'borrador', 'pendiente_aprobacion'] as const

// Quién puede pasar la OIC a cada estado.
// 'self' significa "el vendedor dueño de la orden o cualquiera de los roles listados".
const PERMISO_POR_ESTADO: Record<string, { roles: string[]; self?: boolean }> = {
  borrador:             { roles: ['asistente_ventas', 'gerente_comercial', 'administracion'], self: true },
  pendiente_aprobacion: { roles: ['asistente_ventas', 'gerente_comercial', 'administracion'], self: true },
  aprobada:             { roles: ['gerente_comercial'] },
  rechazada:            { roles: ['gerente_comercial'] },
  en_oic:               { roles: ['administracion', 'gerente_comercial', 'operaciones'] },
  facturada:            { roles: ['administracion'] },
  cobrada:              { roles: ['administracion'] },
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: { estado: string; comentario?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (!ESTADOS_VALIDOS.includes(body.estado as typeof ESTADOS_VALIDOS[number])) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Validar transición por rol/ownership
  const permiso = PERMISO_POR_ESTADO[body.estado]
  const tieneRol = permiso?.roles.includes(session.user.rol)
  let esDueño = false
  if (!tieneRol && permiso?.self) {
    const { data: orden } = await supabase.from('ordenes_venta').select('vendedor_id').eq('id', params.id).maybeSingle()
    esDueño = orden?.vendedor_id === session.user.id
  }
  if (!tieneRol && !esDueño) {
    return NextResponse.json({ error: `Tu rol no puede pasar la OIC a "${body.estado}"` }, { status: 403 })
  }

  // Setear aprobado_at/por cuando corresponde
  const updates: Record<string, unknown> = { estado: body.estado, updated_at: new Date().toISOString() }
  if (body.estado === 'aprobada') {
    updates.aprobado_at  = new Date().toISOString()
    updates.aprobado_por = session.user.id
  }
  if (body.estado === 'rechazada' && body.comentario) {
    updates.motivo_rechazo = body.comentario
  }

  const { error } = await supabase
    .from('ordenes_venta')
    .update(updates)
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
