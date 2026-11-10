import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { pagaAdministracion } from '@/lib/auth/roles'
import { hoyUY } from '@/lib/fechas'

/**
 * POST /api/comisiones-agencia  { ids: uuid[], estado: 'pagada' | 'pendiente', fecha? }
 *
 * Marca pagada (o vuelve a pendiente) la comisión de una o varias facturas
 * de una agencia. Las "descontadas" (la agencia pagó el neto) no se tocan
 * desde acá: se corrigen deshaciendo el cobro.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!pagaAdministracion(session.user.rol)) return NextResponse.json({ error: 'El pago a las agencias lo registra Administración' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown): x is string => typeof x === 'string') : []
  if (!ids.length || !['pagada', 'pendiente'].includes(body.estado)) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const fecha = typeof body.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? body.fecha : hoyUY()
  const { error } = await createServerClient().from('comisiones_agencia')
    .update({ estado: body.estado, fecha_pago: body.estado === 'pagada' ? fecha : null, updated_at: new Date().toISOString() })
    .in('id', ids).neq('estado', 'descontada')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
