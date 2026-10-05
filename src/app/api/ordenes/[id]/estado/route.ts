import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { generarTasksDeOrden } from '@/lib/tasks/generar-desde-orden'
import { cerrarBloqueoDeVenta } from '@/lib/reservas/confirmar'
import { asignarBusesDeOrden } from '@/lib/ventas/asignar-buses'

import {
  ESTADOS_VENTA, PERMISO_POR_ESTADO, MOVIDO_A_SU_ENDPOINT, estaCerrada,
  type EstadoVenta,
} from '@/lib/ventas/estados'

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

  if (!ESTADOS_VENTA.includes(body.estado as EstadoVenta)) {
    const endpoint = MOVIDO_A_SU_ENDPOINT[body.estado]
    return NextResponse.json(
      { error: endpoint ? `"${body.estado}": ${endpoint}` : 'Estado inválido' },
      { status: 400 },
    )
  }

  const supabase = createServerClient()

  const { data: actual } = await supabase
    .from('ordenes_venta')
    .select('estado, vendedor_id')
    .eq('id', params.id)
    .maybeSingle()
  if (!actual) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

  // Una venta aprobada es un compromiso cerrado: no vuelve atrás ni se
  // reabre. Si de verdad cambió lo vendido, se emite una venta nueva.
  if (estaCerrada(actual.estado)) {
    return NextResponse.json(
      { error: 'La venta ya está aprobada y no se puede cambiar de estado. Si cambió lo vendido, hay que hacer una venta nueva.' },
      { status: 409 },
    )
  }

  // Validar transición por rol/ownership
  const permiso = PERMISO_POR_ESTADO[body.estado as EstadoVenta]
  const tieneRol = puede(session.user.rol, permiso?.roles ?? [])
  const esDueño = !tieneRol && !!permiso?.self && actual.vendedor_id === session.user.id
  if (!tieneRol && !esDueño) {
    return NextResponse.json({ error: `Tu rol no puede pasar la venta a "${body.estado}"` }, { status: 403 })
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

  // La aprobación es el único disparador de la producción: antes faltaba un
  // paso más ("pasar a producción") que asignaba los buses, y si nadie lo daba
  // la campaña no llegaba a Comprobantes y el espacio quedaba contado dos veces.
  let tasksCreated = 0
  let busesAsignados = 0
  let bloqueoCerrado: string | null = null
  const warnings: string[] = []
  if (body.estado === 'aprobada') {
    const r = await generarTasksDeOrden(supabase, params.id)
    tasksCreated = r.created

    const buses = await asignarBusesDeOrden(supabase, params.id)
    busesAsignados = buses.asignados
    warnings.push(...buses.warnings)

    bloqueoCerrado = (await cerrarBloqueoDeVenta(supabase, params.id, session.user.id)).estado
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
    buses_asignados: busesAsignados,
    bloqueo_estado: bloqueoCerrado,
    warnings: warnings.length > 0 ? warnings : undefined,
  })
}
