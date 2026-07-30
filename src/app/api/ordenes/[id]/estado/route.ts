import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { generarTasksDeOrden } from '@/lib/tasks/generar-desde-orden'
import { sincronizarReservaConOrden } from '@/lib/reservas/confirmar'

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

  let body: {
    estado: string
    comentario?: string
    fecha_facturacion?: string
    factura_numero?: string
    fecha_cobro?: string
    metodo_pago?: string
  }
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

  // Setear campos específicos por estado destino
  const hoy = new Date().toISOString().slice(0, 10)
  const updates: Record<string, unknown> = { estado: body.estado, updated_at: new Date().toISOString() }
  if (body.estado === 'aprobada') {
    updates.aprobado_at  = new Date().toISOString()
    updates.aprobado_por = session.user.id
  }
  if (body.estado === 'rechazada' && body.comentario) {
    updates.motivo_rechazo = body.comentario
  }
  if (body.estado === 'facturada') {
    updates.fecha_facturacion = body.fecha_facturacion || hoy
    if (body.factura_numero) updates.factura_numero = body.factura_numero
  }
  if (body.estado === 'cobrada') {
    updates.fecha_cobro = body.fecha_cobro || hoy
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

  // Al cobrar, generar pago + comisión automáticamente.
  // Idempotente: si ya hay comisión para esta orden, no duplica.
  let comisionGenerada = false
  if (body.estado === 'cobrada') {
    const { data: ya } = await supabase
      .from('comisiones')
      .select('id')
      .eq('orden_id', params.id)
      .maybeSingle()
    if (!ya) {
      const { data: orden } = await supabase
        .from('ordenes_venta')
        .select('vendedor_id, monto_total, factura_numero, fecha_cobro')
        .eq('id', params.id)
        .maybeSingle()
      const { data: vendedor } = orden?.vendedor_id
        ? await supabase
            .from('perfiles')
            .select('porcentaje_comision')
            .eq('id', orden.vendedor_id)
            .maybeSingle()
        : { data: null }
      if (orden?.vendedor_id && orden.monto_total) {
        const monto = Number(orden.monto_total)
        const pct = Number(vendedor?.porcentaje_comision ?? 6)
        const comisionMonto = Math.round(monto * pct) / 100
        // Registrar pago (la tabla pagos tiene NOT NULL en monto y fecha_pago)
        const { data: pago } = await supabase
          .from('pagos')
          .insert({
            orden_id: params.id,
            monto,
            fecha_pago: orden.fecha_cobro ?? hoy,
            numero_factura: orden.factura_numero ?? null,
            metodo: body.metodo_pago ?? null,
          })
          .select('id')
          .single()
        // Crear comision (pago_id puede ser null si la inserción de pago falla)
        const { error: comErr } = await supabase.from('comisiones').insert({
          pago_id:        pago?.id ?? null,
          vendedor_id:    orden.vendedor_id,
          orden_id:       params.id,
          monto_base:     monto,
          porcentaje:     pct,
          monto_comision: comisionMonto,
          estado:         'pendiente',
        })
        if (!comErr) comisionGenerada = true
      }
    }
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
    comision_generada: comisionGenerada,
    reserva_estado: reservaSincronizada,
    warnings: warnings.length > 0 ? warnings : undefined,
  })
}
