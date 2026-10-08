import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { es } from '@/lib/auth/roles'
import { aPagar, cargarCanonDelMes, mesAnterior } from '@/lib/canon/calcular'

export const dynamic = 'force-dynamic'

const mesValido = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)
const fechaValida = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

type Liquidacion = {
  shopping_id: string; mes: string; canon_variable: number; canon_minimo: number; arrastre: number
  diferido: number; a_pagar: number; canon_variable_usd: number; estado: string; fecha_pago: string | null; notas: string | null
}

/**
 * GET /api/admin/canon-mensual?mes=AAAA-MM
 *
 * Por shopping: las líneas del mes, el canon variable, el mínimo, lo que vino
 * del mes anterior y la liquidación guardada si la hay. Un mes abierto se
 * recalcula siempre; cerrado o pagado muestra lo que quedó fijo.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!es(session.user.rol, 'administracion')) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const mes = req.nextUrl.searchParams.get('mes')
  if (!mesValido(mes)) return NextResponse.json({ error: 'Mes inválido' }, { status: 400 })

  const supabase = createServerClient()
  const [{ resumen, error }, { data: guardadas, error: gErr }] = await Promise.all([
    cargarCanonDelMes(supabase, mes),
    supabase.from('canon_mensual').select('*').in('mes', [`${mes}-01`, mesAnterior(`${mes}-01`)]),
  ])
  if (error || gErr) return NextResponse.json({ error: error ?? gErr?.message }, { status: 500 })

  const de = (shoppingId: string, m: string) =>
    (guardadas ?? []).find((g: Liquidacion) => g.shopping_id === shoppingId && g.mes === m) as Liquidacion | undefined

  const shoppings = resumen.map(r => {
    const actual = de(r.shopping.id, `${mes}-01`)
    const anterior = de(r.shopping.id, mesAnterior(`${mes}-01`))
    const fijo = actual && actual.estado !== 'abierto'
    const variable = fijo ? Number(actual.canon_variable) : r.variable
    const minimo = fijo ? Number(actual.canon_minimo) : r.shopping.canon_minimo
    const arrastre = fijo ? Number(actual.arrastre) : Number(anterior?.diferido ?? 0)
    const diferido = Number(actual?.diferido ?? 0)
    return {
      ...r,
      variable,
      variable_usd: fijo ? Number(actual.canon_variable_usd) : r.variable_usd,
      minimo,
      arrastre,
      diferido,
      a_pagar: fijo ? Number(actual.a_pagar) : aPagar(variable, minimo, arrastre, diferido),
      estado: actual?.estado ?? 'abierto',
      fecha_pago: actual?.fecha_pago ?? null,
      notas: actual?.notas ?? null,
      // Si el mes está cerrado y las líneas de hoy ya no dan lo mismo
      // (se corrigió una cuota después), se avisa.
      recalculado: fijo ? r.variable : null,
    }
  })
  return NextResponse.json({ mes, shoppings })
}

/**
 * POST /api/admin/canon-mensual
 *   { shopping_id, mes, accion: 'diferir', diferido, notas? }
 *   { shopping_id, mes, accion: 'cerrar' | 'reabrir' }
 *   { shopping_id, mes, accion: 'pagar', fecha_pago }
 *
 * diferir: pasa una parte al mes siguiente (se suma allá como arrastre).
 * cerrar:  deja fijos los números del mes.
 * pagar:   lo marca pagado (cierra si estaba abierto).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!es(session.user.rol, 'administracion')) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  let body: { shopping_id?: string; mes?: string; accion?: string; diferido?: unknown; fecha_pago?: unknown; notas?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  const { shopping_id, mes } = body
  if (!shopping_id || !mesValido(mes)) return NextResponse.json({ error: 'Faltan shopping o mes' }, { status: 400 })
  const primerDia = `${mes}-01`

  const supabase = createServerClient()
  const [{ resumen, error }, { data: guardadas }] = await Promise.all([
    cargarCanonDelMes(supabase, mes),
    supabase.from('canon_mensual').select('*').eq('shopping_id', shopping_id).in('mes', [primerDia, mesAnterior(primerDia)]),
  ])
  if (error) return NextResponse.json({ error }, { status: 500 })
  const r = resumen.find(x => x.shopping.id === shopping_id)
  if (!r) return NextResponse.json({ error: 'Shopping no encontrado' }, { status: 404 })

  const actual = (guardadas ?? []).find((g: Liquidacion) => g.mes === primerDia) as Liquidacion | undefined
  const anterior = (guardadas ?? []).find((g: Liquidacion) => g.mes !== primerDia) as Liquidacion | undefined
  const estado = actual?.estado ?? 'abierto'
  if (estado === 'pagado' && body.accion !== 'reabrir') {
    return NextResponse.json({ error: 'Ese mes ya está pagado' }, { status: 409 })
  }

  // La foto del mes: si está abierto, lo de hoy; si no, lo que quedó fijo.
  const fijo = estado !== 'abierto'
  const base = {
    canon_variable: fijo ? Number(actual!.canon_variable) : r.variable,
    canon_minimo: fijo ? Number(actual!.canon_minimo) : r.shopping.canon_minimo,
    arrastre: fijo ? Number(actual!.arrastre) : Number(anterior?.diferido ?? 0),
    canon_variable_usd: fijo ? Number(actual!.canon_variable_usd) : r.variable_usd,
  }
  let diferido = Number(actual?.diferido ?? 0)
  let nuevoEstado = estado
  let fechaPago: string | null = actual?.fecha_pago ?? null
  let notas: string | null = actual?.notas ?? null
  if (typeof body.notas === 'string') notas = body.notas.trim() || null

  switch (body.accion) {
    case 'diferir': {
      const d = Number(body.diferido ?? 0)
      const tope = Math.max(base.canon_variable, base.canon_minimo) + base.arrastre
      if (!Number.isFinite(d) || d < 0) return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
      if (d > tope) return NextResponse.json({ error: 'No se puede pasar al mes siguiente más de lo que hay que pagar' }, { status: 400 })
      diferido = Math.round(d * 100) / 100
      break
    }
    case 'cerrar':
      nuevoEstado = 'cerrado'
      break
    case 'reabrir':
      if (estado === 'pagado') return NextResponse.json({ error: 'Ese mes ya está pagado: para corregirlo, desmarcá el pago primero' }, { status: 409 })
      nuevoEstado = 'abierto'
      break
    case 'pagar':
      if (!fechaValida(body.fecha_pago)) return NextResponse.json({ error: 'Indicá la fecha de pago' }, { status: 400 })
      nuevoEstado = 'pagado'
      fechaPago = body.fecha_pago
      break
    case 'desmarcar_pago':
      nuevoEstado = 'cerrado'
      fechaPago = null
      break
    default:
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  }

  const { error: uErr } = await supabase.from('canon_mensual').upsert({
    shopping_id,
    mes: primerDia,
    ...base,
    diferido,
    a_pagar: aPagar(base.canon_variable, base.canon_minimo, base.arrastre, diferido),
    estado: nuevoEstado,
    fecha_pago: fechaPago,
    notas,
    cerrado_por: nuevoEstado !== 'abierto' ? session.user.id : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'shopping_id,mes' })
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
