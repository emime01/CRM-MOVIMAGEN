import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { ESTADOS_VENTA_VIVA, altaEfectiva, bajaEfectiva } from '@/lib/ventas/asignar-buses'

export const dynamic = 'force-dynamic'

const cruzan = (a1: string | null, a2: string | null, b1: string | null, b2: string | null) =>
  !!(a1 && a2 && b1 && b2 && a1 <= b2 && a2 >= b1)

/**
 * PUT /api/orden-items/[id]/buses  { bus_ids: string[] }
 *
 * Los buses de una línea de venta ("FullBus × 3" → tres buses). Reemplaza los
 * que tenía. Un bus no puede llevar el mismo soporte en dos ventas vivas con
 * fechas que se pisan: esos se devuelven como conflicto y no se guardan.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puede(session.user.rol, ['operaciones', 'administracion', 'gerente_comercial'])) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  let body: { bus_ids?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Payload inválido' }, { status: 400 }) }
  const busIds = Array.isArray(body.bus_ids) ? Array.from(new Set(body.bus_ids.filter((x): x is string => typeof x === 'string'))) : null
  if (!busIds) return NextResponse.json({ error: 'Faltan los buses' }, { status: 400 })

  const supabase = createServerClient()
  const { data: item } = await supabase
    .from('orden_items')
    .select('id, orden_id, soporte_id, cantidad, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real, ordenes_venta(id, estado, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real)')
    .eq('id', params.id).maybeSingle()
  if (!item) return NextResponse.json({ error: 'Línea no encontrada' }, { status: 404 })
  const orden: any = Array.isArray(item.ordenes_venta) ? item.ordenes_venta[0] : item.ordenes_venta
  const cantidad = Math.max(1, Number(item.cantidad) || 1)
  if (busIds.length > cantidad) {
    return NextResponse.json({ error: `La línea es de ${cantidad} bus(es): elegiste ${busIds.length}` }, { status: 400 })
  }
  const desde = altaEfectiva(item, orden), hasta = bajaEfectiva(item, orden)

  // ¿Alguno de esos buses ya lleva este mismo soporte en otra venta viva?
  const conflictos: { bus_id: string; numero: string; motivo: string }[] = []
  if (busIds.length) {
    const { data: usados, error } = await supabase
      .from('orden_item_buses')
      .select(`bus_id, buses(numero), orden_items!inner(id, soporte_id, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real,
        ordenes_venta!inner(numero, estado, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real))`)
      .in('bus_id', busIds)
      .neq('orden_item_id', params.id)
    if (error) return asignarSinV46(supabase, params.id, item, orden, busIds, desde, hasta)
    for (const u of (usados ?? []) as any[]) {
      const oi = Array.isArray(u.orden_items) ? u.orden_items[0] : u.orden_items
      const ov = Array.isArray(oi?.ordenes_venta) ? oi.ordenes_venta[0] : oi?.ordenes_venta
      if (!oi || oi.soporte_id !== item.soporte_id || !(ESTADOS_VENTA_VIVA as readonly string[]).includes(ov?.estado)) continue
      if (!cruzan(desde, hasta, altaEfectiva(oi, ov), bajaEfectiva(oi, ov))) continue
      const b = Array.isArray(u.buses) ? u.buses[0] : u.buses
      conflictos.push({ bus_id: u.bus_id, numero: b?.numero ?? '?', motivo: `ya lo tiene la OIC #${ov?.numero ?? '?'} en esas fechas` })
    }
  }
  const malos = new Set(conflictos.map(c => c.bus_id))
  const ok = busIds.filter(b => !malos.has(b))

  await supabase.from('orden_item_buses').delete().eq('orden_item_id', params.id)
  if (ok.length) {
    const { error } = await supabase.from('orden_item_buses').insert(ok.map(bus_id => ({ orden_item_id: params.id, bus_id })))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // Compatibilidad: la línea guarda el primero.
  await supabase.from('orden_items').update({ bus_id: ok[0] ?? null }).eq('id', params.id)

  // Si ya no falta ningún bus en la venta, la tarea "Asignar buses" se cierra.
  const { data: lineas } = await supabase
    .from('orden_items').select('id, cantidad, soportes(tipo_cotizador, tipo, bus_id)').eq('orden_id', item.orden_id)
  const deBus = (lineas ?? []).filter((l: any) => {
    const s = Array.isArray(l.soportes) ? l.soportes[0] : l.soportes
    return s && (s.tipo_cotizador === 'estatico_bus' || s.tipo === 'bus' || s.bus_id)
  })
  const { data: asignados } = await supabase.from('orden_item_buses').select('orden_item_id').in('orden_item_id', deBus.map((l: any) => l.id))
  const cuenta = new Map<string, number>()
  for (const a of asignados ?? []) cuenta.set(a.orden_item_id, (cuenta.get(a.orden_item_id) ?? 0) + 1)
  const completa = deBus.every((l: any) => (cuenta.get(l.id) ?? 0) >= Math.max(1, Number(l.cantidad) || 1))
  if (completa) {
    await supabase.from('tasks').update({ estado: 'completada', completed_at: new Date().toISOString() })
      .eq('orden_id', item.orden_id).eq('tipo', 'ops_asignar_buses').neq('estado', 'completada')
  }

  return NextResponse.json({ ok: true, asignados: ok.length, cantidad, conflictos, venta_completa: completa })
}

/**
 * Sin la migración v46 (orden_item_buses), cada línea guarda un solo bus en
 * orden_items.bus_id: antes ni ése se guardaba y operaciones quedaba trabada.
 * Se chequea el mismo conflicto (mismo bus y soporte en otra venta viva con
 * fechas que se pisan) sobre esa columna.
 */
