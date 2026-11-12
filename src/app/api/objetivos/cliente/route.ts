import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { recalcularObjetivos } from '@/lib/objetivos/recalcular'
import { puede } from '@/lib/auth/roles'

const ALLOWED_ROLES = ['asistente_ventas', 'gerente_comercial', 'administracion']

const monto = (v: unknown): number | null => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * POST /api/objetivos/cliente
 *
 * Crea o modifica el objetivo de UN cliente en el año (montos por
 * cuatrimestre, ponderación y vendedor) y recalcula los totales por vendedor.
 * Es la edición a mano de lo que hasta ahora sólo entraba por el Excel.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puede(session.user.rol, ALLOWED_ROLES)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: {
    clienteId?: string; vendedorId?: string | null; year?: number
    c1?: unknown; c2?: unknown; c3?: unknown; ponderacion?: unknown
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const { clienteId } = body
  if (!clienteId) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })

  const c1 = monto(body.c1), c2 = monto(body.c2), c3 = monto(body.c3)
  if (c1 === null || c2 === null || c3 === null) {
    return NextResponse.json({ error: 'Los montos deben ser números mayores o iguales a 0' }, { status: 400 })
  }
  const ponderacion = body.ponderacion === undefined || body.ponderacion === '' ? 100 : Number(body.ponderacion)
  if (!Number.isFinite(ponderacion) || ponderacion < 0 || ponderacion > 100) {
    return NextResponse.json({ error: 'La ponderación debe estar entre 0 y 100' }, { status: 400 })
  }

  const year = body.year ?? new Date().getFullYear()
  const vendedorId = body.vendedorId || null
  const supabase = createServerClient()

  const { data: cliente } = await supabase.from('clientes').select('id').eq('id', clienteId).maybeSingle()
  if (!cliente) return NextResponse.json({ error: 'El cliente no existe' }, { status: 404 })

  if (vendedorId) {
    const { data: v } = await supabase
      .from('perfiles').select('id').eq('id', vendedorId)
      .in('rol', ['vendedor', 'asistente_ventas', 'gerente_comercial']).maybeSingle()
    if (!v) return NextResponse.json({ error: 'El vendedor no existe o no es del área comercial' }, { status: 400 })
  }

  const ahora = new Date().toISOString()
  const { error } = await supabase.from('cliente_objetivos').upsert({
    cliente_id: clienteId,
    vendedor_id: vendedorId,
    year,
    ponderacion_pct: ponderacion,
    objetivo_c1: c1,
    objetivo_c2: c2,
    objetivo_c3: c3,
    updated_at: ahora,
  }, { onConflict: 'cliente_id,year' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // El dueño también se guarda en el cliente, igual que al asignar.
  const { error: errCli } = await supabase.from('clientes').update({ vendedor_id: vendedorId, updated_at: ahora }).eq('id', clienteId)
  if (errCli) return NextResponse.json({ error: errCli.message }, { status: 500 })

  const resumen = await recalcularObjetivos(supabase, year)
  return NextResponse.json({ ok: true, vendedores_con_objetivo: resumen.vendedores, clientes_sin_vendedor: resumen.sinVendedor })
}
