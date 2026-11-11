import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { haceAdministracion } from '@/lib/auth/roles'
import { aPagar, cargarCanonDelMes, mesSiguiente } from '@/lib/canon/calcular'

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
 * Por shopping: las líneas del mes (con los diferidos aplicados: las pasadas a
 * otro mes en `diferidas`), el canon variable, el mínimo y la liquidación
 * guardada si la hay. Un mes abierto se
 * recalcula siempre; cerrado o pagado muestra lo que quedó fijo.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!haceAdministracion(session.user.rol)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const mes = req.nextUrl.searchParams.get('mes')
  if (!mesValido(mes)) return NextResponse.json({ error: 'Mes inválido' }, { status: 400 })

  const supabase = createServerClient()
  const [{ resumen, error }, { data: guardadas, error: gErr }] = await Promise.all([
    cargarCanonDelMes(supabase, mes),
    supabase.from('canon_mensual').select('*').eq('mes', `${mes}-01`),
  ])
  if (error || gErr) return NextResponse.json({ error: error ?? gErr?.message }, { status: 500 })

  const de = (shoppingId: string, m: string) =>
    (guardadas ?? []).find((g: Liquidacion) => g.shopping_id === shoppingId && g.mes === m) as Liquidacion | undefined

  const shoppings = resumen.map(r => {
    const actual = de(r.shopping.id, `${mes}-01`)
    const fijo = actual && actual.estado !== 'abierto'
    const variable = fijo ? Number(actual.canon_variable) : r.variable
    const minimo = fijo ? Number(actual.canon_minimo) : r.shopping.canon_minimo
    // Abierto: lo que llega y lo que se pasa salen de las líneas (informativo,
    // ya está reflejado en `variable`). Los montos viejos guardados se ignoran.
    const suma = (ls: { canon: number }[] | undefined) => Math.round((ls ?? []).reduce((t, l) => t + l.canon, 0) * 100) / 100
    const arrastre = fijo ? Number(actual.arrastre) : suma(r.lineas.filter(l => l.diferida_de))
    const diferido = fijo ? Number(actual.diferido) : suma(r.diferidas)
    return {
      ...r,
      variable,
      variable_usd: fijo ? Number(actual.canon_variable_usd) : r.variable_usd,
      minimo,
      arrastre,
      diferido,
      a_pagar: fijo ? Number(actual.a_pagar) : aPagar(variable, minimo, 0, 0),
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
 *   { shopping_id, mes, accion: 'diferir_linea', linea_id, mes_destino?, mes_pauta? }
 *   { shopping_id, mes /* mes_pauta *\/, accion: 'devolver_linea', linea_id }
 *   { shopping_id, mes, accion: 'cerrar' | 'reabrir' }
 *   { shopping_id, mes, accion: 'pagar', fecha_pago }
 *
 * diferir_linea:  pasa una línea (factura) a pagar en otro mes (por defecto el
 *                 siguiente): sale del informe de este mes y entra en el otro.
 *                 `mes_pauta` sólo hace falta para una línea que viene de otro mes.
 * devolver_linea: la línea vuelve a su mes original (`mes` es ese mes).
 * cerrar:  deja fijos los números del mes.
 * pagar:   lo marca pagado (cierra si estaba abierto).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!haceAdministracion(session.user.rol)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  let body: { shopping_id?: string; mes?: string; accion?: string; linea_id?: unknown; mes_destino?: unknown; mes_pauta?: unknown; fecha_pago?: unknown; notas?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  const { shopping_id, mes } = body
  if (!shopping_id || !mesValido(mes)) return NextResponse.json({ error: 'Faltan shopping o mes' }, { status: 400 })
  const primerDia = `${mes}-01`

  const supabase = createServerClient()
  const [{ resumen, error }, { data: guardadas }] = await Promise.all([
    cargarCanonDelMes(supabase, mes),
    supabase.from('canon_mensual').select('*').eq('shopping_id', shopping_id).eq('mes', primerDia),
  ])
  if (error) return NextResponse.json({ error }, { status: 500 })
  const r = resumen.find(x => x.shopping.id === shopping_id)
  if (!r) return NextResponse.json({ error: 'Shopping no encontrado' }, { status: 404 })

  const actual = (guardadas ?? []).find((g: Liquidacion) => g.mes === primerDia) as Liquidacion | undefined
  const estado = actual?.estado ?? 'abierto'
  if (estado === 'pagado' && body.accion !== 'reabrir') {
    return NextResponse.json({ error: 'Ese mes ya está pagado' }, { status: 409 })
  }

  // La foto del mes: si está abierto, lo de hoy; si no, lo que quedó fijo.
  const fijo = estado !== 'abierto'
  const suma = (ls: { canon: number }[] | undefined) => Math.round((ls ?? []).reduce((t, l) => t + l.canon, 0) * 100) / 100
  const base = {
    canon_variable: fijo ? Number(actual!.canon_variable) : r.variable,
    canon_minimo: fijo ? Number(actual!.canon_minimo) : r.shopping.canon_minimo,
    // Informativos: ya están dentro de canon_variable.
    arrastre: fijo ? Number(actual!.arrastre) : suma(r.lineas.filter(l => l.diferida_de)),
    canon_variable_usd: fijo ? Number(actual!.canon_variable_usd) : r.variable_usd,
  }
  const diferido = fijo ? Number(actual!.diferido) : suma(r.diferidas)
  let nuevoEstado = estado
  let fechaPago: string | null = actual?.fecha_pago ?? null
  let notas: string | null = actual?.notas ?? null
  if (typeof body.notas === 'string') notas = body.notas.trim() || null

  // Marcar pagado el canon lo hacen Administración y la asistente (Belén).

  if (body.accion === 'diferir_linea' || body.accion === 'devolver_linea') {
    if (estado !== 'abierto') return NextResponse.json({ error: 'El mes tiene que estar abierto: reabrilo para mover líneas' }, { status: 409 })
    if (typeof body.linea_id !== 'string' || !body.linea_id) return NextResponse.json({ error: 'Falta la línea' }, { status: 400 })
    const lineaId = body.linea_id

    // El estado de un mes (sin liquidación guardada, abierto).
    const estadoDe = async (m01: string) => {
      const { data } = await supabase.from('canon_mensual').select('estado').eq('shopping_id', shopping_id).eq('mes', m01).maybeSingle()
      return (data?.estado as string | undefined) ?? 'abierto'
    }
    const filaDe = async (mesPauta01: string) => {
      const { data, error: fErr } = await supabase.from('canon_diferidos').select('mes_destino')
        .eq('shopping_id', shopping_id).eq('linea_id', lineaId).eq('mes_pauta', mesPauta01).maybeSingle()
      return { fila: data as { mes_destino: string } | null, fErr }
    }
    const tablaFalta = (m: string) => /canon_diferidos/.test(m) ? 'Falta correr la migración v51 (canon_diferidos)' : m

    if (body.accion === 'diferir_linea') {
      // Una línea que viene de otro mes se vuelve a diferir desde su mes de origen.
      const origen = typeof body.mes_pauta === 'string' && mesValido(body.mes_pauta) && body.mes_pauta !== mes ? body.mes_pauta : null
      const linea = r.lineas.find(l => l.factura_id === lineaId && (l.diferida_de ?? null) === origen)
      if (!linea) return NextResponse.json({ error: 'La línea no está en este mes' }, { status: 404 })
      if (linea.tipo === 'nota_credito') return NextResponse.json({ error: 'Una nota de crédito no se pasa de mes' }, { status: 400 })
      const destino = body.mes_destino == null || body.mes_destino === '' ? mesSiguiente(primerDia).slice(0, 7) : body.mes_destino
      if (!mesValido(destino) || destino <= mes) return NextResponse.json({ error: 'El mes de destino tiene que ser posterior' }, { status: 400 })
      const estDest = await estadoDe(`${destino}-01`)
      if (estDest !== 'abierto') return NextResponse.json({ error: `${destino} está ${estDest}: reabrilo antes de pasarle líneas` }, { status: 409 })
      const { error: dErr } = await supabase.from('canon_diferidos').upsert({
        shopping_id, linea_id: lineaId, mes_pauta: `${origen ?? mes}-01`, mes_destino: `${destino}-01`, creado_por: session.user.id,
      }, { onConflict: 'shopping_id,linea_id,mes_pauta' })
      if (dErr) return NextResponse.json({ error: tablaFalta(dErr.message) }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // devolver_linea: `mes` es el mes de origen (mes_pauta).
    const { fila, fErr } = await filaDe(primerDia)
    if (fErr) return NextResponse.json({ error: tablaFalta(fErr.message) }, { status: 500 })
    if (!fila) return NextResponse.json({ error: 'Esa línea no está pasada a otro mes' }, { status: 404 })
    const estDest = await estadoDe(fila.mes_destino)
    if (estDest !== 'abierto') return NextResponse.json({ error: `${fila.mes_destino.slice(0, 7)} está ${estDest}: reabrilo antes de devolver la línea` }, { status: 409 })
    const { error: dErr } = await supabase.from('canon_diferidos').delete()
      .eq('shopping_id', shopping_id).eq('linea_id', lineaId).eq('mes_pauta', primerDia)
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  switch (body.accion) {
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
    // El arrastre y lo diferido ya están en canon_variable: no se suman de nuevo.
    a_pagar: fijo ? Number(actual!.a_pagar) : aPagar(base.canon_variable, base.canon_minimo, 0, 0),
    estado: nuevoEstado,
    fecha_pago: fechaPago,
    notas,
    cerrado_por: nuevoEstado !== 'abierto' ? session.user.id : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'shopping_id,mes' })
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
