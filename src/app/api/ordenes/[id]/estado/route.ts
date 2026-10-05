import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { generarTasksDeOrden } from '@/lib/tasks/generar-desde-orden'
import { sincronizarReservaConOrden } from '@/lib/reservas/confirmar'

// Dónde está la campaña. Facturar y cobrar NO son estados: son fechas que
// administración carga por /facturar y /cobrar, en paralelo y sin frenar la
// producción. Mientras estuvieron acá, marcar una venta como facturada la
// sacaba de producción y los dos carriles se pisaban.
const ESTADOS_VALIDOS = ['aprobada', 'rechazada', 'en_oic', 'borrador', 'pendiente_aprobacion'] as const

/** Lo que se intentaba hacer y adónde se hace ahora. */
const MOVIDO_A_SU_ENDPOINT: Record<string, string> = {
  facturada: 'POST /api/ordenes/[id]/facturar',
  cobrada:   'POST /api/ordenes/[id]/cobrar',
}

// Quién puede pasar la OIC a cada estado.
// 'self' significa "el vendedor dueño de la orden o cualquiera de los roles listados".
const PERMISO_POR_ESTADO: Record<string, { roles: string[]; self?: boolean }> = {
  borrador:             { roles: ['asistente_ventas', 'gerente_comercial', 'administracion'], self: true },
  pendiente_aprobacion: { roles: ['asistente_ventas', 'gerente_comercial', 'administracion'], self: true },
  aprobada:             { roles: ['gerente_comercial'] },
  rechazada:            { roles: ['gerente_comercial'] },
  en_oic:               { roles: ['administracion', 'gerente_comercial', 'operaciones'] },
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: {
    estado: string
    comentario?: string
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (!ESTADOS_VALIDOS.includes(body.estado as typeof ESTADOS_VALIDOS[number])) {
    const endpoint = MOVIDO_A_SU_ENDPOINT[body.estado]
    return NextResponse.json(
      { error: endpoint ? `"${body.estado}" ya no es un estado de la venta: usá ${endpoint}` : 'Estado inválido' },
      { status: 400 },
    )
  }

  const supabase = createServerClient()

  // Validar transición por rol/ownership
  const permiso = PERMISO_POR_ESTADO[body.estado]
  const tieneRol = puede(session.user.rol, permiso?.roles ?? [])
  let esDueño = false
  if (!tieneRol && permiso?.self) {
    const { data: orden } = await supabase.from('ordenes_venta').select('vendedor_id').eq('id', params.id).maybeSingle()
    esDueño = orden?.vendedor_id === session.user.id
  }
  if (!tieneRol && !esDueño) {
    return NextResponse.json({ error: `Tu rol no puede pasar la OIC a "${body.estado}"` }, { status: 403 })
  }

  // Setear campos específicos por estado destino
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

  // La reserva sigue a la venta: aprobar la OIC la aprueba, y ponerla en
  // producción la confirma (asignando buses). Antes había que hacerlo aparte en
  // otra pantalla, y si no se hacía la campaña no aparecía en Comprobantes.
  let reservaSincronizada: string | null = null
  const warnings: string[] = []
  if (body.estado === 'aprobada' || body.estado === 'en_oic') {
    const sync = await sincronizarReservaConOrden(supabase, params.id, body.estado, session.user.id)
    reservaSincronizada = sync.estado
    warnings.push(...sync.warnings)
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

  return NextResponse.json({
    ok: true,
    tasks_creadas: tasksCreated,
    reserva_estado: reservaSincronizada,
    warnings: warnings.length > 0 ? warnings : undefined,
  })
}
