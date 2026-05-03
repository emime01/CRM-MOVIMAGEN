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

  return NextResponse.json({ ok: true, created })
}
