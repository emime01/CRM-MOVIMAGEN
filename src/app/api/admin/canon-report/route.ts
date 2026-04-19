import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function cuatrimestreRange(label: string): { start: string; end: string } | null {
  const match = label.match(/^Q(\d)-(\d{4})$/)
  if (!match) return null
  const [, q, y] = match
  const ranges: Record<string, { start: string; end: string }> = {
    '1': { start: `${y}-01-01`, end: `${y}-04-30` },
    '2': { start: `${y}-05-01`, end: `${y}-08-31` },
    '3': { start: `${y}-09-01`, end: `${y}-12-31` },
  }
  return ranges[q] ?? null
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (session.user.rol !== 'administracion') return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const cuatrimestre = req.nextUrl.searchParams.get('cuatrimestre') ?? ''
  const range = cuatrimestreRange(cuatrimestre)
  if (!range) return NextResponse.json({ error: 'Cuatrimestre inválido' }, { status: 400 })

  const supabase = createServerClient()

  // Fetch all active shoppings and assigned soportes in parallel
  const [{ data: shoppings }, { data: soportes }] = await Promise.all([
    supabase.from('canon_shoppings').select('id, nombre, porcentaje_canon').eq('activo', true).order('nombre'),
    supabase.from('soportes').select('id, nombre, canon_shopping_id').not('canon_shopping_id', 'is', null),
  ])

  // Build lookup structures
  const soporteShoppingMap: Record<string, string> = {}
  const soportesByShopping: Record<string, string[]> = {}
  for (const s of soportes ?? []) {
    soporteShoppingMap[s.id] = s.canon_shopping_id!
    if (!soportesByShopping[s.canon_shopping_id!]) soportesByShopping[s.canon_shopping_id!] = []
    soportesByShopping[s.canon_shopping_id!].push(s.nombre)
  }

  // Get approved ordenes in the period
  const { data: ordenes } = await supabase
    .from('ordenes_venta')
    .select('id')
    .in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada'])
    .gte('created_at', range.start)
    .lte('created_at', range.end)

  // Get orden_items for those ordenes
  const revenueMap: Record<string, number> = {}
  if (ordenes?.length) {
    const { data: items } = await supabase
      .from('orden_items')
      .select('soporte_id, cantidad, semanas, precio_unitario')
      .in('orden_id', ordenes.map(o => o.id))

    for (const item of items ?? []) {
      const shoppingId = soporteShoppingMap[item.soporte_id]
      if (!shoppingId) continue
      const revenue = Number(item.precio_unitario ?? 0) * Number(item.cantidad ?? 1) * Number(item.semanas ?? 1)
      revenueMap[shoppingId] = (revenueMap[shoppingId] ?? 0) + revenue
    }
  }

  const result = (shoppings ?? []).map(sh => {
    const revenue = revenueMap[sh.id] ?? 0
    const canon = revenue * (Number(sh.porcentaje_canon) / 100)
    return { ...sh, soportes: soportesByShopping[sh.id] ?? [], revenue, canon }
  })

  return NextResponse.json({ shoppings: result, range, cuatrimestre })
}
