import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const rol = session.user.rol
  const canApprove = ['asistente_ventas', 'gerente_comercial', 'administracion'].includes(rol)
  const canConfirm = ['operaciones', 'administracion'].includes(rol)
  const isManager = ['asistente_ventas', 'gerente_comercial', 'administracion', 'operaciones'].includes(rol)

  let body: { estado: string; comentario?: string; busOverrides?: { itemId: string; busId: string }[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const VALID = ['aprobada', 'rechazada', 'pendiente', 'confirmada', 'vencida']
  if (!VALID.includes(body.estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  if (['aprobada', 'rechazada'].includes(body.estado) && !canApprove) {
    return NextResponse.json({ error: 'Sin permisos para aprobar/rechazar' }, { status: 403 })
  }

  if (body.estado === 'confirmada' && !canConfirm) {
    return NextResponse.json({ error: 'Sin permisos para confirmar' }, { status: 403 })
  }

  const supabase = createServerClient()

  // Ownership: vendedor solo puede modificar sus reservas.
  // Para `vencida` / `pendiente` (sin chequeo de rol arriba) exigimos que sea suya o un manager.
  if (!isManager) {
    const { data: own } = await supabase
      .from('reservas')
      .select('vendedor_id')
      .eq('id', params.id)
      .maybeSingle()
    if (!own) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })
    if (own.vendedor_id !== session.user.id) {
      return NextResponse.json({ error: 'Sin permisos sobre esta reserva' }, { status: 403 })
    }
  }

  const updates: Record<string, unknown> = {
    estado: body.estado,
    updated_at: new Date().toISOString(),
  }

  if (['aprobada', 'rechazada'].includes(body.estado)) {
    updates.aprobada_por = session.user.id
  }

  const { error } = await supabase.from('reservas').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Bus assignment on confirmation ────────────────────────────────────────
  if (body.estado === 'confirmada') {
    const overrideMap = new Map((body.busOverrides ?? []).map(o => [o.itemId, o.busId]))

    // Get reserva with dates and items (with their soportes' bus_id)
    const { data: reserva } = await supabase
      .from('reservas')
      .select('fecha_desde, fecha_hasta, reserva_items(id, soporte_id, soportes(bus_id, lado_bus))')
      .eq('id', params.id)
      .single()

    if (reserva?.reserva_items?.length) {
      const conflicts: { itemId: string; busNumero: string }[] = []

      for (const item of reserva.reserva_items as unknown as Array<{
        id: string
        soporte_id: string
        soportes: { bus_id: string | null; lado_bus: string | null } | null
      }>) {
        const targetBusId = overrideMap.get(item.id) ?? item.soportes?.bus_id ?? null
        if (!targetBusId) continue

        // Check if this soporte is already in a confirmed/aprobada reservation with overlapping dates
        const { data: conflictItems } = await supabase
          .from('reserva_items')
          .select('id, reservas!inner(id, fecha_desde, fecha_hasta, estado)')
          .eq('soporte_id', item.soporte_id)
          .neq('reservas.id', params.id)
          .in('reservas.estado', ['confirmada', 'aprobada'])
          .lte('reservas.fecha_desde', reserva.fecha_hasta)
          .gte('reservas.fecha_hasta', reserva.fecha_desde)

        if (conflictItems && conflictItems.length > 0) {
          const { data: bus } = await supabase.from('buses').select('numero').eq('id', targetBusId).single()
          conflicts.push({ itemId: item.id, busNumero: bus?.numero ?? targetBusId })
          continue
        }

        // Assign bus to this reservation item
        await supabase.from('reserva_items').update({ bus_id: targetBusId }).eq('id', item.id)
      }

      if (conflicts.length > 0) {
        return NextResponse.json({
          ok: true,
          warnings: conflicts.map(c => `Bus #${c.busNumero} tiene conflicto de fechas — asignar manualmente`),
          conflicts,
        })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
