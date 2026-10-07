import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'
import { es } from '@/lib/auth/roles'

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
  if (!es(session.user.rol, 'administracion')) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

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
    .select('id, agencias(porcentaje_comision)')
    .in('estado', ESTADOS_VENTA_VIVA as unknown as string[])
    .gte('created_at', range.start)
    .lte('created_at', range.end)

  // Get orden_items for those ordenes
  const revenueMap: Record<string, number> = {}

  // El canon se calcula sobre lo neto de la comisión de la agencia: la
  // planilla de Administración hace `$ Neto de Ag. = $ Total × (1 − % Ag)` y
  // aplica el porcentaje del shopping sobre eso. Sin agencia (venta directa),
  // no hay nada que descontar.
  const pctAgenciaPorOrden: Record<string, number> = {}
  for (const o of ordenes ?? []) {
    const ag = Array.isArray(o.agencias) ? o.agencias[0] : o.agencias
    pctAgenciaPorOrden[o.id] = Number((ag as { porcentaje_comision?: number } | null)?.porcentaje_comision ?? 0)
  }

  if (ordenes?.length) {
    const { data: items } = await supabase
      .from('orden_items')
      .select('orden_id, soporte_id, cantidad, semanas, precio_unitario, descuento_pct')
      .in('orden_id', ordenes.map(o => o.id))

    for (const item of items ?? []) {
      const shoppingId = soporteShoppingMap[item.soporte_id]
      if (!shoppingId) continue
      // El descuento existe en el ítem y se usa en la factura y en la pantalla
      // de la venta, pero acá no se aplicaba: el canon salía sobre el precio de
      // lista, así que al shopping se le liquidaba de más. Se cobró lo
      // descontado, el canon va sobre eso.
      const descuento = 1 - (Number(item.descuento_pct ?? 0) / 100)
      // Los ítems llevan sólo arrendamiento sin IVA (el precio sale de
      // `precio_semanal` del soporte): la producción no entra al canon.
      const netoDeAgencia = 1 - (pctAgenciaPorOrden[item.orden_id] ?? 0) / 100
      const revenue = Number(item.precio_unitario ?? 0) * Number(item.cantidad ?? 1) * Number(item.semanas ?? 1) * descuento * netoDeAgencia
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
