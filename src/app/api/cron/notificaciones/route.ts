import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// POST /api/cron/notificaciones
// Called daily at 8am by Vercel Cron. Protected by CRON_SECRET.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const today = new Date().toISOString().slice(0, 10)
  let created = 0

  // Helper: skip if a notif for this entity+tipo already exists today
  async function alreadyNotified(userId: string, tipo: string, entityId: string): Promise<boolean> {
    const { data } = await supabase
      .from('notificaciones')
      .select('id')
      .eq('user_id', userId)
      .eq('tipo', tipo)
      .eq('entity_id', entityId)
      .gte('created_at', today)
      .limit(1)
    return (data?.length ?? 0) > 0
  }

  async function createNotif(userId: string, tipo: string, titulo: string, mensaje: string, link: string, entityId: string) {
    if (await alreadyNotified(userId, tipo, entityId)) return
    await supabase.from('notificaciones').insert({ user_id: userId, tipo, titulo, mensaje, link, entity_id: entityId })
    created++
  }

  // ── 1. Leads sin gestión ──────────────────────────────────────────────────
  // proxima_gestion < today OR (null AND created_at < 7 days ago)
  const cutoff7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)

  const { data: leadsAtrasados } = await supabase
    .from('leads')
    .select('id, descripcion, vendedor_id, proxima_gestion, clientes(nombre, empresa)')
    .in('estado', ['nuevo', 'en_conversacion', 'propuesta_enviada', 'negociacion'])
    .not('vendedor_id', 'is', null)

  for (const lead of leadsAtrasados ?? []) {
    const atrasado = lead.proxima_gestion
      ? lead.proxima_gestion < today
      : lead.id < cutoff7 // fallback: use id date proxy via created_at below

    // Re-check with created_at when proxima_gestion is null
    if (!lead.proxima_gestion) {
      const { data: fullLead } = await supabase
        .from('leads')
        .select('created_at')
        .eq('id', lead.id)
        .single()
      if (!fullLead || fullLead.created_at >= cutoff7) continue
    } else if (!atrasado) {
      continue
    }

    const cli = Array.isArray(lead.clientes) ? lead.clientes[0] : lead.clientes
    const clienteNombre = (cli as any)?.empresa || (cli as any)?.nombre || 'cliente'
    const descripcion = lead.descripcion ? ` — ${lead.descripcion}` : ''

    await createNotif(
      lead.vendedor_id!,
      'lead_sin_gestion',
      `Lead sin gestión: ${clienteNombre}`,
      `El lead de ${clienteNombre}${descripcion} tiene la fecha de seguimiento vencida.`,
      '/dashboard/leads',
      lead.id,
    )
  }

  // ── 2. Órdenes pendientes de aprobación hace más de 2 días ───────────────
  const cutoff2 = new Date(Date.now() - 2 * 86400000).toISOString()

  const { data: ordenesPendientes } = await supabase
    .from('ordenes_venta')
    .select('id, numero, clientes(nombre, empresa)')
    .eq('estado', 'pendiente_aprobacion')
    .lt('updated_at', cutoff2)

  if ((ordenesPendientes?.length ?? 0) > 0) {
    // Notify all gerentes and admins
    const { data: managers } = await supabase
      .from('perfiles')
      .select('id')
      .in('rol', ['gerente_comercial', 'administracion'])

    for (const orden of ordenesPendientes ?? []) {
      const cli = Array.isArray(orden.clientes) ? orden.clientes[0] : orden.clientes
      const clienteNombre = (cli as any)?.empresa || (cli as any)?.nombre || 'cliente'
      const numero = orden.numero ? `#${String(orden.numero).padStart(5, '0')}` : `#${orden.id.slice(0, 6)}`

      for (const mgr of managers ?? []) {
        await createNotif(
          mgr.id,
          'orden_pendiente',
          `Orden ${numero} esperando aprobación`,
          `La orden de ${clienteNombre} lleva más de 2 días pendiente de aprobación.`,
          `/dashboard/ventas/${orden.id}`,
          orden.id,
        )
      }
    }
  }

  // ── 3. Campañas que arrancan mañana ──────────────────────────────────────
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  const { data: campanasManana } = await supabase
    .from('ordenes_venta')
    .select('id, numero, vendedor_id, clientes(nombre, empresa), fecha_alta_prevista, fecha_alta_real')
    .in('estado', ['aprobada', 'en_oic', 'facturada'])
    .not('vendedor_id', 'is', null)

  for (const orden of campanasManana ?? []) {
    const alta = (orden as any).fecha_alta_real ?? (orden as any).fecha_alta_prevista
    if (alta?.slice(0, 10) !== tomorrow) continue

    const cli = Array.isArray(orden.clientes) ? orden.clientes[0] : orden.clientes
    const clienteNombre = (cli as any)?.empresa || (cli as any)?.nombre || 'cliente'
    const numero = orden.numero ? `#${String(orden.numero).padStart(5, '0')}` : `#${orden.id.slice(0, 6)}`

    await createNotif(
      (orden as any).vendedor_id!,
      'campana_proxima',
      `Campaña de ${clienteNombre} arranca mañana`,
      `La orden ${numero} de ${clienteNombre} comienza el ${tomorrow}. Verificá que los materiales estén listos.`,
      `/dashboard/ventas/${orden.id}`,
      orden.id,
    )
  }

  // ── 4. Lead en propuesta enviada sin respuesta >5 días ──────────────────
  const cutoff5 = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10)

  const { data: propuestasSinRespuesta } = await supabase
    .from('leads')
    .select('id, descripcion, vendedor_id, updated_at, clientes(nombre, empresa)')
    .eq('estado', 'propuesta_enviada')
    .not('vendedor_id', 'is', null)
    .lt('updated_at', cutoff5 + 'T00:00:00')

  for (const lead of propuestasSinRespuesta ?? []) {
    const cli = Array.isArray(lead.clientes) ? lead.clientes[0] : lead.clientes
    const clienteNombre = (cli as any)?.empresa || (cli as any)?.nombre || 'cliente'
    const dias = Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / 86400000)

    await createNotif(
      lead.vendedor_id!,
      'propuesta_sin_respuesta',
      `Propuesta sin respuesta: ${clienteNombre}`,
      `Hace ${dias} días que enviaste la propuesta a ${clienteNombre} y no hay respuesta. ¿Hiciste seguimiento?`,
      '/dashboard/leads',
      lead.id,
    )
  }

  // ── 5. Campañas que terminan en 3 días ───────────────────────────────────
  const in3days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)

  const { data: campanasTerminan } = await supabase
    .from('ordenes_venta')
    .select('id, numero, vendedor_id, clientes(nombre, empresa), fecha_baja_prevista, fecha_baja_real')
    .in('estado', ['aprobada', 'en_oic', 'facturada'])
    .not('vendedor_id', 'is', null)

  for (const orden of campanasTerminan ?? []) {
    const baja = (orden as any).fecha_baja_real ?? (orden as any).fecha_baja_prevista
    if (baja?.slice(0, 10) !== in3days) continue

    const cli = Array.isArray(orden.clientes) ? orden.clientes[0] : orden.clientes
    const clienteNombre = (cli as any)?.empresa || (cli as any)?.nombre || 'cliente'
    const numero = orden.numero ? `#${String(orden.numero).padStart(5, '0')}` : `#${orden.id.slice(0, 6)}`

    await createNotif(
      (orden as any).vendedor_id!,
      'campana_por_terminar',
      `Campaña de ${clienteNombre} termina en 3 días`,
      `La orden ${numero} de ${clienteNombre} vence el ${in3days}. ¿Interesa renovar?`,
      `/dashboard/ventas/${orden.id}`,
      orden.id,
    )
  }

  // ── 6. Campañas terminadas ayer sin registros fotográficos ───────────────
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  const { data: campanasTerminadasAyer } = await supabase
    .from('ordenes_venta')
    .select('id, numero, vendedor_id, clientes(nombre, empresa), fecha_baja_prevista, fecha_baja_real')
    .in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada'])
    .not('vendedor_id', 'is', null)

  for (const orden of campanasTerminadasAyer ?? []) {
    const baja = (orden as any).fecha_baja_real ?? (orden as any).fecha_baja_prevista
    if (baja?.slice(0, 10) !== yesterday) continue

    // Check if there are registros for this order
    const { data: regs } = await supabase
      .from('registros')
      .select('id')
      .eq('orden_id', orden.id)
      .limit(1)

    if ((regs?.length ?? 0) > 0) continue

    const cli = Array.isArray(orden.clientes) ? orden.clientes[0] : orden.clientes
    const clienteNombre = (cli as any)?.empresa || (cli as any)?.nombre || 'cliente'
    const numero = orden.numero ? `#${String(orden.numero).padStart(5, '0')}` : `#${orden.id.slice(0, 6)}`

    // Notify operaciones and the vendedor
    const { data: ops } = await supabase
      .from('perfiles')
      .select('id')
      .in('rol', ['operaciones', 'gerente_comercial'])

    for (const op of ops ?? []) {
      await createNotif(
        op.id,
        'campana_sin_registro',
        `Falta registro: ${clienteNombre}`,
        `La campaña ${numero} de ${clienteNombre} terminó ayer y no tiene fotos/videos de registro subidos.`,
        `/dashboard/registros`,
        orden.id,
      )
    }
  }

  // ── 7. Deudas de más de 30 días ──────────────────────────────────────────
  const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString()

  const { data: deudasAntiguas } = await supabase
    .from('ordenes_venta')
    .select('id, numero, monto_total, moneda, clientes(nombre, empresa)')
    .eq('estado', 'facturada')
    .lt('updated_at', cutoff30)

  if ((deudasAntiguas?.length ?? 0) > 0) {
    const { data: admins } = await supabase
      .from('perfiles')
      .select('id')
      .in('rol', ['administracion', 'gerente_comercial'])

    for (const orden of deudasAntiguas ?? []) {
      const cli = Array.isArray(orden.clientes) ? orden.clientes[0] : orden.clientes
      const clienteNombre = (cli as any)?.empresa || (cli as any)?.nombre || 'cliente'
      const numero = orden.numero ? `#${String(orden.numero).padStart(5, '0')}` : `#${orden.id.slice(0, 6)}`
      const moneda = (orden as any).moneda === 'USD' ? 'U$S' : '$'
      const monto = `${moneda} ${Number((orden as any).monto_total ?? 0).toLocaleString('es-UY', { maximumFractionDigits: 0 })}`
      const dias = Math.floor((Date.now() - new Date(cutoff30).getTime()) / 86400000) + 30

      for (const adm of admins ?? []) {
        await createNotif(
          adm.id,
          'deuda_antigua',
          `Deuda sin cobrar: ${clienteNombre}`,
          `La orden ${numero} de ${clienteNombre} por ${monto} lleva ${dias} días facturada sin cobrar.`,
          `/dashboard/ventas/${orden.id}`,
          orden.id,
        )
      }
    }
  }

  // ── 8. Leads ganados sin orden asociada hace >3 días ─────────────────────
  const cutoff3 = new Date(Date.now() - 3 * 86400000).toISOString()

  const { data: leadsGanados } = await supabase
    .from('leads')
    .select('id, descripcion, vendedor_id, updated_at, clientes(nombre, empresa)')
    .eq('estado', 'ganado')
    .not('vendedor_id', 'is', null)
    .lt('updated_at', cutoff3)

  for (const lead of leadsGanados ?? []) {
    // Check if there's already an order linked to this lead
    const { data: ordenes } = await supabase
      .from('ordenes_venta')
      .select('id')
      .eq('lead_id', lead.id)
      .limit(1)

    if ((ordenes?.length ?? 0) > 0) continue

    const cli = Array.isArray(lead.clientes) ? lead.clientes[0] : lead.clientes
    const clienteNombre = (cli as any)?.empresa || (cli as any)?.nombre || 'cliente'
    const descripcion = lead.descripcion ? ` (${lead.descripcion})` : ''

    await createNotif(
      lead.vendedor_id!,
      'lead_ganado_sin_orden',
      `Lead ganado sin OIC: ${clienteNombre}`,
      `El lead de ${clienteNombre}${descripcion} está marcado como ganado pero todavía no tiene una orden creada.`,
      '/dashboard/leads',
      lead.id,
    )
  }

  return NextResponse.json({ ok: true, created })
}
