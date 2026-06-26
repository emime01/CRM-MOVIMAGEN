import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

const ESTADOS_GRABADO = ['pendiente', 'grabado']
const ESTADOS_PRODUCCION = ['pendiente', 'en_produccion', 'producido', 'instalado']

/**
 * PATCH /api/orden-items/[id]
 *
 * Actualiza los campos editables de un ítem de orden de venta:
 *  - fechas reales (modal de Disponibilidad)
 *  - estado_grabado / estado_produccion (seguimiento de producción e
 *    instalación / "salió al aire" desde la vista OIC de operaciones)
 *
 * Solo operaciones y administración.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const canEdit = ['operaciones', 'administracion'].includes(session.user.rol)
  if (!canEdit) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  let body: {
    fecha_alta_real?: string | null
    fecha_baja_real?: string | null
    estado_grabado?: string
    estado_produccion?: string
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.fecha_alta_real !== undefined) updates.fecha_alta_real = body.fecha_alta_real || null
  if (body.fecha_baja_real !== undefined) updates.fecha_baja_real = body.fecha_baja_real || null
  if (body.estado_grabado !== undefined) {
    if (!ESTADOS_GRABADO.includes(body.estado_grabado)) {
      return NextResponse.json({ error: 'Estado de grabado inválido' }, { status: 400 })
    }
    updates.estado_grabado = body.estado_grabado
  }
  if (body.estado_produccion !== undefined) {
    if (!ESTADOS_PRODUCCION.includes(body.estado_produccion)) {
      return NextResponse.json({ error: 'Estado de producción inválido' }, { status: 400 })
    }
    updates.estado_produccion = body.estado_produccion
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })

  if (updates.fecha_alta_real && updates.fecha_baja_real && (updates.fecha_alta_real as string) > (updates.fecha_baja_real as string)) {
    return NextResponse.json({ error: 'La fecha de baja no puede ser anterior a la de alta' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { error } = await supabase.from('orden_items').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
