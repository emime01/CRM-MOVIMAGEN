import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { es, puede } from '@/lib/auth/roles'
import { rangoCuatrimestre, vendidoEnCuatrimestre } from '@/lib/comisiones/bonos'
import { hoyUY } from '@/lib/fechas'

export const dynamic = 'force-dynamic'

const importe = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/**
 * PUT /api/comisiones/bonos  { vendedor_id, cuatrimestre, monto | null, moneda? }
 *
 * Asigna (o quita, con monto null o 0) el bono por objetivo de un vendedor en
 * un cuatrimestre. Lo asigna gerencia o Administración.
 */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puede(session.user.rol, ['gerente_comercial', 'administracion'])) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: { vendedor_id?: string; cuatrimestre?: string; monto?: unknown; moneda?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  if (!body.vendedor_id || !body.cuatrimestre || !rangoCuatrimestre(body.cuatrimestre)) {
    return NextResponse.json({ error: 'Faltan vendedor o cuatrimestre' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Un bono ya liquidado no se cambia por debajo.
  const { data: liquidado } = await supabase
    .from('comisiones').select('id')
    .eq('tipo', 'bono').eq('vendedor_id', body.vendedor_id).eq('cuatrimestre', body.cuatrimestre)
    .neq('estado', 'cancelada').limit(1)
  if (liquidado?.length) {
    return NextResponse.json({ error: 'Ese bono ya se liquidó: para cambiarlo, cancelá la liquidación en Comisiones' }, { status: 409 })
  }

  const monto = body.monto == null || body.monto === '' ? 0 : importe(body.monto)
  if (monto === null || monto < 0) return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })

  if (monto === 0) {
    const { error } = await supabase.from('bonos_objetivo').delete()
      .eq('vendedor_id', body.vendedor_id).eq('cuatrimestre', body.cuatrimestre)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase.from('bonos_objetivo').upsert({
    vendedor_id: body.vendedor_id,
    cuatrimestre: body.cuatrimestre,
    monto,
    moneda: body.moneda === 'USD' ? 'USD' : 'UYU',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'vendedor_id,cuatrimestre' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/**
 * POST /api/comisiones/bonos  { vendedor_id, cuatrimestre }
 *
 * Liquida el bono: si el vendedor llegó al objetivo, el bono entra como una
 * comisión más en la liquidación del mes en curso.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!es(session.user.rol, 'administracion')) {
    return NextResponse.json({ error: 'Sólo Administración liquida bonos' }, { status: 403 })
  }

  let body: { vendedor_id?: string; cuatrimestre?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  const { vendedor_id, cuatrimestre } = body
  if (!vendedor_id || !cuatrimestre || !rangoCuatrimestre(cuatrimestre)) {
    return NextResponse.json({ error: 'Faltan vendedor o cuatrimestre' }, { status: 400 })
  }

  const supabase = createServerClient()
  const [{ data: bono }, { data: objetivo }] = await Promise.all([
    supabase.from('bonos_objetivo').select('monto, moneda').eq('vendedor_id', vendedor_id).eq('cuatrimestre', cuatrimestre).maybeSingle(),
    supabase.from('objetivos').select('objetivo_monto').eq('vendedor_id', vendedor_id).eq('cuatrimestre', cuatrimestre).maybeSingle(),
  ])
  if (!bono) return NextResponse.json({ error: 'Ese vendedor no tiene bono asignado en el cuatrimestre' }, { status: 400 })
  const meta = Number(objetivo?.objetivo_monto ?? 0)
  if (meta <= 0) return NextResponse.json({ error: 'Ese vendedor no tiene objetivo en el cuatrimestre' }, { status: 400 })

  const vendido = (await vendidoEnCuatrimestre(supabase, cuatrimestre)).get(vendedor_id) ?? 0
  if (vendido < meta) {
    return NextResponse.json({ error: `Todavía no llegó al objetivo: lleva ${Math.round(vendido / meta * 100)}%` }, { status: 409 })
  }

  const hoy = hoyUY()
  const { error } = await supabase.from('comisiones').insert({
    tipo: 'bono',
    vendedor_id,
    cuatrimestre,
    orden_id: null,
    monto_base: Math.round(vendido * 100) / 100,
    porcentaje: 0,
    monto_comision: Number(bono.monto),
    moneda: bono.moneda ?? 'UYU',
    mes_liquidacion: `${hoy.slice(0, 7)}-01`,
    estado: 'pendiente',
  })
  if (error) {
    // El índice único (vendedor, cuatrimestre) frena el doble clic.
    if (error.code === '23505') return NextResponse.json({ error: 'Ese bono ya se liquidó' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true }, { status: 201 })
}
