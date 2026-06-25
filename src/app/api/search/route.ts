import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { escapePostgrestPattern } from '@/lib/api/safe-patch'

export const dynamic = 'force-dynamic'

/**
 * GET /api/search?q=
 *
 * Búsqueda global: clientes, leads, cotizaciones y OICs.
 * Cada vendedor solo ve los suyos; el resto ve todo.
 *
 * Devuelve hasta 5 resultados por categoría.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const rawQ = (searchParams.get('q') ?? '').trim()
  if (rawQ.length < 2) return NextResponse.json({ clientes: [], leads: [], cotizaciones: [], ordenes: [] })

  // Sanitiza para evitar que `,` `(` `)` rompan el parser de PostgREST en .or(),
  // y que `%` `_` se interpreten como wildcards en ilike.
  const q = escapePostgrestPattern(rawQ)
  if (q.length < 2) return NextResponse.json({ clientes: [], leads: [], cotizaciones: [], ordenes: [] })

  const supabase = createServerClient()
  const esVendedor = session.user.rol === 'vendedor'
  const ilike = `%${q}%`

  // Cotizaciones: si el query parece COT-XXX, prioriza match por número
  const cotPattern = /^cot[-_]?\d+$/i.test(rawQ) ? `${rawQ.replace(/[_]/g, '-').toUpperCase()}%` : `%${q}%`
  // OICs: si parece número solo
  const ordenNumero = /^\d+$/.test(rawQ) ? Number(rawQ) : null

  let qClientes = supabase
    .from('clientes')
    .select('id, nombre, empresa')
    .or(`nombre.ilike.${ilike},empresa.ilike.${ilike}`)
    .eq('activo', true)
    .limit(5)
  if (esVendedor) qClientes = qClientes.eq('vendedor_id', session.user.id)

  let qLeads = supabase
    .from('leads')
    .select('id, descripcion, estado, clientes(nombre, empresa)')
    .ilike('descripcion', ilike)
    .limit(5)
  if (esVendedor) qLeads = qLeads.eq('vendedor_id', session.user.id)

  let qPropuestas = supabase
    .from('propuestas')
    .select('id, numero, nombre, estado, clientes(nombre, empresa)')
    .or(`numero.ilike.${cotPattern},nombre.ilike.${ilike}`)
    .limit(5)
  if (esVendedor) qPropuestas = qPropuestas.eq('vendedor_id', session.user.id)

  let qOrdenes = supabase
    .from('ordenes_venta')
    .select('id, numero, estado, monto_total, clientes(nombre, empresa)')
    .limit(5)
  if (ordenNumero !== null) qOrdenes = qOrdenes.eq('numero', ordenNumero)
  if (esVendedor) qOrdenes = qOrdenes.eq('vendedor_id', session.user.id)

  const [{ data: clientes }, { data: leads }, { data: propuestas }, { data: ordenes }] = await Promise.all([
    qClientes, qLeads, qPropuestas, qOrdenes,
  ])

  return NextResponse.json({
    clientes:    clientes ?? [],
    leads:       leads ?? [],
    cotizaciones: propuestas ?? [],
    ordenes:     ordenNumero !== null ? (ordenes ?? []) : [],
  })
}