async function asignarSinV46(
  supabase: ReturnType<typeof createServerClient>, itemId: string, item: any, orden: any,
  busIds: string[], desde: string | null, hasta: string | null,
) {
  const elegido = busIds[0] ?? null
  if (elegido) {
    const { data: usados } = await supabase
      .from('orden_items')
      .select(`id, soporte_id, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real, buses!bus_id(numero),
        ordenes_venta!inner(numero, estado, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real)`)
      .eq('bus_id', elegido).neq('id', itemId)
    for (const oi of (usados ?? []) as any[]) {
      const ov = Array.isArray(oi.ordenes_venta) ? oi.ordenes_venta[0] : oi.ordenes_venta
      if (oi.soporte_id !== item.soporte_id || !(ESTADOS_VENTA_VIVA as readonly string[]).includes(ov?.estado)) continue
      if (!cruzan(desde, hasta, altaEfectiva(oi, ov), bajaEfectiva(oi, ov))) continue
      const b = Array.isArray(oi.buses) ? oi.buses[0] : oi.buses
      return NextResponse.json({ ok: true, asignados: 0, cantidad: 1, sin_v46: true,
        conflictos: [{ bus_id: elegido, numero: b?.numero ?? '?', motivo: `ya lo tiene la OIC #${ov?.numero ?? '?'} en esas fechas` }] })
    }
  }
  const { error } = await supabase.from('orden_items').update({ bus_id: elegido }).eq('id', itemId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ¿Quedó algún bus por asignar en la venta? (con una sola columna, una
  // línea cuenta como asignada si tiene su bus)
  const { data: lineas } = await supabase
    .from('orden_items').select('id, bus_id, soportes(tipo_cotizador, tipo)').eq('orden_id', item.orden_id)
  const completa = (lineas ?? []).filter((l: any) => {
    const s = Array.isArray(l.soportes) ? l.soportes[0] : l.soportes
    return s && (s.tipo_cotizador === 'estatico_bus' || s.tipo === 'bus')
  }).every((l: any) => !!l.bus_id)
  if (completa) {
    await supabase.from('tasks').update({ estado: 'completada', completed_at: new Date().toISOString() })
      .eq('orden_id', item.orden_id).eq('tipo', 'ops_asignar_buses').neq('estado', 'completada')
  }
  return NextResponse.json({
    ok: true, asignados: elegido ? 1 : 0, cantidad: 1, conflictos: [], venta_completa: completa, sin_v46: true,
    aviso: busIds.length > 1 ? 'Hasta correr la migración v46 se guarda un solo bus por línea: quedó el primero.' : undefined,
  })
}
