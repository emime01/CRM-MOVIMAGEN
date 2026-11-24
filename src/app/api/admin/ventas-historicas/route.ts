import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { todos } from '@/lib/supabase-todos'
import { emparejarCliente, emparejarVendedor, nombreBaseCliente, nombrePropio, normalizar } from '@/lib/ventas/historicas'

export const dynamic = 'force-dynamic'

async function autorizado() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  return puede(session.user.rol, ['administracion']) ? session : null
}

/**
 * GET /api/admin/ventas-historicas — resumen de lo importado: totales por año
 * y vendedor, y los clientes que no quedaron asociados a uno del CRM.
 */
export async function GET() {
  if (!(await autorizado())) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const supabase = createServerClient()
  const { data, error } = await todos((d, h) => supabase.from('ventas_historicas')
    .select('anio, trimestre, vendedor_nombre, vendedor_id, cliente_texto, cliente_id, monto, fuente').order('id').range(d, h))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const filas = data as any[]
  const totales: Record<string, number> = {}
  for (const f of filas) { const k = `${f.anio} · ${f.vendedor_nombre}`; totales[k] = (totales[k] ?? 0) + Number(f.monto) }
  const sinCliente = Array.from(new Set(filas.filter(f => !f.cliente_id).map(f => nombreBaseCliente(f.cliente_texto)))).sort()
  return NextResponse.json({
    filas: filas.length,
    con_cliente: filas.filter(f => f.cliente_id).length,
    con_vendedor: filas.filter(f => f.vendedor_id).length,
    totales,
    sin_cliente: sinCliente,
  })
}

/**
 * POST /api/admin/ventas-historicas — importa una planilla ya leída:
 *   { fuente: string, filas: [{ anio, trimestre, vendedor, cliente, monto }],
 *     alias?: { [cliente de la planilla, sin el detalle]: id del cliente del CRM } }
 * `alias` resuelve a mano los que el nombre no alcanza ("M LIBRE" → Mercado Libre).
 * Reemplaza todo lo de esa fuente (se puede volver a correr) y asocia cada
 * fila al vendedor y al cliente del CRM cuando el nombre coincide.
 * Con ?dry=1 sólo devuelve cómo quedaría, sin escribir nada.
 */
export async function POST(req: NextRequest) {
  if (!(await autorizado())) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  let body: { fuente?: string; filas?: any[]; alias?: Record<string, string> }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Payload inválido' }, { status: 400 }) }
  const fuente = String(body.fuente ?? '').trim()
  const filas = Array.isArray(body.filas) ? body.filas : []
  if (!fuente || !filas.length) return NextResponse.json({ error: 'Faltan la fuente o las filas' }, { status: 400 })

  const malas = filas.filter(f => !(Number.isInteger(f.anio) && f.anio >= 2000 && f.anio <= 2100
    && Number.isInteger(f.trimestre) && f.trimestre >= 1 && f.trimestre <= 4
    && String(f.vendedor ?? '').trim() && String(f.cliente ?? '').trim() && Number.isFinite(Number(f.monto))))
  if (malas.length) return NextResponse.json({ error: `${malas.length} fila(s) incompletas`, ejemplo: malas[0] }, { status: 400 })

  const supabase = createServerClient()
  const [{ data: perfiles, error: e1 }, { data: clientes, error: e2 }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre'),
    todos((d, h) => supabase.from('clientes').select('id, nombre, empresa').order('id').range(d, h)),
  ])
  if (e1 || e2) return NextResponse.json({ error: (e1 ?? e2 as any).message }, { status: 500 })
  const reales = (clientes as any[]).filter(c => !/^\[PRUEBA\]/i.test(c.nombre ?? '') && !/^\[PRUEBA\]/i.test(c.empresa ?? ''))

  const idsReales = new Set(reales.map(c => c.id))
  const alias = new Map<string, string>()
  for (const [k, v] of Object.entries(body.alias ?? {})) {
    if (!idsReales.has(v)) return NextResponse.json({ error: `El alias "${k}" apunta a un cliente que no existe` }, { status: 400 })
    alias.set(normalizar(k), v)
  }
  const clienteDe = (texto: string) => alias.get(normalizar(nombreBaseCliente(texto))) ?? emparejarCliente(texto, reales)

  const nuevas = filas.map(f => ({
    anio: f.anio, trimestre: f.trimestre,
    vendedor_nombre: nombrePropio(String(f.vendedor)),
    vendedor_id: emparejarVendedor(String(f.vendedor), perfiles ?? []),
    cliente_texto: String(f.cliente).replace(/\s+/g, ' ').trim(),
    cliente_id: clienteDe(String(f.cliente)),
    monto: Math.round(Number(f.monto) * 100) / 100,
    moneda: 'UYU',
    fuente,
  }))

  const resumen = {
    importadas: nuevas.length,
    con_cliente: nuevas.filter(n => n.cliente_id).length,
    con_vendedor: nuevas.filter(n => n.vendedor_id).length,
    sin_cliente: Array.from(new Set(nuevas.filter(n => !n.cliente_id).map(n => nombreBaseCliente(n.cliente_texto)))).sort(),
    vendedores_sin_perfil: Array.from(new Set(nuevas.filter(n => !n.vendedor_id).map(n => n.vendedor_nombre))),
  }
  if (req.nextUrl.searchParams.get('dry') === '1') {
    const nombreCli = new Map(reales.map(c => [c.id, c.empresa ?? c.nombre]))
    const asociados = Array.from(new Set(nuevas.filter(n => n.cliente_id).map(n => `${nombreBaseCliente(n.cliente_texto)} → ${nombreCli.get(n.cliente_id!)}`))).sort()
    return NextResponse.json({ dry: true, ...resumen, asociados })
  }

  const { error: eDel } = await supabase.from('ventas_historicas').delete().eq('fuente', fuente)
  if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 })
  for (let i = 0; i < nuevas.length; i += 500) {
    const { error } = await supabase.from('ventas_historicas').insert(nuevas.slice(i, i + 500))
    if (error) return NextResponse.json({ error: error.message, importadas: i }, { status: 500 })
  }
  return NextResponse.json({ ok: true, ...resumen })
}
