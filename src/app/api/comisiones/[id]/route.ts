import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { es, haceAdministracion, pagaAdministracion } from '@/lib/auth/roles'

const ESTADOS_VALIDOS = ['pendiente', 'liquidada', 'pagada', 'cancelada'] as const

/**
 * PATCH /api/comisiones/[id]  { estado }
 *
 * pendiente → liquidada (entró en la liquidación del mes) → pagada.
 * cancelada la saca de la liquidación.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!haceAdministracion(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: { estado?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  const estado = body.estado as typeof ESTADOS_VALIDOS[number]
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const ahora = new Date().toISOString()
  const updates: Record<string, unknown> = { estado }
  // Las marcas de tiempo acompañan al estado: volver atrás las borra.
  if (estado === 'pendiente' || estado === 'cancelada') { updates.liquidada_at = null; updates.pagada_at = null }
  if (estado === 'liquidada') { updates.liquidada_at = ahora; updates.pagada_at = null }
  if (estado === 'pagada') updates.pagada_at = ahora

  const supabase = createServerClient()

  // Marcar pagada (o sacar una pagada de ese estado) es de Administración.
  if (!pagaAdministracion(session.user.rol)) {
    const { data: actual } = await supabase.from('comisiones').select('estado').eq('id', params.id).maybeSingle()
    if (estado === 'pagada' || actual?.estado === 'pagada') {
      return NextResponse.json({ error: 'El pago de las comisiones lo registra Administración' }, { status: 403 })
    }
  }

  const { error } = await supabase.from('comisiones').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
