import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { haceAdministracion } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

/**
 * Plan de canon de una venta: en cuántas cuotas se le paga al shopping el
 * canon de toda la venta y desde qué mes.
 *
 *   GET    /api/admin/canon-planes?orden_id=…
 *   POST   { orden_id, cuotas, primer_mes: 'AAAA-MM' }
 *   DELETE { orden_id }   → vuelve a pagarse cuota por cuota, según la facturación
 */
async function permiso() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!haceAdministracion(session.user.rol)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  return null
}

const faltaV49 = (msg: string) => /canon_planes/.test(msg)
  ? NextResponse.json({ error: 'Falta correr la migración v49 en Supabase.' }, { status: 503 })
  : NextResponse.json({ error: msg }, { status: 500 })

export async function GET(req: NextRequest) {
  const no = await permiso(); if (no) return no
  const ordenId = req.nextUrl.searchParams.get('orden_id')
  if (!ordenId) return NextResponse.json({ error: 'Falta orden_id' }, { status: 400 })
  const { data, error } = await createServerClient().from('canon_planes').select('*').eq('orden_id', ordenId).maybeSingle()
  if (error) return faltaV49(error.message)
  return NextResponse.json({ plan: data })
}

export async function POST(req: NextRequest) {
  const no = await permiso(); if (no) return no
  const body = await req.json().catch(() => ({}))
  const cuotas = Number(body.cuotas)
  if (typeof body.orden_id !== 'string' || !Number.isInteger(cuotas) || cuotas < 1 || cuotas > 36) {
    return NextResponse.json({ error: 'Indicá la venta y una cantidad de cuotas entre 1 y 36' }, { status: 400 })
  }
  if (typeof body.primer_mes !== 'string' || !/^\d{4}-\d{2}$/.test(body.primer_mes)) {
    return NextResponse.json({ error: 'El mes de la primera cuota tiene que ser AAAA-MM' }, { status: 400 })
  }
  const { error } = await createServerClient().from('canon_planes').upsert({
    orden_id: body.orden_id, cuotas, primer_mes: `${body.primer_mes}-01`, updated_at: new Date().toISOString(),
  }, { onConflict: 'orden_id' })
  if (error) return faltaV49(error.message)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const no = await permiso(); if (no) return no
  const body = await req.json().catch(() => ({}))
  if (typeof body.orden_id !== 'string') return NextResponse.json({ error: 'Falta orden_id' }, { status: 400 })
  const { error } = await createServerClient().from('canon_planes').delete().eq('orden_id', body.orden_id)
  if (error) return faltaV49(error.message)
  return NextResponse.json({ ok: true })
}
