import type { SupabaseClient } from '@supabase/supabase-js'
import { ESTADOS_VENTA_VIVA, altaEfectiva, bajaEfectiva } from '@/lib/ventas/asignar-buses'

/**
 * Las ventas vivas con soportes de bus y cuántos buses tiene asignados cada
 * línea. Un soporte de bus se reconoce por tipo_cotizador 'estatico_bus' (el
 * campo `tipo` está vacío en el catálogo) o porque está atado a un bus.
 */
export interface LineaBus {
  id: string
  soporte: string
  cantidad: number
  buses: { id: string; numero: string }[]
}
export interface VentaBus {
  id: string
  numero: number | null
  cliente: string
  desde: string | null
  hasta: string | null
  lineas: LineaBus[]
  faltan: number
}

export async function ventasConBuses(supabase: SupabaseClient): Promise<{ ventas: VentaBus[]; tablaLista: boolean }> {
  const { data } = await supabase
    .from('ordenes_venta')
    .select(`id, numero, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real,
      clientes(nombre, empresa),
      orden_items(id, cantidad, bus_id, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real,
        soportes(nombre, tipo, tipo_cotizador, bus_id), buses!bus_id(id, numero))`)
    .in('estado', ESTADOS_VENTA_VIVA as unknown as string[])
    .order('fecha_alta_prevista')

  const ventas = (data ?? []) as any[]
  const itemIds = ventas.flatMap(v => (v.orden_items ?? []).map((i: any) => i.id))

  // La tabla de varios buses por línea (v46). Si todavía no se corrió, se usa
  // el bus único de la línea.
  let tablaLista = true
  const porItem = new Map<string, { id: string; numero: string }[]>()
  if (itemIds.length) {
    const { data: rel, error } = await supabase
      .from('orden_item_buses').select('orden_item_id, buses(id, numero)').in('orden_item_id', itemIds)
    if (error) tablaLista = false
    for (const r of (rel ?? []) as any[]) {
      const b = Array.isArray(r.buses) ? r.buses[0] : r.buses
      if (b) (porItem.get(r.orden_item_id) ?? porItem.set(r.orden_item_id, []).get(r.orden_item_id)!).push(b)
    }
  }

  const out: VentaBus[] = []
  for (const v of ventas) {
    const lineas: LineaBus[] = []
    for (const it of v.orden_items ?? []) {
      const s = Array.isArray(it.soportes) ? it.soportes[0] : it.soportes
      if (!s || !(s.tipo_cotizador === 'estatico_bus' || s.tipo === 'bus' || s.bus_id)) continue
      let buses = porItem.get(it.id) ?? []
      if (!buses.length && it.bus_id) {
        const b = Array.isArray(it.buses) ? it.buses[0] : it.buses
        if (b) buses = [b]
      }
      buses.sort((a, b) => Number(a.numero) - Number(b.numero))
      lineas.push({ id: it.id, soporte: s.nombre, cantidad: Math.max(1, Number(it.cantidad) || 1), buses })
    }
    if (!lineas.length) continue
    const cli = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
    out.push({
      id: v.id, numero: v.numero, cliente: cli?.empresa ?? cli?.nombre ?? '—',
      desde: altaEfectiva({}, v), hasta: bajaEfectiva({}, v),
      lineas, faltan: lineas.reduce((a, l) => a + Math.max(0, l.cantidad - l.buses.length), 0),
    })
  }
  return { ventas: out, tablaLista }
}
