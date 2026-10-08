import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { es } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

/**
 * POST /api/comisiones/liquidar  { mes: 'AAAA-MM', accion: 'liquidar' | 'pagar', vendedor_id? }
 *
 * liquidar: las pendientes del mes pasan a liquidadas (cierra la planilla).
 * pagar:    las liquidadas del mes pasan a pagadas.
 * Con vendedor_id, sólo las de ese vendedor.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!es(session.user.rol, 'administracion')) {
    return NextResponse.json({ error: 'Sólo Administración liquida comisiones' }, { status: 403 })
  }

  let body: { mes?: string; accion?: string; vendedor_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  if (!body.mes || !/^\d{4}-\d{2}$/.test(body.mes)) return NextResponse.json({ error: 'Mes inválido' }, { status: 400 })
  if (body.accion !== 'liquidar' && body.accion !== 'pagar') return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })

  const ahora = new Date().toISOString()
  const [desde, hacia, updates] = body.accion === 'liquidar'
    ? ['pendiente', 'liquidada', { estado: 'liquidada', liquidada_at: ahora }]
    : ['liquidada', 'pagada', { estado: 'pagada', pagada_at: ahora }]

  const supabase = createServerClient()
  let q = supabase.from('comisiones').update(updates)
    .eq('mes_liquidacion', `${body.mes}-01`)
    .eq('estado', desde)
  if (body.vendedor_id) q = q.eq('vendedor_id', body.vendedor_id)
  const { data, error } = await q.select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, estado: hacia, cantidad: data?.length ?? 0 })
}
