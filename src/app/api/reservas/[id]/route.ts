import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { asignarBusesYDetectarConflictos } from '@/lib/reservas/confirmar'

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

  // ── Asignación de buses al confirmar ──────────────────────────────────────
  // La lógica es compartida con el paso de la OIC a producción, que confirma la
  // reserva en el mismo movimiento.
  if (body.estado === 'confirmada') {
    const { warnings, conflictos } = await asignarBusesYDetectarConflictos(supabase, params.id, body.busOverrides ?? [])
    if (conflictos.length > 0) {
      return NextResponse.json({ ok: true, warnings, conflicts: conflictos })
    }
  }

  return NextResponse.json({ ok: true })
}
