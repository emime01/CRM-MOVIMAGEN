import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

/**
 * PATCH /api/reserva-items/[id]
 *
 * Carga las fechas reales de subida/bajada de un soporte instalado en el bus.
 * Estas fechas (cuando existen) mandan sobre la ventana provisoria de la
 * reserva en toda la app. Solo operaciones / administración.
 *
 * Enviar fecha_*_real: null para volver a la fecha provisoria.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['operaciones', 'administracion'].includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: { fecha_alta_real?: string | null; fecha_baja_real?: string | null }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.fecha_alta_real !== undefined) updates.fecha_alta_real = body.fecha_alta_real || null
  if (body.fecha_baja_real !== undefined) updates.fecha_baja_real = body.fecha_baja_real || null
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  if (updates.fecha_alta_real && updates.fecha_baja_real && (updates.fecha_alta_real as string) > (updates.fecha_baja_real as string)) {
    return NextResponse.json({ error: 'La fecha de baja no puede ser anterior a la de alta' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { error } = await supabase.from('reserva_items').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
